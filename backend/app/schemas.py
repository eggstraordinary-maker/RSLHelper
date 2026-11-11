from datetime import datetime, timezone
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.password_policy import is_valid_username, validate_password_strength


class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        if not is_valid_username(value):
            raise ValueError("Username may contain only letters, digits and underscores")
        return value


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_strength(value)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    public_id: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    role: str
    full_name: str | None = None

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: int | None = None
    public_id: str | None = None
    token_id: str | None = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1, max_length=4096)


class EmailVerificationTokenRequest(BaseModel):
    token: str = Field(..., min_length=1, max_length=256)


class EmailVerificationRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_strength(value)


class UserUpdate(BaseModel):
    username: str | None = Field(None, min_length=3, max_length=50)
    full_name: str | None = Field(None, max_length=200)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Username cannot be empty")
        if not is_valid_username(value):
            raise ValueError("Username may contain only letters, digits and underscores")
        return value


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_strength(value)


class DeleteAccountRequest(BaseModel):
    password: str


class UserProgressBase(BaseModel):
    word: str
    completed: bool = False
    attempts: int = 0


class UserProgressCreate(UserProgressBase):
    pass


class UserProgress(UserProgressBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    completed_at: datetime | None
    lesson_id: str

    @field_validator("completed_at")
    @classmethod
    def completed_at_in_utc(cls, value: datetime | None) -> datetime | None:
        # Legacy writers used datetime.utcnow(); SQLite also drops timezone
        # metadata. Preserve the instant explicitly instead of emitting naive ISO.
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class PracticeAttempt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    completed: bool = False
    attempt_id: UUID | None = Field(
        default=None,
        description="Client-generated UUID reused until this practice is acknowledged. "
        "The same user/ID/payload returns the original result; a different payload gives 409. "
        "Without an ID each call remains a new practice for legacy clients.",
    )


class LegacyProgress(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    progress_id: int
    word: str
    status: str
    completed: bool | None
    attempts: int | None
    completed_at: datetime | None

    @field_validator("completed_at")
    @classmethod
    def completed_at_in_utc(cls, value: datetime | None) -> datetime | None:
        return UserProgress.completed_at_in_utc(value)

class ProgressStats(BaseModel):
    total_lessons: int
    completed_lessons: int
    completed_percentage: float
    recent_lessons: list[str]
    unresolved_legacy_records: int = 0


class VideoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lesson_id: str
    filename: str
    description: str | None
    object_name: str | None
    is_published: bool


class LessonResponse(BaseModel):
    """Published lesson contract independent of the internal object-store key."""

    id: int
    lesson_id: str
    filename: str
    description: str | None
    is_published: bool
    media_url: str = Field(description="Relative API URL of the published MP4")
