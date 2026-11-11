from typing import Literal

from pydantic import Field, field_validator
from urllib.parse import urlsplit
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    # Database
    database_url: str
    database_url_async: str

    # JWT
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    auth_rate_limits_enabled: bool = True
    auth_login_limit: int = Field(default=10, ge=1, le=1000)
    auth_login_window_seconds: int = Field(default=60, ge=1, le=86400)
    auth_mail_limit: int = Field(default=3, ge=1, le=1000)
    auth_mail_window_seconds: int = Field(default=900, ge=1, le=86400)

    # Email
    smtp_host: str
    smtp_port: int
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str
    smtp_security: Literal["starttls", "ssl", "plain"] = "starttls"
    smtp_auth: bool = True
    smtp_timeout_seconds: float = Field(default=10.0, gt=0, le=120)

    # Frontend
    frontend_url: str = "http://localhost:5173"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8000", "http://frontend:5173"]

    @field_validator("cors_origins")
    @classmethod
    def validate_origins(cls, values: list[str]) -> list[str]:
        for value in values:
            parsed = urlsplit(value)
            _ = parsed.port
            if (parsed.scheme not in {"http", "https"} or not parsed.hostname
                    or parsed.username or parsed.password or parsed.query or parsed.fragment
                    or parsed.path not in {"", "/"}):
                raise ValueError("CORS origins must be explicit HTTP(S) origins")
        return list(dict.fromkeys(value.rstrip("/") for value in values))

    # App
    debug: bool = False
    recognition_endpoint_url: str | None = None

    # MP4 upload validation. Request overhead includes multipart headers/fields.
    # DR-01 uses decimal MB: 100 MB = 100,000,000 bytes. Deployments may tighten it.
    media_max_upload_bytes: int = Field(default=100_000_000, gt=0, le=100_000_000)
    media_max_duration_seconds: float = Field(default=15.0, gt=0, le=15.0)
    media_max_request_overhead_bytes: int = Field(default=1024 * 1024, gt=0)
    media_probe_timeout_seconds: float = Field(default=10.0, gt=0)

    # S3-compatible object storage (SeaweedFS in Docker Compose)
    s3_endpoint_url: str
    s3_public_endpoint_url: str | None = None
    aws_access_key_id: str
    aws_secret_access_key: str
    s3_bucket: str = "videos"
    s3_region: str = "us-east-1"

settings = Settings()
