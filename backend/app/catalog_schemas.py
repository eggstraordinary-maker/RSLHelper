"""HTTP contracts for the authenticated catalog editor."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.catalog.dto import CatalogAction, ReviewStatus

VersionNumber = Annotated[int, Field(ge=1, le=2_147_483_647)]


class CatalogFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10_000)
    category: str = Field(default="", max_length=100)
    source: str = Field(default="", max_length=500, description="Provenance of the current video")
    consent_reference: str = Field(default="", max_length=500, description="Internal reference to the permission to publish")


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
