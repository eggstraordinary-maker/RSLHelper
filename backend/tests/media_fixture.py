"""Synthetic video fixture, generated without cameras or user recordings."""

from functools import lru_cache
from pathlib import Path
import subprocess
import tempfile


@lru_cache(maxsize=8)
def tiny_mp4_bytes(duration: str = "0.4", codec: str = "libx264") -> bytes:
    with tempfile.TemporaryDirectory(prefix="rsl-test-video-") as directory:
        destination = Path(directory) / "tiny.mp4"
        subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
                "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=5", "-t", duration,
                "-c:v", codec, "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                "-an", str(destination),
            ],
            check=True, capture_output=True, timeout=15,
        )
        return destination.read_bytes()
