"""
Inference service — real AI inference using NoiseSpectrogramClassifier and
LightweightSpectralUNet.
NIRVAN AI / SIH26052
"""

import os
import sys
import logging
import time
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn.functional as F

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC_DIR = os.path.join(PROJECT_ROOT, "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from config import NOISE_CLASSES, NUM_CLASSES  # noqa: E402

logger = logging.getLogger("nirvan.inference_service")


# ─────────────────────────────────────────────
# Classifier Inference
# ─────────────────────────────────────────────

def classify_noise(
    model,
    waveform_np: np.ndarray,
    device: torch.device,
) -> Tuple[int, str, float, List[Dict]]:
    """
    Run NoiseSpectrogramClassifier on waveform_np.

    Parameters
    ----------
    model        : NoiseSpectrogramClassifier (already eval(), on device)
    waveform_np  : np.ndarray  shape (N,)  float32
    device       : torch.device

    Returns
    -------
    class_id     : int
    noise_type   : str
    confidence   : float  (softmax probability of top class)
    top_preds    : List[{class_id, noise_type, confidence}]
    latency_ms   : float
    """
    tensor = torch.from_numpy(waveform_np).float().unsqueeze(0).to(device)  # (1, N)

    t_start = time.perf_counter()
    with torch.no_grad():
        logits = model(tensor)  # (1, NUM_CLASSES)
    if device.type == "cuda":
        torch.cuda.synchronize()
    t_end = time.perf_counter()

    latency_ms = (t_end - t_start) * 1000.0

    probs = F.softmax(logits, dim=-1).squeeze(0).cpu().numpy()  # (NUM_CLASSES,)

    class_id = int(np.argmax(probs))
    noise_type = NOISE_CLASSES[class_id]
    confidence = float(probs[class_id])

    # Top-5 predictions
    top_indices = np.argsort(probs)[::-1][:5]
    top_preds = [
        {
            "class_id": int(i),
            "noise_type": NOISE_CLASSES[i],
            "confidence": float(probs[i]),
        }
        for i in top_indices
    ]

    return class_id, noise_type, confidence, top_preds, latency_ms


# ─────────────────────────────────────────────
# Enhancement Inference
# ─────────────────────────────────────────────

def enhance_audio(
    model,
    waveform_np: np.ndarray,
    device: torch.device,
) -> Tuple[np.ndarray, float]:
    """
    Run LightweightSpectralUNet on noisy waveform.

    Parameters
    ----------
    model        : LightweightSpectralUNet (already eval(), on device)
    waveform_np  : np.ndarray  shape (N,)  float32
    device       : torch.device

    Returns
    -------
    enhanced_np  : np.ndarray  shape (N,)  float32  clipped to [-1, 1]
    latency_ms   : float
    """
    tensor = torch.from_numpy(waveform_np).float().unsqueeze(0).to(device)  # (1, N)

    t_start = time.perf_counter()
    with torch.no_grad():
        enhanced_tensor, _mask = model(tensor)  # (1, N)
    if device.type == "cuda":
        torch.cuda.synchronize()
    t_end = time.perf_counter()

    latency_ms = (t_end - t_start) * 1000.0

    enhanced_np = enhanced_tensor.squeeze(0).cpu().numpy().astype(np.float32)
    enhanced_np = np.clip(enhanced_np, -1.0, 1.0)

    return enhanced_np, latency_ms
