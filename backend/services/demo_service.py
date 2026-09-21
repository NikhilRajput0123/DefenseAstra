"""
Demo service — controlled demo flow for NIRVAN AI.

Flow:
  Clean speech + Real noise sample + Target SNR
      → mix_speech_and_noise()
      → Noisy audio
      → NoiseSpectrogramClassifier  (real inference)
      → LightweightSpectralUNet     (real inference)
      → Enhanced audio
      → Real metrics
NIRVAN AI / SIH26052
"""

import os
import sys
import logging
import random
from typing import Dict, List, Optional, Tuple

import numpy as np

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC_DIR = os.path.join(PROJECT_ROOT, "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from audio_utils import load_audio, mix_speech_and_noise  # noqa: E402
from config import (  # noqa: E402
    NOISE_CLASSES,
    SAMPLE_RATE,
    CLIP_SAMPLES,
)

logger = logging.getLogger("nirvan.demo_service")

# Paths relative to project root
NOISE_BASE = os.path.join(PROJECT_ROOT, "data", "processed", "noise")
CLEAN_BASE = os.path.join(PROJECT_ROOT, "data", "processed", "clean")

VALID_SNR_DB = [-5.0, 0.0, 5.0, 10.0, 15.0, 20.0]


def _list_noise_files(noise_type: str) -> List[str]:
    """Return sorted list of .wav paths for a noise category."""
    folder = os.path.join(NOISE_BASE, noise_type)
    if not os.path.isdir(folder):
        return []
    return sorted(
        [
            os.path.join(folder, f)
            for f in os.listdir(folder)
            if f.lower().endswith(".wav")
        ]
    )


def _list_clean_files() -> List[str]:
    """Return sorted list of clean speech .wav paths from all speakers."""
    paths = []
    if not os.path.isdir(CLEAN_BASE):
        return paths
    for speaker in sorted(os.listdir(CLEAN_BASE)):
        spk_dir = os.path.join(CLEAN_BASE, speaker)
        if not os.path.isdir(spk_dir):
            continue
        for f in sorted(os.listdir(spk_dir)):
            if f.lower().endswith(".wav"):
                paths.append(os.path.join(spk_dir, f))
    return paths


def get_noise_samples_metadata() -> Dict[str, List[Dict]]:
    """
    Build metadata dict for /api/noise/samples endpoint.
    Returns real files, never fake entries.
    """
    result: Dict[str, List[Dict]] = {}
    for noise_type in NOISE_CLASSES:
        files = _list_noise_files(noise_type)
        entries = []
        for fpath in files[:50]:  # Return max 50 per category
            fname = os.path.basename(fpath)
            sample_id = f"noise_{noise_type}_{fname.replace('.wav', '')}"
            entries.append(
                {
                    "id": sample_id,
                    "filename": fname,
                    "noise_type": noise_type,
                    "noise_nature": _noise_nature(noise_type),
                    "duration_s": None,  # Avoid loading every file
                }
            )
        result[noise_type] = entries
    return result


def _noise_nature(noise_type: str) -> Optional[str]:
    """
    Return noise_nature from dataset metadata where known.
    Values come from dataset.csv (noise_nature column).
    """
    nature_map = {
        "helicopter": "continuous",
        "gunshot": "impulsive",
        "explosion": "impulsive",
        "artillery": "impulsive",
        "drone": "continuous",
        "military_vehicle": "continuous",
        "heavy_engine": "continuous",
        "wind": "continuous",
        "traffic": "continuous",
        "machinery": "continuous",
        "siren": "intermittent",
        "crowd": "continuous",
    }
    return nature_map.get(noise_type)


def load_random_clean_speech() -> np.ndarray:
    """Load a random clean speech clip from the dataset."""
    clean_files = _list_clean_files()
    if not clean_files:
        raise RuntimeError("No clean speech files found in data/processed/clean/")
    path = random.choice(clean_files)
    audio, _ = load_audio(path, target_sr=SAMPLE_RATE, mono=True, normalize=True)
    return audio.astype(np.float32)


def load_random_noise_sample(noise_type: str) -> Tuple[np.ndarray, str]:
    """
    Load a random noise sample of the given type.
    Returns (audio_np, path).
    """
    files = _list_noise_files(noise_type)
    if not files:
        raise ValueError(
            f"No noise files found for noise_type='{noise_type}' "
            f"in {NOISE_BASE}/{noise_type}/"
        )
    path = random.choice(files)
    audio, _ = load_audio(path, target_sr=SAMPLE_RATE, mono=True, normalize=True)
    return audio.astype(np.float32), path


def prepare_demo_audio(
    noise_type: str,
    target_snr_db: float,
    clean_audio: Optional[np.ndarray] = None,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, float, str]:
    """
    Prepare noisy audio using real mix_speech_and_noise from audio_utils.

    Returns
    -------
    clean_clipped   : np.ndarray  (CLIP_SAMPLES,)
    noisy           : np.ndarray  (CLIP_SAMPLES,)
    noise_segment   : np.ndarray  (CLIP_SAMPLES,)
    actual_snr_db   : float
    noise_file_path : str
    """
    if noise_type not in NOISE_CLASSES:
        raise ValueError(
            f"Unknown noise_type '{noise_type}'. "
            f"Valid: {NOISE_CLASSES}"
        )

    if target_snr_db not in VALID_SNR_DB:
        # Accept any float, but warn
        logger.warning(
            f"target_snr_db={target_snr_db} is outside standard demo range "
            f"{VALID_SNR_DB}. Proceeding anyway."
        )

    if clean_audio is None:
        clean_audio = load_random_clean_speech()

    noise_audio, noise_path = load_random_noise_sample(noise_type)

    # Pad/crop clean to CLIP_SAMPLES
    n = len(clean_audio)
    if n < CLIP_SAMPLES:
        reps = int(np.ceil(CLIP_SAMPLES / n))
        clean_audio = np.tile(clean_audio, reps)
    clean_clip = clean_audio[:CLIP_SAMPLES].astype(np.float32)

    # Mix using project's existing function
    noisy, noise_seg, actual_snr = mix_speech_and_noise(
        clean_clip, noise_audio, snr_db=target_snr_db, random_noise_slice=True
    )

    # Ensure exact clip length
    noisy = noisy[:CLIP_SAMPLES].astype(np.float32)
    noise_seg = noise_seg[:CLIP_SAMPLES].astype(np.float32)

    return clean_clip, noisy, noise_seg, float(actual_snr), noise_path
