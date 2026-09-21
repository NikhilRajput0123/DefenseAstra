"""
Audio router — main processing endpoint and audio file serving.

POST /api/audio/process  — full AI pipeline (demo + upload modes)
GET  /api/audio/{audio_id} — serve saved audio for playback
NIRVAN AI / SIH26052
"""

import logging
import os
import uuid
from typing import Optional

from fastapi import APIRouter, Form, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse

from backend.schemas import ProcessingResponse, NoiseClassification, NoisePrediction, NoiseInfo
from backend.services.audio_service import (
    validate_and_load_audio,
    pad_or_crop_to_clip,
    compute_rms_dbfs,
)
from backend.services.demo_service import (
    prepare_demo_audio,
    _noise_nature,
    VALID_SNR_DB,
)
from backend.services.inference_service import classify_noise, enhance_audio
from backend.services.metrics_service import compute_metrics_with_reference
from backend.utils.visualization import build_waveform_response, build_spectrogram_response
from backend.utils.file_utils import save_audio_temp, get_audio_path

logger = logging.getLogger("nirvan.router.audio")
router = APIRouter(prefix="/api/audio", tags=["Audio Processing"])


@router.post(
    "/process",
    response_model=ProcessingResponse,
    summary="Full AI pipeline: classify noise + enhance speech",
)
async def process_audio(
    request: Request,
    speech_audio: UploadFile = File(
        ...,
        description="Clean or noisy speech audio file (WAV/MP3/FLAC)"
    ),
    noise_type: Optional[str] = Form(
        default="helicopter",
        description="Noise type for controlled demo (one of 12 classes)"
    ),
    target_snr_db: float = Form(
        default=0.0,
        description="Target SNR in dB for mixing (-5 to 20)"
    ),
    mode: str = Form(
        default="demo",
        description="'demo' = mix clean speech with real noise; 'upload' = use uploaded audio as-is"
    ),
) -> ProcessingResponse:
    """
    Main NIRVAN AI processing endpoint.

    **Demo mode** (mode=demo):
    1. Receive clean speech audio
    2. Load a real noise sample of noise_type from the dataset
    3. Mix at target_snr_db using the project's mix_speech_and_noise()
    4. Run NoiseSpectrogramClassifier → real noise type + confidence
    5. Run LightweightSpectralUNet → real enhanced audio
    6. Compute real metrics (SNR/SI-SNR/STOI) using clean reference
    7. Return all data

    **Upload mode** (mode=upload):
    1. Receive noisy audio directly
    2. Run classifier + enhancer
    3. Return metrics WITHOUT reference (no clean speech available)
    """
    ms = request.app.state.model_service

    if not ms.classifier_loaded or not ms.enhancer_loaded:
        raise HTTPException(
            status_code=503,
            detail="AI models not loaded. Check backend startup logs."
        )

    # Read uploaded file
    try:
        file_bytes = await speech_audio.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot read uploaded file: {exc}")

    # Validate mode
    mode = mode.strip().lower()
    if mode not in {"demo", "upload"}:
        mode = "demo"

    session_id = str(uuid.uuid4())

    # ─────────────────────────────────────────────
    # Load and validate speech audio
    # ─────────────────────────────────────────────
    try:
        speech_np, sr = validate_and_load_audio(file_bytes, speech_audio.filename or "audio.wav")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    classifier = ms.get_classifier()
    enhancer = ms.get_enhancer()
    device = ms.device

    # ─────────────────────────────────────────────
    # DEMO MODE: mix clean speech + real noise
    # ─────────────────────────────────────────────
    if mode == "demo":
        if not noise_type or noise_type not in [
            "helicopter", "gunshot", "explosion", "artillery", "drone",
            "military_vehicle", "heavy_engine", "wind", "traffic",
            "machinery", "siren", "crowd"
        ]:
            noise_type = "helicopter"

        if target_snr_db < -10.0 or target_snr_db > 30.0:
            raise HTTPException(
                status_code=422,
                detail=f"target_snr_db must be between -10 and 30, got {target_snr_db}"
            )

        try:
            clean_clip, noisy_clip, _noise_seg, actual_snr, _noise_file = prepare_demo_audio(
                noise_type=noise_type,
                target_snr_db=float(target_snr_db),
                clean_audio=speech_np,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception as exc:
            logger.exception("Demo audio preparation failed")
            raise HTTPException(status_code=500, detail=f"Demo preparation failed: {exc}")

        # Clip model input to CLIP_SAMPLES
        noisy_model_input = pad_or_crop_to_clip(noisy_clip)

        # ─── Real classifier inference ───
        try:
            class_id, noise_type_pred, confidence, top_preds, clf_latency = classify_noise(
                classifier, noisy_model_input, device
            )
        except Exception as exc:
            logger.exception("Classifier inference failed")
            raise HTTPException(status_code=500, detail=f"Classifier error: {exc}")

        # ─── Real U-Net inference ───
        try:
            enhanced_np, enh_latency = enhance_audio(enhancer, noisy_model_input, device)
        except Exception as exc:
            logger.exception("Enhancement inference failed")
            raise HTTPException(status_code=500, detail=f"Enhancer error: {exc}")

        # ─── Real metrics with clean reference ───
        metrics_dict = compute_metrics_with_reference(
            clean=clean_clip[:len(enhanced_np)],
            noisy=noisy_model_input[:len(enhanced_np)],
            enhanced=enhanced_np,
            sr=sr,
            classifier_latency_ms=clf_latency,
            enhancement_latency_ms=enh_latency,
        )
        metrics_dict["rms_input"] = compute_rms_dbfs(noisy_model_input)
        metrics_dict["rms_enhanced"] = compute_rms_dbfs(enhanced_np)

        noisy_for_viz = noisy_model_input
        enhanced_for_viz = enhanced_np

    # ─────────────────────────────────────────────
    # UPLOAD MODE: process uploaded noisy audio
    # ─────────────────────────────────────────────
    else:
        noisy_model_input = pad_or_crop_to_clip(speech_np)

        # Classifier
        try:
            class_id, noise_type_pred, confidence, top_preds, clf_latency = classify_noise(
                classifier, noisy_model_input, device
            )
        except Exception as exc:
            logger.exception("Classifier inference failed")
            raise HTTPException(status_code=500, detail=f"Classifier error: {exc}")

        # U-Net
        try:
            enhanced_np, enh_latency = enhance_audio(enhancer, noisy_model_input, device)
        except Exception as exc:
            logger.exception("Enhancement inference failed")
            raise HTTPException(status_code=500, detail=f"Enhancer error: {exc}")

        from backend.services.metrics_service import compute_metrics_no_reference
        metrics_dict = compute_metrics_no_reference(
            classifier_latency_ms=clf_latency,
            enhancement_latency_ms=enh_latency,
        )
        metrics_dict["rms_input"] = compute_rms_dbfs(noisy_model_input)
        metrics_dict["rms_enhanced"] = compute_rms_dbfs(enhanced_np)

        actual_snr = None
        noise_type = noise_type_pred  # use predicted class as label
        noisy_for_viz = noisy_model_input
        enhanced_for_viz = enhanced_np

    # ─────────────────────────────────────────────
    # Save audio files
    # ─────────────────────────────────────────────
    noisy_audio_id = save_audio_temp(noisy_for_viz, sr=sr)
    enhanced_audio_id = save_audio_temp(enhanced_for_viz, sr=sr)

    # ─────────────────────────────────────────────
    # Build visualization data
    # ─────────────────────────────────────────────
    waveform = build_waveform_response(noisy_for_viz, enhanced_for_viz, sr=sr)
    spectrogram = build_spectrogram_response(noisy_for_viz, enhanced_for_viz)

    # ─────────────────────────────────────────────
    # Build response
    # ─────────────────────────────────────────────
    top_preds_models = [
        NoisePrediction(
            class_id=p["class_id"],
            noise_type=p["noise_type"],
            confidence=round(p["confidence"], 4),
        )
        for p in top_preds
    ]

    base_url = str(request.base_url).rstrip("/")

    return ProcessingResponse(
        session_id=session_id,
        mode=mode,
        noise_classification=NoiseClassification(
            class_id=class_id,
            noise_type=noise_type_pred,
            confidence=round(confidence, 4),
            top_predictions=top_preds_models,
        ),
        noise_info=NoiseInfo(
            noise_type=noise_type_pred,
            noise_nature=_noise_nature(noise_type_pred),
            intensity_dbfs=metrics_dict.get("rms_input"),
            class_id=class_id,
            confidence=round(confidence, 4),
        ),
        audio={
            "noisy": {
                "audio_id": noisy_audio_id,
                "url": f"{base_url}/api/audio/{noisy_audio_id}",
                "duration_s": round(len(noisy_for_viz) / sr, 3),
            },
            "enhanced": {
                "audio_id": enhanced_audio_id,
                "url": f"{base_url}/api/audio/{enhanced_audio_id}",
                "duration_s": round(len(enhanced_for_viz) / sr, 3),
            },
        },
        waveform=waveform,
        spectrogram=spectrogram,
        metrics=metrics_dict,
        target_snr_db=float(target_snr_db) if mode == "demo" else None,
        actual_snr_db=round(actual_snr, 2) if actual_snr is not None else None,
    )


@router.get(
    "/{audio_id}",
    summary="Stream saved audio file for playback",
    response_class=FileResponse,
)
def get_audio(audio_id: str) -> FileResponse:
    """
    Serve a previously saved audio file by its UUID.
    Only UUID-named files in the temp directory are accessible.
    """
    path = get_audio_path(audio_id)
    if path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Audio not found or expired: {audio_id}"
        )
    return FileResponse(
        path=path,
        media_type="audio/wav",
        filename=f"{audio_id}.wav",
    )
