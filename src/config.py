"""
Central configuration for Step 3 — AI Model Training & Evaluation
SIH26052 — Defence Audio Noise Intelligence & AI Noise Suppression System
"""

import os
import random
import numpy as np
import torch

# ──────────────────────────────────────────────
# Reproducibility
# ──────────────────────────────────────────────
SEED: int = 42

# ──────────────────────────────────────────────
# Audio
# ──────────────────────────────────────────────
SAMPLE_RATE: int = 16000
N_FFT: int = 512
HOP_LENGTH: int = 128
WIN_LENGTH: int = 512

# Fixed clip length used for model inputs (3 seconds)
CLIP_DURATION_S: float = 3.0
CLIP_SAMPLES: int = int(SAMPLE_RATE * CLIP_DURATION_S)  # 48000

# ──────────────────────────────────────────────
# Noise classes
# ──────────────────────────────────────────────
NOISE_CLASSES: list = [
    "helicopter",
    "gunshot",
    "explosion",
    "artillery",
    "drone",
    "military_vehicle",
    "heavy_engine",
    "wind",
    "traffic",
    "machinery",
    "siren",
    "crowd",
]
NUM_CLASSES: int = len(NOISE_CLASSES)
CLASS_TO_IDX: dict = {c: i for i, c in enumerate(NOISE_CLASSES)}
IDX_TO_CLASS: dict = {i: c for c, i in CLASS_TO_IDX.items()}

# ──────────────────────────────────────────────
# Dataset
# ──────────────────────────────────────────────
DATASET_CSV: str = os.path.join("data", "metadata", "dataset.csv")

# ──────────────────────────────────────────────
# DataLoader
# ──────────────────────────────────────────────
BATCH_SIZE: int = 16
NUM_WORKERS: int = 0  # Keep 0 for Windows + CPU stability

# ──────────────────────────────────────────────
# Classifier training
# ──────────────────────────────────────────────
CLASSIFIER_LR: float = 3e-4
CLASSIFIER_EPOCHS: int = 40
CLASSIFIER_PATIENCE: int = 8
CLASSIFIER_WEIGHT_DECAY: float = 1e-4
CLASSIFIER_LR_FACTOR: float = 0.5
CLASSIFIER_LR_PATIENCE: int = 4

# ──────────────────────────────────────────────
# Enhancement training
# ──────────────────────────────────────────────
ENHANCEMENT_LR: float = 3e-4
ENHANCEMENT_EPOCHS: int = 40
ENHANCEMENT_PATIENCE: int = 8
ENHANCEMENT_WEIGHT_DECAY: float = 1e-4
ENHANCEMENT_LR_FACTOR: float = 0.5
ENHANCEMENT_LR_PATIENCE: int = 4

# Loss weights
LAMBDA_WAVEFORM: float = 0.1   # weight of time-domain waveform loss
LAMBDA_MASK: float = 1.0        # weight of IRM mask loss
LAMBDA_SPEC: float = 1.0        # weight of spectral magnitude loss
EPSILON: float = 1e-8           # numerical stability

# ──────────────────────────────────────────────
# Output paths
# ──────────────────────────────────────────────
OUTPUT_ROOT: str = "outputs"
MODELS_DIR: str = os.path.join(OUTPUT_ROOT, "models")
TRAINING_DIR: str = os.path.join(OUTPUT_ROOT, "training")
EVAL_DIR: str = os.path.join(OUTPUT_ROOT, "evaluation")
EXAMPLES_DIR: str = os.path.join(EVAL_DIR, "examples")
PLOTS_DIR: str = os.path.join(EVAL_DIR, "plots")

# Model checkpoints
CLASSIFIER_BEST_CKPT: str = os.path.join(MODELS_DIR, "noise_classifier_best.pt")
CLASSIFIER_LAST_CKPT: str = os.path.join(MODELS_DIR, "noise_classifier_last.pt")
UNET_BEST_CKPT: str = os.path.join(MODELS_DIR, "spectral_unet_best.pt")
UNET_LAST_CKPT: str = os.path.join(MODELS_DIR, "spectral_unet_last.pt")

# Training logs
CLASSIFIER_HISTORY: str = os.path.join(TRAINING_DIR, "classifier_history.json")
ENHANCEMENT_HISTORY: str = os.path.join(TRAINING_DIR, "enhancement_history.json")
SKIPPED_SAMPLES: str = os.path.join(TRAINING_DIR, "skipped_samples.csv")

# Evaluation outputs
CLASSIFIER_METRICS: str = os.path.join(EVAL_DIR, "classifier_metrics.json")
CONFUSION_MATRIX_PNG: str = os.path.join(EVAL_DIR, "confusion_matrix.png")
CLASSIFICATION_REPORT: str = os.path.join(EVAL_DIR, "classification_report.txt")
NOISE_WISE_CSV: str = os.path.join(EVAL_DIR, "noise_wise_metrics.csv")
NOISE_WISE_JSON: str = os.path.join(EVAL_DIR, "noise_wise_metrics.json")
STEP3_REPORT_JSON: str = os.path.join(EVAL_DIR, "step3_report.json")
STEP3_REPORT_TXT: str = os.path.join(EVAL_DIR, "step3_report.txt")

# ──────────────────────────────────────────────
# Device
# ──────────────────────────────────────────────
DEVICE: torch.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def set_seed(seed: int = SEED) -> None:
    """Set all random seeds for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    # Note: full determinism requires torch.use_deterministic_algorithms(True)
    # but this can break some ops on CPU; we skip it for robustness.


def make_output_dirs() -> None:
    """Create all required output directories."""
    for d in [MODELS_DIR, TRAINING_DIR, EVAL_DIR, EXAMPLES_DIR, PLOTS_DIR]:
        os.makedirs(d, exist_ok=True)


def print_config() -> None:
    """Print training configuration at startup."""
    print("=" * 60)
    print("  SIH26052 — Step 3 Configuration")
    print("=" * 60)
    print(f"  Device            : {DEVICE}")
    print(f"  Seed              : {SEED}")
    print(f"  Sample rate       : {SAMPLE_RATE} Hz")
    print(f"  N_FFT             : {N_FFT}")
    print(f"  Hop length        : {HOP_LENGTH}")
    print(f"  Win length        : {WIN_LENGTH}")
    print(f"  Clip samples      : {CLIP_SAMPLES}  ({CLIP_DURATION_S}s)")
    print(f"  Num classes       : {NUM_CLASSES}")
    print(f"  Batch size        : {BATCH_SIZE}")
    print(f"  Classifier LR     : {CLASSIFIER_LR}")
    print(f"  Classifier epochs : {CLASSIFIER_EPOCHS}")
    print(f"  Enhancement LR    : {ENHANCEMENT_LR}")
    print(f"  Enhancement epochs: {ENHANCEMENT_EPOCHS}")
    print("=" * 60)
