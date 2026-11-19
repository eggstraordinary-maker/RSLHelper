from datetime import datetime, timedelta
from enum import Enum
from hashlib import sha256
import secrets
import uuid

from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, ForeignKey, ForeignKeyConstraint,
    Integer, JSON, String, Text, UniqueConstraint, false, true,
)
from sqlalchemy.sql import func

from app.database import Base
from app.modules.catalog.dto import RUSSIAN_ALPHABET


class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"


def generate_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("username", name="uq_users_username"),)

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String(36), unique=True, index=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # role = Column(SQLEnum(UserRole), default=UserRole.USER, nullable=False)
    role = Column(String, default=UserRole.USER.value, nullable=False)

    # Дополнительные поля для профиля
    full_name = Column(String(200))
    avatar_url = Column(String(500))

    # Поля для восстановления пароля
    verification_token = Column(String(100), unique=True, index=True)
    verification_token_expires = Column(DateTime)
    reset_token = Column(String(100), unique=True, index=True)
    reset_token_expires = Column(DateTime)


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    token_hash = Column("token", String(64), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_used = Column(Boolean, default=False)

    @classmethod
    def create_for_email(cls, email: str) -> tuple["EmailVerification", str]:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(hours=24)
        verification = cls(
            email=email,
            token_hash=sha256(token.encode("utf-8")).hexdigest(),
            expires_at=expires_at,
        )
        return verification, token


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    # Preserve the legacy column name but store only a one-way token digest.
    token_hash = Column("token", String(64), unique=True, index=True, nullable=False)
    user_id = Column(Integer, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_revoked = Column(Boolean, default=False)


class VideoFile(Base):
    __tablename__ = "video_files"

    id = Column(Integer, primary_key=True, index=True)
    # Stable lesson identity survives changes to titles, filenames and S3 keys.
    lesson_id = Column(String(36), unique=True, nullable=False, default=generate_uuid)
    is_published = Column(Boolean, nullable=False, default=True, server_default=true())

    filename = Column(String(255), nullable=False)
    title = Column(String(200), nullable=True)

    description = Column(Text)

    object_name = Column(String(255), unique=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CatalogGesture(Base):
    """Stable catalog identity. video_files is the projection used by public lessons."""

    __tablename__ = "catalog_gestures"
    __table_args__ = (
        CheckConstraint("version > 0", name="ck_catalog_gesture_version"),
        CheckConstraint(
            "published_version IS NULL OR (published_version BETWEEN 1 AND version AND NOT archived)",
            name="ck_catalog_publication",
        ),
    )

    id = Column(String(36), primary_key=True)
    lesson_id = Column(String(36), ForeignKey("video_files.lesson_id", ondelete="CASCADE"), unique=True, nullable=False)
    version = Column(Integer, nullable=False)
    published_version = Column(Integer)
    archived = Column(Boolean, nullable=False, default=False, server_default=false())


class CatalogMedia(Base):
    """One object can be shared by revisions of the same gesture."""

    __tablename__ = "catalog_media"
    __table_args__ = (UniqueConstraint("gesture_id", "id", name="uq_catalog_media_owner"),)

    id = Column(String(36), primary_key=True)
    gesture_id = Column(String(36), ForeignKey("catalog_gestures.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    object_name = Column(String(255), unique=True, nullable=False)
    withdrawn_at = Column(DateTime(timezone=True))


class CatalogRevision(Base):
    """An immutable snapshot of content and moderation after one catalog action."""

    __tablename__ = "catalog_revisions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["gesture_id", "media_id"], ["catalog_media.gesture_id", "catalog_media.id"],
            name="fk_catalog_revision_media_owner", ondelete="CASCADE",
        ),
        CheckConstraint("version > 0", name="ck_catalog_revision_version"),
        CheckConstraint(
            "review_status IN ('draft', 'approved', 'changes_requested')",
            name="ck_catalog_review_status",
        ),
        CheckConstraint(
            "(learning_section = 'basic' AND alphabet_letter IS NULL) OR "
            "(learning_section = 'alphabet' AND alphabet_letter IS NOT NULL AND "
            f"alphabet_letter IN ({', '.join(repr(letter) for letter in RUSSIAN_ALPHABET)}))",
            name="ck_catalog_learning_placement",
        ),
    )

    gesture_id = Column(String(36), ForeignKey("catalog_gestures.id", ondelete="CASCADE"), primary_key=True)
    version = Column(Integer, primary_key=True)
    media_id = Column(String(36))
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(100), nullable=False)
    learning_section = Column(String(8), nullable=False, server_default="basic")
    alphabet_letter = Column(String(1))
    source = Column(String(500), nullable=False)
    consent_reference = Column(String(500), nullable=False)
    review_status = Column(String(20), nullable=False)
    review_note = Column(String(2000), nullable=False)
    action = Column(String(24), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class UserLearningProgress(Base):
    __tablename__ = "user_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "lesson_id", name="uq_user_progress_user_lesson"),
        CheckConstraint("attempts >= 0", name="ck_user_progress_attempts_nonnegative"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # NULL is reserved for preserved, unresolved legacy progress.
    lesson_id = Column(String(36), ForeignKey("video_files.lesson_id"), nullable=True)
    word = Column(String(100), nullable=False)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    attempts = Column(Integer, default=0)


class LegacyProgressMapping(Base):
    """Lossless audit of the old word-based records and migration decisions."""

    __tablename__ = "legacy_progress_mapping"

    progress_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    word = Column(String(100), nullable=False)
    candidate_lesson_ids = Column(Text, nullable=False)
    lesson_id = Column(String(36), nullable=True)
    status = Column(String(20), nullable=False)
    completed = Column(Boolean, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    attempts = Column(Integer, nullable=True)


class LearningAttemptReceipt(Base):
    """A committed request ID and its original result, owned by one user."""

    __tablename__ = "learning_attempt_receipts"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    attempt_id = Column(String(36), primary_key=True)
    lesson_id = Column(String(36), ForeignKey("video_files.lesson_id"), nullable=False)
    completed = Column(Boolean, nullable=False)
    # NULL exists only during the uncommitted claim. The use case writes the
    # result and progress in the same transaction before acknowledging success.
    response_payload = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AuthRateBucket(Base):
    """Short-lived admission timestamps keyed by a pseudonymous address digest."""
    __tablename__ = "auth_rate_buckets"
    scope = Column(String(16), primary_key=True)
    key_digest = Column(String(64), primary_key=True)
    admissions = Column(JSON, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
