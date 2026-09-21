"""
Pydantic schemas for NIRVAN AI FastAPI backend.
SIH26052 — AI-Powered Adaptive Noise Cancellation for Defence Communication
"""

from typing import Dict, List, Optional, Union
from pydantic import BaseModel, Field


# ─────────────────────────────────────────────
# Noise Classification
# ─────────────────────────────────────────────

class NoisePrediction(BaseModel):
    class_id: int
    noise_type: str
    confidence: float


class NoiseClassification(BaseModel):
    class_id: int
    noise_type: str
    confidence: float
    top_predictions: List[NoisePrediction]


# ─────────────────────────────────────────────
# Waveform / Spectrogram Data
# ─────────────────────────────────────────────

class WaveformData(BaseModel):
    """Downsampled waveform for visualization (not for AI inference)."""
    samples: List[float]
    sample_rate: int
    duration_s: float
    n_samples_original: int
    n_samples_visualization: int


class SpectrogramData(BaseModel):
    """Log-magnitude spectrogram for visualization."""
    data: List[List[float]]   # shape: [freq_bins][time_frames]
    freq_bins: int
    time_frames: int
    n_fft: int
    hop_length: int
    sample_rate: int


class AudioVisualization(BaseModel):
    noisy: WaveformData
    enhanced: WaveformData
    sample_rate: int
    duration_s: float


class SpectrogramVisualization(BaseModel):
    noisy: SpectrogramData
    enhanced: SpectrogramData


# ─────────────────────────────────────────────
# Metrics
# ─────────────────────────────────────────────

class EnhancementMetrics(BaseModel):
    reference_available: bool

    snr_before: Optional[float] = None
    snr_after: Optional[float] = None
    snr_improvement: Optional[float] = None

    si_snr_before: Optional[float] = None
    si_snr_after: Optional[float] = None
    si_snr_improvement: Optional[float] = None

    stoi_before: Optional[float] = None
    stoi_after: Optional[float] = None
    stoi_improvement: Optional[float] = None

    pesq: Optional[float] = None   # Not implemented — requires MSVC build tools

    noise_reduction_pct: Optional[float] = None
    speech_preservation_pct: Optional[float] = None

    classifier_latency_ms: Optional[float] = None
    enhancement_latency_ms: Optional[float] = None
    total_latency_ms: Optional[float] = None

    rms_input: Optional[float] = None
    rms_enhanced: Optional[float] = None


# ─────────────────────────────────────────────
# Audio references (for playback)
# ─────────────────────────────────────────────

class AudioRef(BaseModel):
    audio_id: str
    url: str
    duration_s: float


class ProcessingAudio(BaseModel):
    noisy: AudioRef
    enhanced: AudioRef


# ─────────────────────────────────────────────
# Main processing response
# ─────────────────────────────────────────────

class ProcessingRequest(BaseModel):
    """Body params (passed alongside multipart files via Form)."""
    noise_type: Optional[str] = None
    target_snr_db: float = Field(default=0.0, ge=-10.0, le=30.0)
    mode: str = Field(default="demo")  # "demo" | "upload"


class NoiseInfo(BaseModel):
    noise_type: str
    noise_nature: Optional[str] = None
    intensity_dbfs: Optional[float] = None   # RMS-based dBFS, NOT fake
    class_id: int
    confidence: float


class ProcessingResponse(BaseModel):
    session_id: str
    mode: str

    noise_classification: NoiseClassification
    noise_info: NoiseInfo

    audio: ProcessingAudio
    waveform: AudioVisualization
    spectrogram: SpectrogramVisualization
    metrics: EnhancementMetrics

    target_snr_db: Optional[float] = None
    actual_snr_db: Optional[float] = None

    processing_mode: str = "ai"
    model_used: str = "LightweightSpectralUNet"
    classifier_used: str = "NoiseSpectrogramClassifier"


# ─────────────────────────────────────────────
# Live processing response (no clean reference)
# ─────────────────────────────────────────────

class LiveProcessingResponse(BaseModel):
    session_id: str
    noise_classification: NoiseClassification
    noise_info: NoiseInfo
    audio: AudioRef           # enhanced audio
    noisy_audio: AudioRef     # original input
    waveform: AudioVisualization
    spectrogram: SpectrogramVisualization
    metrics: EnhancementMetrics  # reference_available=False, SNR/SI-SNR=null


# ─────────────────────────────────────────────
# Noise samples
# ─────────────────────────────────────────────

class NoiseSampleEntry(BaseModel):
    id: str
    filename: str
    noise_type: str
    noise_nature: Optional[str]
    duration_s: Optional[float]


class NoiseSamplesResponse(BaseModel):
    total: int
    categories: Dict[str, List[NoiseSampleEntry]]


# ─────────────────────────────────────────────
# Health / System
# ─────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    device: str
    classifier_loaded: bool
    enhancer_loaded: bool
    sample_rate: int
    project: str = "SIH26052"
    system: str = "NIRVAN AI"


class ModelInfo(BaseModel):
    name: str
    loaded: bool
    parameters: Optional[int]
    checkpoint: str


class SystemInfoResponse(BaseModel):
    system: str = "NIRVAN AI"
    project: str = "SIH26052"
    description: str = "AI-Powered Adaptive Noise Cancellation for Defence Communication"
    status: str
    device: str
    sample_rate: int
    n_fft: int
    hop_length: int
    win_length: int
    clip_samples: int
    clip_duration_s: float
    num_classes: int
    noise_classes: List[str]
    classifier: ModelInfo
    enhancer: ModelInfo
    processing_mode: str = "AI inference (CPU)"
    version: str = "1.0.0"


class BenchmarkEnhancement(BaseModel):
    test_samples: int = 1056
    snr_before_db: float = 9.13
    snr_after_db: float = 12.92
    snr_improvement_db: float = 3.79
    si_snr_before_db: float = 8.03
    si_snr_after_db: float = 14.94
    si_snr_improvement_db: float = 6.91
    stoi_before: float = 0.8078
    stoi_after: float = 0.8738
    cpu_latency_ms_per_sample: float = 139.4
    best_epoch: int = 14
    best_val_loss: float = 0.2517


class BenchmarkClassifier(BaseModel):
    test_samples: int = 1056
    accuracy: float = 0.6004
    macro_f1: float = 0.5730
    weighted_f1: float = 0.5854
    macro_precision: float = 0.6055
    macro_recall: float = 0.5852


class BenchmarkResponse(BaseModel):
    note: str = (
        "These are verified offline test-set benchmarks. "
        "They are NOT the current live inference result."
    )
    enhancement: BenchmarkEnhancement
    classifier: BenchmarkClassifier
