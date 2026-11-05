"""Immutable catalog metadata for public module boundaries."""

from dataclasses import dataclass


@dataclass(frozen=True)
class LessonRecord:
    id: int
    lesson_id: str
    filename: str
    description: str | None
    object_name: str
    is_published: bool
