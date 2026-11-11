"""DR-01 boundaries, real codec/duration probing and failure cleanup."""

import io
import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.config import Settings, settings
from app.modules.catalog import service
from app.modules.catalog.errors import UnsupportedMediaError
from media_fixture import tiny_mp4_bytes
import test_media

api = test_media.api
media_api = test_media.media_api


def test_media_defaults_are_decimal_mb_and_fifteen_seconds():
    config = Settings(_env_file=None)
    assert config.media_max_upload_bytes == 100_000_000
    assert config.media_max_duration_seconds == 15
    for field, value in [("media_max_upload_bytes", 100_000_001), ("media_max_duration_seconds", 15.001)]:
        with pytest.raises(ValidationError):
            Settings(_env_file=None, **{field: value})


def test_exact_file_boundary_is_accepted_and_one_extra_byte_is_rejected(media_api, monkeypatch):
    client, engine, store, headers, _ = media_api
    payload = tiny_mp4_bytes()
    monkeypatch.setattr(settings, "media_max_upload_bytes", len(payload))
    assert test_media._upload(client, headers, payload=payload).status_code == 200
    before = (test_media._row_count(engine), len(store.objects))
    assert test_media._upload(client, headers, payload=payload + b"x").status_code == 413
    assert before == (test_media._row_count(engine), len(store.objects))


def test_real_h264_at_fifteen_seconds_is_accepted(media_api):
    client, _, _, headers, _ = media_api
    assert test_media._upload(client, headers, payload=tiny_mp4_bytes("15")).status_code == 200


@pytest.mark.parametrize("duration,codec", [("15.2", "libx264"), ("0.4", "mpeg4")])
def test_real_oversized_duration_or_wrong_codec_never_reaches_storage(media_api, duration, codec):
    client, engine, store, headers, _ = media_api
    response = test_media._upload(client, headers, payload=tiny_mp4_bytes(duration, codec))
    assert response.status_code == 415
    assert not store.objects and test_media._row_count(engine) == 0


@pytest.mark.parametrize("duration", [None, "N/A", "NaN", "Infinity", "0", "-1", "15.000000001"])
def test_unknown_invalid_or_over_limit_duration_cleans_tempfile(monkeypatch, tmp_path, duration):
    payload = tiny_mp4_bytes()
    monkeypatch.setattr(service.tempfile, "tempdir", str(tmp_path))
    metadata = {
        "format": {"duration": duration},
        "streams": [{"codec_type": "video", "codec_name": "h264", "width": 32, "height": 32}],
    }
    monkeypatch.setattr(service.subprocess, "run", lambda *_, **__: SimpleNamespace(stdout=json.dumps(metadata)))
    with pytest.raises(UnsupportedMediaError):
        service.prepare_upload(io.BytesIO(payload), "test.mp4", "video/mp4")
    assert list(tmp_path.iterdir()) == []


def test_all_video_streams_and_container_duration_must_satisfy_contract(monkeypatch, tmp_path):
    good = {"codec_type": "video", "codec_name": "h264", "width": 32, "height": 32, "duration": "1"}
    for metadata in [
        {"format": {"duration": "16"}, "streams": [good]},
        {"format": {"duration": "1"}, "streams": [good, {**good, "codec_name": "hevc"}]},
    ]:
        monkeypatch.setattr(service.subprocess, "run", lambda *_, **__: SimpleNamespace(stdout=json.dumps(metadata)))
        with pytest.raises(UnsupportedMediaError):
            service._probe_mp4(tmp_path / "test.mp4")


@pytest.mark.parametrize("metadata", [[], {"format": None}, {"streams": [None]}, {"streams": {}}])
def test_malformed_probe_metadata_is_safe_and_cleans_tempfile(monkeypatch, tmp_path, metadata):
    payload = tiny_mp4_bytes()
    monkeypatch.setattr(service.tempfile, "tempdir", str(tmp_path))
    monkeypatch.setattr(service.subprocess, "run", lambda *_, **__: SimpleNamespace(stdout=json.dumps(metadata)))
    with pytest.raises(UnsupportedMediaError):
        service.prepare_upload(io.BytesIO(payload), "test.mp4", "video/mp4")
    assert list(tmp_path.iterdir()) == []
