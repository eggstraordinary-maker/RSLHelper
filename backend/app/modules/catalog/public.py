"""Supported catalog operations. Persistence remains internal to the module."""

from .dto import DraftFields, LessonRecord
from .errors import MediaNotFoundError, AmbiguousLessonError
from .editor import (
    create_gesture, edit_gesture, gesture_history, get_gesture, list_gestures, preview_object,
    replace_video, transition, upload_lesson,
)
from .service import (
    get_legacy_lesson,
    get_lesson,
    list_lessons,
    read_media,
    resolve_legacy_label,
)

__all__ = [
    "LessonRecord",
    "DraftFields",
    "MediaNotFoundError",
    "AmbiguousLessonError",
    "get_legacy_lesson",
    "get_lesson",
    "list_lessons",
    "read_media",
    "upload_lesson",
    "resolve_legacy_label",
    "create_gesture",
    "edit_gesture",
    "get_gesture",
    "list_gestures",
    "gesture_history",
    "preview_object",
    "replace_video",
    "transition",
]
