"""Versioned catalog use cases. Only publication changes the public lesson."""

from dataclasses import replace
from datetime import datetime, timezone
from typing import BinaryIO
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CatalogRevision
from . import repository as repo
from .dto import CatalogAction, DraftFields, GestureRecord, LessonRecord, ReviewStatus, UploadedVideo
from .errors import CatalogConflictError, MediaNotFoundError, MediaUnavailableError
from .service import catalog_write, media_metadata, video_upload


async def _lookup(db: AsyncSession, gesture_id: str, *, lock: bool = False) -> repo.EditingState:
    state = await repo.current_gesture(db, gesture_id, lock=lock)
    if state is None:
        raise MediaNotFoundError("Gesture not found")
    return state


def _check_version(state: repo.EditingState, expected_version: int) -> None:
    if state.gesture.version != expected_version:
        raise CatalogConflictError("stale_version", "The gesture changed. Reload its current version.")


def _check_editable(state: repo.EditingState) -> None:
    if state.gesture.archived:
        raise CatalogConflictError("gesture_archived", "Restore the gesture before editing it.")


def _fields(revision: CatalogRevision) -> DraftFields:
    return DraftFields(
        title=revision.title, description=revision.description, category=revision.category,
        source=revision.source, consent_reference=revision.consent_reference,
        learning_section=revision.learning_section, alphabet_letter=revision.alphabet_letter,
    )


async def list_gestures(db: AsyncSession, offset: int, limit: int) -> list[GestureRecord]:
    return await repo.gestures(db, offset, limit)


async def get_gesture(db: AsyncSession, gesture_id: str) -> GestureRecord:
    state = await _lookup(db, gesture_id)
    return repo.gesture_record(state.gesture, state.revision, state.media)


async def gesture_history(db: AsyncSession, gesture_id: str, before: int | None, limit: int):
    state = await _lookup(db, gesture_id)
    return await repo.history(db, gesture_id, before if before is not None else state.gesture.version + 1, limit)


async def preview_object(db: AsyncSession, gesture_id: str, version: int) -> str:
    media = await repo.version_media(db, gesture_id, version)
    if media is None or media.withdrawn_at is not None:
        raise MediaNotFoundError("Video not found")
    return media.object_name


async def _create(db: AsyncSession, gesture_id: str, fields: DraftFields, author_id: int,
                  uploaded: UploadedVideo | None = None):
    if fields.learning_section is None:
        fields = replace(fields, learning_section="basic")
    lesson = await repo.add_lesson(db, lesson_id=str(uuid4()), title=fields.title)
    try:
        gesture = await repo.add_gesture(db, gesture_id, lesson.lesson_id)
    except IntegrityError:
        raise CatalogConflictError("gesture_exists", "A draft with this ID already exists.") from None
    media = await repo.add_video(db, gesture.id, str(uuid4()), uploaded) if uploaded else None
    revision = await repo.append_revision(db, gesture, fields, media, action="created", author_id=author_id)
    return lesson.id, repo.gesture_record(gesture, revision, media)


async def create_gesture(db: AsyncSession, gesture_id: str, fields: DraftFields, author_id: int) -> GestureRecord:
    async with catalog_write(db):
        _, record = await _create(db, gesture_id, fields, author_id)
    return record


async def upload_lesson(db: AsyncSession, source: BinaryIO, filename: str | None, content_type: str | None,
                        description: str, *, author_id: int) -> LessonRecord:
    """Compatibility route. The uploaded lesson enters the same draft workflow."""
    async with video_upload(db, source, filename, content_type) as uploaded:
        title = (description.strip() or uploaded.filename)[:200]
        lesson_pk, record = await _create(
            db, str(uuid4()), DraftFields(title, description), author_id, uploaded,
        )
        result = LessonRecord(
            lesson_pk, record.lesson_id, uploaded.filename, description, uploaded.object_name, False,
            title=title, gesture_id=record.gesture_id, version=record.revision.version,
        )
    return result


async def edit_gesture(db: AsyncSession, gesture_id: str, expected_version: int,
                       fields: DraftFields, author_id: int) -> GestureRecord:
    async with catalog_write(db):
        state = await _lookup(db, gesture_id, lock=True)
        _check_version(state, expected_version)
        _check_editable(state)
        # Older catalog clients omit placement. An unrelated edit must keep it.
        if fields.learning_section is None:
            fields = replace(
                fields, learning_section=state.revision.learning_section, alphabet_letter=state.revision.alphabet_letter,
            )
        state.gesture.version += 1
        revision = await repo.append_revision(db, state.gesture, fields, state.media, action="edited", author_id=author_id)
        result = repo.gesture_record(state.gesture, revision, state.media)
    return result


async def _release_read(db: AsyncSession) -> None:
    try:
        await db.rollback()
    except Exception:
        raise MediaUnavailableError("Catalog is temporarily unavailable") from None


async def replace_video(db: AsyncSession, gesture_id: str, expected_version: int, author_id: int,
                        source: BinaryIO, filename: str | None, content_type: str | None) -> GestureRecord:
    try:
        state = await _lookup(db, gesture_id)
        _check_version(state, expected_version)
        _check_editable(state)
    finally:
        await _release_read(db)
    async with video_upload(db, source, filename, content_type) as uploaded:
        state = await _lookup(db, gesture_id, lock=True)
        _check_version(state, expected_version)
        _check_editable(state)
        media = await repo.add_video(db, gesture_id, str(uuid4()), uploaded)
        fields = replace(_fields(state.revision), source="", consent_reference="")
        state.gesture.version += 1
        revision = await repo.append_revision(
            db, state.gesture, fields, media, action="video_replaced", author_id=author_id,
        )
        result = repo.gesture_record(state.gesture, revision, media)
    return result


def _reviewable(state: repo.EditingState) -> None:
    revision = state.revision
    checks = (
        ("video", state.media is not None and state.media.withdrawn_at is None),
        ("category", bool(revision.category.strip())),
        ("source", bool(revision.source.strip())),
        ("consent_reference", bool(revision.consent_reference.strip())),
    )
    missing = tuple(name for name, present in checks if not present)
    if missing:
        raise CatalogConflictError("incomplete_revision", "Complete the material before approval.", missing)


async def _check_publication(db: AsyncSession, gesture_id: str, expected_version: int) -> None:
    # Do the S3 HEAD outside the database transaction. The write then checks
    # the same version under lock, so a concurrent edit or withdrawal wins.
    try:
        state = await _lookup(db, gesture_id)
        _check_version(state, expected_version)
        _check_editable(state)
        _reviewable(state)
        if state.revision.review_status != "approved":
            raise CatalogConflictError("review_required", "Approve this revision before publishing it.")
        object_name = state.media.object_name
    finally:
        await _release_read(db)
    try:
        await media_metadata(object_name)
    except MediaNotFoundError:
        raise CatalogConflictError("video_unavailable", "The video is missing or cannot be played.") from None


async def transition(db: AsyncSession, gesture_id: str, expected_version: int, author_id: int,
                     action: CatalogAction, note: str, media_version: int | None) -> GestureRecord:
    if action == "publish":
        await _check_publication(db, gesture_id, expected_version)
    async with catalog_write(db):
        state = await _lookup(db, gesture_id, lock=True)
        _check_version(state, expected_version)
        gesture, lesson, previous, media = state
        if action not in {"restore", "withdraw_consent"}:
            _check_editable(state)
        fields = _fields(previous)
        review_status: ReviewStatus = "draft"
        gesture.version += 1
        if action == "approve":
            _reviewable(state)
            review_status = "approved"
        elif action == "request_changes":
            review_status = "changes_requested"
        elif action == "publish":
            if gesture.published_version == previous.version:
                raise CatalogConflictError("already_published", "This version is already published.")
            gesture.published_version = gesture.version
            review_status = "approved"
            note = previous.review_note
            repo.publish(lesson, fields, media)
        elif action in {"unpublish", "archive"}:
            if action == "unpublish" and gesture.published_version is None:
                raise CatalogConflictError("not_published", "There is no published version to hide.")
            gesture.published_version = None
            gesture.archived = action == "archive"
            repo.hide(lesson)
        elif action == "restore":
            if not gesture.archived:
                raise CatalogConflictError("not_archived", "This gesture is not archived.")
            gesture.archived = False
        elif action == "withdraw_consent":
            withdrawn = await repo.version_media(db, gesture_id, media_version)
            if withdrawn is None or withdrawn.withdrawn_at is not None:
                raise CatalogConflictError("no_withdrawable_video", "This version has no video with consent to withdraw.")
            repo.withdraw(withdrawn, datetime.now(timezone.utc))
            if gesture.published_version is not None and withdrawn.object_name == lesson.object_name:
                gesture.published_version = None
                repo.hide(lesson)
            if media is not None and media.id == withdrawn.id:
                fields = replace(fields, consent_reference="")
            else:
                review_status = previous.review_status
                note = note or previous.review_note
        revision = await repo.append_revision(
            db, gesture, fields, media, action=action, author_id=author_id,
            review_status=review_status, review_note=note,
        )
        result = repo.gesture_record(gesture, revision, media)
    return result
