"""Export the actual HTTP contract without loading .env or starting dependencies."""
import argparse
import json
import os
from pathlib import Path
import sys
import tempfile


def export():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    output = parser.parse_args().output.resolve()
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    # Always override inherited credentials; imports must never touch a real DB.
    os.environ.update({
        "DATABASE_URL": "sqlite:///:memory:", "DATABASE_URL_ASYNC": "sqlite+aiosqlite:///:memory:",
        "SECRET_KEY": "openapi-only-placeholder-never-used-for-runtime-credentials",
        "SMTP_HOST": "localhost", "SMTP_PORT": "25", "SMTP_USER": "schema", "SMTP_PASSWORD": "schema",
        "EMAIL_FROM": "schema@example.com", "S3_ENDPOINT_URL": "http://localhost:8333",
        "AWS_ACCESS_KEY_ID": "schema", "AWS_SECRET_ACCESS_KEY": "schema",
    })
    previous = Path.cwd()
    try:
        with tempfile.TemporaryDirectory() as directory:
            os.chdir(directory)  # Settings cannot discover the developer's .env.
            from app.main import app
            contract = app.openapi()
    finally:
        os.chdir(previous)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(contract, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf8")
    print("OpenAPI contract exported")


if __name__ == "__main__":
    export()
