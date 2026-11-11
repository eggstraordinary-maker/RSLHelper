from datetime import datetime, timedelta, timezone

import pytest

from app.schemas import LegacyProgress, UserProgress


@pytest.mark.parametrize("value", [datetime(2026, 1, 2, 12), datetime(2026, 1, 2, 15, tzinfo=timezone(timedelta(hours=3))), None])
def test_progress_and_preserved_legacy_timestamps_are_explicit_utc(value):
    common = dict(word="Example", completed=True, attempts=1, completed_at=value)
    progress = UserProgress(id=1, user_id=1, lesson_id="lesson", **common)
    legacy = LegacyProgress(progress_id=1, status="unmatched", **common)
    for model in (progress, legacy):
        expected = None if value is None else datetime(2026, 1, 2, 12, tzinfo=timezone.utc)
        assert model.completed_at == expected
        assert model.model_dump(mode="json")["completed_at"] == (None if value is None else "2026-01-02T12:00:00Z")
