import os

# Keep imports deterministic and independent of developer secrets or services.
os.environ.setdefault("DATABASE_URL", "sqlite:///./rslhelper-tests.db")
os.environ.setdefault(
    "DATABASE_URL_ASYNC", "sqlite+aiosqlite:///./rslhelper-tests.db"
)
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-change-in-production")
os.environ.setdefault("SMTP_HOST", "localhost")
os.environ.setdefault("SMTP_PORT", "25")
os.environ.setdefault("SMTP_USER", "test")
os.environ.setdefault("SMTP_PASSWORD", "test")
os.environ.setdefault("EMAIL_FROM", "test@example.com")
os.environ.setdefault("MINIO_ENDPOINT", "localhost:9000")
os.environ.setdefault("MINIO_ACCESS_KEY", "test")
os.environ.setdefault("MINIO_SECRET_KEY", "test")
