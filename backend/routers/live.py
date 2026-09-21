"""
Live audio processing router.

POST /api/live/process — process microphone audio chunk.
No clean reference → no fake SNR/SI-SNR/STOI. Latency measured.
NIRVAN AI / SIH26052
"""

import logging
import uuid

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from backend.schemas import LiveProcessingResponse, NoiseClassification, NoisePrediction, NoiseInfo
from backend.services.audio_service import (
    validate_and_load_audio,
    pad_or_crop_to_clip,
    compute_rms_dbfs,
)
from backend.services.demo_service import _noise_nature
from backend.services.inference_service import classify_noise, enhance_audio
from backend.services.metrics_service import compute_metrics_no_reference
from backend.utils.visualization import build_waveform_response, build_spectrogram_response
from backend.utils.file_utils import save_audio_temp

logger = logging.getLogger("nirvan.router.live")
router = APIRouter(prefix="/api/live", tags=["Live Processing"])


@router.post(
    "/process",
    response_model=LiveProcessingResponse,
    summary="Process live microphone audio chunk (no clean reference)",
)
async def live_process(
    request: Request,
    audio_chunk: UploadFile = File(
        ...,
        description="Short audio chunk from microphone (WAV/WebM/OGG)"
    ),
) -> LiveProcessingResponse:
    """
    Process a live microphone audio chunk through the real AI pipeline.

    Since there is NO clean reference audio:
    - SNR, SI-SNR, STOI are all null (reference_available: false)
    - Latency IS measured
    - Classifier confidence IS measured
    - RMS/dBFS level IS measured
    """
    ms = request.app.state.model_service

    if not ms.classifier_loaded or not ms.enhancer_loaded:
        raise HTTPException(
            status_code=503,
            detail="AI models not loaded. Check backend startup logs."
        )

    try:
        file_bytes = await audio_chunk.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot read audio chunk: {exc}")

    try:
        audio_np, sr = validate_and_load_audio(
            file_bytes, audio_chunk.filename or "chunk.wav"
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Clip to model input size
    noisy_input = pad_or_crop_to_clip(audio_np)

    classifier = ms.get_classifier()
    enhancer = ms.get_enhancer()
    device = ms.device

    # ─── Real classifier ───
    try:
        class_id, noise_type, confidence, top_preds, clf_latency = classify_noise(
            classifier, noisy_input, device
        )
    except Exception as exc:
        logger.exception("Live classifier failed")
        raise HTTPException(status_code=500, detail=f"Classifier error: {exc}")

    # ─── Real U-Net ───
    try:
        enhanced_np, enh_latency = enhance_audio(enhancer, noisy_input, device)
    except Exception as exc:
        logger.exception("Live enhancer failed")
        raise HTTPException(status_code=500, detail=f"Enhancer error: {exc}")

    # No reference → all SNR/STOI are null
    metrics_dict = compute_metrics_no_reference(
        classifier_latency_ms=clf_latency,
        enhancement_latency_ms=enh_latency,
    )
    metrics_dict["rms_input"] = compute_rms_dbfs(noisy_input)
    metrics_dict["rms_enhanced"] = compute_rms_dbfs(enhanced_np)

    # Save audio for playback
    noisy_audio_id = save_audio_temp(noisy_input, sr=sr)
    enhanced_audio_id = save_audio_temp(enhanced_np, sr=sr)

    # Visualization
    waveform = build_waveform_response(noisy_input, enhanced_np, sr=sr)
    spectrogram = build_spectrogram_response(noisy_input, enhanced_np)

    top_preds_models = [
        NoisePrediction(
            class_id=p["class_id"],
            noise_type=p["noise_type"],
            confidence=round(p["confidence"], 4),
        )
        for p in top_preds
    ]

    session_id = str(uuid.uuid4())
    base_url = str(request.base_url).rstrip("/")
    duration_s = round(len(enhanced_np) / sr, 3)

    return LiveProcessingResponse(
        session_id=session_id,
        noise_classification=NoiseClassification(
            class_id=class_id,
            noise_type=noise_type,
            confidence=round(confidence, 4),
            top_predictions=top_preds_models,
        ),
        noise_info=NoiseInfo(
            noise_type=noise_type,
            noise_nature=_noise_nature(noise_type),
            intensity_dbfs=metrics_dict.get("rms_input"),
            class_id=class_id,
            confidence=round(confidence, 4),
        ),
        audio={"audio_id": enhanced_audio_id, "url": f"{base_url}/api/audio/{enhanced_audio_id}", "duration_s": duration_s},
        noisy_audio={"audio_id": noisy_audio_id, "url": f"{base_url}/api/audio/{noisy_audio_id}", "duration_s": duration_s},
        waveform=waveform,
        spectrogram=spectrogram,
        metrics=metrics_dict,
    )
