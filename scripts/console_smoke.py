"""Verify local SeaweedFS console authentication without printing credentials."""

from http.cookiejar import CookieJar
from pathlib import Path
import re
from urllib.parse import urlencode
from urllib.request import build_opener, HTTPCookieProcessor, Request
from urllib.parse import urljoin

config = Path(__file__).parents[1] / "seaweedfs" / ".env.admin"
values = dict(
    line.split("=", 1)
    for line in config.read_text(encoding="utf-8-sig").splitlines()
    if "=" in line and not line.lstrip().startswith("#")
)
base = "http://localhost:23646"
opener = build_opener(HTTPCookieProcessor(CookieJar()))
with opener.open(base + "/", timeout=10) as response:
    assert "/login" in response.url, "Console must require authentication"
    html = response.read().decode()
print(
    "Console requires login; form fields:",
    re.findall(r'<input[^>]*name="([^"]+)"', html),
)
csrf = re.search(r'name="csrf_token"[^>]*value="([^"]+)"', html)
assert csrf, "Console login must include CSRF protection"
with opener.open(
    Request(
        base + "/login",
        data=urlencode(
            {
                "username": values["WEED_ADMIN_USER"],
                "password": values["WEED_ADMIN_PASSWORD"],
                "csrf_token": csrf.group(1),
            }
        ).encode(),
    ),
    timeout=10,
) as response:
    assert "/login" not in response.url, "Console login failed"
    dashboard = response.read().decode()
bucket_links = [
    link
    for link in re.findall(r'href="([^"]+)"', dashboard)
    if "object-store/buckets" in link
]
assert bucket_links, "Console must link to the S3 bucket browser"
for path in ("/", bucket_links[0]):
    with opener.open(urljoin(base, path), timeout=10) as response:
        assert response.status == 200 and "/login" not in response.url
print("Console authenticated dashboard and S3 bucket page OK")
