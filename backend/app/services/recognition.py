"""Versioned recognition port. Production returns no synthetic predictions."""

from collections import deque
import asyncio
from typing import Literal, Protocol, runtime_checkable
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

PROTOCOL_VERSION = "1.0"
MAX_FRAME_BYTES = 256 * 1024
MAX_FRAMES_PER_SECOND = 5
MAX_IN_FLIGHT = 2
FRAME_TIMEOUT_SECONDS = 5.0


class ContractModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        protected_namespaces=("model_validate", "model_dump"),
    )
    protocol_version: Literal["1.0"] = PROTOCOL_VERSION


class SessionRequest(ContractModel):
    session_id: UUID
    expected_lesson_id: UUID | None = None
    frames_per_second: int = Field(default=5, ge=1, le=MAX_FRAMES_PER_SECOND)
    max_in_flight: Literal[2] = MAX_IN_FLIGHT


class SessionInfo(ContractModel):
    session_id: UUID
    provider_version: str = Field(min_length=1)
    model_version: str = Field(min_length=1)


class JPEGFrame(ContractModel):
    session_id: UUID
    sequence: int = Field(ge=0)
    timestamp_ms: int = Field(ge=0)
    width: int = Field(ge=1, le=1280)
    height: int = Field(ge=1, le=720)
    jpeg: bytes = Field(min_length=4, max_length=MAX_FRAME_BYTES)

    @field_validator("jpeg")
    @classmethod
    def jpeg_envelope(cls, value: bytes) -> bytes:
        # Envelope validation only; the adapter must also decode/verify dimensions.
        if not value.startswith(b"\xff\xd8") or not value.endswith(b"\xff\xd9"):
            raise ValueError("Expected a JPEG frame")
        return value


class RecognitionResult(SessionInfo):
    sequence: int = Field(ge=0)
    kind: Literal["partial", "final"]
    label: str | None = Field(default=None, min_length=1)
    # A model score, never a claim of calibrated accuracy or lesson completion.
    confidence: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)


class SessionEnded(ContractModel):
    session_id: UUID
    reason: Literal[
        "client_closed", "disconnected", "timeout", "provider_unavailable", "overloaded"
    ]


class ProviderStatus(ContractModel):
    available: bool
    configured: bool
    transport: Literal["websocket"] = "websocket"
    reason: Literal["not_configured", "provider_unavailable", "ready"]
    max_frame_bytes: int = MAX_FRAME_BYTES
    max_frames_per_second: int = MAX_FRAMES_PER_SECOND
    max_in_flight: int = MAX_IN_FLIGHT


class RecognitionUnavailableError(RuntimeError):
    """Safe domain error; adapters must not include URLs, credentials or frames."""


class RecognitionTimeoutError(RecognitionUnavailableError):
    pass


class RecognitionProtocolError(RecognitionUnavailableError):
    pass


@runtime_checkable
class RecognitionProvider(Protocol):
    async def health(self) -> ProviderStatus: ...
    async def start_session(self, request: SessionRequest) -> SessionInfo: ...
    async def recognize_frame(self, frame: JPEGFrame) -> RecognitionResult: ...
    async def end_session(self, session_id: UUID) -> SessionEnded: ...


async def recognize_with_timeout(
    provider: RecognitionProvider,
    frame: JPEGFrame,
    timeout: float = FRAME_TIMEOUT_SECONDS,
) -> RecognitionResult:
    try:
        result = await asyncio.wait_for(
            provider.recognize_frame(frame), timeout=timeout
        )
        if result.session_id != frame.session_id or result.sequence != frame.sequence:
            raise RecognitionProtocolError(
                "Recognition response does not match the frame"
            )
        return result
    except asyncio.TimeoutError:
        raise RecognitionTimeoutError("Recognition request timed out") from None


class UnavailableRecognitionProvider:
    """Used until a real, verified adapter and model are connected."""

    def __init__(self, configured: bool = False):
        self.configured = configured

    async def health(self) -> ProviderStatus:
        return ProviderStatus(
            available=False,
            configured=self.configured,
            reason="provider_unavailable" if self.configured else "not_configured",
        )

    async def start_session(self, request: SessionRequest) -> SessionInfo:
        raise RecognitionUnavailableError("Recognition provider is unavailable")

    async def recognize_frame(self, frame: JPEGFrame) -> RecognitionResult:
        raise RecognitionUnavailableError("Recognition provider is unavailable")

    async def end_session(self, session_id: UUID) -> SessionEnded:
        return SessionEnded(session_id=session_id, reason="provider_unavailable")


class BoundedFrameBuffer:
    """A per-session adapter boundary: at most two pending, sampled JPEG frames."""

    def __init__(self, session: SessionRequest):
        self.session = session
        self.pending: deque[JPEGFrame] = deque(maxlen=MAX_IN_FLIGHT)
        self.dropped = 0
        self.closed = False
        self._last_sequence = -1
        self._last_timestamp: int | None = None

    def push(self, frame: JPEGFrame) -> None:
        if self.closed or frame.session_id != self.session.session_id:
            raise ValueError("Inactive recognition session")
        if frame.sequence <= self._last_sequence:
            raise ValueError("Frame sequence must increase")
        if self._last_timestamp is not None and (
            frame.timestamp_ms - self._last_timestamp
            < 1000 / self.session.frames_per_second
        ):
            raise ValueError("Frame rate exceeds session limit")
        if len(self.pending) == MAX_IN_FLIGHT:
            self.pending.popleft()
            self.dropped += 1
        self.pending.append(frame)
        self._last_sequence = frame.sequence
        self._last_timestamp = frame.timestamp_ms

    def close(self) -> None:
        self.closed = True
        self.pending.clear()
