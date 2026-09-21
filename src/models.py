"""
Neural network models for SIH26052 Step 3.

Model 1: NoiseSpectrogramClassifier
    Input : noisy waveform → STFT magnitude spectrogram
    Output: 12-class noise logits

Model 2: LightweightSpectralUNet
    Input : noisy waveform
    Output: enhanced waveform (via learned spectral mask applied in STFT domain)

Both models are lightweight for CPU training.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple

from config import (
    N_FFT,
    HOP_LENGTH,
    WIN_LENGTH,
    NUM_CLASSES,
    CLIP_SAMPLES,
    DEVICE,
)

# Number of STFT frequency bins (N_FFT // 2 + 1 = 257)
N_FREQ: int = N_FFT // 2 + 1


# ══════════════════════════════════════════════════════════════
# Shared STFT helper (operates on batched waveforms)
# ══════════════════════════════════════════════════════════════

class STFTLayer(nn.Module):
    """
    Non-trainable STFT layer.
    Forward: waveform (B, T) → magnitude (B, F, T_frames), phase (B, F, T_frames)
    """

    def __init__(
        self,
        n_fft: int = N_FFT,
        hop_length: int = HOP_LENGTH,
        win_length: int = WIN_LENGTH,
    ):
        super().__init__()
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.win_length = win_length
        # Register window as buffer so it moves with the model's device
        self.register_buffer("window", torch.hann_window(win_length))

    def forward(self, waveform: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Parameters
        ----------
        waveform : (B, T)
        Returns
        -------
        magnitude : (B, F, T_frames)
        phase     : (B, F, T_frames)
        """
        B = waveform.shape[0]
        # Flatten to (B, T) if needed
        x = waveform.reshape(B, -1)
        stft = torch.stft(
            x,
            n_fft=self.n_fft,
            hop_length=self.hop_length,
            win_length=self.win_length,
            window=self.window,
            return_complex=True,
        )  # (B, F, T_frames)
        magnitude = stft.abs()
        phase = stft.angle()
        return magnitude, phase

    def inverse(
        self,
        magnitude: torch.Tensor,
        phase: torch.Tensor,
        length: int,
    ) -> torch.Tensor:
        """
        iSTFT from magnitude + phase.

        Parameters
        ----------
        magnitude : (B, F, T_frames)
        phase     : (B, F, T_frames)
        length    : original waveform length in samples
        Returns
        -------
        waveform  : (B, T)
        """
        stft_complex = magnitude * torch.exp(1j * phase)
        waveform = torch.istft(
            stft_complex,
            n_fft=self.n_fft,
            hop_length=self.hop_length,
            win_length=self.win_length,
            window=self.window,
            length=length,
        )
        return waveform


# ══════════════════════════════════════════════════════════════
# Model 1 — NoiseSpectrogramClassifier
# ══════════════════════════════════════════════════════════════

class ConvBlock(nn.Module):
    """Conv2d → BatchNorm → GELU → optional MaxPool."""

    def __init__(
        self,
        in_ch: int,
        out_ch: int,
        kernel: int = 3,
        pool: bool = True,
        pool_kernel: int = 2,
    ):
        super().__init__()
        layers = [
            nn.Conv2d(in_ch, out_ch, kernel_size=kernel, padding=kernel // 2, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.GELU(),
        ]
        if pool:
            layers.append(nn.MaxPool2d(pool_kernel))
        self.block = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class NoiseSpectrogramClassifier(nn.Module):
    """
    Lightweight 2D CNN for 12-class defence noise classification.

    Architecture:
        Input: (B, 1, F, T) log-magnitude spectrogram
        Conv blocks with progressive channel expansion + MaxPool
        AdaptiveAvgPool → Flatten → FC → Dropout → 12 logits

    Parameters (~450 K on N_FFT=512)
    """

    def __init__(
        self,
        n_freq: int = N_FREQ,
        num_classes: int = NUM_CLASSES,
        dropout: float = 0.4,
    ):
        super().__init__()

        # Keep the configured number of output classes on the model.
        # train_classifier.py uses this for a strict label-range safety check.
        self.num_classes = num_classes

        self.stft_layer = STFTLayer()

        # CNN feature extractor
        self.features = nn.Sequential(
            ConvBlock(1, 32, kernel=3, pool=True),     # (B, 32, F/2, T/2)
            ConvBlock(32, 64, kernel=3, pool=True),    # (B, 64, F/4, T/4)
            ConvBlock(64, 128, kernel=3, pool=True),   # (B, 128, F/8, T/8)
            ConvBlock(128, 128, kernel=3, pool=False), # (B, 128, F/8, T/8)
            ConvBlock(128, 256, kernel=3, pool=True),  # (B, 256, F/16, T/16)
        )
        self.pool = nn.AdaptiveAvgPool2d((4, 4))       # (B, 256, 4, 4)

        self.classifier = nn.Sequential(
            nn.Flatten(),                              # (B, 256*4*4=4096)
            nn.Linear(256 * 4 * 4, 512),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(512, 128),
            nn.GELU(),
            nn.Dropout(dropout / 2),
            nn.Linear(128, num_classes),
        )

    def _compute_log_spectrogram(self, waveform: torch.Tensor) -> torch.Tensor:
        """
        waveform (B, T) → log magnitude spectrogram (B, 1, F, T_frames)
        """
        magnitude, _ = self.stft_layer(waveform)  # (B, F, T_frames)
        log_mag = torch.log1p(magnitude)           # log1p for numerical stability
        return log_mag.unsqueeze(1)                # (B, 1, F, T_frames)

    def forward(self, waveform: torch.Tensor) -> torch.Tensor:
        """
        Parameters
        ----------
        waveform : (B, T)  float32 waveform at SAMPLE_RATE

        Returns
        -------
        logits : (B, NUM_CLASSES)
        """
        x = self._compute_log_spectrogram(waveform)  # (B, 1, F, T_f)
        x = self.features(x)
        x = self.pool(x)
        logits = self.classifier(x)
        return logits


# ══════════════════════════════════════════════════════════════
# Model 2 — LightweightSpectralUNet
# ══════════════════════════════════════════════════════════════

class UNetEncoderBlock(nn.Module):
    """Encoder block: Conv2d → BN → GELU → (downsample via stride)."""

    def __init__(self, in_ch: int, out_ch: int, stride: int = 2):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, kernel_size=3, stride=stride, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.GELU(),
            nn.Conv2d(out_ch, out_ch, kernel_size=3, stride=1, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.GELU(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.conv(x)


class UNetDecoderBlock(nn.Module):
    """Decoder block: Upsample → concat skip → Conv2d → BN → GELU."""

    def __init__(self, in_ch: int, skip_ch: int, out_ch: int):
        super().__init__()
        self.up = nn.ConvTranspose2d(in_ch, in_ch // 2, kernel_size=2, stride=2)
        self.conv = nn.Sequential(
            nn.Conv2d(in_ch // 2 + skip_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.GELU(),
            nn.Conv2d(out_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.GELU(),
        )

    def forward(self, x: torch.Tensor, skip: torch.Tensor) -> torch.Tensor:
        x = self.up(x)
        # Handle spatial size mismatch (padding)
        if x.shape[-2:] != skip.shape[-2:]:
            x = F.interpolate(x, size=skip.shape[-2:], mode="bilinear", align_corners=False)
        x = torch.cat([x, skip], dim=1)
        return self.conv(x)


class LightweightSpectralUNet(nn.Module):
    """
    U-Net style spectral mask predictor for speech enhancement.

    Architecture:
        Input waveform → STFT → log-magnitude (B, 1, F, T_f)
        Encoder: 4 downsample stages [1→16→32→64→128]
        Bottleneck: 128→128
        Decoder: 4 upsample stages with skip connections
        Output: (B, 1, F, T_f) → sigmoid → spectral mask

    Enhancement:
        enhanced_mag = noisy_mag * mask
        enhanced_wav = iSTFT(enhanced_mag, noisy_phase)

    Parameters: ~620 K
    """

    def __init__(self):
        super().__init__()
        self.stft_layer = STFTLayer()

        # Encoder
        self.enc1 = UNetEncoderBlock(1, 16, stride=1)   # no downsample at start
        self.enc2 = UNetEncoderBlock(16, 32, stride=2)
        self.enc3 = UNetEncoderBlock(32, 64, stride=2)
        self.enc4 = UNetEncoderBlock(64, 128, stride=2)

        # Bottleneck
        self.bottleneck = nn.Sequential(
            nn.Conv2d(128, 128, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(128),
            nn.GELU(),
            nn.Conv2d(128, 128, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(128),
            nn.GELU(),
        )

        # Decoder
        self.dec4 = UNetDecoderBlock(128, 64, 64)
        self.dec3 = UNetDecoderBlock(64, 32, 32)
        self.dec2 = UNetDecoderBlock(32, 16, 16)

        # Output mask head (no upsample needed — enc1 kept stride=1)
        self.mask_head = nn.Sequential(
            nn.Conv2d(16 + 16, 16, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(16),
            nn.GELU(),
            nn.Conv2d(16, 1, kernel_size=1),
            nn.Sigmoid(),
        )

    def forward(
        self,
        noisy_waveform: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Parameters
        ----------
        noisy_waveform : (B, T)

        Returns
        -------
        enhanced_waveform : (B, T)
        mask              : (B, 1, F, T_f) — the learned spectral gain mask
        """
        T = noisy_waveform.shape[-1]

        # STFT
        noisy_mag, noisy_phase = self.stft_layer(noisy_waveform)  # (B, F, T_f)
        log_mag = torch.log1p(noisy_mag).unsqueeze(1)              # (B, 1, F, T_f)

        # Encoder
        e1 = self.enc1(log_mag)   # (B, 16,  F,    T_f)
        e2 = self.enc2(e1)        # (B, 32,  F/2,  T_f/2)
        e3 = self.enc3(e2)        # (B, 64,  F/4,  T_f/4)
        e4 = self.enc4(e3)        # (B, 128, F/8,  T_f/8)

        # Bottleneck
        bn = self.bottleneck(e4)  # (B, 128, F/8,  T_f/8)

        # Decoder
        d4 = self.dec4(bn, e3)    # (B, 64,  F/4,  T_f/4)
        d3 = self.dec3(d4, e2)    # (B, 32,  F/2,  T_f/2)
        d2 = self.dec2(d3, e1)    # (B, 16,  F,    T_f)

        # Upsample back to enc1 spatial size
        d1 = F.interpolate(d2, size=e1.shape[-2:], mode="bilinear", align_corners=False)
        d1 = torch.cat([d1, e1], dim=1)

        mask = self.mask_head(d1)  # (B, 1, F, T_f)
        mask = mask.squeeze(1)     # (B, F, T_f)

        # Apply mask
        enhanced_mag = noisy_mag * mask  # (B, F, T_f)

        # iSTFT
        enhanced_wav = self.stft_layer.inverse(enhanced_mag, noisy_phase, length=T)

        return enhanced_wav, mask


# ══════════════════════════════════════════════════════════════
# Model summary helper
# ══════════════════════════════════════════════════════════════

def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def print_model_summary(model: nn.Module, name: str) -> None:
    n = count_parameters(model)
    print(f"\n  {name}")
    print(f"    Trainable parameters: {n:,}")
    print(f"    Approx. size        : {n * 4 / 1024 / 1024:.2f} MB (float32)")


# ══════════════════════════════════════════════════════════════
# Quick architecture test
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys
    sys.path.insert(0, "src")

    torch.manual_seed(42)
    B, T = 2, CLIP_SAMPLES
    x = torch.randn(B, T)

    print("\n=== Model Architecture Tests ===")

    # Classifier
    clf = NoiseSpectrogramClassifier()
    logits = clf(x)
    assert logits.shape == (B, NUM_CLASSES), f"Unexpected shape: {logits.shape}"
    print_model_summary(clf, "NoiseSpectrogramClassifier")
    print(f"    logits shape: {tuple(logits.shape)}")

    # U-Net
    unet = LightweightSpectralUNet()
    enh, mask = unet(x)
    assert enh.shape == (B, T), f"Enhanced wav shape: {enh.shape}"
    print_model_summary(unet, "LightweightSpectralUNet")
    print(f"    enhanced wav shape : {tuple(enh.shape)}")
    print(f"    mask shape         : {tuple(mask.shape)}")
    print(f"    mask range         : [{mask.min().item():.4f}, {mask.max().item():.4f}]")

    print("\n[OK] All model tests passed.")
