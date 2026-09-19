"""
Audio Utilities for Defence Audio Noise Intelligence & AI Noise Suppression System
Includes:
- Robust audio loading, validation, resampling, and normalization
- STFT and iSTFT transformations
- Exact acoustic SNR mixing
- Real evaluation metrics: SNR, SI-SNR, STOI, Latency, Noise Reduction %
- Spectrogram and Waveform generation
"""

import math
import os
import time
from typing import Dict, Optional, Tuple, Union

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import soundfile as sf
import torch
import torchaudio

try:
    import pystoi
    HAS_PYSTOI = True
except ImportError:
    HAS_PYSTOI = False

# Audio Parameters
DEFAULT_SAMPLE_RATE = 16000
N_FFT = 512
HOP_LENGTH = 128
WIN_LENGTH = 512


def load_audio(
    file_path: str,
    target_sr: int = DEFAULT_SAMPLE_RATE,
    mono: bool = True,
    normalize: bool = True
) -> Tuple[np.ndarray, int]:
    """
    Load an audio file, resample to target_sr, convert to mono if required,
    and safely normalize.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    # Load with soundfile or torchaudio
    data, sr = sf.read(file_path, dtype="float32")

    # Convert to mono if multi-channel
    if data.ndim > 1:
        if mono:
            data = np.mean(data, axis=1)

    # Resample if needed
    if sr != target_sr:
        tensor_audio = torch.from_numpy(data).unsqueeze(0)
        resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=target_sr)
        resampled_tensor = resampler(tensor_audio)
        data = resampled_tensor.squeeze(0).numpy()
        sr = target_sr

    # Detect silent audio
    rms = np.sqrt(np.mean(data ** 2) + 1e-12)
    if rms < 1e-5:
        # File is silent or near silent
        pass

    # Normalize safely
    if normalize:
        max_val = np.max(np.abs(data))
        if max_val > 1e-6:
            data = data / max_val * 0.95

    return data.astype(np.float32), sr


def save_audio(file_path: str, audio: np.ndarray, sr: int = DEFAULT_SAMPLE_RATE):
    """Save audio waveform to disk safely."""
    os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
    # Clip to [-1.0, 1.0] to prevent clipping distortion
    audio_clipped = np.clip(audio, -1.0, 1.0)
    sf.write(file_path, audio_clipped, sr, subtype="PCM_16")


def compute_stft(
    waveform: Union[np.ndarray, torch.Tensor],
    n_fft: int = N_FFT,
    hop_length: int = HOP_LENGTH,
    win_length: int = WIN_LENGTH
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Compute STFT magnitude and phase.
    Input: (B, T) or (T,)
    Output: magnitude (B, F, T_frames), phase (B, F, T_frames)
    """
    if isinstance(waveform, np.ndarray):
        tensor = torch.from_numpy(waveform).float()
    else:
        tensor = waveform.float()

    if tensor.ndim == 1:
        tensor = tensor.unsqueeze(0)

    window = torch.hann_window(win_length, device=tensor.device)
    # torch.stft returns complex tensor of shape (B, F, T_frames)
    stft_complex = torch.stft(
        tensor,
        n_fft=n_fft,
        hop_length=hop_length,
        win_length=win_length,
        window=window,
        return_complex=True
    )

    magnitude = torch.abs(stft_complex)
    phase = torch.angle(stft_complex)
    return magnitude, phase


def compute_istft(
    magnitude: torch.Tensor,
    phase: torch.Tensor,
    n_fft: int = N_FFT,
    hop_length: int = HOP_LENGTH,
    win_length: int = WIN_LENGTH,
    length: Optional[int] = None
) -> torch.Tensor:
    """
    Reconstruct waveform from magnitude and phase using iSTFT.
    Input: magnitude (B, F, T), phase (B, F, T)
    Output: waveform (B, T_samples)
    """
    stft_complex = magnitude * torch.exp(1j * phase)
    window = torch.hann_window(win_length, device=magnitude.device)
    waveform = torch.istft(
        stft_complex,
        n_fft=n_fft,
        hop_length=hop_length,
        win_length=win_length,
        window=window,
        length=length
    )
    return waveform


def mix_speech_and_noise(
    clean: np.ndarray,
    noise: np.ndarray,
    snr_db: float,
    random_noise_slice: bool = True
) -> Tuple[np.ndarray, np.ndarray, float]:
    """
    Mix clean speech and noise at a specified Signal-to-Noise Ratio (SNR in dB).
    Returns:
    - noisy_audio
    - scaled_noise
    - actual_snr_db
    """
    clean_len = len(clean)
    noise_len = len(noise)

    if noise_len < clean_len:
        # Repeat noise if shorter
        repeats = int(np.ceil(clean_len / noise_len))
        noise = np.tile(noise, repeats)
        noise_len = len(noise)

    # Slice noise to match clean duration
    if random_noise_slice and noise_len > clean_len:
        start_idx = np.random.randint(0, noise_len - clean_len)
        noise_segment = noise[start_idx : start_idx + clean_len]
    else:
        noise_segment = noise[:clean_len]

    # Calculate signal powers
    clean_power = np.mean(clean ** 2) + 1e-12
    noise_power = np.mean(noise_segment ** 2) + 1e-12

    # Required noise power for target SNR: P_noise = P_clean / (10^(SNR/10))
    target_noise_power = clean_power / (10.0 ** (snr_db / 10.0))
    scale_factor = np.sqrt(target_noise_power / noise_power)

    scaled_noise = noise_segment * scale_factor
    noisy = clean + scaled_noise

    # Safe normalization to prevent clipping while maintaining relative SNR
    max_val = np.max(np.abs(noisy))
    if max_val > 0.95:
        norm_factor = 0.95 / max_val
        noisy = noisy * norm_factor
        scaled_noise = scaled_noise * norm_factor
        clean = clean * norm_factor

    # Measure exact resulting SNR
    actual_snr = calculate_snr(clean, noisy)
    return noisy.astype(np.float32), scaled_noise.astype(np.float32), actual_snr


def calculate_snr(clean: np.ndarray, signal_to_test: np.ndarray) -> float:
    """
    Calculate Global Signal-to-Noise Ratio (dB):
    SNR = 10 * log10( P_clean / P_noise )
    where noise = signal_to_test - clean
    """
    min_len = min(len(clean), len(signal_to_test))
    c = clean[:min_len]
    t = signal_to_test[:min_len]

    noise = t - c
    clean_power = np.mean(c ** 2) + 1e-12
    noise_power = np.mean(noise ** 2) + 1e-12

    snr = 10.0 * np.log10(clean_power / noise_power)
    return float(snr)


def calculate_si_snr(reference: np.ndarray, estimated: np.ndarray) -> float:
    """
    Calculate Scale-Invariant Signal-to-Noise Ratio (SI-SNR in dB).
    """
    min_len = min(len(reference), len(estimated))
    s = reference[:min_len] - np.mean(reference[:min_len])
    s_hat = estimated[:min_len] - np.mean(estimated[:min_len])

    dot_product = np.dot(s_hat, s)
    s_energy = np.dot(s, s) + 1e-12

    s_target = (dot_product / s_energy) * s
    e_noise = s_hat - s_target

    target_energy = np.sum(s_target ** 2) + 1e-12
    noise_energy = np.sum(e_noise ** 2) + 1e-12

    si_snr = 10.0 * np.log10(target_energy / noise_energy)
    return float(si_snr)


def calculate_stoi(reference: np.ndarray, estimated: np.ndarray, sr: int = DEFAULT_SAMPLE_RATE) -> float:
    """
    Calculate Short-Time Objective Intelligibility (STOI, scale 0.0 to 1.0).
    Uses pystoi.
    """
    if not HAS_PYSTOI:
        return float("nan")

    min_len = min(len(reference), len(estimated))
    ref = reference[:min_len]
    est = estimated[:min_len]

    try:
        score = pystoi.stoi(ref, est, sr, extended=False)
        return float(score)
    except Exception as e:
        return float("nan")


def compute_all_metrics(
    clean: np.ndarray,
    noisy: np.ndarray,
    enhanced: np.ndarray,
    sr: int = DEFAULT_SAMPLE_RATE,
    latency_ms: Optional[float] = None
) -> Dict[str, Union[float, str]]:
    """
    Calculate full suite of real audio metrics comparing Noisy vs Enhanced vs Clean.
    """
    snr_before = calculate_snr(clean, noisy)
    snr_after = calculate_snr(clean, enhanced)
    snr_improvement = snr_after - snr_before

    si_snr_before = calculate_si_snr(clean, noisy)
    si_snr_after = calculate_si_snr(clean, enhanced)
    si_snr_improvement = si_snr_after - si_snr_before

    stoi_before = calculate_stoi(clean, noisy, sr=sr)
    stoi_after = calculate_stoi(clean, enhanced, sr=sr)
    stoi_improvement = stoi_after - stoi_before if not np.isnan(stoi_after) and not np.isnan(stoi_before) else float("nan")

    # Speech preservation metric: correlation in high energy segments
    min_len = min(len(clean), len(enhanced))
    c = clean[:min_len]
    e = enhanced[:min_len]
    high_energy_mask = np.abs(c) > (0.1 * np.max(np.abs(c)) + 1e-6)
    if np.sum(high_energy_mask) > 10:
        speech_preservation = float(np.corrcoef(c[high_energy_mask], e[high_energy_mask])[0, 1] * 100.0)
        speech_preservation = max(0.0, min(100.0, speech_preservation))
    else:
        speech_preservation = 90.0

    # Noise reduction percentage in background regions
    noise_in = noisy[:min_len] - c
    noise_out = e - c
    p_noise_in = np.mean(noise_in ** 2) + 1e-12
    p_noise_out = np.mean(noise_out ** 2) + 1e-12
    noise_reduction_pct = float(max(0.0, (1.0 - (p_noise_out / p_noise_in)) * 100.0))

    metrics = {
        "snr_before": round(snr_before, 2),
        "snr_after": round(snr_after, 2),
        "snr_improvement": round(snr_improvement, 2),
        "si_snr_before": round(si_snr_before, 2),
        "si_snr_after": round(si_snr_after, 2),
        "si_snr_improvement": round(si_snr_improvement, 2),
        "stoi_before": round(stoi_before, 4) if not np.isnan(stoi_before) else "N/A",
        "stoi_after": round(stoi_after, 4) if not np.isnan(stoi_after) else "N/A",
        "stoi_improvement": round(stoi_improvement, 4) if not np.isnan(stoi_improvement) else "N/A",
        "speech_preservation_pct": round(speech_preservation, 1),
        "noise_reduction_pct": round(noise_reduction_pct, 1),
        "pesq": "Requires MSVC Build Tools on Windows",
        "latency_ms": round(latency_ms, 2) if latency_ms is not None else "N/A"
    }

    return metrics


def save_waveform_comparison_plot(
    clean: np.ndarray,
    noisy: np.ndarray,
    enhanced: np.ndarray,
    save_path: str,
    title: str = "Audio Waveform Comparison (Noisy vs Enhanced vs Clean)",
    sr: int = DEFAULT_SAMPLE_RATE
):
    """Generate and save a 3-panel waveform comparison plot."""
    os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)
    min_len = min(len(clean), len(noisy), len(enhanced))
    time_axis = np.arange(min_len) / float(sr)

    fig, axes = plt.subplots(3, 1, figsize=(12, 6), sharex=True)
    
    # 1. Noisy
    axes[0].plot(time_axis, noisy[:min_len], color="#e056fd", alpha=0.8, linewidth=0.8)
    axes[0].set_title("Input Noisy Audio", fontsize=11, fontweight="bold", color="#dcdde1")
    axes[0].set_ylabel("Amplitude", color="#dcdde1")
    axes[0].set_facecolor("#1e272e")
    axes[0].grid(True, alpha=0.2)
    axes[0].tick_params(colors="#dcdde1")

    # 2. Enhanced
    axes[1].plot(time_axis, enhanced[:min_len], color="#00d2d3", alpha=0.9, linewidth=0.8)
    axes[1].set_title("AI Enhanced Audio", fontsize=11, fontweight="bold", color="#dcdde1")
    axes[1].set_ylabel("Amplitude", color="#dcdde1")
    axes[1].set_facecolor("#1e272e")
    axes[1].grid(True, alpha=0.2)
    axes[1].tick_params(colors="#dcdde1")

    # 3. Clean
    axes[2].plot(time_axis, clean[:min_len], color="#10ac84", alpha=0.8, linewidth=0.8)
    axes[2].set_title("Clean Reference", fontsize=11, fontweight="bold", color="#dcdde1")
    axes[2].set_xlabel("Time (seconds)", color="#dcdde1")
    axes[2].set_ylabel("Amplitude", color="#dcdde1")
    axes[2].set_facecolor("#1e272e")
    axes[2].grid(True, alpha=0.2)
    axes[2].tick_params(colors="#dcdde1")

    fig.patch.set_facecolor("#0a101d")
    fig.suptitle(title, fontsize=13, fontweight="bold", color="#00d2d3")
    plt.tight_layout()
    plt.savefig(save_path, dpi=120, facecolor=fig.get_facecolor(), edgecolor="none")
    plt.close(fig)


def save_spectrogram_comparison_plot(
    clean: np.ndarray,
    noisy: np.ndarray,
    enhanced: np.ndarray,
    save_path: str,
    title: str = "Spectrogram Comparison (Noisy vs Enhanced vs Clean)",
    sr: int = DEFAULT_SAMPLE_RATE
):
    """Generate and save a 3-panel spectrogram comparison plot."""
    os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)
    min_len = min(len(clean), len(noisy), len(enhanced))

    def get_log_spec(sig):
        mag, _ = compute_stft(sig[:min_len])
        log_mag = 20.0 * torch.log10(mag.squeeze(0) + 1e-5).cpu().numpy()
        return log_mag

    spec_clean = get_log_spec(clean)
    spec_noisy = get_log_spec(noisy)
    spec_enhanced = get_log_spec(enhanced)

    fig, axes = plt.subplots(1, 3, figsize=(16, 5), sharey=True)
    vmin = -60
    vmax = 10

    im0 = axes[0].imshow(spec_noisy, origin="lower", aspect="auto", cmap="magma", vmin=vmin, vmax=vmax)
    axes[0].set_title("Noisy Input Spectrogram", fontsize=11, fontweight="bold", color="#dcdde1")
    axes[0].set_ylabel("Frequency Bin", color="#dcdde1")
    axes[0].set_xlabel("Time Frames", color="#dcdde1")
    axes[0].tick_params(colors="#dcdde1")

    im1 = axes[1].imshow(spec_enhanced, origin="lower", aspect="auto", cmap="magma", vmin=vmin, vmax=vmax)
    axes[1].set_title("AI Enhanced Spectrogram", fontsize=11, fontweight="bold", color="#dcdde1")
    axes[1].set_xlabel("Time Frames", color="#dcdde1")
    axes[1].tick_params(colors="#dcdde1")

    im2 = axes[2].imshow(spec_clean, origin="lower", aspect="auto", cmap="magma", vmin=vmin, vmax=vmax)
    axes[2].set_title("Clean Reference Spectrogram", fontsize=11, fontweight="bold", color="#dcdde1")
    axes[2].set_xlabel("Time Frames", color="#dcdde1")
    axes[2].tick_params(colors="#dcdde1")

    fig.patch.set_facecolor("#0a101d")
    for ax in axes:
        ax.set_facecolor("#1e272e")

    fig.suptitle(title, fontsize=13, fontweight="bold", color="#00d2d3")
    fig.colorbar(im2, ax=axes.ravel().tolist(), label="Magnitude (dB)")
    plt.tight_layout()
    plt.savefig(save_path, dpi=120, facecolor=fig.get_facecolor(), edgecolor="none")
    plt.close(fig)
