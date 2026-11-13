"""Check the configuration shipped to a clean clone, without real env or services."""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = (
    "backend/.env.example", "postgres/.env.example",
    "seaweedfs/.env.example", "seaweedfs/.env.admin.example", "frontend/.env.example",
)


class DeploymentExamplesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace = tempfile.TemporaryDirectory(prefix="rslhelper-example-check-")
        cls.addClassCleanup(cls.workspace.cleanup)
        target = Path(cls.workspace.name)
        shutil.copyfile(ROOT / "docker-compose.yml", target / "docker-compose.yml")
        (target / "empty.env").write_text("", encoding="utf8")
        for name in EXAMPLES:
            destination = target / name.removesuffix(".example")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, destination)
        result = subprocess.run([
            "docker", "compose", "--env-file", str(target / "empty.env"),
            "--project-directory", str(target), "-p", "rslhelper-example-check",
            "-f", str(target / "docker-compose.yml"), "config", "--format", "json",
        ], check=False, capture_output=True, encoding="utf8", timeout=30)
        if result.returncode:
            raise AssertionError("Published examples must form a valid Compose configuration")
        cls.services = json.loads(result.stdout)["services"]

    def test_database_urls_match_postgres_in_both_drivers(self):
        backend = self.services["backend"]["environment"]
        database = self.services["postgres"]["environment"]
        for name in ("DATABASE_URL", "DATABASE_URL_ASYNC"):
            with self.subTest(variable=name):
                url = urlsplit(backend[name])
                self.assertTrue(url.hostname == "postgres" and url.port == 5432,
                                "Container database endpoint must be postgres:5432")
                self.assertTrue(unquote(url.username or "") == database["POSTGRES_USER"],
                                "Database example usernames must match")
                self.assertTrue(unquote(url.password or "") == database["POSTGRES_PASSWORD"],
                                "Database example passwords must match")
                self.assertTrue(unquote(url.path.lstrip("/")) == database["POSTGRES_DB"],
                                "Database example names must match")

    def test_s3_credentials_and_endpoints_are_consistent(self):
        backend = self.services["backend"]["environment"]
        storage = self.services["seaweedfs"]["environment"]
        for key in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
            self.assertTrue(bool(storage[key]) and backend[key] == storage[key],
                            "Backend and S3 example credentials must match")
        self.assertTrue(backend["S3_ENDPOINT_URL"] == "http://seaweedfs:8333")
        self.assertTrue(backend["S3_PUBLIC_ENDPOINT_URL"] == "http://localhost:8333")

    def test_console_template_has_required_credentials(self):
        console = self.services["seaweedfs-console"]["environment"]
        self.assertTrue(bool(console.get("WEED_ADMIN_USER")), "Console user example missing")
        self.assertTrue(bool(console.get("WEED_ADMIN_PASSWORD")), "Console password example missing")

    def test_smtp_signature_and_frontend_defaults_are_published(self):
        backend = self.services["backend"]["environment"]
        self.assertTrue(backend["SMTP_HOST"] == "smtp.gmail.com")
        self.assertTrue(str(backend["SMTP_PORT"]) == "465" and backend["SMTP_SECURITY"] == "ssl")
        for field in ("SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM", "SMTP_AUTH", "SMTP_TIMEOUT_SECONDS"):
            self.assertTrue(bool(backend.get(field)), "SMTP example field missing")
        self.assertTrue(self.services["frontend"]["environment"]["VITE_API_URL"] == "http://localhost:8000")

    def test_examples_are_allowed_and_real_env_stays_ignored(self):
        command = ["git", "-c", f"safe.directory={ROOT.as_posix()}", "-C", str(ROOT),
                   "check-ignore", "--no-index", "--quiet"]
        for name in EXAMPLES:
            result = subprocess.run(command + [name], check=False, capture_output=True, timeout=10)
            self.assertTrue(result.returncode == 1, "Sanitized examples must not be ignored")
            result = subprocess.run(command + [name.removesuffix(".example")],
                                    check=False, capture_output=True, timeout=10)
            self.assertTrue(result.returncode == 0, "Real environment files must stay ignored")


if __name__ == "__main__":
    unittest.main()
