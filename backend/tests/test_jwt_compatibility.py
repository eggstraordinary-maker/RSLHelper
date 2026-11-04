"""JWT library migration keeps valid sessions and fails closed on bad claims."""

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from uuid import uuid4

import jwt
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import auth, models
from app.config import settings
import test_auth_security_flows as security_tests


PUBLIC_ID = str(uuid4())
api = security_tests.api


def legacy_hs256_token(payload):
    """Encode the RFC 7519 shape previously emitted by python-jose, independently."""
    def encode(value):
        return base64.urlsafe_b64encode(
            json.dumps(value, separators=(",", ":")).encode()
        ).rstrip(b"=")

    header = encode({"alg": "HS256", "typ": "JWT"})
    body = encode(payload)
    message = header + b"." + body
    signature = hmac.new(settings.secret_key.encode(), message, hashlib.sha256).digest()
    return (message + b"." + base64.urlsafe_b64encode(signature).rstrip(b"=")).decode()


def claims(token_type="access"):
    return {
        "sub": PUBLIC_ID,
        "type": token_type,
        "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
    }


@pytest.mark.parametrize("token_type", ["access", "refresh"])
def test_existing_hs256_tokens_remain_valid_after_library_migration(token_type):
    payload = claims(token_type)
    if token_type == "refresh":
        payload["jti"] = "previous-server-issued-session"
    verify = auth.verify_token if token_type == "access" else auth.verify_refresh_token
    verified = verify(legacy_hs256_token(payload))
    assert verified.public_id == PUBLIC_ID
    if token_type == "refresh":
        assert verified.token_id == payload["jti"]


@pytest.mark.parametrize(
    "change",
    [
        {"sub": ""},
        {"sub": None},
        {"sub": 123},
        {"exp": 0},
        {"exp": "not-a-timestamp"},
        {"type": "unknown"},
    ],
)
def test_invalid_claims_never_escape_as_validation_errors(change):
    payload = claims()
    payload.update(change)
    token = legacy_hs256_token(payload)
    assert auth.verify_token(token) is None
    assert auth.verify_refresh_token(token) is None


@pytest.mark.parametrize("missing", ["sub", "exp", "type"])
def test_required_claims_cannot_be_omitted(missing):
    payload = claims()
    payload.pop(missing)
    assert auth.verify_token(legacy_hs256_token(payload)) is None


def test_access_and_refresh_tokens_cannot_be_interchanged():
    access = auth.create_access_token({"sub": PUBLIC_ID})
    refresh = auth.create_refresh_token({"sub": PUBLIC_ID})
    assert auth.verify_refresh_token(access) is None
    assert auth.verify_token(refresh) is None


def test_invalid_refresh_identifier_is_rejected_without_a_server_error():
    payload = {**claims("refresh"), "jti": 123}
    assert auth.verify_refresh_token(legacy_hs256_token(payload)) is None


def test_untrusted_header_cannot_change_the_configured_algorithm():
    unsigned = jwt.encode(claims(), key="", algorithm="none")
    other_algorithm = jwt.encode(claims(), settings.secret_key, algorithm="HS384")
    wrong_key = jwt.encode(claims(), "different-test-key-" + "x" * 32, algorithm="HS256")
    for token in (unsigned, other_algorithm, wrong_key, "not-a-jwt"):
        assert auth.verify_token(token) is None


def test_new_tokens_do_not_mutate_input_and_refresh_ids_are_unique():
    source = {"sub": PUBLIC_ID}
    first = auth.create_refresh_token(source)
    second = auth.create_refresh_token(source)
    assert source == {"sub": PUBLIC_ID}
    assert first != second
    assert auth.verify_refresh_token(first).token_id != auth.verify_refresh_token(second).token_id


def test_explicit_zero_lifetime_is_not_replaced_by_default_lifetime():
    token = auth.create_access_token({"sub": PUBLIC_ID}, expires_delta=timedelta(0))
    assert auth.verify_token(token) is None


def test_previously_stored_refresh_token_rotates_through_the_actual_api(api):
    client, engine, mail = api
    security_tests._register_and_login(client, engine, mail)
    with Session(engine) as db:
        user = db.scalar(select(models.User).where(models.User.email == "learner@example.com"))
        payload = {**claims("refresh"), "sub": user.public_id, "jti": "legacy-session"}
        token = legacy_hs256_token(payload)
        db.add(models.RefreshToken(
            user_id=user.id,
            token_hash=auth.hash_token(token),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
            is_revoked=False,
        ))
        db.commit()
    rotated = client.post("/auth/refresh", json={"refresh_token": token})
    assert rotated.status_code == 200
    assert auth.verify_refresh_token(rotated.json()["refresh_token"]).public_id == payload["sub"]
    assert client.post("/auth/refresh", json={"refresh_token": token}).status_code == 401
