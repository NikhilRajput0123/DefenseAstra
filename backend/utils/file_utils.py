"""
File utilities — UUID-based temp file management for audio output.
NIRVAN AI / SIH26052

Security:
- UUID-based filenames (no user-supplied filenames exposed)
- Temp directory only
- File size limits enforced at audio service layer
- No path traversal possible (UUIDs + fixed dir)
"""

import logging
import os
import tempfile
import threading
import time
import uuid
from typing import Dict, Optional, Tuple

import numpy as np
import soundfile as sf

logger = logging.getLogger("nirvan.file_utils")

# Audio store: maps audio_id → (path, creation_time)
_audio_store: Dict[str, Tuple[str, float]] = {}
_store_lock = threading.Lock()

# Temp directory for all backend audio files
_TEMP_DIR: Optional[str] = None
_FILE_TTL_SECONDS = 3600  # 1 hour


def get_temp_dir() -> str:
    global _TEMP_DIR
    if _TEMP_DIR is None:
        _TEMP_DIR = tempfile.mkdtemp(prefix="nirvan_")
        logger.info(f"NIRVAN AI temp dir: {_TEMP_DIR}")
    return _TEMP_DIR


def save_audio_temp(audio: np.ndarray, sr: int = 16000) -> str:
    """
    Save audio to a UUID-named temp file.
    Returns the audio_id (UUID string).
    """
    audio_id = str(uuid.uuid4())
    temp_dir = get_temp_dir()
    path = os.path.join(temp_dir, f"{audio_id}.wav")

    audio_clipped = np.clip(audio, -1.0, 1.0).astype(np.float32)
    sf.write(path, audio_clipped, sr, subtype="PCM_16")

    with _store_lock:
        _audio_store[audio_id] = (path, time.monotonic())

    return audio_id


def get_audio_path(audio_id: str) -> Optional[str]:
    """Return file path for a given audio_id, or None if not found/expired."""
    # Sanitize: audio_id must be a valid UUID
    try:
        uuid.UUID(audio_id)
    except ValueError:
        return None

    with _store_lock:
        entry = _audio_store.get(audio_id)

    if entry is None:
        return None

    path, _ = entry
    if not os.path.isfile(path):
        return None

    return path


def cleanup_expired_files() -> int:
    """Remove files older than TTL. Returns number of cleaned files."""
    now = time.monotonic()
    expired = []

    with _store_lock:
        for audio_id, (path, created) in list(_audio_store.items()):
            if now - created > _FILE_TTL_SECONDS:
                expired.append(audio_id)

    cleaned = 0
    for audio_id in expired:
        with _store_lock:
            entry = _audio_store.pop(audio_id, None)
        if entry:
            path, _ = entry
            try:
                if os.path.isfile(path):
                    os.unlink(path)
                    cleaned += 1
            except Exception as e:
                logger.warning(f"Failed to delete temp file {path}: {e}")

    if cleaned > 0:
        logger.info(f"Cleaned up {cleaned} expired audio files.")
    return cleaned


def cleanup_all_files() -> None:
    """Remove all temp audio files. Called at shutdown."""
    with _store_lock:
        all_ids = list(_audio_store.keys())

    for audio_id in all_ids:
        with _store_lock:
            entry = _audio_store.pop(audio_id, None)
        if entry:
            path, _ = entry
            try:
                if os.path.isfile(path):
                    os.unlink(path)
            except Exception:
                pass

    temp_dir = _TEMP_DIR
    if temp_dir and os.path.isdir(temp_dir):
        try:
            os.rmdir(temp_dir)
        except Exception:
            pass
    logger.info("NIRVAN AI temp files cleaned up.")
