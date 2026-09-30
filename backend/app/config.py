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

    # Email
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str
    email_from: str

    # Frontend
    frontend_url: str = "http://localhost:5173"

    # App
    debug: bool = False

    # S3-compatible object storage (SeaweedFS in Docker Compose)
    s3_endpoint_url: str
    s3_public_endpoint_url: str | None = None
    aws_access_key_id: str
    aws_secret_access_key: str
    s3_bucket: str = "videos"
    s3_region: str = "us-east-1"

settings = Settings()
