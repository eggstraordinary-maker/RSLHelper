"""Verify signed HTTP reads against real S3, without printing signed URLs."""

import json
import subprocess
from urllib.error import HTTPError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import urlopen

command = [
    "docker",
    "compose",
    "exec",
    "-T",
    "backend",
    "python",
    "-m",
    "scripts.storage_smoke",
]
result = subprocess.run(
    command + ["--keep"], check=True, capture_output=True, text=True
)
fixture = next(
    json.loads(line) for line in result.stdout.splitlines() if line.startswith("{")
)
object_name = fixture["object_name"]
try:
    with urlopen(fixture["url"], timeout=15) as response:
        assert response.status == 200
        assert response.read() == b"rslhelper-seaweedfs-smoke"
    parsed = urlsplit(fixture["url"])
    anonymous = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
    parameters = dict(parse_qsl(parsed.query))
    parameters["X-Amz-Signature"] = "0" * 64
    invalid_signature = urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, urlencode(parameters), "")
    )
    for url in (anonymous, invalid_signature):
        try:
            with urlopen(url, timeout=15):
                raise AssertionError("Unsigned/invalid-signature read must be rejected")
        except HTTPError as error:
            assert error.code == 403
    print(
        "S3 signed HTTP content OK; anonymous and invalid signatures rejected with 403"
    )
finally:
    if not object_name.startswith("smoke/"):
        raise ValueError("Refusing to delete an untagged smoke object")
    subprocess.run(
        command + ["--delete", object_name], check=True, capture_output=True, text=True
    )
    print("Temporary S3 object removed")
