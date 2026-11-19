"""HTTP contracts for the catalog editor and published lessons."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.catalog.dto import CatalogAction, LearningSection, LessonRecord, ReviewStatus, RUSSIAN_ALPHABET
from app.schemas import LessonResponse

VersionNumber = Annotated[int, Field(ge=1, le=2_147_483_647)]


class CatalogFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10_000)
    category: str = Field(default="", max_length=100)
    source: str = Field(default="", max_length=500, description="Provenance of the current video")
    consent_reference: str = Field(default="", max_length=500, description="Internal reference to the permission to publish")
    learning_section: LearningSection | None = Field(
        default=None, description="Default is basic for new drafts. Omit on edit to keep the existing placement.",
    )
    alphabet_letter: str | None = Field(
        default=None, min_length=1, max_length=1, description="Russian letter required for the alphabet section.",
    )

    @field_validator("alphabet_letter")
    @classmethod
    def validate_alphabet_letter(cls, value: str | None) -> str | None:
        if value is None:
            return None
        letter = value.upper()
        if len(letter) != 1 or letter not in RUSSIAN_ALPHABET:
            raise ValueError("Use a letter of the Russian alphabet")
        return letter

    @model_validator(mode="after")
    def validate_learning_section(self):
        if (self.learning_section == "alphabet") != (self.alphabet_letter is not None):
            raise ValueError("Specify a Russian letter only for the alphabet section")
        return self


class CatalogCreate(CatalogFields):
    gesture_id: UUID = Field(description="Client-generated UUID, reused on retry to avoid duplicate drafts")


class CatalogEdit(CatalogFields):
    expected_version: VersionNumber


class CatalogTransition(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_version: VersionNumber
    action: CatalogAction
    note: str = Field(default="", max_length=2000, description="Moderation comment")
    media_version: VersionNumber | None = Field(
        default=None, description="When withdrawing consent, the version whose video must be withdrawn",
    )

    @model_validator(mode="after")
    def validate_target(self):
        if (self.action == "withdraw_consent") != (self.media_version is not None):
            raise ValueError("A video version is required only for consent withdrawal")
        return self


class CatalogRevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    version: int
    title: str
    description: str
    category: str
    source: str
    consent_reference: str
    filename: str | None
    video_withdrawn: bool
    review_status: ReviewStatus
    review_note: str
    action: str
    author_id: int | None
    created_at: datetime
    learning_section: LearningSection
    alphabet_letter: str | None


class CatalogGestureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    gesture_id: UUID
    lesson_id: UUID
    archived: bool
    published_version: int | None = Field(description="Version currently visible in the dictionary, if any")
    revision: CatalogRevisionResponse = Field(description="Latest saved version for editing and review")


class CatalogConflictDetail(BaseModel):
    code: str
    message: str
    missing: list[str] = Field(default_factory=list)


class CatalogConflictResponse(BaseModel):
    detail: CatalogConflictDetail


class LearningSectionsResponse(BaseModel):
    alphabet: list[LessonResponse] = Field(description="Published lessons in Russian alphabetical order")
    basic: list[LessonResponse] = Field(description="Published lessons ordered by category, then title")


def lesson_response(lesson: LessonRecord) -> LessonResponse:
    return LessonResponse(
        id=lesson.id, lesson_id=lesson.lesson_id, filename=lesson.filename,
        description=lesson.description, is_published=lesson.is_published,
        media_url=f"/videos/lessons/{lesson.lesson_id}/content",
        title=lesson.title, category=lesson.category, gesture_id=lesson.gesture_id, version=lesson.version,
        alphabet_letter=lesson.alphabet_letter,
    )
