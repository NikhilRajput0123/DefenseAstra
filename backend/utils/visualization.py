"""
Visualization utilities — waveform downsampling and spectrogram data generation.
NIRVAN AI / SIH26052

IMPORTANT:
- Downsampling is ONLY for browser visualization.
- AI model input/output always uses full-resolution audio.
- Spectrograms use exact project STFT parameters: N_FFT=512, HOP=128, WIN=512.
"""

import os
import sys
import logging
from typing import List, Optional

import numpy as np
import torch

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC_DIR = os.path.join(PROJECT_ROOT, "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from audio_utils import compute_stft  # noqa: E402
from config import N_FFT, HOP_LENGTH, WIN_LENGTH, SAMPLE_RATE  # noqa: E402

logger = logging.getLogger("nirvan.visualization")

# Max points sent to browser for waveform visualization
WAVEFORM_VIZ_MAX_POINTS = 1000


def downsample_waveform(audio: np.ndarray, max_points: int = WAVEFORM_VIZ_MAX_POINTS) -> List[float]:
    """
    Downsample audio to at most max_points for browser visualization.
    Uses max-amplitude envelope per window (preserves peak shape better than mean).
    DOES NOT affect AI inference.
    """
    n = len(audio)
    if n == 0:
        return []

    if n <= max_points:
        return [round(float(x), 6) for x in audio]

    window = n // max_points
    out = []
    for i in range(0, n - window + 1, window):
        chunk = audio[i : i + window]
        # Use max-abs envelope value (signed by max absolute position)
        max_idx = int(np.argmax(np.abs(chunk)))
        out.append(round(float(chunk[max_idx]), 6))

    return out[:max_points]


def compute_spectrogram_data(audio: np.ndarray) -> dict:
    """
    Compute log-magnitude spectrogram (dB) for visualization.
    Uses exact project STFT parameters.

    Returns dict with:
        data        : List[List[float]]  shape [freq_bins][time_frames]
        freq_bins   : int
        time_frames : int
        n_fft       : int
        hop_length  : int
        sample_rate : int
    """
    magnitude, _ = compute_stft(
        audio,
        n_fft=N_FFT,
        hop_length=HOP_LENGTH,
        win_length=WIN_LENGTH,
    )
    # magnitude: (1, F, T) or (F, T)
    if magnitude.dim() == 3:
        mag = magnitude.squeeze(0)  # (F, T)
    else:
        mag = magnitude  # (F, T)

    # Convert to log-dB
    log_mag = 20.0 * torch.log10(mag + 1e-5)  # (F, T)
    log_mag_np = log_mag.cpu().numpy()

    freq_bins, time_frames = log_mag_np.shape

    # Downsample time axis for browser if too many frames
    max_time_frames = 300
    if time_frames > max_time_frames:
        step = time_frames // max_time_frames
        log_mag_np = log_mag_np[:, ::step]
        time_frames = log_mag_np.shape[1]

    # Round to 2 decimal places for compact JSON
    data = [[round(float(v), 2) for v in row] for row in log_mag_np]

    return {
        "data": data,
        "freq_bins": freq_bins,
        "time_frames": time_frames,
        "n_fft": N_FFT,
        "hop_length": HOP_LENGTH,
        "sample_rate": SAMPLE_RATE,
    }


def build_waveform_response(
    noisy: np.ndarray,
    enhanced: np.ndarray,
    sr: int = SAMPLE_RATE,
) -> dict:
    """Build the waveform dict for the API response."""
    duration_s = len(noisy) / sr

    noisy_viz = downsample_waveform(noisy)
    enhanced_viz = downsample_waveform(enhanced)

    return {
        "noisy": {
            "samples": noisy_viz,
            "sample_rate": sr,
            "duration_s": round(duration_s, 3),
            "n_samples_original": len(noisy),
            "n_samples_visualization": len(noisy_viz),
        },
        "enhanced": {
            "samples": enhanced_viz,
            "sample_rate": sr,
            "duration_s": round(duration_s, 3),
            "n_samples_original": len(enhanced),
            "n_samples_visualization": len(enhanced_viz),
        },
        "sample_rate": sr,
        "duration_s": round(duration_s, 3),
    }


def build_spectrogram_response(noisy: np.ndarray, enhanced: np.ndarray) -> dict:
    """Build the spectrogram dict for the API response."""
    noisy_spec = compute_spectrogram_data(noisy)
    enhanced_spec = compute_spectrogram_data(enhanced)
    return {
        "noisy": noisy_spec,
        "enhanced": enhanced_spec,
    }
