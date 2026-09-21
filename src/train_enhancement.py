"""
Train the LightweightSpectralUNet for speech enhancement on SIH26052.

Usage (from project root):
    venv\\Scripts\\python.exe -m src.train_enhancement
    venv\\Scripts\\python.exe -m src.train_enhancement --smoke  # 2-epoch smoke test
    venv\\Scripts\\python.exe -m src.train_enhancement --epochs 40

Loss:
    L_total = lambda_spec  * spectral_magnitude_loss
            + lambda_mask  * IRM_mask_loss
            + lambda_wave  * waveform_L1_loss

Saves:
    outputs/models/spectral_unet_best.pt
    outputs/models/spectral_unet_last.pt
    outputs/training/enhancement_history.json
    outputs/training/enhancement_loss.png
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim.lr_scheduler import ReduceLROnPlateau

from config import (
    BATCH_SIZE,
    DEVICE,
    ENHANCEMENT_EPOCHS,
    ENHANCEMENT_HISTORY,
    ENHANCEMENT_LR,
    ENHANCEMENT_LR_FACTOR,
    ENHANCEMENT_LR_PATIENCE,
    ENHANCEMENT_PATIENCE,
    ENHANCEMENT_WEIGHT_DECAY,
    EPSILON,
    HOP_LENGTH,
    LAMBDA_MASK,
    LAMBDA_SPEC,
    LAMBDA_WAVEFORM,
    N_FFT,
    SEED,
    TRAINING_DIR,
    UNET_BEST_CKPT,
    UNET_LAST_CKPT,
    WIN_LENGTH,
    make_output_dirs,
    print_config,
    set_seed,
)
from dataset import make_dataloader, get_skip_logger
from models import LightweightSpectralUNet, count_parameters


# ──────────────────────────────────────────────────────────────
# Enhancement loss
# ──────────────────────────────────────────────────────────────

def compute_enhancement_loss(
    enhanced_wav: torch.Tensor,
    clean_wav: torch.Tensor,
    predicted_mask: torch.Tensor,
    noisy_wav: torch.Tensor,
    device: torch.device,
    n_fft: int = N_FFT,
    hop_length: int = HOP_LENGTH,
    win_length: int = WIN_LENGTH,
    lambda_spec: float = LAMBDA_SPEC,
    lambda_mask: float = LAMBDA_MASK,
    lambda_wave: float = LAMBDA_WAVEFORM,
    epsilon: float = EPSILON,
) -> tuple:
    """
    Combined spectral + mask + waveform loss.

    Returns
    -------
    total_loss : scalar tensor
    components : dict with individual loss values
    """
    window = torch.hann_window(win_length, device=device)

    def stft_mag(wav):
        s = torch.stft(
            wav, n_fft=n_fft, hop_length=hop_length,
            win_length=win_length, window=window, return_complex=True
        )
        return s.abs()  # (B, F, T_f)

    clean_mag = stft_mag(clean_wav)     # (B, F, T_f)
    noisy_mag = stft_mag(noisy_wav)     # (B, F, T_f)

    # ── 1. Spectral magnitude loss ────────────────────────────
    # Compare enhanced magnitude vs clean magnitude
    enh_mag = stft_mag(enhanced_wav)    # (B, F, T_f)
    # Truncate to common time frames (may differ by 1 due to iSTFT)
    min_t = min(clean_mag.shape[-1], enh_mag.shape[-1])
    spec_loss = F.l1_loss(enh_mag[..., :min_t], clean_mag[..., :min_t])

    # ── 2. IRM mask loss ─────────────────────────────────────
    # Ideal Ratio Mask: IRM = clean_mag / (noisy_mag + eps)
    # Clamp to [0, 1] range
    irm_target = (clean_mag / (noisy_mag + epsilon)).clamp(0.0, 1.0)  # (B, F, T_f)
    min_t2 = min(irm_target.shape[-1], predicted_mask.shape[-1])
    mask_loss = F.mse_loss(predicted_mask[..., :min_t2], irm_target[..., :min_t2])

    # ── 3. Waveform L1 loss ───────────────────────────────────
    min_wav = min(enhanced_wav.shape[-1], clean_wav.shape[-1])
    wave_loss = F.l1_loss(enhanced_wav[..., :min_wav], clean_wav[..., :min_wav])

    total = lambda_spec * spec_loss + lambda_mask * mask_loss + lambda_wave * wave_loss

    components = {
        "spec_loss": spec_loss.item(),
        "mask_loss": mask_loss.item(),
        "wave_loss": wave_loss.item(),
        "total": total.item(),
    }
    return total, components


# ──────────────────────────────────────────────────────────────
# Training and validation loops
# ──────────────────────────────────────────────────────────────

def train_one_epoch(
    model: nn.Module,
    loader,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
) -> dict:
    model.train()
    total_loss = 0.0
    total_spec = 0.0
    total_mask = 0.0
    total_wave = 0.0
    n_batches = 0
    skipped_batches = 0

    for batch_idx, batch in enumerate(loader):
        # collate_fn returns None when every sample in the batch is invalid.
        if batch is None:
            skipped_batches += 1
            continue

        noisy, clean, labels, metas = batch

        # Scientific safety: never train on non-finite audio.
        if not torch.isfinite(noisy).all() or not torch.isfinite(clean).all():
            raise FloatingPointError(
                f"Non-finite audio detected at training batch {batch_idx}"
            )

        noisy = noisy.to(device)
        clean = clean.to(device)

        optimizer.zero_grad()
        enhanced_wav, mask = model(noisy)

        loss, comps = compute_enhancement_loss(
            enhanced_wav, clean, mask, noisy, device
        )

        if not torch.isfinite(loss):
            raise FloatingPointError(
                f"Non-finite enhancement loss at training batch {batch_idx}: "
                f"{loss.item()}"
            )

        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
        optimizer.step()

        total_loss += comps["total"]
        total_spec += comps["spec_loss"]
        total_mask += comps["mask_loss"]
        total_wave += comps["wave_loss"]
        n_batches += 1

        if (batch_idx + 1) % 20 == 0:
            print(f"    Batch {batch_idx+1}/{len(loader)} | "
                  f"total={comps['total']:.4f} | "
                  f"spec={comps['spec_loss']:.4f} | "
                  f"mask={comps['mask_loss']:.4f} | "
                  f"wave={comps['wave_loss']:.4f}")

    if n_batches == 0:
        return {
            "total": float("nan"),
            "spec": float("nan"),
            "mask": float("nan"),
            "wave": float("nan"),
            "samples": 0,
            "skipped_batches": skipped_batches,
        }

    return {
        "total": total_loss / n_batches,
        "spec": total_spec / n_batches,
        "mask": total_mask / n_batches,
        "wave": total_wave / n_batches,
        "samples": n_batches,
        "skipped_batches": skipped_batches,
    }


@torch.no_grad()
def validate(
    model: nn.Module,
    loader,
    device: torch.device,
) -> dict:
    model.eval()
    total_loss = 0.0
    n_batches = 0
    skipped_batches = 0

    for batch in loader:
        # collate_fn returns None when every sample in the batch is invalid.
        if batch is None:
            skipped_batches += 1
            continue

        noisy, clean, labels, metas = batch

        if not torch.isfinite(noisy).all() or not torch.isfinite(clean).all():
            raise FloatingPointError("Non-finite audio detected during validation.")

        noisy = noisy.to(device)
        clean = clean.to(device)

        enhanced_wav, mask = model(noisy)
        _, comps = compute_enhancement_loss(
            enhanced_wav, clean, mask, noisy, device
        )

        if not np.isfinite(comps["total"]):
            raise FloatingPointError(
                f"Non-finite enhancement validation loss: {comps['total']}"
            )

        total_loss += comps["total"]
        n_batches += 1

    if n_batches == 0:
        return {
            "total": float("nan"),
            "samples": 0,
            "skipped_batches": skipped_batches,
        }

    return {
        "total": total_loss / n_batches,
        "samples": n_batches,
        "skipped_batches": skipped_batches,
    }


# ──────────────────────────────────────────────────────────────
# Plot helper
# ──────────────────────────────────────────────────────────────

def _plot_loss(history: dict, save_path: str):
    epochs = range(1, len(history["train_total"]) + 1)
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(epochs, history["train_total"], "b-o", label="Train Total", linewidth=1.5, markersize=4)
    ax.plot(epochs, history["val_total"], "r-s", label="Val Total", linewidth=1.5, markersize=4)
    if "train_spec" in history:
        ax.plot(epochs, history["train_spec"], "g--", label="Train Spec", linewidth=1, alpha=0.7)
        ax.plot(epochs, history["train_mask"], "m--", label="Train Mask", linewidth=1, alpha=0.7)
    ax.set_xlabel("Epoch")
    ax.set_ylabel("Loss")
    ax.set_title("Enhancement Training & Validation Loss")
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    plt.savefig(save_path, dpi=120)
    plt.close(fig)
    print(f"  Plot saved: {save_path}")


# ──────────────────────────────────────────────────────────────
# Main training function
# ──────────────────────────────────────────────────────────────

def train_enhancement(
    epochs: int = ENHANCEMENT_EPOCHS,
    batch_size: int = BATCH_SIZE,
    lr: float = ENHANCEMENT_LR,
    patience: int = ENHANCEMENT_PATIENCE,
    smoke: bool = False,
    resume: bool = True,
) -> dict:
    """Train LightweightSpectralUNet with safe checkpoint resume support."""
    if smoke:
        epochs = 2
        resume = False
        print("\n[SMOKE MODE] Running 2 epochs only.\n")

    set_seed(SEED)
    make_output_dirs()
    print_config()

    print(f"\nDevice: {DEVICE}")
    print(f"Training LightweightSpectralUNet for {epochs} total epochs...")

    train_loader = make_dataloader("train", batch_size=batch_size, load_clean=True)
    val_loader = make_dataloader("val", batch_size=batch_size, load_clean=True)

    model = LightweightSpectralUNet().to(DEVICE)
    total_params = count_parameters(model)
    print(f"  Model parameters: {total_params:,}")

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=lr,
        weight_decay=ENHANCEMENT_WEIGHT_DECAY,
    )

    scheduler = ReduceLROnPlateau(
        optimizer,
        mode="min",
        factor=ENHANCEMENT_LR_FACTOR,
        patience=ENHANCEMENT_LR_PATIENCE,
    )

    history = {
        "train_total": [],
        "train_spec": [],
        "train_mask": [],
        "train_wave": [],
        "val_total": [],
        "train_batches": [],
        "val_batches": [],
        "skipped_train_batches": [],
        "skipped_val_batches": [],
        "lr": [],
        "epochs_trained": 0,
        "best_val_loss": float("inf"),
        "best_epoch": 0,
        "total_training_time_s": 0.0,
    }

    best_val_loss = float("inf")
    best_epoch = 0
    patience_counter = 0
    start_epoch = 1

    # ------------------------------------------------------------
    # Resume from latest checkpoint after interruption
    # ------------------------------------------------------------
    if resume and not smoke and os.path.exists(UNET_LAST_CKPT):
        print("\n" + "=" * 60)
        print("  RESUMING U-NET TRAINING")
        print("=" * 60)
        print(f"  Checkpoint: {UNET_LAST_CKPT}")

        checkpoint = torch.load(UNET_LAST_CKPT, map_location=DEVICE)

        model.load_state_dict(checkpoint["model_state_dict"])

        if "optimizer_state_dict" in checkpoint:
            optimizer.load_state_dict(checkpoint["optimizer_state_dict"])

        if "scheduler_state_dict" in checkpoint:
            scheduler.load_state_dict(checkpoint["scheduler_state_dict"])

        saved_history = checkpoint.get("history")
        if isinstance(saved_history, dict):
            history = saved_history

        completed_epoch = int(checkpoint.get("epoch", 0))
        start_epoch = completed_epoch + 1

        saved_best = history.get("best_val_loss", float("inf"))
        if saved_best != float("inf"):
            best_val_loss = float(saved_best)
        else:
            best_val_loss = float(checkpoint.get("val_loss", float("inf")))

        best_epoch = int(history.get("best_epoch", 0))

        # Reconstruct patience from saved validation history.
        val_history = history.get("val_total", [])
        if val_history:
            best_idx = int(np.argmin(val_history))
            best_epoch = best_idx + 1
            best_val_loss = float(val_history[best_idx])

            patience_counter = 0
            for value in val_history[best_idx + 1:]:
                if float(value) < best_val_loss:
                    best_val_loss = float(value)
                    patience_counter = 0
                else:
                    patience_counter += 1

        print(f"  Last completed epoch : {completed_epoch}")
        print(f"  Resuming from epoch  : {start_epoch}")
        print(f"  Best validation loss : {best_val_loss:.6f}")
        print(f"  Best epoch           : {best_epoch}")
        print(f"  Patience counter     : {patience_counter}/{patience}")

        if start_epoch > epochs:
            print(
                f"\nTraining already reached epoch {completed_epoch}. "
                f"Target is {epochs}; nothing more to train."
            )
            _plot_loss(
                history,
                os.path.join(TRAINING_DIR, "enhancement_loss.png"),
            )
            return history
    else:
        print("\nStarting U-Net training from Epoch 1.")

    session_start = time.time()
    epoch_completed = max(0, start_epoch - 1)

    # ------------------------------------------------------------
    # Training loop
    # ------------------------------------------------------------
    for epoch in range(start_epoch, epochs + 1):
        epoch_start = time.time()
        current_lr = optimizer.param_groups[0]["lr"]

        print(f"\n--- Epoch {epoch}/{epochs} | LR={current_lr:.2e} ---")

        train_stats = train_one_epoch(
            model, train_loader, optimizer, DEVICE
        )

        if (
            train_stats["samples"] == 0
            or not np.isfinite(train_stats["total"])
        ):
            raise RuntimeError(
                "Training produced no valid batches or a non-finite loss."
            )

        print(
            f"  Train: total={train_stats['total']:.4f} | "
            f"spec={train_stats['spec']:.4f} | "
            f"mask={train_stats['mask']:.4f} | "
            f"wave={train_stats['wave']:.4f} | "
            f"batches={train_stats['samples']} | "
            f"skipped={train_stats['skipped_batches']}"
        )

        val_stats = validate(model, val_loader, DEVICE)

        print(
            f"  Val  : total={val_stats['total']:.4f} | "
            f"batches={val_stats['samples']} | "
            f"skipped={val_stats['skipped_batches']}"
        )

        if (
            val_stats["samples"] == 0
            or not np.isfinite(val_stats["total"])
        ):
            raise RuntimeError(
                "Validation produced no valid batches or a non-finite loss."
            )

        scheduler.step(val_stats["total"])

        history["train_total"].append(train_stats["total"])
        history["train_spec"].append(train_stats["spec"])
        history["train_mask"].append(train_stats["mask"])
        history["train_wave"].append(train_stats["wave"])
        history["val_total"].append(val_stats["total"])
        history["train_batches"].append(train_stats["samples"])
        history["val_batches"].append(val_stats["samples"])
        history["skipped_train_batches"].append(
            train_stats["skipped_batches"]
        )
        history["skipped_val_batches"].append(
            val_stats["skipped_batches"]
        )
        history["lr"].append(current_lr)
        history["epochs_trained"] = epoch

        improved = val_stats["total"] < best_val_loss

        if improved:
            best_val_loss = val_stats["total"]
            best_epoch = epoch
            patience_counter = 0
            history["best_val_loss"] = best_val_loss
            history["best_epoch"] = best_epoch
        else:
            patience_counter += 1

        epoch_elapsed = time.time() - epoch_start
        print(f"  Epoch time: {epoch_elapsed:.1f}s")

        # Save latest checkpoint after every completed epoch.
        torch.save(
            {
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "scheduler_state_dict": scheduler.state_dict(),
                "val_loss": val_stats["total"],
                "history": history,
            },
            UNET_LAST_CKPT,
        )

        # Save best checkpoint.
        if improved:
            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "scheduler_state_dict": scheduler.state_dict(),
                    "val_loss": val_stats["total"],
                    "history": history,
                },
                UNET_BEST_CKPT,
            )
            print(
                f"  [BEST] New best val loss: "
                f"{best_val_loss:.4f} — saved."
            )
        else:
            print(
                f"  No improvement. "
                f"Patience: {patience_counter}/{patience}"
            )

        # Save history after every epoch to survive power loss.
        history["total_training_time_s"] = round(
            time.time() - session_start, 1
        )

        with open(ENHANCEMENT_HISTORY, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)

        print(f"  History saved after epoch {epoch}.")
        epoch_completed = epoch

        if not smoke and patience_counter >= patience:
            print(
                f"\n  Early stopping triggered after {epoch} epochs."
            )
            break

    total_elapsed = time.time() - session_start

    history["epochs_trained"] = max(
        int(history.get("epochs_trained", 0)),
        epoch_completed,
    )
    history["best_val_loss"] = best_val_loss
    history["best_epoch"] = best_epoch
    history["total_training_time_s"] = round(total_elapsed, 1)

    with open(ENHANCEMENT_HISTORY, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)

    print(f"\nTraining session complete. Time: {total_elapsed:.1f}s")
    print(
        f"Best val loss: {best_val_loss:.4f} "
        f"at epoch {best_epoch}"
    )
    print(f"Total epochs recorded: {history['epochs_trained']}")

    _plot_loss(
        history,
        os.path.join(TRAINING_DIR, "enhancement_loss.png"),
    )

    get_skip_logger().save()

    return history


# ──────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train LightweightSpectralUNet"
    )
    parser.add_argument(
        "--epochs", type=int, default=ENHANCEMENT_EPOCHS
    )
    parser.add_argument(
        "--batch_size", type=int, default=BATCH_SIZE
    )
    parser.add_argument(
        "--lr", type=float, default=ENHANCEMENT_LR
    )
    parser.add_argument(
        "--patience", type=int, default=ENHANCEMENT_PATIENCE
    )
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Run only 2 epochs as a smoke test",
    )
    parser.add_argument(
        "--no-resume",
        action="store_true",
        help="Ignore existing checkpoint and start from Epoch 1",
    )

    args = parser.parse_args()

    history = train_enhancement(
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        patience=args.patience,
        smoke=args.smoke,
        resume=not args.no_resume,
    )

    print("\nDone.")

