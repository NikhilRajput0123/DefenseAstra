"""
Evaluate the trained LightweightSpectralUNet on the test split.

Usage (from project root):
    venv\\Scripts\\python.exe -m src.evaluate_enhancement

Produces:
    outputs/evaluation/noise_wise_metrics.csv
    outputs/evaluation/noise_wise_metrics.json
    outputs/evaluation/examples/  (clean/noisy/enhanced WAV files)
    outputs/evaluation/plots/     (waveform + spectrogram comparisons)
"""

import csv
import json
import os
import sys
import time
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))

import matplotlib
matplotlib.use("Agg")
import numpy as np
import soundfile as sf
import torch
from audio_utils import (
    calculate_snr,
    calculate_si_snr,
    calculate_stoi,
    save_waveform_comparison_plot,
    save_spectrogram_comparison_plot,
)

from config import (
    DEVICE,
    EVAL_DIR,
    EXAMPLES_DIR,
    NOISE_CLASSES,
    NOISE_WISE_CSV,
    NOISE_WISE_JSON,
    PLOTS_DIR,
    SAMPLE_RATE,
    SEED,
    UNET_BEST_CKPT,
    make_output_dirs,
    set_seed,
)
from dataset import make_dataloader, SIHAudioDataset
from models import LightweightSpectralUNet


# ──────────────────────────────────────────────────────────────
# Single-sample inference with latency measurement
# ──────────────────────────────────────────────────────────────

@torch.no_grad()
def enhance_waveform(
    model: torch.nn.Module,
    noisy_wav: np.ndarray,
    device: torch.device,
) -> tuple:
    """
    Run the U-Net on a single waveform and measure latency.

    Returns
    -------
    enhanced_np : np.ndarray
    latency_ms  : dict with keys stft, model, istft, total
    """
    x = torch.from_numpy(noisy_wav).unsqueeze(0).to(device)  # (1, T)

    model.eval()
    t0 = time.time()
    enhanced_t, mask = model(x)
    t1 = time.time()

    total_ms = (t1 - t0) * 1000.0
    enhanced_np = enhanced_t.squeeze(0).cpu().numpy()

    latency = {
        "total_ms": round(total_ms, 2),
        "note": "Measured on CPU (offline processing, not real-time chunked)",
    }
    return enhanced_np, latency


# ──────────────────────────────────────────────────────────────
# Main evaluation
# ──────────────────────────────────────────────────────────────

def evaluate_enhancement(checkpoint_path: str = UNET_BEST_CKPT) -> dict:
    """
    Evaluate the trained U-Net on the test split.

    - Calculates SNR, SI-SNR, STOI before and after enhancement
    - Reports noise-wise and SNR-level-wise breakdowns
    - Saves example WAV files and comparison plots
    - All metrics from actual model inference — no fabrication

    Returns
    -------
    results dict
    """
    set_seed(SEED)
    make_output_dirs()

    print("=" * 60)
    print("  Enhancement Evaluation — TEST SET ONLY")
    print("  ALL METRICS FROM ACTUAL MODEL INFERENCE")
    print("=" * 60)

    # ── Load model ────────────────────────────────────────────
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(
            f"Checkpoint not found: {checkpoint_path}\n"
            "Please run train_enhancement.py first."
        )
    print(f"\nLoading checkpoint: {checkpoint_path}")
    ckpt = torch.load(checkpoint_path, map_location=DEVICE)
    model = LightweightSpectralUNet().to(DEVICE)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()
    trained_epoch = ckpt.get("epoch", "?")
    print(f"  Loaded from epoch {trained_epoch}")

    # ── Test DataLoader ───────────────────────────────────────
    print("\nLoading test DataLoader...")
    # Use batch_size=1 for per-sample latency measurement + WAV saving
    test_loader = make_dataloader("test", batch_size=1, load_clean=True, shuffle=False)

    # ── Containers for aggregation ────────────────────────────
    # noise_wise: {noise_type: {snr_before:[], snr_after:[], si_snr_before:[], ...}}
    noise_wise: dict = defaultdict(lambda: defaultdict(list))
    # snr_wise: {target_snr_db: {snr_before:[], snr_after:[], si_snr_before:[], ...}}
    snr_wise: dict = defaultdict(lambda: defaultdict(list))

    all_latencies = []
    all_results = []  # per-sample record

    # Track representative examples to save
    # We want 1 example per noise class (at a mid SNR if possible)
    saved_examples: dict = {}  # noise_type → bool
    n_plots_max = 6  # how many waveform/spectrogram plots to generate

    print(f"\nProcessing {len(test_loader)} test samples...")
    t_eval_start = time.time()

    for sample_idx, (noisy_b, clean_b, labels_b, metas_b) in enumerate(test_loader):
        meta = metas_b[0]
        noise_type = meta["noise_type"]
        target_snr = float(meta["target_snr_db"])
        sample_id = meta["sample_id"]

        # Get numpy arrays (squeeze batch dim)
        noisy_np = noisy_b.squeeze(0).numpy()   # (T,)
        clean_np = clean_b.squeeze(0).numpy()   # (T,)

        # Skip completely silent (bad) audio
        if noisy_np.std() < 1e-6 or clean_np.std() < 1e-6:
            print(f"  [SKIP] {sample_id} — silent audio")
            continue

        # ── Enhance ───────────────────────────────────────────
        try:
            enhanced_np, latency = enhance_waveform(model, noisy_np, DEVICE)
        except Exception as e:
            print(f"  [SKIP] {sample_id} — enhancement failed: {e}")
            continue

        all_latencies.append(latency["total_ms"])

        # ── Metrics before/after ──────────────────────────────
        min_len = min(len(clean_np), len(noisy_np), len(enhanced_np))
        c = clean_np[:min_len]
        n_ = noisy_np[:min_len]
        e_ = enhanced_np[:min_len]

        snr_before = calculate_snr(c, n_)
        snr_after = calculate_snr(c, e_)
        si_snr_before = calculate_si_snr(c, n_)
        si_snr_after = calculate_si_snr(c, e_)
        stoi_before = calculate_stoi(c, n_, sr=SAMPLE_RATE)
        stoi_after = calculate_stoi(c, e_, sr=SAMPLE_RATE)

        # Accumulate
        noise_wise[noise_type]["snr_before"].append(snr_before)
        noise_wise[noise_type]["snr_after"].append(snr_after)
        noise_wise[noise_type]["si_snr_before"].append(si_snr_before)
        noise_wise[noise_type]["si_snr_after"].append(si_snr_after)
        noise_wise[noise_type]["stoi_before"].append(stoi_before)
        noise_wise[noise_type]["stoi_after"].append(stoi_after)

        snr_key = str(int(target_snr))
        snr_wise[snr_key]["snr_before"].append(snr_before)
        snr_wise[snr_key]["snr_after"].append(snr_after)
        snr_wise[snr_key]["si_snr_before"].append(si_snr_before)
        snr_wise[snr_key]["si_snr_after"].append(si_snr_after)
        snr_wise[snr_key]["stoi_before"].append(stoi_before)
        snr_wise[snr_key]["stoi_after"].append(stoi_after)

        all_results.append({
            "sample_id": sample_id,
            "noise_type": noise_type,
            "target_snr_db": target_snr,
            "snr_before": snr_before,
            "snr_after": snr_after,
            "snr_improvement": snr_after - snr_before,
            "si_snr_before": si_snr_before,
            "si_snr_after": si_snr_after,
            "si_snr_improvement": si_snr_after - si_snr_before,
            "stoi_before": stoi_before,
            "stoi_after": stoi_after,
            "latency_ms": latency["total_ms"],
        })

        # ── Save example WAVs ─────────────────────────────────
        if noise_type not in saved_examples and abs(target_snr - 0) < 3.0:
            saved_examples[noise_type] = True
            ex_dir = os.path.join(EXAMPLES_DIR, noise_type)
            os.makedirs(ex_dir, exist_ok=True)
            sf.write(os.path.join(ex_dir, "clean.wav"),
                     c.astype(np.float32), SAMPLE_RATE, subtype="PCM_16")
            sf.write(os.path.join(ex_dir, "noisy.wav"),
                     n_.astype(np.float32), SAMPLE_RATE, subtype="PCM_16")
            sf.write(os.path.join(ex_dir, "enhanced.wav"),
                     e_.astype(np.float32), SAMPLE_RATE, subtype="PCM_16")
            print(f"  [EXAMPLE] Saved WAVs for: {noise_type}")

        # ── Save comparison plots ─────────────────────────────
        if len(saved_examples) <= n_plots_max and noise_type in saved_examples:
            # Only plot for the noise types we've saved WAVs for
            plot_prefix = os.path.join(PLOTS_DIR, f"{noise_type}_snr{int(target_snr)}")
            if not os.path.exists(plot_prefix + "_waveform.png"):
                try:
                    save_waveform_comparison_plot(
                        c, n_, e_,
                        save_path=plot_prefix + "_waveform.png",
                        title=f"Waveform: {noise_type} @ {int(target_snr)} dB SNR",
                    )
                    save_spectrogram_comparison_plot(
                        c, n_, e_,
                        save_path=plot_prefix + "_spectrogram.png",
                        title=f"Spectrogram: {noise_type} @ {int(target_snr)} dB SNR",
                    )
                except Exception as e_plot:
                    print(f"  [WARN] Plot failed for {noise_type}: {e_plot}")

        if (sample_idx + 1) % 100 == 0:
            elapsed = time.time() - t_eval_start
            print(f"  Progress: {sample_idx+1}/{len(test_loader)} | "
                  f"Elapsed: {elapsed:.1f}s")

    t_eval_elapsed = time.time() - t_eval_start
    n_evaluated = len(all_results)
    print(f"\n  Evaluated {n_evaluated} test samples in {t_eval_elapsed:.1f}s")

    # ── Aggregate noise-wise metrics ──────────────────────────
    noise_wise_agg = {}
    for noise_type in NOISE_CLASSES:
        vals = noise_wise.get(noise_type, {})
        n = len(vals.get("snr_before", []))
        if n == 0:
            noise_wise_agg[noise_type] = {"n_samples": 0}
            continue
        noise_wise_agg[noise_type] = {
            "n_samples": n,
            "mean_snr_before": round(float(np.mean(vals["snr_before"])), 3),
            "mean_snr_after": round(float(np.mean(vals["snr_after"])), 3),
            "mean_snr_improvement": round(
                float(np.mean(vals["snr_after"])) - float(np.mean(vals["snr_before"])), 3
            ),
            "mean_si_snr_before": round(float(np.mean(vals["si_snr_before"])), 3),
            "mean_si_snr_after": round(float(np.mean(vals["si_snr_after"])), 3),
            "mean_si_snr_improvement": round(
                float(np.mean(vals["si_snr_after"])) - float(np.mean(vals["si_snr_before"])), 3
            ),
            "mean_stoi_before": round(float(np.nanmean(vals["stoi_before"])), 4),
            "mean_stoi_after": round(float(np.nanmean(vals["stoi_after"])), 4),
            "mean_stoi_improvement": round(
                float(np.nanmean(vals["stoi_after"])) - float(np.nanmean(vals["stoi_before"])), 4
            ),
        }

    # ── Aggregate SNR-wise metrics ─────────────────────────────
    snr_wise_agg = {}
    for snr_key in sorted(snr_wise.keys(), key=lambda x: int(x)):
        vals = snr_wise[snr_key]
        n = len(vals["snr_before"])
        snr_wise_agg[f"{snr_key}dB"] = {
            "n_samples": n,
            "mean_snr_before": round(float(np.mean(vals["snr_before"])), 3),
            "mean_snr_after": round(float(np.mean(vals["snr_after"])), 3),
            "mean_snr_improvement": round(
                float(np.mean(vals["snr_after"])) - float(np.mean(vals["snr_before"])), 3
            ),
            "mean_si_snr_before": round(float(np.mean(vals["si_snr_before"])), 3),
            "mean_si_snr_after": round(float(np.mean(vals["si_snr_after"])), 3),
            "mean_si_snr_improvement": round(
                float(np.mean(vals["si_snr_after"])) - float(np.mean(vals["si_snr_before"])), 3
            ),
            "mean_stoi_before": round(float(np.nanmean(vals["stoi_before"])), 4),
            "mean_stoi_after": round(float(np.nanmean(vals["stoi_after"])), 4),
        }

    # ── Overall aggregates ────────────────────────────────────
    all_snr_before = [r["snr_before"] for r in all_results]
    all_snr_after = [r["snr_after"] for r in all_results]
    all_si_snr_before = [r["si_snr_before"] for r in all_results]
    all_si_snr_after = [r["si_snr_after"] for r in all_results]
    all_stoi_before = [r["stoi_before"] for r in all_results if not np.isnan(r["stoi_before"])]
    all_stoi_after = [r["stoi_after"] for r in all_results if not np.isnan(r["stoi_after"])]

    overall = {
        "IMPORTANT": "All metrics from actual test-set inference. No fabrication.",
        "test_samples_evaluated": n_evaluated,
        "total_eval_time_s": round(t_eval_elapsed, 1),
        "mean_latency_per_sample_ms": round(float(np.mean(all_latencies)), 2) if all_latencies else 0,
        "latency_note": "Measured on CPU, offline (batch) processing",
        "mean_snr_before_dB": round(float(np.mean(all_snr_before)), 3),
        "mean_snr_after_dB": round(float(np.mean(all_snr_after)), 3),
        "mean_snr_improvement_dB": round(float(np.mean(all_snr_after)) - float(np.mean(all_snr_before)), 3),
        "mean_si_snr_before_dB": round(float(np.mean(all_si_snr_before)), 3),
        "mean_si_snr_after_dB": round(float(np.mean(all_si_snr_after)), 3),
        "mean_si_snr_improvement_dB": round(float(np.mean(all_si_snr_after)) - float(np.mean(all_si_snr_before)), 3),
        "mean_stoi_before": round(float(np.mean(all_stoi_before)), 4) if all_stoi_before else "N/A",
        "mean_stoi_after": round(float(np.mean(all_stoi_after)), 4) if all_stoi_after else "N/A",
        "noise_wise": noise_wise_agg,
        "snr_wise": snr_wise_agg,
    }

    # ── Save noise-wise CSV ───────────────────────────────────
    with open(NOISE_WISE_CSV, "w", newline="", encoding="utf-8") as f:
        fields = ["noise_type", "n_samples",
                  "mean_snr_before", "mean_snr_after", "mean_snr_improvement",
                  "mean_si_snr_before", "mean_si_snr_after", "mean_si_snr_improvement",
                  "mean_stoi_before", "mean_stoi_after", "mean_stoi_improvement"]
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for nt in NOISE_CLASSES:
            row = {"noise_type": nt}
            row.update(noise_wise_agg.get(nt, {"n_samples": 0}))
            writer.writerow(row)
    print(f"  Noise-wise CSV saved: {NOISE_WISE_CSV}")

    with open(NOISE_WISE_JSON, "w") as f:
        json.dump(overall, f, indent=2)
    print(f"  Noise-wise JSON saved: {NOISE_WISE_JSON}")

    # ── Print summary ─────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  ENHANCEMENT TEST SET RESULTS")
    print("  (from actual model inference — no fabrication)")
    print("=" * 60)
    print(f"  Samples evaluated    : {n_evaluated}")
    print(f"  Mean SNR before      : {overall['mean_snr_before_dB']:.2f} dB")
    print(f"  Mean SNR after       : {overall['mean_snr_after_dB']:.2f} dB")
    print(f"  Mean SNR improvement : {overall['mean_snr_improvement_dB']:+.2f} dB")
    print(f"  Mean SI-SNR before   : {overall['mean_si_snr_before_dB']:.2f} dB")
    print(f"  Mean SI-SNR after    : {overall['mean_si_snr_after_dB']:.2f} dB")
    print(f"  Mean SI-SNR improv.  : {overall['mean_si_snr_improvement_dB']:+.2f} dB")
    if all_stoi_before:
        print(f"  Mean STOI before     : {overall['mean_stoi_before']:.4f}")
        print(f"  Mean STOI after      : {overall['mean_stoi_after']:.4f}")
    print(f"\n  Latency (mean/sample): {overall['mean_latency_per_sample_ms']:.1f} ms")
    print(f"  Note: CPU offline processing (not real-time)")

    print("\n  Noise-wise SNR improvement:")
    for nt in NOISE_CLASSES:
        v = noise_wise_agg.get(nt, {})
        if v.get("n_samples", 0) > 0:
            imp = v.get("mean_snr_improvement", 0)
            bar = "#" * max(0, int((imp + 5) * 2))
            print(f"    {nt:20s}: {imp:+.2f} dB  (n={v['n_samples']})")

    print("\n  SNR-level breakdown:")
    for snr_label, v in snr_wise_agg.items():
        if v.get("n_samples", 0) > 0:
            imp = v.get("mean_snr_improvement", 0)
            print(f"    {snr_label:8s}: {imp:+.2f} dB improvement  "
                  f"(n={v['n_samples']})")
    print("=" * 60)

    return overall


# ──────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    results = evaluate_enhancement()
    print("\nEnhancement evaluation complete.")
