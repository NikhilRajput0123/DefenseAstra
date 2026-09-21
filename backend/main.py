"""
NIRVAN AI — FastAPI Backend
SIH26052: AI-Powered Adaptive Noise Cancellation for Defence Communication

Run command:
    cd C:\\SIH26052
    .\\venv\\Scripts\\Activate.ps1
    python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

API Docs:
    http://127.0.0.1:8000/docs   (Swagger UI)
    http://127.0.0.1:8000/redoc  (ReDoc)
"""

import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ─────────────────────────────────────────────
# Configure logging
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("nirvan.main")

# ─────────────────────────────────────────────
# Project path setup
# ─────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC_DIR = os.path.join(PROJECT_ROOT, "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.services.model_service import get_model_service  # noqa: E402
from backend.utils.file_utils import cleanup_all_files  # noqa: E402


# ─────────────────────────────────────────────
# Lifespan — load models on startup, cleanup on shutdown
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager.
    - Loads both AI models once at startup.
    - Cleans up temp audio files on shutdown.
    """
    logger.info("=" * 60)
    logger.info("  NIRVAN AI Backend — Starting Up")
    logger.info("  SIH26052: AI-Powered Adaptive Noise Cancellation")
    logger.info("=" * 60)

    # Load models
    ms = get_model_service()
    try:
        ms.load_models()
        logger.info("✓ NoiseSpectrogramClassifier loaded")
        logger.info("✓ LightweightSpectralUNet loaded")
        logger.info(f"  Device: {ms.device}")
        logger.info(f"  Classifier params: {ms.classifier_params:,}")
        logger.info(f"  Enhancer params:   {ms.enhancer_params:,}")
    except FileNotFoundError as exc:
        logger.critical(f"FATAL: {exc}")
        raise

    # Attach model service to app state for dependency injection
    app.state.model_service = ms

    logger.info("=" * 60)
    logger.info("  NIRVAN AI Backend — Ready")
    logger.info("  Swagger UI: http://127.0.0.1:8000/docs")
    logger.info("=" * 60)

    yield  # ← App is running here

    # Shutdown
    logger.info("NIRVAN AI Backend — Shutting Down")
    cleanup_all_files()
    logger.info("Temp files cleaned. Goodbye.")


# ─────────────────────────────────────────────
# FastAPI app
# ─────────────────────────────────────────────
app = FastAPI(
    title="NIRVAN AI",
    description=(
        "AI-Powered Adaptive Noise Cancellation for Defence Communication\n\n"
        "**Project:** SIH26052\n\n"
        "Real AI pipeline using:\n"
        "- `NoiseSpectrogramClassifier` — 12-class defence noise detection\n"
        "- `LightweightSpectralUNet` — speech enhancement via learned spectral mask\n\n"
        "**No fake data.** All metrics, confidences, and audio are real."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─────────────────────────────────────────────
# CORS — allow frontend dev servers
# ─────────────────────────────────────────────
ALLOWED_ORIGINS = [
    "http://localhost:5173",     # Vite default
    "http://127.0.0.1:5173",
    "http://localhost:3000",     # CRA fallback
    "http://127.0.0.1:3000",
    "http://localhost:5174",     # Vite secondary port
    "http://127.0.0.1:5174",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# Routers
# ─────────────────────────────────────────────
from backend.routers.system import router as system_router  # noqa: E402
from backend.routers.audio import router as audio_router    # noqa: E402
from backend.routers.noise import router as noise_router    # noqa: E402
from backend.routers.live import router as live_router      # noqa: E402

app.include_router(system_router)
app.include_router(audio_router)
app.include_router(noise_router)
app.include_router(live_router)


# ─────────────────────────────────────────────
# Root redirect
# ─────────────────────────────────────────────
from fastapi.responses import RedirectResponse  # noqa: E402


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")
