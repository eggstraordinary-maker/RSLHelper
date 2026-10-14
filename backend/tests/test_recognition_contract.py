from uuid import UUID, uuid4
import asyncio

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.services.recognition import (
    MAX_FRAME_BYTES,
    BoundedFrameBuffer,
    JPEGFrame,
    ProviderStatus,
    RecognitionProvider,
    RecognitionResult,
    RecognitionUnavailableError,
    RecognitionTimeoutError,
    SessionEnded,
    SessionInfo,
    SessionRequest,
    UnavailableRecognitionProvider,
    recognize_with_timeout,
    RecognitionProtocolError,
)

SESSION_ID = UUID("11111111-1111-4111-8111-111111111111")
# Minimal envelope fixture: exercises the port, NOT JPEG decoding or ML inference.
FRAME_BYTES = b"\xff\xd8contract-test-only\xff\xd9"


def frame(sequence=0, timestamp_ms=0, **overrides):
    return JPEGFrame(
        session_id=SESSION_ID,
        sequence=sequence,
        timestamp_ms=timestamp_ms,
        width=1,
        height=1,
        jpeg=FRAME_BYTES,
        **overrides,
    )


class FixtureProvider:
    """Only imported in tests. Fixture output is explicitly not a translation."""

    def __init__(self):
        self.session = None

    async def health(self):
        return ProviderStatus(available=True, configured=True, reason="ready")

    async def start_session(self, request):
        self.session = request.session_id
        return SessionInfo(
            session_id=self.session,
            provider_version="contract-fixture-v1",
            model_version="no-model-test-fixture",
        )

    async def recognize_frame(self, image):
        if image.session_id != self.session:
            raise RecognitionUnavailableError("Inactive recognition session")
        return RecognitionResult(
            session_id=image.session_id,
            sequence=image.sequence,
            kind="final",
            label="__contract_fixture_not_a_prediction__",
            confidence=0.25,
            provider_version="contract-fixture-v1",
            model_version="no-model-test-fixture",
        )

    async def end_session(self, session_id):
        self.session = None
        return SessionEnded(session_id=session_id, reason="client_closed")


@pytest.mark.asyncio
async def test_typed_provider_session_frame_result_and_close_contract():
    provider = FixtureProvider()
    assert isinstance(provider, RecognitionProvider)
    assert (await provider.health()).available
    session = await provider.start_session(SessionRequest(session_id=SESSION_ID))
    result = await provider.recognize_frame(frame())
    assert result.session_id == session.session_id
    assert result.protocol_version == "1.0"
    assert result.label == "__contract_fixture_not_a_prediction__"
    assert result.confidence == 0.25
    assert result.model_version == "no-model-test-fixture"
    assert (await provider.end_session(SESSION_ID)).reason == "client_closed"
    with pytest.raises(RecognitionUnavailableError):
        await provider.recognize_frame(frame())


@pytest.mark.asyncio
@pytest.mark.parametrize("configured", [False, True])
async def test_production_provider_never_returns_a_fake_result(configured):
    provider = UnavailableRecognitionProvider(configured=configured)
    assert isinstance(provider, RecognitionProvider)
    status = await provider.health()
    assert status.available is False
    assert status.configured is configured
    with pytest.raises(RecognitionUnavailableError):
        await provider.start_session(SessionRequest(session_id=SESSION_ID))
    with pytest.raises(RecognitionUnavailableError):
        await provider.recognize_frame(frame())
    assert (await provider.end_session(SESSION_ID)).reason == "provider_unavailable"


@pytest.mark.parametrize(
    "change",
    [
        {"protocol_version": "2.0"},
        {"frames_per_second": 6},
        {"max_in_flight": 100},
        {"unknown": 1},
    ],
)
def test_rejects_unsupported_session_protocol_and_limits(change):
    with pytest.raises(ValidationError):
        SessionRequest(session_id=SESSION_ID, **change)


@pytest.mark.parametrize(
    "change",
    [
        {"jpeg": b"not-jpeg"},
        {"jpeg": b"\xff\xd8" + b"x" * MAX_FRAME_BYTES + b"\xff\xd9"},
        {"width": 1281},
        {"height": 721},
        {"sequence": -1},
    ],
)
def test_rejects_invalid_frame_format_dimensions_and_size(change):
    data = dict(
        session_id=SESSION_ID,
        sequence=0,
        timestamp_ms=0,
        width=1,
        height=1,
        jpeg=FRAME_BYTES,
    )
    data.update(change)
    with pytest.raises(ValidationError):
        JPEGFrame(**data)


def test_buffer_bounds_memory_drops_oldest_and_rejects_late_closed_and_fast_frames():
    buffer = BoundedFrameBuffer(SessionRequest(session_id=SESSION_ID))
    for i in range(10):
        buffer.push(frame(i, i * 200))
    assert [item.sequence for item in buffer.pending] == [8, 9]
    assert buffer.dropped == 8
    with pytest.raises(ValueError):
        buffer.push(frame(9, 2000))
    with pytest.raises(ValueError):
        buffer.push(frame(10, 1850))
    with pytest.raises(ValueError):
        buffer.push(
            JPEGFrame(
                session_id=uuid4(),
                sequence=10,
                timestamp_ms=2000,
                width=1,
                height=1,
                jpeg=FRAME_BYTES,
            )
        )
    buffer.close()
    assert len(buffer.pending) == 0
    with pytest.raises(ValueError):
        buffer.push(frame(10, 2000))


def test_rejects_invalid_model_confidence_and_public_status_is_honest():
    for confidence in (-0.1, 1.1, float("nan")):
        with pytest.raises(ValidationError):
            RecognitionResult(
                session_id=SESSION_ID,
                sequence=0,
                kind="final",
                confidence=confidence,
                provider_version="test",
                model_version="test",
            )
    with TestClient(app) as client:
        response = client.get("/recognition/status")
    assert response.status_code == 200
    assert response.json()["available"] is False
    assert "endpoint" not in response.json()


@pytest.mark.asyncio
async def test_provider_timeout_cancels_work_and_exposes_a_safe_error():
    cancelled = asyncio.Event()

    class SlowFixture(FixtureProvider):
        async def recognize_frame(self, image):
            try:
                await asyncio.sleep(60)
            finally:
                cancelled.set()

    with pytest.raises(RecognitionTimeoutError, match="Recognition request timed out"):
        await recognize_with_timeout(SlowFixture(), frame(), timeout=0.01)
    assert cancelled.is_set()


@pytest.mark.asyncio
@pytest.mark.parametrize("change", [{"session_id": uuid4()}, {"sequence": 99}])
async def test_response_from_other_session_or_frame_is_rejected(change):
    class WrongResponseFixture(FixtureProvider):
        async def recognize_frame(self, image):
            return (await super().recognize_frame(image)).model_copy(update=change)

    provider = WrongResponseFixture()
    await provider.start_session(SessionRequest(session_id=SESSION_ID))
    with pytest.raises(RecognitionProtocolError):
        await recognize_with_timeout(provider, frame())
