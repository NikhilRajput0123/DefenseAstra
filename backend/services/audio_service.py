"""
Audio service — loading, validation, preprocessing for NIRVAN AI.
SIH26052
"""

import io
import os
import sys
import logging
import tempfile
from typing import Optional, Tuple

import numpy as np
import soundfile as sf
import torch

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC_DIR = os.path.join(PROJECT_ROOT, "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from audio_utils import load_audio  # noqa: E402
from config import SAMPLE_RATE, CLIP_SAMPLES  # noqa: E402

logger = logging.getLogger("nirvan.audio_service")

# Maximum allowed upload: 30 seconds at 16 kHz mono float32
MAX_AUDIO_SAMPLES = SAMPLE_RATE * 30
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


def validate_and_load_audio(
    file_bytes: bytes,
    filename: str,
    max_bytes: int = MAX_FILE_BYTES,
) -> Tuple[np.ndarray, int]:
    """
    Validate audio bytes and load as 16 kHz mono float32.

    Returns
    -------
    audio : np.ndarray  shape (N,)  float32
    sample_rate : int
    """
    if len(file_bytes) == 0:
        raise ValueError("Audio file is empty.")
    if len(file_bytes) > max_bytes:
        raise ValueError(
            f"Audio file too large: {len(file_bytes) / 1024:.0f} KB "
            f"(max {max_bytes // 1024} KB)"
        )

    # Write to temp file for soundfile compatibility
    suffix = os.path.splitext(filename)[-1].lower() or ".wav"
    valid_suffixes = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".webm"}
    if suffix not in valid_suffixes:
        suffix = ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        audio, sr = load_audio(
            tmp_path,
            target_sr=SAMPLE_RATE,
            mono=True,
            normalize=True,
        )
    except Exception as exc:
        raise ValueError(f"Cannot decode audio file '{filename}': {exc}") from exc
    finally:
        os.unlink(tmp_path)

    if len(audio) == 0:
        raise ValueError("Audio is empty after loading.")
    if not np.isfinite(audio).all():
        raise ValueError("Audio contains NaN or Inf values.")
    if len(audio) > MAX_AUDIO_SAMPLES:
        # Truncate silently — we don't refuse, just trim
        audio = audio[:MAX_AUDIO_SAMPLES]
        logger.warning(f"Audio truncated to {MAX_AUDIO_SAMPLES} samples (30s).")

    return audio.astype(np.float32), SAMPLE_RATE


def pad_or_crop_to_clip(audio: np.ndarray, clip_samples: int = CLIP_SAMPLES) -> np.ndarray:
    """
    Pad or crop audio to exactly clip_samples.
    - Shorter audio is repeated (tiled) then cropped.
    - Longer audio is cropped from the start.
    """
    n = len(audio)
    if n == clip_samples:
        return audio.astype(np.float32)
    if n > clip_samples:
        return audio[:clip_samples].astype(np.float32)
    reps = int(np.ceil(clip_samples / n))
    return np.tile(audio, reps)[:clip_samples].astype(np.float32)


def audio_to_tensor(audio: np.ndarray, device: torch.device) -> torch.Tensor:
    """Convert numpy (N,) float32 → torch (1, N) on device."""
    return torch.from_numpy(audio).float().unsqueeze(0).to(device)


def tensor_to_audio(tensor: torch.Tensor) -> np.ndarray:
    """Convert torch (1, N) or (N,) → numpy (N,) float32 clipped to [-1,1]."""
    arr = tensor.detach().cpu().squeeze().numpy().astype(np.float32)
    return np.clip(arr, -1.0, 1.0)


def compute_rms_dbfs(audio: np.ndarray) -> Optional[float]:
    """Compute RMS level in dBFS. Returns None if audio is silent."""
    rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))
    if rms < 1e-10:
        return None
    dbfs = 20.0 * np.log10(rms + 1e-12)
    return round(dbfs, 2)
