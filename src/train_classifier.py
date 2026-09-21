"""
Train the NoiseSpectrogramClassifier on the SIH26052 dataset.

Usage from project root:
    venv\Scripts\python.exe -m src.train_classifier
    venv\Scripts\python.exe -m src.train_classifier --smoke
    venv\Scripts\python.exe -m src.train_classifier --epochs 40 --batch_size 16

Saves:
    outputs/models/noise_classifier_best.pt
    outputs/models/noise_classifier_last.pt
    outputs/training/classifier_history.json
    outputs/training/classifier_loss.png
    outputs/training/classifier_accuracy.png
    outputs/training/skipped_samples.csv
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
import torch
import torch.nn as nn
from torch.optim.lr_scheduler import ReduceLROnPlateau

from config import (
    BATCH_SIZE,
    CLASSIFIER_BEST_CKPT,
    CLASSIFIER_EPOCHS,
    CLASSIFIER_HISTORY,
    CLASSIFIER_LAST_CKPT,
    CLASSIFIER_LR,
    CLASSIFIER_LR_FACTOR,
    CLASSIFIER_LR_PATIENCE,
    CLASSIFIER_PATIENCE,
    CLASSIFIER_WEIGHT_DECAY,
    DEVICE,
    MODELS_DIR,
    SEED,
    TRAINING_DIR,
    make_output_dirs,
    set_seed,
    print_config,
)

from dataset import (
    get_skip_logger,
    make_dataloader,
    reset_skip_logger,
)

from models import (
    NoiseSpectrogramClassifier,
    count_parameters,
)


def train_one_epoch(
    model: nn.Module,
    loader,
    optimizer: torch.optim.Optimizer,
    criterion: nn.Module,
    device: torch.device,
) -> dict:
    model.train()

    total_loss = 0.0
    correct = 0
    total = 0
    skipped_batches = 0

    for batch_idx, batch in enumerate(loader):
        # collate_fn returns None if every sample in a batch is invalid.
        if batch is None:
            skipped_batches += 1
            continue

        noisy, _clean, labels, _metas = batch

        # Dataset guarantees valid labels. Keep this assertion as a
        # scientific safety check rather than silently repairing labels.
        if not torch.all(
            (labels >= 0) & (labels < model.num_classes)
        ):
            raise ValueError(
                f"Invalid labels in training batch: "
                f"{labels.tolist()}"
            )

        noisy = noisy.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        optimizer.zero_grad(set_to_none=True)

        logits = model(noisy)
        loss = criterion(logits, labels)

        if not torch.isfinite(loss):
            raise FloatingPointError(
                f"Non-finite training loss at batch {batch_idx}: "
                f"{loss.item()}"
            )

        loss.backward()

        nn.utils.clip_grad_norm_(
            model.parameters(),
            max_norm=5.0,
        )

        optimizer.step()

        batch_size_actual = labels.size(0)

        total_loss += loss.item() * batch_size_actual

        preds = logits.argmax(dim=1)

        correct += (
            preds == labels
        ).sum().item()

        total += batch_size_actual

        if (batch_idx + 1) % 20 == 0:
            print(
                f"    Batch {batch_idx + 1}/{len(loader)} | "
                f"loss={loss.item():.4f} | "
                f"acc={correct / total * 100:.1f}%"
            )

    if total == 0:
        return {
            "loss": float("nan"),
            "accuracy": 0.0,
            "samples": 0,
            "skipped_batches": skipped_batches,
        }

    return {
        "loss": total_loss / total,
        "accuracy": correct / total * 100.0,
        "samples": total,
        "skipped_batches": skipped_batches,
    }


@torch.no_grad()
def validate(
    model: nn.Module,
    loader,
    criterion: nn.Module,
    device: torch.device,
) -> dict:
    model.eval()

    total_loss = 0.0
    correct = 0
    total = 0
    skipped_batches = 0

    for batch in loader:
        if batch is None:
            skipped_batches += 1
            continue

        noisy, _clean, labels, _metas = batch

        if not torch.all(
            (labels >= 0) & (labels < model.num_classes)
        ):
            raise ValueError(
                f"Invalid labels in validation batch: "
                f"{labels.tolist()}"
            )

        noisy = noisy.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        logits = model(noisy)
        loss = criterion(logits, labels)

        if not torch.isfinite(loss):
            raise FloatingPointError(
                f"Non-finite validation loss: {loss.item()}"
            )

        batch_size_actual = labels.size(0)

        total_loss += loss.item() * batch_size_actual

        preds = logits.argmax(dim=1)

        correct += (
            preds == labels
        ).sum().item()

        total += batch_size_actual

    if total == 0:
        return {
            "loss": float("nan"),
            "accuracy": 0.0,
            "samples": 0,
            "skipped_batches": skipped_batches,
        }

    return {
        "loss": total_loss / total,
        "accuracy": correct / total * 100.0,
        "samples": total,
        "skipped_batches": skipped_batches,
    }


def _plot_metric(
    train_vals,
    val_vals,
    ylabel: str,
    title: str,
    save_path: str,
) -> None:
    epochs = range(1, len(train_vals) + 1)

    fig, ax = plt.subplots(figsize=(10, 5))

    ax.plot(
        epochs,
        train_vals,
        "b-o",
        label="Train",
        linewidth=1.5,
        markersize=4,
    )

    ax.plot(
        epochs,
        val_vals,
        "r-s",
        label="Validation",
        linewidth=1.5,
        markersize=4,
    )

    ax.set_xlabel("Epoch")
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.legend()
    ax.grid(True, alpha=0.3)

    fig.tight_layout()
    plt.savefig(save_path, dpi=120)
    plt.close(fig)

    print(f"  Plot saved: {save_path}")


def _save_checkpoint(
    path: str,
    epoch: int,
    model: nn.Module,
    optimizer,
    scheduler,
    val_acc: float,
    history: dict,
) -> None:
    """Save a complete resumable checkpoint."""
    torch.save(
        {
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "scheduler_state_dict": scheduler.state_dict(),
            "val_acc": val_acc,
            "history": history,
        },
        path,
    )


def train_classifier(
    epochs: int = CLASSIFIER_EPOCHS,
    batch_size: int = BATCH_SIZE,
    lr: float = CLASSIFIER_LR,
    patience: int = CLASSIFIER_PATIENCE,
    smoke: bool = False,
) -> dict:

    if smoke:
        epochs = 2
        print("\n[SMOKE MODE] Running exactly 2 epochs.\n")

    set_seed(SEED)
    make_output_dirs()

    print_config()

    print(f"\nDevice: {DEVICE}")
    print(
        f"Training NoiseSpectrogramClassifier "
        f"for {epochs} epochs..."
    )

    # ----------------------------------------------------------
    # DataLoaders
    # ----------------------------------------------------------
    reset_skip_logger()

    train_loader = make_dataloader(
        "train",
        batch_size=batch_size,
        load_clean=False,
    )

    val_loader = make_dataloader(
        "val",
        batch_size=batch_size,
        load_clean=False,
    )

    print(
        f"  Train batches: {len(train_loader)}"
    )
    print(
        f"  Val batches  : {len(val_loader)}"
    )

    # ----------------------------------------------------------
    # Model
    # ----------------------------------------------------------
    model = NoiseSpectrogramClassifier().to(DEVICE)

    total_params = count_parameters(model)

    print(
        f"  Model parameters: {total_params:,}"
    )

    # ----------------------------------------------------------
    # Loss / optimizer / scheduler
    # ----------------------------------------------------------
    criterion = nn.CrossEntropyLoss()

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=lr,
        weight_decay=CLASSIFIER_WEIGHT_DECAY,
    )

    # No 'verbose=True' here so this remains compatible with
    # current PyTorch versions.
    scheduler = ReduceLROnPlateau(
        optimizer,
        mode="max",
        factor=CLASSIFIER_LR_FACTOR,
        patience=CLASSIFIER_LR_PATIENCE,
    )

    history = {
        "train_loss": [],
        "val_loss": [],
        "train_acc": [],
        "val_acc": [],
        "lr": [],
        "train_samples": [],
        "val_samples": [],
        "skipped_train_batches": [],
        "skipped_val_batches": [],
        "epochs_trained": 0,
        "best_val_acc": 0.0,
        "best_epoch": 0,
    }

    # Start below any valid accuracy so epoch 1 can always
    # establish the first checkpoint.
    best_val_acc = float("-inf")
    patience_counter = 0

    training_start = time.time()

    # ----------------------------------------------------------
    # Training loop
    # ----------------------------------------------------------
    for epoch in range(1, epochs + 1):
        epoch_start = time.time()

        current_lr = optimizer.param_groups[0]["lr"]

        print(
            f"\n--- Epoch {epoch}/{epochs} | "
            f"LR={current_lr:.2e} ---"
        )

        train_stats = train_one_epoch(
            model,
            train_loader,
            optimizer,
            criterion,
            DEVICE,
        )

        print(
            f"  Train: "
            f"loss={train_stats['loss']:.4f}, "
            f"acc={train_stats['accuracy']:.2f}%, "
            f"samples={train_stats['samples']}, "
            f"skipped_batches={train_stats['skipped_batches']}"
        )

        val_stats = validate(
            model,
            val_loader,
            criterion,
            DEVICE,
        )

        print(
            f"  Val  : "
            f"loss={val_stats['loss']:.4f}, "
            f"acc={val_stats['accuracy']:.2f}%, "
            f"samples={val_stats['samples']}, "
            f"skipped_batches={val_stats['skipped_batches']}"
        )

        if val_stats["samples"] == 0:
            raise RuntimeError(
                "Validation produced zero valid samples."
            )

        scheduler.step(val_stats["accuracy"])

        history["train_loss"].append(
            train_stats["loss"]
        )
        history["val_loss"].append(
            val_stats["loss"]
        )
        history["train_acc"].append(
            train_stats["accuracy"]
        )
        history["val_acc"].append(
            val_stats["accuracy"]
        )
        history["lr"].append(current_lr)
        history["train_samples"].append(
            train_stats["samples"]
        )
        history["val_samples"].append(
            val_stats["samples"]
        )
        history["skipped_train_batches"].append(
            train_stats["skipped_batches"]
        )
        history["skipped_val_batches"].append(
            val_stats["skipped_batches"]
        )
        history["epochs_trained"] = epoch

        epoch_elapsed = time.time() - epoch_start

        print(
            f"  Epoch time: {epoch_elapsed:.1f}s"
        )

        # Save last checkpoint every epoch.
        _save_checkpoint(
            CLASSIFIER_LAST_CKPT,
            epoch,
            model,
            optimizer,
            scheduler,
            val_stats["accuracy"],
            history,
        )

        # Save best checkpoint only when validation improves.
        if val_stats["accuracy"] > best_val_acc:
            best_val_acc = val_stats["accuracy"]

            history["best_val_acc"] = best_val_acc
            history["best_epoch"] = epoch

            _save_checkpoint(
                CLASSIFIER_BEST_CKPT,
                epoch,
                model,
                optimizer,
                scheduler,
                val_stats["accuracy"],
                history,
            )

            patience_counter = 0

            print(
                f"  [BEST] New best val acc: "
                f"{best_val_acc:.2f}% — saved."
            )

        else:
            patience_counter += 1

            print(
                f"  No improvement. "
                f"Patience: {patience_counter}/{patience}"
            )

            if (
                not smoke
                and patience_counter >= patience
            ):
                print(
                    f"\n  Early stopping triggered "
                    f"after {epoch} epochs."
                )
                break

    total_elapsed = time.time() - training_start

    history["total_training_time_s"] = round(
        total_elapsed,
        1,
    )

    print(
        f"\nTraining complete. "
        f"Total time: {total_elapsed:.1f}s"
    )

    print(
        f"Best val accuracy: "
        f"{best_val_acc:.2f}% "
        f"at epoch {history['best_epoch']}"
    )

    # ----------------------------------------------------------
    # Save history
    # ----------------------------------------------------------
    with open(
        CLASSIFIER_HISTORY,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            history,
            f,
            indent=2,
        )

    print(
        f"History saved: {CLASSIFIER_HISTORY}"
    )

    # ----------------------------------------------------------
    # Save plots
    # ----------------------------------------------------------
    _plot_metric(
        history["train_loss"],
        history["val_loss"],
        "Cross-Entropy Loss",
        "Classifier Training & Validation Loss",
        os.path.join(
            TRAINING_DIR,
            "classifier_loss.png",
        ),
    )

    _plot_metric(
        history["train_acc"],
        history["val_acc"],
        "Accuracy (%)",
        "Classifier Training & Validation Accuracy",
        os.path.join(
            TRAINING_DIR,
            "classifier_accuracy.png",
        ),
    )

    # ----------------------------------------------------------
    # Save skipped-sample log
    # ----------------------------------------------------------
    get_skip_logger().save()

    return history


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train NoiseSpectrogramClassifier"
    )

    parser.add_argument(
        "--epochs",
        type=int,
        default=CLASSIFIER_EPOCHS,
    )

    parser.add_argument(
        "--batch_size",
        type=int,
        default=BATCH_SIZE,
    )

    parser.add_argument(
        "--lr",
        type=float,
        default=CLASSIFIER_LR,
    )

    parser.add_argument(
        "--patience",
        type=int,
        default=CLASSIFIER_PATIENCE,
    )

    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Run exactly 2 epochs as a smoke test",
    )

    args = parser.parse_args()

    train_classifier(
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        patience=args.patience,
        smoke=args.smoke,
    )

    print("\nDone.")
