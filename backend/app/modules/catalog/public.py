"""Supported catalog operations. Persistence remains internal to the module."""

from .dto import LessonRecord
from .errors import MediaNotFoundError, AmbiguousLessonError
from .service import (
    get_legacy_lesson,
    get_lesson,
    legacy_url,
    list_lessons,
    read_media,
    upload_lesson,
    resolve_legacy_label,
)

__all__ = [
    "LessonRecord",
    "MediaNotFoundError",
    "AmbiguousLessonError",
    "get_legacy_lesson",
    "get_lesson",
    "legacy_url",
    "list_lessons",
    "read_media",
    "upload_lesson",
    "resolve_legacy_label",
]
