"""Exercise the published bootstrap against disposable directories, never working env."""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
ENV_FILES = ("backend/.env", "postgres/.env", "seaweedfs/.env", "seaweedfs/.env.admin", "frontend/.env")


def read_env(path):
    return dict(line.split("=", 1) for line in path.read_text(encoding="utf8").splitlines()
                if line and not line.startswith("#"))


class SetupEnvTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.shell = shutil.which("pwsh") or shutil.which("powershell")
        if not cls.shell:
            raise RuntimeError("PowerShell is required to verify the supported env bootstrap")

    def setUp(self):
        workspace = tempfile.TemporaryDirectory(prefix="rslhelper-bootstrap-check-")
        self.addCleanup(workspace.cleanup)
        self.target = Path(workspace.name)
        for name in ENV_FILES:
            destination = self.target / (name + ".example")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / (name + ".example"), destination)

    def run_setup(self):
        return subprocess.run([self.shell, "-NoProfile", "-NonInteractive", "-File",
                               str(ROOT / "scripts/setup_env.ps1"), "-ProjectRoot", str(self.target)],
                              check=False, capture_output=True, encoding="utf8", errors="replace", timeout=30)

    def test_fresh_bootstrap_generates_consistent_private_configuration(self):
        result = self.run_setup()
        self.assertTrue(result.returncode == 0, "Fresh bootstrap must succeed")
        self.assertTrue(all((self.target / name).is_file() for name in ENV_FILES))
        backend = read_env(self.target / "backend/.env")
        postgres = read_env(self.target / "postgres/.env")
        storage = read_env(self.target / "seaweedfs/.env")
        console = read_env(self.target / "seaweedfs/.env.admin")
        for driver in ("DATABASE_URL", "DATABASE_URL_ASYNC"):
            url = urlsplit(backend[driver])
            self.assertTrue(url.hostname == "postgres" and url.port == 5432)
            self.assertTrue(unquote(url.username) == postgres["POSTGRES_USER"])
            self.assertTrue(unquote(url.password) == postgres["POSTGRES_PASSWORD"])
            self.assertTrue(unquote(url.path.lstrip("/")) == postgres["POSTGRES_DB"])
        for key in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
            self.assertTrue(bool(storage[key]) and backend[key] == storage[key])
        secrets = [postgres["POSTGRES_PASSWORD"], storage["AWS_SECRET_ACCESS_KEY"],
                   storage["AWS_ACCESS_KEY_ID"], console["WEED_ADMIN_PASSWORD"], backend["SECRET_KEY"]]
        self.assertTrue(len(set(secrets)) == len(secrets), "Subsystem secrets must be distinct")
        self.assertTrue(all(len(value) >= 32 and "replace" not in value for value in secrets))
        self.assertTrue(all(value not in result.stdout + result.stderr for value in secrets),
                        "Bootstrap must not print generated secrets")
        self.assertTrue(backend["SMTP_USER"] == "your-mailbox@example.com")
        self.assertTrue(backend["SMTP_PASSWORD"] == "replace-with-your-smtp-app-password")
        # Resolve the actual application Compose with only generated env files.
        shutil.copyfile(ROOT / "docker-compose.yml", self.target / "docker-compose.yml")
        (self.target / "empty.env").write_text("", encoding="utf8")
        config = subprocess.run(["docker", "compose", "--env-file", str(self.target / "empty.env"),
                                 "-f", str(self.target / "docker-compose.yml"), "config", "--format", "json"],
                                check=False, capture_output=True, encoding="utf8", timeout=30)
        self.assertTrue(config.returncode == 0, "Generated env must resolve actual Compose")
        services = json.loads(config.stdout)["services"]
        self.assertTrue(services["backend"]["environment"]["AWS_SECRET_ACCESS_KEY"]
                        == services["seaweedfs"]["environment"]["AWS_SECRET_ACCESS_KEY"])

    def test_second_run_preserves_existing_files_byte_for_byte(self):
        self.assertTrue(self.run_setup().returncode == 0)
        before = {name: (self.target / name).read_bytes() for name in ENV_FILES}
        self.assertTrue(self.run_setup().returncode == 0)
        self.assertTrue(all((self.target / name).read_bytes() == value for name, value in before.items()),
                        "Second run must preserve every existing env byte")

    def test_partial_configuration_fails_without_overwrite_or_new_files(self):
        existing = self.target / "postgres/.env"
        existing.write_bytes(b"POSTGRES_PASSWORD=manual-env-canary\r\n")
        result = self.run_setup()
        self.assertTrue(result.returncode != 0, "Partial setup must require explicit repair")
        self.assertTrue(existing.read_bytes() == b"POSTGRES_PASSWORD=manual-env-canary\r\n")
        self.assertTrue(all(not (self.target / name).exists() for name in ENV_FILES if name != "postgres/.env"))
        self.assertTrue("manual-env-canary" not in result.stdout + result.stderr)

    def test_invalid_example_fails_before_writing_any_environment_file(self):
        example = self.target / "backend/.env.example"
        example.write_text(example.read_text(encoding="utf8").replace("SECRET_KEY=", "WRONG_KEY="), encoding="utf8")
        self.assertTrue(self.run_setup().returncode != 0)
        self.assertTrue(all(not (self.target / name).exists() for name in ENV_FILES))
