import os
os.environ.setdefault("AUTH_RATE_LIMITS_ENABLED", "false")  # Rate-limit regressions explicitly enable the real gate.

# Keep imports deterministic and independent of developer secrets or services.
os.environ.setdefault("DATABASE_URL", "sqlite:///./rslhelper-tests.db")
os.environ.setdefault(
    "DATABASE_URL_ASYNC", "sqlite+aiosqlite:///./rslhelper-tests.db"
)
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-change-in-production-64-byte-placeholder-value")
os.environ.setdefault("SMTP_HOST", "localhost")
os.environ.setdefault("SMTP_PORT", "25")
os.environ.setdefault("SMTP_USER", "test")
os.environ.setdefault("SMTP_PASSWORD", "test")
os.environ.setdefault("EMAIL_FROM", "test@example.com")
os.environ.setdefault("S3_ENDPOINT_URL", "http://localhost:8333")
os.environ.setdefault("S3_PUBLIC_ENDPOINT_URL", "http://localhost:8333")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
