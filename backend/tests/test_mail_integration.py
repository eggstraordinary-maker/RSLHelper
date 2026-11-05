"""Opt-in real SMTP -> Mailpit + migrated PostgreSQL account journey."""
import os
import re
from html import unescape
from uuid import uuid4

import httpx
import pytest

from app.routers import auth as router
import test_accounts_postgresql

pg_api = test_accounts_postgresql.pg_api
send_real = router._send_email_safely
pytestmark = [pytest.mark.asyncio, pytest.mark.skipif(
    os.getenv("MAIL_INTEGRATION_TESTS") != "1", reason="Requires isolated Mailpit and PostgreSQL",
)]


async def test_real_register_resend_verify_login_reset(pg_api, monkeypatch):
    client, _, _ = pg_api
    monkeypatch.setattr(router, "_send_email_safely", send_real)
    address = f"mail_{uuid4().hex}@example.com"
    password = "MailTestPass8"
    owned_messages = set()
    async with httpx.AsyncClient(base_url="http://mailpit-tests:8025") as inbox:
        async def token(kind):
            messages = (await inbox.get("/api/v1/messages")).json()["messages"]
            owned = [message for message in messages if any(to["Address"] == address for to in message["To"])]
            owned_messages.update(message["ID"] for message in owned)
            for message in owned:
                payload = (await inbox.get("/api/v1/message/" + message["ID"])).json()
                found = re.search(r"/" + kind + r"#([A-Za-z0-9_-]+)", unescape(payload["HTML"]))
                if found:
                    return found.group(1)
            pytest.fail("Expected account message was not delivered")

        try:
            response = await client.post("/auth/register", json={"username": "mail_" + uuid4().hex, "email": address, "password": password})
            assert response.status_code == 200
            assert (await client.post("/auth/login", data={"username": address, "password": password})).status_code == 401
            first = await token("verify-email")
            assert (await client.post("/auth/resend-verification", json={"email": address})).status_code == 200
            second = await token("verify-email")
            assert bool(first != second), "Resend must replace the verification credential"
            assert (await client.post("/auth/verify-email", json={"token": first})).status_code == 400
            assert (await client.post("/auth/verify-email", json={"token": second})).status_code == 200
            assert (await client.post("/auth/verify-email", json={"token": second})).status_code == 400
            session = await client.post("/auth/login", data={"username": address, "password": password})
            assert session.status_code == 200
            assert (await client.post("/auth/forgot-password", json={"email": address})).status_code == 200
            reset = await token("reset-password")
            assert (await client.post("/auth/reset-password", json={"token": reset, "new_password": "NewMailPass8"})).status_code == 200
            assert (await client.post("/auth/reset-password", json={"token": reset, "new_password": "OtherMailPass8"})).status_code == 400
            assert (await client.post("/auth/refresh", json={"refresh_token": session.json()["refresh_token"]})).status_code == 401
            assert (await client.post("/auth/login", data={"username": address, "password": "NewMailPass8"})).status_code == 200
        finally:
            messages = (await inbox.get("/api/v1/messages")).json()["messages"]
            owned_messages.update(message["ID"] for message in messages if any(to["Address"] == address for to in message["To"]))
            for identifier in owned_messages:
                await inbox.request("DELETE", "/api/v1/messages", json={"IDs": [identifier]})
