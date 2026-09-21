"""
Model service — loads both AI models once at startup.
NIRVAN AI / SIH26052
"""

import os
import sys
import logging
from typing import Optional, Tuple

import torch

# Add src/ to path so we can import from the project
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC_DIR = os.path.join(PROJECT_ROOT, "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from models import NoiseSpectrogramClassifier, LightweightSpectralUNet, count_parameters  # noqa: E402
from config import (  # noqa: E402
    CLASSIFIER_BEST_CKPT,
    UNET_BEST_CKPT,
    DEVICE,
    NUM_CLASSES,
    NOISE_CLASSES,
)

logger = logging.getLogger("nirvan.model_service")


class ModelService:
    """
    Singleton-like service that holds both AI models in memory.
    Models are loaded ONCE at FastAPI startup.
    """

    def __init__(self) -> None:
        self._classifier: Optional[NoiseSpectrogramClassifier] = None
        self._enhancer: Optional[LightweightSpectralUNet] = None
        self._classifier_params: Optional[int] = None
        self._enhancer_params: Optional[int] = None
        self._device: torch.device = DEVICE
        self._classifier_loaded: bool = False
        self._enhancer_loaded: bool = False

    @property
    def device(self) -> torch.device:
        return self._device

    @property
    def classifier_loaded(self) -> bool:
        return self._classifier_loaded

    @property
    def enhancer_loaded(self) -> bool:
        return self._enhancer_loaded

    @property
    def classifier_params(self) -> Optional[int]:
        return self._classifier_params

    @property
    def enhancer_params(self) -> Optional[int]:
        return self._enhancer_params

    def load_models(self) -> None:
        """Load both models from checkpoints. Called once during lifespan startup."""
        self._load_classifier()
        self._load_enhancer()

    def _resolve_ckpt(self, rel_path: str) -> str:
        """Resolve checkpoint path relative to project root."""
        if os.path.isabs(rel_path):
            return rel_path
        return os.path.abspath(os.path.join(PROJECT_ROOT, rel_path))

    def _load_classifier(self) -> None:
        ckpt_path = self._resolve_ckpt(CLASSIFIER_BEST_CKPT)
        logger.info(f"Loading classifier from: {ckpt_path}")

        if not os.path.isfile(ckpt_path):
            raise FileNotFoundError(
                f"Classifier checkpoint not found: {ckpt_path}\n"
                "Cannot start backend without trained models."
            )

        model = NoiseSpectrogramClassifier(num_classes=NUM_CLASSES)
        state = torch.load(ckpt_path, map_location=self._device, weights_only=True)

        # Handle both raw state_dict and checkpoint dict wrappers
        if isinstance(state, dict) and "model_state_dict" in state:
            state = state["model_state_dict"]
        elif isinstance(state, dict) and "state_dict" in state:
            state = state["state_dict"]

        model.load_state_dict(state)
        model.to(self._device)
        model.eval()

        self._classifier = model
        self._classifier_params = count_parameters(model)
        self._classifier_loaded = True
        logger.info(
            f"Classifier loaded — {self._classifier_params:,} parameters — device: {self._device}"
        )

    def _load_enhancer(self) -> None:
        ckpt_path = self._resolve_ckpt(UNET_BEST_CKPT)
        logger.info(f"Loading enhancer from: {ckpt_path}")

        if not os.path.isfile(ckpt_path):
            raise FileNotFoundError(
                f"Enhancer checkpoint not found: {ckpt_path}\n"
                "Cannot start backend without trained models."
            )

        model = LightweightSpectralUNet()
        state = torch.load(ckpt_path, map_location=self._device, weights_only=True)

        if isinstance(state, dict) and "model_state_dict" in state:
            state = state["model_state_dict"]
        elif isinstance(state, dict) and "state_dict" in state:
            state = state["state_dict"]

        model.load_state_dict(state)
        model.to(self._device)
        model.eval()

        self._enhancer = model
        self._enhancer_params = count_parameters(model)
        self._enhancer_loaded = True
        logger.info(
            f"Enhancer loaded — {self._enhancer_params:,} parameters — device: {self._device}"
        )

    def get_classifier(self) -> NoiseSpectrogramClassifier:
        if self._classifier is None:
            raise RuntimeError("Classifier not loaded. Check startup logs.")
        return self._classifier

    def get_enhancer(self) -> LightweightSpectralUNet:
        if self._enhancer is None:
            raise RuntimeError("Enhancer not loaded. Check startup logs.")
        return self._enhancer


# Module-level singleton — instantiated once, populated at lifespan startup
_model_service: Optional[ModelService] = None


def get_model_service() -> ModelService:
    global _model_service
    if _model_service is None:
        _model_service = ModelService()
    return _model_service
