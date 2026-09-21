"""
Noise samples router.
GET /api/noise/samples  — returns real noise sample metadata for the dashboard.
NIRVAN AI / SIH26052
"""

import logging
from fastapi import APIRouter

from backend.schemas import NoiseSamplesResponse, NoiseSampleEntry
from backend.services.demo_service import get_noise_samples_metadata

logger = logging.getLogger("nirvan.router.noise")
router = APIRouter(prefix="/api/noise", tags=["Noise Samples"])


@router.get(
    "/samples",
    response_model=NoiseSamplesResponse,
    summary="List real noise samples grouped by category",
)
def list_noise_samples() -> NoiseSamplesResponse:
    """
    Returns metadata for available real noise samples from the frozen dataset.
    Grouped by noise category (12 classes).
    Does NOT return audio data — only metadata for the dashboard noise selector.
    """
    categories_raw = get_noise_samples_metadata()

    categories_typed = {}
    total = 0
    for noise_type, entries in categories_raw.items():
        typed_entries = [
            NoiseSampleEntry(
                id=e["id"],
                filename=e["filename"],
                noise_type=e["noise_type"],
                noise_nature=e["noise_nature"],
                duration_s=e["duration_s"],
            )
            for e in entries
        ]
        categories_typed[noise_type] = typed_entries
        total += len(typed_entries)

    return NoiseSamplesResponse(total=total, categories=categories_typed)
