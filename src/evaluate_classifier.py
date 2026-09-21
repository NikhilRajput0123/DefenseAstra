"""
Evaluate the trained NoiseSpectrogramClassifier on the test split.

Usage (from project root):
    venv\\Scripts\\python.exe -m src.evaluate_classifier

Produces:
    outputs/evaluation/classifier_metrics.json
    outputs/evaluation/confusion_matrix.png
    outputs/evaluation/classification_report.txt
"""

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
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

from config import (
    CLASSIFIER_BEST_CKPT,
    CLASSIFIER_METRICS,
    CLASSIFICATION_REPORT,
    CONFUSION_MATRIX_PNG,
    DEVICE,
    EVAL_DIR,
    IDX_TO_CLASS,
    NOISE_CLASSES,
    NUM_CLASSES,
    SEED,
    make_output_dirs,
    set_seed,
)
from dataset import make_dataloader
from models import NoiseSpectrogramClassifier


# ──────────────────────────────────────────────────────────────
# Inference pass on test set
# ──────────────────────────────────────────────────────────────

@torch.no_grad()
def run_test_inference(
    model: torch.nn.Module,
    loader,
    device: torch.device,
) -> tuple:
    """
    Run inference on the test DataLoader.

    Returns
    -------
    all_preds  : list[int]
    all_labels : list[int]
    all_metas  : list[dict]
    latency_ms : float  (mean per-batch inference time)
    """
    model.eval()
    all_preds = []
    all_labels = []
    all_metas = []
    latencies = []

    for batch_idx, batch in enumerate(loader):
        # collate_fn returns None when every sample in the batch is invalid.
        if batch is None:
            continue

        noisy, _clean, labels, metas = batch

        # Dataset/collate_fn guarantee valid labels. Do not silently repair them.
        if not torch.all(
            (labels >= 0) & (labels < model.num_classes)
        ):
            raise ValueError(
                f"Invalid labels in test batch {batch_idx}: {labels.tolist()}"
            )

        if not torch.isfinite(noisy).all():
            raise FloatingPointError(
                f"Non-finite audio detected in test batch {batch_idx}"
            )

        noisy_v = noisy.to(device, non_blocking=True)
        labels_v = labels.to(device, non_blocking=True)

        # Synchronize CUDA before/after timing so GPU latency is measured
        # rather than only measuring asynchronous kernel launch time.
        if device.type == "cuda":
            torch.cuda.synchronize(device)
        t0 = time.perf_counter()
        logits = model(noisy_v)
        if device.type == "cuda":
            torch.cuda.synchronize(device)
        t1 = time.perf_counter()

        latencies.append((t1 - t0) * 1000.0)  # ms per batch

        if not torch.isfinite(logits).all():
            raise FloatingPointError(
                f"Non-finite logits detected in test batch {batch_idx}"
            )

        preds = logits.argmax(dim=1).cpu().tolist()
        labels_cpu = labels_v.cpu().tolist()

        all_preds.extend(preds)
        all_labels.extend(labels_cpu)
        all_metas.extend(metas)

    mean_latency_ms = float(np.mean(latencies)) if latencies else 0.0
    return all_preds, all_labels, all_metas, mean_latency_ms


# ──────────────────────────────────────────────────────────────
# Confusion matrix plot
# ──────────────────────────────────────────────────────────────

def plot_confusion_matrix(
    cm: np.ndarray,
    class_names: list,
    save_path: str,
) -> None:
    fig, ax = plt.subplots(figsize=(14, 12))
    im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
    fig.colorbar(im, ax=ax)

    ax.set_xticks(range(len(class_names)))
    ax.set_yticks(range(len(class_names)))
    ax.set_xticklabels(class_names, rotation=45, ha="right", fontsize=9)
    ax.set_yticklabels(class_names, fontsize=9)
    ax.set_xlabel("Predicted Label", fontsize=11)
    ax.set_ylabel("True Label", fontsize=11)
    ax.set_title("Noise Classifier — Confusion Matrix (Test Set)", fontsize=13)

    # Annotate cells
    thresh = cm.max() / 2.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, f"{cm[i, j]}",
                    ha="center", va="center", fontsize=8,
                    color="white" if cm[i, j] > thresh else "black")

    fig.tight_layout()
    plt.savefig(save_path, dpi=120)
    plt.close(fig)
    print(f"  Confusion matrix saved: {save_path}")


# ──────────────────────────────────────────────────────────────
# Main evaluation function
# ──────────────────────────────────────────────────────────────

def evaluate_classifier(checkpoint_path: str = CLASSIFIER_BEST_CKPT) -> dict:
    """
    Load the best classifier checkpoint and evaluate on the test split.

    All reported metrics come from actual test-set inference.

    Returns
    -------
    metrics dict
    """
    set_seed(SEED)
    make_output_dirs()

    print("=" * 60)
    print("  Classifier Evaluation — TEST SET ONLY")
    print("  METRICS ARE FROM ACTUAL MODEL INFERENCE ON THE TEST SET")
    print("=" * 60)

    # ── Load model ───────────────────────────────────────────
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(
            f"Checkpoint not found: {checkpoint_path}\n"
            "Please run train_classifier.py first."
        )
    print(f"\nLoading checkpoint: {checkpoint_path}")
    ckpt = torch.load(checkpoint_path, map_location=DEVICE)
    model = NoiseSpectrogramClassifier().to(DEVICE)
    model.load_state_dict(ckpt["model_state_dict"])
    trained_epoch = ckpt.get("epoch", "?")
    train_val_acc = ckpt.get("val_acc", "?")
    if isinstance(train_val_acc, (int, float)):
        val_acc_text = f"{train_val_acc:.2f}%"
    else:
        val_acc_text = str(train_val_acc)
    print(
        f"  Loaded from epoch {trained_epoch} "
        f"(val acc during training: {val_acc_text})"
    )
    model.eval()

    # ── Test DataLoader ───────────────────────────────────────
    print("\nLoading test DataLoader...")
    test_loader = make_dataloader("test", batch_size=16, load_clean=False, shuffle=False)

    # ── Inference ─────────────────────────────────────────────
    print("Running inference on test set...")
    t_start = time.time()
    all_preds, all_labels, all_metas, mean_latency_ms = run_test_inference(
        model, test_loader, DEVICE
    )
    t_elapsed = time.time() - t_start

    n_samples = len(all_preds)
    print(f"  Inference complete. {n_samples} samples evaluated in {t_elapsed:.1f}s")
    print(f"  Mean batch latency: {mean_latency_ms:.1f} ms")

    if n_samples == 0:
        raise RuntimeError("No valid test samples were evaluated!")

    # ── Metrics ───────────────────────────────────────────────
    y_true = np.array(all_labels)
    y_pred = np.array(all_preds)

    accuracy = float(accuracy_score(y_true, y_pred)) * 100.0
    macro_f1 = float(f1_score(y_true, y_pred, average="macro", zero_division=0))
    weighted_f1 = float(f1_score(y_true, y_pred, average="weighted", zero_division=0))
    macro_precision = float(precision_score(y_true, y_pred, average="macro", zero_division=0))
    macro_recall = float(recall_score(y_true, y_pred, average="macro", zero_division=0))
    weighted_precision = float(precision_score(y_true, y_pred, average="weighted", zero_division=0))
    weighted_recall = float(recall_score(y_true, y_pred, average="weighted", zero_division=0))

    # Per-class metrics
    class_precision = precision_score(y_true, y_pred, average=None, zero_division=0, labels=list(range(NUM_CLASSES)))
    class_recall = recall_score(y_true, y_pred, average=None, zero_division=0, labels=list(range(NUM_CLASSES)))
    class_f1 = f1_score(y_true, y_pred, average=None, zero_division=0, labels=list(range(NUM_CLASSES)))

    per_class = {}
    for i in range(NUM_CLASSES):
        class_name = IDX_TO_CLASS[i]
        support = int(np.sum(y_true == i))
        per_class[class_name] = {
            "precision": round(float(class_precision[i]), 4),
            "recall": round(float(class_recall[i]), 4),
            "f1": round(float(class_f1[i]), 4),
            "support": support,
        }

    # Confusion matrix
    cm = confusion_matrix(y_true, y_pred, labels=list(range(NUM_CLASSES)))

    # Build full metrics dict
    metrics = {
        "IMPORTANT": "These metrics are calculated from actual test-set inference.",
        "checkpoint_path": str(checkpoint_path),
        "test_samples_evaluated": n_samples,
        "inference_time_s": round(t_elapsed, 2),
        "mean_batch_latency_ms": round(mean_latency_ms, 2),
        "latency_definition": "Mean forward-pass latency per valid test batch; CUDA synchronized when applicable.",
        "accuracy_pct": round(accuracy, 4),
        "macro_precision": round(macro_precision, 4),
        "macro_recall": round(macro_recall, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_precision": round(weighted_precision, 4),
        "weighted_recall": round(weighted_recall, 4),
        "weighted_f1": round(weighted_f1, 4),
        "per_class_metrics": per_class,
        "confusion_matrix": cm.tolist(),
    }

    # ── Save metrics JSON ─────────────────────────────────────
    with open(CLASSIFIER_METRICS, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"\n  Metrics saved: {CLASSIFIER_METRICS}")

    # ── Save classification report TXT ────────────────────────
    class_names_present = [IDX_TO_CLASS[i] for i in range(NUM_CLASSES)]
    report_str = (
        "=" * 70 + "\n"
        "NOISE CLASSIFIER — TEST SET EVALUATION REPORT\n"
        "These metrics are calculated from actual test-set inference.\n"
        "No metrics are fabricated or hardcoded.\n"
        "=" * 70 + "\n\n"
        f"Checkpoint: {checkpoint_path}\n"
        f"Test samples evaluated: {n_samples}\n"
        f"Overall Accuracy: {accuracy:.2f}%\n\n"
        + classification_report(
            y_true, y_pred,
            target_names=class_names_present,
        labels=list(range(NUM_CLASSES)),
            zero_division=0,
            
        )
    )
    with open(CLASSIFICATION_REPORT, "w", encoding="utf-8") as f:
        f.write(report_str)
    print(f"  Classification report saved: {CLASSIFICATION_REPORT}")

    # ── Plot confusion matrix ─────────────────────────────────
    plot_confusion_matrix(cm, NOISE_CLASSES, CONFUSION_MATRIX_PNG)

    # ── Print summary ─────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  CLASSIFIER TEST SET RESULTS")
    print("  (from actual model inference — no fabrication)")
    print("=" * 60)
    print(f"  Samples evaluated  : {n_samples}")
    print(f"  Accuracy           : {accuracy:.2f}%")
    print(f"  Macro F1           : {macro_f1:.4f}")
    print(f"  Weighted F1        : {weighted_f1:.4f}")
    print(f"  Macro Precision    : {macro_precision:.4f}")
    print(f"  Macro Recall       : {macro_recall:.4f}")
    print("\n  Per-class F1:")
    for cls_name, v in per_class.items():
        bar = "#" * int(v["f1"] * 20)
        print(f"    {cls_name:20s}: {v['f1']:.3f}  [{bar:<20}] (n={v['support']})")
    print("=" * 60)

    return metrics


# ──────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    metrics = evaluate_classifier()
    print("\nClassifier evaluation complete.")
