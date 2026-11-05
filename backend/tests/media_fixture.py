"""Synthetic video fixture, generated without cameras or user recordings."""

from functools import lru_cache
from pathlib import Path
import subprocess
import tempfile


@lru_cache(maxsize=1)
def tiny_mp4_bytes() -> bytes:
    with tempfile.TemporaryDirectory(prefix="rsl-test-video-") as directory:
        destination = Path(directory) / "tiny.mp4"
        subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
                "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=5", "-t", "0.4",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                "-an", str(destination),
            ],
            check=True, capture_output=True, timeout=15,
        )
        return destination.read_bytes()
