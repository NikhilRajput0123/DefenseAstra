"""
System info and health routers.
NIRVAN AI / SIH26052
"""

import os
import sys
import logging
from typing import List

from fastapi import APIRouter, Request

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC_DIR = os.path.join(PROJECT_ROOT, "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from config import (  # noqa: E402
    SAMPLE_RATE, N_FFT, HOP_LENGTH, WIN_LENGTH, CLIP_SAMPLES,
    CLIP_DURATION_S, NUM_CLASSES, NOISE_CLASSES,
    CLASSIFIER_BEST_CKPT, UNET_BEST_CKPT,
)

from backend.schemas import (  # noqa: E402
    HealthResponse,
    SystemInfoResponse,
    ModelInfo,
    BenchmarkResponse,
    BenchmarkEnhancement,
    BenchmarkClassifier,
)

logger = logging.getLogger("nirvan.router.system")
router = APIRouter(tags=["System"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check — models loaded + device status",
)
def health_check(request: Request) -> HealthResponse:
    """
    Returns real backend status. Both models must be loaded for status=online.
    """
    ms = request.app.state.model_service
    classifier_ok = ms.classifier_loaded
    enhancer_ok = ms.enhancer_loaded
    status = "online" if (classifier_ok and enhancer_ok) else "degraded"
    device_str = str(ms.device)

    return HealthResponse(
        status=status,
        device=device_str,
        classifier_loaded=classifier_ok,
        enhancer_loaded=enhancer_ok,
        sample_rate=SAMPLE_RATE,
    )


@router.get(
    "/api/system/info",
    response_model=SystemInfoResponse,
    summary="Full system and model information",
)
def system_info(request: Request) -> SystemInfoResponse:
    """
    Returns programmatically obtained system information.
    Parameter counts come from the actual loaded models.
    """
    ms = request.app.state.model_service

    clf_info = ModelInfo(
        name="NoiseSpectrogramClassifier",
        loaded=ms.classifier_loaded,
        parameters=ms.classifier_params,
        checkpoint=os.path.basename(CLASSIFIER_BEST_CKPT),
    )
    enh_info = ModelInfo(
        name="LightweightSpectralUNet",
        loaded=ms.enhancer_loaded,
        parameters=ms.enhancer_params,
        checkpoint=os.path.basename(UNET_BEST_CKPT),
    )

    device_str = str(ms.device)
    status = "online" if (ms.classifier_loaded and ms.enhancer_loaded) else "degraded"

    return SystemInfoResponse(
        status=status,
        device=device_str,
        sample_rate=SAMPLE_RATE,
        n_fft=N_FFT,
        hop_length=HOP_LENGTH,
        win_length=WIN_LENGTH,
        clip_samples=CLIP_SAMPLES,
        clip_duration_s=CLIP_DURATION_S,
        num_classes=NUM_CLASSES,
        noise_classes=NOISE_CLASSES,
        classifier=clf_info,
        enhancer=enh_info,
    )


@router.get(
    "/api/benchmarks",
    response_model=BenchmarkResponse,
    summary="Verified offline test-set benchmarks (NOT live results)",
)
def get_benchmarks() -> BenchmarkResponse:
    """
    Returns the verified benchmark numbers from the offline test set evaluation.
    These are NOT live inference results — they are pre-computed evaluation results.
    """
    return BenchmarkResponse(
        enhancement=BenchmarkEnhancement(),
        classifier=BenchmarkClassifier(),
    )
