"""
Metrics service — real audio quality metrics using existing project utilities.
NIRVAN AI / SIH26052

For live/microphone audio with no clean reference: returns null for all metrics.
For controlled demo/upload with clean reference: computes real SNR/SI-SNR/STOI.
"""

import os
import sys
import logging
import math
from typing import Optional

import numpy as np

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC_DIR = os.path.join(PROJECT_ROOT, "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from audio_utils import (  # noqa: E402
    calculate_snr,
    calculate_si_snr,
    calculate_stoi,
    compute_all_metrics,
    HAS_PYSTOI,
)

logger = logging.getLogger("nirvan.metrics_service")


def _safe_float(val: float) -> Optional[float]:
    """Return float or None if NaN/Inf."""
    if val is None:
        return None
    if math.isnan(val) or math.isinf(val):
        return None
    return round(float(val), 4)


def compute_metrics_with_reference(
    clean: np.ndarray,
    noisy: np.ndarray,
    enhanced: np.ndarray,
    sr: int,
    classifier_latency_ms: Optional[float] = None,
    enhancement_latency_ms: Optional[float] = None,
) -> dict:
    """
    Compute all real quality metrics when a clean reference is available.

    Returns a dict compatible with EnhancementMetrics schema.
    """
    snr_before = _safe_float(calculate_snr(clean, noisy))
    snr_after = _safe_float(calculate_snr(clean, enhanced))
    snr_improvement = (
        _safe_float(snr_after - snr_before)
        if snr_before is not None and snr_after is not None
        else None
    )

    si_snr_before = _safe_float(calculate_si_snr(clean, noisy))
    si_snr_after = _safe_float(calculate_si_snr(clean, enhanced))
    si_snr_improvement = (
        _safe_float(si_snr_after - si_snr_before)
        if si_snr_before is not None and si_snr_after is not None
        else None
    )

    stoi_before: Optional[float] = None
    stoi_after: Optional[float] = None
    stoi_improvement: Optional[float] = None

    if HAS_PYSTOI:
        raw_before = calculate_stoi(clean, noisy, sr=sr)
        raw_after = calculate_stoi(clean, enhanced, sr=sr)
        stoi_before = _safe_float(raw_before)
        stoi_after = _safe_float(raw_after)
        if stoi_before is not None and stoi_after is not None:
            stoi_improvement = _safe_float(stoi_after - stoi_before)

    # Noise reduction %
    min_len = min(len(clean), len(noisy), len(enhanced))
    c = clean[:min_len]
    n = noisy[:min_len]
    e = enhanced[:min_len]
    noise_in = n - c
    noise_out = e - c
    p_in = float(np.mean(noise_in ** 2)) + 1e-12
    p_out = float(np.mean(noise_out ** 2)) + 1e-12
    noise_reduction_pct = _safe_float(max(0.0, (1.0 - p_out / p_in) * 100.0))

    # Speech preservation correlation
    high_mask = np.abs(c) > (0.1 * np.max(np.abs(c)) + 1e-6)
    if np.sum(high_mask) > 10:
        speech_pres = float(
            np.corrcoef(c[high_mask], e[high_mask])[0, 1] * 100.0
        )
        speech_pres = max(0.0, min(100.0, speech_pres))
    else:
        speech_pres = None  # Not enough voiced frames — don't guess

    total_latency = (
        (classifier_latency_ms or 0.0) + (enhancement_latency_ms or 0.0)
        if classifier_latency_ms is not None or enhancement_latency_ms is not None
        else None
    )

    return {
        "reference_available": True,
        "snr_before": snr_before,
        "snr_after": snr_after,
        "snr_improvement": snr_improvement,
        "si_snr_before": si_snr_before,
        "si_snr_after": si_snr_after,
        "si_snr_improvement": si_snr_improvement,
        "stoi_before": stoi_before,
        "stoi_after": stoi_after,
        "stoi_improvement": stoi_improvement,
        "pesq": None,   # Requires MSVC build tools on Windows
        "noise_reduction_pct": noise_reduction_pct,
        "speech_preservation_pct": _safe_float(speech_pres),
        "classifier_latency_ms": _safe_float(classifier_latency_ms),
        "enhancement_latency_ms": _safe_float(enhancement_latency_ms),
        "total_latency_ms": _safe_float(total_latency),
    }


def compute_metrics_no_reference(
    classifier_latency_ms: Optional[float] = None,
    enhancement_latency_ms: Optional[float] = None,
) -> dict:
    """
    For live/microphone audio: NO clean reference available.
    Returns null for all SNR/SI-SNR/STOI.
    Latency CAN be measured.
    """
    total_latency = (
        (classifier_latency_ms or 0.0) + (enhancement_latency_ms or 0.0)
        if classifier_latency_ms is not None or enhancement_latency_ms is not None
        else None
    )

    return {
        "reference_available": False,
        "snr_before": None,
        "snr_after": None,
        "snr_improvement": None,
        "si_snr_before": None,
        "si_snr_after": None,
        "si_snr_improvement": None,
        "stoi_before": None,
        "stoi_after": None,
        "stoi_improvement": None,
        "pesq": None,
        "noise_reduction_pct": None,
        "speech_preservation_pct": None,
        "classifier_latency_ms": _safe_float(classifier_latency_ms),
        "enhancement_latency_ms": _safe_float(enhancement_latency_ms),
        "total_latency_ms": _safe_float(total_latency),
    }
