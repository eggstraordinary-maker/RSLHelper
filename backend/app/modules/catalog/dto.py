"""Immutable catalog metadata for public module boundaries."""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

ReviewStatus = Literal["draft", "approved", "changes_requested"]
CatalogAction = Literal[
    "approve", "request_changes", "publish", "unpublish", "archive", "restore", "withdraw_consent",
]


@dataclass(frozen=True)
class LessonRecord:
    id: int
    lesson_id: str
    filename: str
    description: str | None
    object_name: str
    is_published: bool
    title: str | None = None
    category: str | None = None
    gesture_id: str | None = None
    version: int | None = None


@dataclass(frozen=True)
class DraftFields:
    title: str
    description: str = ""
    category: str = ""
    source: str = ""
    consent_reference: str = ""


@dataclass(frozen=True)
class UploadedVideo:
    filename: str
    object_name: str


@dataclass(frozen=True)
class RevisionRecord:
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


@dataclass(frozen=True)
class GestureRecord:
    gesture_id: str
    lesson_id: str
    archived: bool
    published_version: int | None
    revision: RevisionRecord
