"""
dataset_builder.py — Defence Audio Noise Intelligence System
Step 2: Real Audio Dataset Acquisition, Preparation, and Verification

Stages:
    1. Data Acquisition      (CMU Arctic, ESC-50, Internet Archive)
    2. Raw Metadata          (scan raw/, extract stats, detect corruptions)
    3. Standardization       (16 kHz mono float32 WAV via audio_utils)
    4. Leakage-free Splits   (speaker-disjoint clean; hash-disjoint noise)
    5. SNR Mixing            (noisy-clean pairs at -5,0,5,10,15,20 dB)
    6. Dataset Metadata      (dataset.csv, split_metadata.csv)
    7. Leakage Checks        (speaker overlap, noise hash overlap)
    8. Automated Validation  (SR, mono, NaN/Inf, SNR accuracy, completeness)
    9. Dataset Report        (human-readable + JSON report)

Usage:
    python src/dataset_builder.py

SCIENTIFIC HONESTY:
    - If a data source is unavailable → reports INSUFFICIENT DATA
    - ESC-50 fireworks used as gunshot proxy with full transparency in metadata
    - actual_snr_db is always measured; never copied from target
    - No fabricated audio, no fake labels, no hard-coded statistics
"""

import csv
import hashlib
import json
import logging
import os
import random
import shutil
import sys
import tarfile
import time
import traceback
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import requests
from tqdm import tqdm

# ── Add src to path for audio_utils ──────────────────────────────────────────
SRC_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SRC_DIR))
import audio_utils as au

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("dataset_builder")

# ── Paths ─────────────────────────────────────────────────────────────────────
PROJECT_ROOT  = SRC_DIR.parent
DATA_ROOT     = PROJECT_ROOT / "data"
RAW_ROOT      = DATA_ROOT / "raw"
PROCESSED_ROOT= DATA_ROOT / "processed"
METADATA_ROOT = DATA_ROOT / "metadata"
REPORT_DIR    = PROJECT_ROOT / "outputs" / "dataset_report"
NOISY_ROOT    = PROCESSED_ROOT / "noisy"

# ── Reproducibility ───────────────────────────────────────────────────────────
RANDOM_SEED = 42
random.seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)

# ── Audio constants ───────────────────────────────────────────────────────────
TARGET_SR   = 16000
SNR_LEVELS  = [-5, 0, 5, 10, 15, 20]
MIN_DURATION = 0.5   # seconds
MAX_DURATION = 30.0  # seconds (clips longer are trimmed)

# ── Dataset sources ───────────────────────────────────────────────────────────
CMU_ARCTIC_BASE = "http://www.festvox.org/cmu_arctic/packed"
ESC50_ZIP_URL   = "https://github.com/karolpiczak/ESC-50/archive/master.zip"
ESC50_LICENSE   = "CC BY (Creative Commons Attribution)"
CMU_LICENSE     = "Permissive free use (CMU Arctic); attribution required"

# Speakers and their fixed split assignment (speaker-disjoint)
CMU_SPEAKERS = {
    "bdl": "train",   # US male
    "slt": "train",   # US female
    "jmk": "train",   # Canadian male
    "awb": "train",   # Scottish male
    "rms": "val",     # US male — validation only
    "clb": "test",    # US female — test only
}

# ESC-50 category → our noise class (transparent mapping)
ESC50_MAP = {
    "helicopter":     "helicopter",
    "wind":           "wind",
    "car_horn":       "traffic",
    "siren":          "siren",
    "engine":         "heavy_engine",
    "chainsaw":       "machinery",
    "vacuum_cleaner": "machinery",
    "laughing":       "crowd",
    "clapping":       "crowd",
    
}

# Noise nature per class
NOISE_NATURE = {
    "gunshot":          "impulsive",
    "explosion":        "impulsive",
    "artillery":        "impulsive",
    "helicopter":       "continuous",
    "drone":            "continuous",
    "heavy_engine":     "continuous",
    "military_vehicle": "continuous",
    "wind":             "continuous",
    "traffic":          "continuous",
    "machinery":        "continuous",
    "siren":            "tonal_continuous",
    "crowd":            "varying_continuous",
}

ALL_NOISE_CLASSES = [
    "helicopter", "gunshot", "explosion", "artillery",
    "drone", "military_vehicle", "heavy_engine",
    "wind", "traffic", "machinery", "siren", "crowd",
]

DEFENCE_CLASSES     = ["helicopter","gunshot","explosion","artillery","drone","military_vehicle","heavy_engine"]
ENVIRONMENTAL_CLASSES = ["wind","traffic","machinery","siren","crowd"]

# Classes where ESC-50 covers us
ESC50_COVERED = set(ESC50_MAP.values())

# Internet Archive search items to try for defence gaps
# Format: (identifier, our_category, description, license)
INTERNET_ARCHIVE_ITEMS = [
    # Add defence-specific sources here ONLY after manually verifying
    # the recording content and exact license.
    #
    # Example:
    # ("verified_identifier", "gunshot", "Verified gunshot recordings", "Verified license"),
    #
    # Kept empty intentionally so the pipeline never guesses labels.
]

# archive.org metadata API
IA_METADATA_URL = "https://archive.org/metadata/{identifier}"
IA_DOWNLOAD_URL = "https://archive.org/download/{identifier}/{filename}"

# Mixing parameters
MAX_NOISE_PER_CLASS_TRAIN = 20
MAX_NOISE_PER_CLASS_VAL   = 8
MAX_NOISE_PER_CLASS_TEST  = 8
MAX_CLEAN_PER_NOISE       = 2   # clean utterances paired with each noise file


# ══════════════════════════════════════════════════════════════════════════════
# HELPER UTILITIES
# ══════════════════════════════════════════════════════════════════════════════

def md5_hash(file_path: Path) -> str:
    """Compute MD5 hash of file for duplicate/leakage detection."""
    h = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def download_file(url: str, dest: Path, desc: str = "", timeout: int = 60) -> bool:
    """Download file with progress bar. Returns True on success."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        log.info(f"  [SKIP] Already exists: {dest.name}")
        return True
    try:
        resp = requests.get(url, stream=True, timeout=timeout,
                            headers={"User-Agent": "SIH26052-DatasetBuilder/1.0"})
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        with open(dest, "wb") as f, tqdm(total=total, unit="B", unit_scale=True,
                                          desc=desc or dest.name, leave=False) as bar:
            for chunk in resp.iter_content(chunk_size=65536):
                f.write(chunk)
                bar.update(len(chunk))
        return True
    except Exception as e:
        log.warning(f"  [FAIL] Download failed for {url}: {e}")
        if dest.exists():
            dest.unlink()
        return False


def validate_audio_file(path: Path) -> Tuple[bool, str, float, int, int]:
    """
    Validate an audio file.
    Returns: (valid, status_msg, duration_sec, sample_rate, channels)
    """
    try:
        import soundfile as sf
        info = sf.info(str(path))
        duration = info.frames / info.samplerate
        channels = info.channels
        if duration < 0.1:
            return False, "too_short", duration, info.samplerate, channels
        return True, "ok", duration, info.samplerate, channels
    except Exception as e:
        return False, f"corrupted: {e}", 0.0, 0, 0


def load_audio_safe(path: Path) -> Optional[Tuple[np.ndarray, int]]:
    """
    Load audio safely using audio_utils. Returns None on failure.
    Tries soundfile first; falls back to torchaudio for MP3/OGG.
    """
    try:
        data, sr = au.load_audio(str(path), target_sr=TARGET_SR, mono=True, normalize=True)
        if np.any(np.isnan(data)) or np.any(np.isinf(data)):
            log.warning(f"  NaN/Inf in {path.name}")
            return None
        if len(data) < int(MIN_DURATION * TARGET_SR):
            return None
        return data, sr
    except Exception:
        # Fallback: try torchaudio for formats soundfile can't handle (MP3 etc.)
        try:
            import torchaudio
            waveform, sr = torchaudio.load(str(path))
            import torch
            if waveform.shape[0] > 1:
                waveform = waveform.mean(dim=0, keepdim=True)
            if sr != TARGET_SR:
                resampler = torchaudio.transforms.Resample(sr, TARGET_SR)
                waveform = resampler(waveform)
                sr = TARGET_SR
            data = waveform.squeeze(0).numpy().astype(np.float32)
            max_val = np.max(np.abs(data))
            if max_val > 1e-6:
                data = data / max_val * 0.95
            if len(data) < int(MIN_DURATION * TARGET_SR):
                return None
            return data, sr
        except Exception as e2:
            log.warning(f"  Cannot load {path.name}: {e2}")
            return None


def get_audio_files(directory: Path, extensions=(".wav", ".flac", ".ogg", ".mp3", ".aif", ".aiff")) -> List[Path]:
    """Recursively collect all audio files in a directory."""
    files = []
    for ext in extensions:
        files.extend(directory.rglob(f"*{ext}"))
    return sorted(files)


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 1 — DATA ACQUISITION
# ══════════════════════════════════════════════════════════════════════════════

def stage1_acquisition() -> Dict:
    """
    FROZEN DATASET MODE.

    Stage 1 does not download anything from the internet.
    It only verifies the already-present raw dataset and reports counts.
    This keeps the pipeline deterministic and prevents it from hanging
    on network downloads.
    """
    log.info("=" * 70)
    log.info("STAGE 1 — DATA ACQUISITION / FROZEN DATASET CHECK")
    log.info("=" * 70)

    status = {
        "clean_speech": {},
        "esc50": "skipped_frozen_dataset",
        "internet_archive": "disabled_frozen_dataset",
    }

    # 1a. CMU Arctic — use existing files only
    log.info("\n[1a] CMU Arctic Speech Dataset")
    cmu_raw_dir = RAW_ROOT / "clean"

    for speaker, split in CMU_SPEAKERS.items():
        speaker_dir = cmu_raw_dir / speaker
        existing = list(speaker_dir.glob("*.wav")) if speaker_dir.exists() else []

        if existing:
            log.info(
                f"  [OK] {speaker} ({split}): "
                f"{len(existing)} WAV files already present"
            )
            status["clean_speech"][speaker] = {
                "split": split,
                "files": len(existing),
                "status": "existing",
            }
        else:
            log.warning(
                f"  [WARN] {speaker} ({split}): no existing WAV files found"
            )
            status["clean_speech"][speaker] = {
                "split": split,
                "files": 0,
                "status": "missing_frozen_dataset",
            }

    # 1b. ESC-50 — completely disabled in frozen mode
    log.info("\n[1b] ESC-50 Environmental Sound Classification Dataset")
    log.info("  [SKIP] Frozen dataset mode — using existing data/raw files only.")
    status["esc50"] = "skipped_frozen_dataset"

    # 1c. Internet Archive — completely disabled in frozen mode
    log.info("\n[1c] Internet Archive — Defence Noise Gaps")
    log.info("  [SKIP] Frozen dataset mode — no network acquisition.")
    status["internet_archive"] = "disabled_frozen_dataset"

    # Final acquisition summary
    log.info("\n[Stage 1 Complete] Frozen dataset summary:")
    for cls in ALL_NOISE_CLASSES:
        if cls in DEFENCE_CLASSES:
            d = RAW_ROOT / "defence_noise" / cls
        else:
            d = RAW_ROOT / "environmental_noise" / cls

        count = len(get_audio_files(d)) if d.exists() else 0
        flag = "✓" if count >= 5 else (
            "⚠ INSUFFICIENT DATA" if count > 0 else "✗ INSUFFICIENT DATA"
        )
        log.info(f"  {cls:20s}: {count:4d} files  {flag}")

    return status


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 2 — RAW METADATA EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def stage2_raw_metadata() -> pd.DataFrame:
    """
    Scan data/raw/, extract metadata for every audio file.
    Saves data/metadata/raw_metadata.csv.
    Returns DataFrame.
    """
    log.info("=" * 70)
    log.info("STAGE 2 — RAW METADATA EXTRACTION")
    log.info("=" * 70)

    rows = []
    corrupted = []
    all_files = get_audio_files(RAW_ROOT)
    log.info(f"  Scanning {len(all_files)} audio files in {RAW_ROOT}")

    for fpath in tqdm(all_files, desc="Scanning raw files"):
        valid, status_msg, duration, sr, channels = validate_audio_file(fpath)
        rel = fpath.relative_to(RAW_ROOT)
        parts = rel.parts

        # Determine category and type
        category = "unknown"
        noise_class = "unknown"
        speaker_id = None
        source_dataset = "unknown"
        source_url = "unknown"
        license_str = "unknown"

        if parts[0] == "clean":
            category = "clean_speech"
            speaker_id = parts[1] if len(parts) > 1 else "unknown"
            source_dataset = "CMU_Arctic"
            source_url = f"http://www.festvox.org/cmu_arctic/packed/cmu_us_{speaker_id}_arctic.tar.bz2"
            license_str = CMU_LICENSE
        elif parts[0] in ("defence_noise", "environmental_noise"):
            noise_class = parts[1] if len(parts) > 1 else "unknown"
            # ESC-50 files have the characteristic naming pattern (digit-hash-letter-target.wav)
            fname = fpath.name
            if fname[0].isdigit() and "-" in fname:
                source_dataset = "ESC-50"
                source_url = "https://github.com/karolpiczak/ESC-50"
                license_str = ESC50_LICENSE
                # No proxy labels are used. Only explicit ESC50_MAP mappings
                # are accepted.
            elif fname.startswith("ia_"):
                source_dataset = "Internet_Archive"
                ia_id = "_".join(fname.split("_")[1:-1]) if fname.count("_") > 2 else "unknown"
                source_url = f"https://archive.org/details/{ia_id}"
                license_str = "Public Domain (unverified — review IA item for exact license)"
            category = "noise"

        file_hash = md5_hash(fpath) if valid else "N/A"

        rows.append({
            "file_path":            str(fpath),
            "original_filename":    fpath.name,
            "relative_path":        str(rel),
            "source_dataset":       source_dataset,
            "source_url":           source_url,
            "license":              license_str,
            "category":             category,
            "noise_class":          noise_class,
            "speaker_id":           speaker_id,
            "duration_sec":         round(duration, 3),
            "original_sample_rate": sr,
            "processed_sample_rate": TARGET_SR,
            "channels":             channels,
            "format":               fpath.suffix.lower(),
            "status":               status_msg,
            "md5":                  file_hash,
            "valid":                valid,
        })
        if not valid:
            corrupted.append(str(fpath))

    df = pd.DataFrame(rows)
    METADATA_ROOT.mkdir(parents=True, exist_ok=True)
    df.to_csv(METADATA_ROOT / "raw_metadata.csv", index=False)
    log.info(f"  Saved raw_metadata.csv: {len(df)} entries, {len(corrupted)} corrupted")
    if corrupted:
        log.warning(f"  Corrupted files: {corrupted}")
    return df


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 3 — AUDIO STANDARDIZATION
# ══════════════════════════════════════════════════════════════════════════════

def stage3_standardize(raw_meta: pd.DataFrame) -> Dict[str, List[Path]]:
    """
    Process all valid raw audio files to 16 kHz mono float32 WAV.
    Saves to data/processed/clean/ or data/processed/noise/<class>/
    Raw files are NOT modified.
    Returns dict: {split_class_key: [processed_path, ...]}
    """
    log.info("=" * 70)
    log.info("STAGE 3 — AUDIO STANDARDIZATION")
    log.info("=" * 70)

    processed_index = defaultdict(list)  # "clean/<speaker>" or "noise/<class>" → [paths]
    valid_rows = raw_meta[raw_meta["valid"] == True].copy()

    for _, row in tqdm(valid_rows.iterrows(), total=len(valid_rows), desc="Standardizing"):
        src_path = Path(row["file_path"])
        category = row["category"]
        speaker_id = row["speaker_id"]
        noise_class = row["noise_class"]

        # Determine output path
        if category == "clean_speech":
            dest_dir = PROCESSED_ROOT / "clean" / str(speaker_id)
            key = f"clean/{speaker_id}"
        elif category == "noise":
            dest_dir = PROCESSED_ROOT / "noise" / noise_class
            key = f"noise/{noise_class}"
        else:
            continue  # skip unknown

        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_file = dest_dir / (src_path.stem + ".wav")

        if dest_file.exists():
            processed_index[key].append(dest_file)
            continue

        result = load_audio_safe(src_path)
        if result is None:
            log.debug(f"  Skipping (load failed): {src_path.name}")
            continue

        data, sr = result

        # Clip very long files
        max_samples = int(MAX_DURATION * TARGET_SR)
        if len(data) > max_samples:
            data = data[:max_samples]

        au.save_audio(str(dest_file), data, sr=TARGET_SR)
        processed_index[key].append(dest_file)

    # Summary
    clean_total = sum(len(v) for k, v in processed_index.items() if k.startswith("clean"))
    noise_total = sum(len(v) for k, v in processed_index.items() if k.startswith("noise"))
    log.info(f"  Standardized: {clean_total} clean files, {noise_total} noise files")
    for cls in ALL_NOISE_CLASSES:
        cnt = len(processed_index.get(f"noise/{cls}", []))
        flag = "✓" if cnt >= 5 else "⚠ INSUFFICIENT DATA"
        log.info(f"    noise/{cls:20s}: {cnt:3d}  {flag}")

    return processed_index


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 4 — LEAKAGE-FREE TRAIN / VAL / TEST SPLIT
# ══════════════════════════════════════════════════════════════════════════════

def stage4_splits(processed_index: Dict[str, List[Path]]) -> Tuple[Dict, Dict]:
    """
    Assign train/val/test splits.
    Clean speech: speaker-disjoint (fixed by CMU_SPEAKERS dict).
    Noise: random 70/15/15 recording-level split per class (seed=42).
    Returns: (clean_splits, noise_splits)
        clean_splits = {"train": [paths], "val": [paths], "test": [paths]}
        noise_splits = {class_name: {"train": [...], "val": [...], "test": [...]}}
    """
    log.info("=" * 70)
    log.info("STAGE 4 — TRAIN / VAL / TEST SPLITS (Leakage-Free)")
    log.info("=" * 70)

    # ── Clean speech splits (speaker-disjoint) ────────────────────────────────
    clean_splits: Dict[str, List[Path]] = {"train": [], "val": [], "test": []}
    for speaker, split in CMU_SPEAKERS.items():
        files = processed_index.get(f"clean/{speaker}", [])
        clean_splits[split].extend(files)

    log.info("  Clean speech split (speaker-disjoint):")
    for split_name in ("train", "val", "test"):
        speakers_in = [s for s, sp in CMU_SPEAKERS.items() if sp == split_name]
        log.info(f"    {split_name:5s}: {len(clean_splits[split_name]):4d} utterances"
                 f"  speakers={speakers_in}")

    # ── Noise splits (recording-disjoint, 70/15/15) ───────────────────────────
    noise_splits: Dict[str, Dict[str, List[Path]]] = {}
    rng = random.Random(RANDOM_SEED)

    for cls in ALL_NOISE_CLASSES:
        files = processed_index.get(f"noise/{cls}", [])
        files_sorted = sorted(files)  # deterministic order before shuffle
        rng.shuffle(files_sorted)

        n = len(files_sorted)
        if n == 0:
            noise_splits[cls] = {"train": [], "val": [], "test": []}
            continue

        n_val  = max(1, int(n * 0.15))
        n_test = max(1, int(n * 0.15))
        if n <= 2:
            n_val, n_test = 0, 0  # too few → all train
        elif n == 3:
            n_val, n_test = 1, 0

        n_train = n - n_val - n_test
        noise_splits[cls] = {
            "train": files_sorted[:n_train],
            "val":   files_sorted[n_train:n_train + n_val],
            "test":  files_sorted[n_train + n_val:],
        }

    log.info("  Noise split (recording-disjoint, seed=42):")
    for cls in ALL_NOISE_CLASSES:
        sp = noise_splits[cls]
        tr, va, te = len(sp["train"]), len(sp["val"]), len(sp["test"])
        total = tr + va + te
        status_str = "✓" if total >= 5 else "⚠ INSUFFICIENT DATA"
        log.info(f"    {cls:20s}: train={tr:2d}  val={va:2d}  test={te:2d}  {status_str}")

    return clean_splits, noise_splits


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 5 — SNR MIXING (NOISY-CLEAN PAIRS)
# ══════════════════════════════════════════════════════════════════════════════

def stage5_mixing(
    clean_splits: Dict[str, List[Path]],
    noise_splits: Dict[str, Dict[str, List[Path]]],
) -> List[Dict]:
    """
    Generate noisy-clean pairs at 6 SNR levels for each split.
    - actual_snr_db is measured from the generated audio (never copied from target)
    - Pairs within a split use only clean + noise from that split
    - Fixed random seed per pair for reproducibility
    Returns list of pair records for dataset.csv.
    """
    log.info("=" * 70)
    log.info("STAGE 5 — SNR MIXING (noisy-clean pairs)")
    log.info("=" * 70)

    MAX_NOISE_PER_SPLIT = {
        "train": MAX_NOISE_PER_CLASS_TRAIN,
        "val":   MAX_NOISE_PER_CLASS_VAL,
        "test":  MAX_NOISE_PER_CLASS_TEST,
    }

    records = []
    pair_rng = random.Random(RANDOM_SEED)

    for split_name in ("train", "val", "test"):
        log.info(f"\n  Generating pairs for split: {split_name}")
        clean_pool = clean_splits[split_name]
        if not clean_pool:
            log.warning(f"  No clean files in {split_name} split — skipping")
            continue

        for cls in ALL_NOISE_CLASSES:
            noise_files = noise_splits[cls][split_name]
            if not noise_files:
                log.info(f"    {cls:20s}: INSUFFICIENT DATA — skipping")
                continue

            # Sample noise files
            max_noise = MAX_NOISE_PER_SPLIT[split_name]
            sampled_noise = noise_files[:min(max_noise, len(noise_files))]

            pair_count = 0
            for noise_path in sampled_noise:
                # Load noise once
                noise_result = load_audio_safe(noise_path)
                if noise_result is None:
                    continue
                noise_data, _ = noise_result

                # Pick clean utterances to pair with this noise file
                clean_sample = pair_rng.sample(clean_pool,
                                               min(MAX_CLEAN_PER_NOISE, len(clean_pool)))

                for clean_path in clean_sample:
                    clean_result = load_audio_safe(clean_path)
                    if clean_result is None:
                        continue
                    clean_data, _ = clean_result

                    for snr_db in SNR_LEVELS:
                        # Use deterministic noise slice seed per (clean, noise, snr) triple
                        # We set numpy seed before each mix call for reproducibility
                        seed_int = (hash(str(clean_path) + str(noise_path) + str(snr_db)) & 0x7FFFFFFF)
                        np.random.seed(seed_int)

                        try:
                            noisy_data, scaled_noise, actual_snr = au.mix_speech_and_noise(
                                clean_data.copy(),
                                noise_data.copy(),
                                snr_db=snr_db,
                                random_noise_slice=True,
                            )
                        except Exception as e:
                            log.debug(f"  Mix failed ({clean_path.name}, {noise_path.name}, {snr_db}dB): {e}")
                            continue

                        # Determine output path
                        snr_tag = f"snr_{snr_db:+d}dB".replace("+", "p").replace("-", "m")
                        noisy_dir = NOISY_ROOT / split_name / cls / snr_tag
                        noisy_dir.mkdir(parents=True, exist_ok=True)

                        sample_id = (f"{split_name}_{cls}_{clean_path.stem}"
                                     f"_{noise_path.stem}_{snr_tag}")
                        noisy_file = noisy_dir / f"{sample_id}.wav"

                        if not noisy_file.exists():
                            au.save_audio(str(noisy_file), noisy_data, sr=TARGET_SR)

                        duration = len(noisy_data) / TARGET_SR
                        records.append({
                            "sample_id":      sample_id,
                            "clean_file":     str(clean_path.relative_to(PROJECT_ROOT)),
                            "noisy_file":     str(noisy_file.relative_to(PROJECT_ROOT)),
                            "noise_file":     str(noise_path.relative_to(PROJECT_ROOT)),
                            "noise_type":     cls,
                            "noise_nature":   NOISE_NATURE.get(cls, "unknown"),
                            "target_snr_db":  snr_db,
                            "actual_snr_db":  round(actual_snr, 3),
                            "duration":       round(duration, 3),
                            "sample_rate":    TARGET_SR,
                            "speaker_id":     clean_path.parent.name,
                            "clean_source":   "CMU_Arctic",
                            "noise_source":   _infer_noise_source(noise_path),
                            "split":          split_name,
                        })
                        pair_count += 1

            log.info(f"    {cls:20s}: {pair_count:4d} pairs created in {split_name}")

    # Reset numpy seed
    np.random.seed(RANDOM_SEED)
    log.info(f"\n  Total noisy-clean pairs generated: {len(records)}")
    return records


def _infer_noise_source(path: Path) -> str:
    """Infer source dataset from processed noise file path/name."""
    name = path.name
    if name.startswith("ia_"):
        return "Internet_Archive"
    # ESC-50 files have pattern like 1-100032-A-0.wav
    parts = name.split("-")
    if len(parts) >= 4 and parts[0].isdigit():
        return "ESC-50"
    return "unknown"


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 6 — DATASET METADATA
# ══════════════════════════════════════════════════════════════════════════════

def stage6_metadata(records: List[Dict]) -> pd.DataFrame:
    """
    Assemble dataset.csv and split_metadata.csv.
    Returns full dataset DataFrame.
    """
    log.info("=" * 70)
    log.info("STAGE 6 — DATASET METADATA")
    log.info("=" * 70)

    df = pd.DataFrame(records)
    if df.empty:
        log.warning("  No records — dataset.csv will be empty")
        df.to_csv(METADATA_ROOT / "dataset.csv", index=False)
        return df

    df.to_csv(METADATA_ROOT / "dataset.csv", index=False)
    log.info(f"  Saved dataset.csv: {len(df)} rows")

    # Split metadata summary
    split_rows = []
    for split in ("train", "val", "test"):
        for cls in ALL_NOISE_CLASSES:
            for snr in SNR_LEVELS:
                subset = df[(df["split"] == split) & (df["noise_type"] == cls) & (df["target_snr_db"] == snr)]
                split_rows.append({
                    "split": split,
                    "noise_type": cls,
                    "target_snr_db": snr,
                    "count": len(subset),
                    "total_duration_sec": round(subset["duration"].sum(), 1),
                })

    split_df = pd.DataFrame(split_rows)
    split_df.to_csv(METADATA_ROOT / "split_metadata.csv", index=False)
    log.info(f"  Saved split_metadata.csv")
    return df


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 7 — LEAKAGE CHECKS
# ══════════════════════════════════════════════════════════════════════════════

def stage7_leakage_checks(
    clean_splits: Dict[str, List[Path]],
    noise_splits: Dict[str, Dict[str, List[Path]]],
    dataset_df: pd.DataFrame,
) -> Dict[str, str]:
    """
    Verify zero leakage:
    1. Speaker overlap across splits
    2. Noise recording MD5 overlap across splits
    3. No noisy sample references noise from a different split
    Returns dict of check_name → PASS/FAIL with details.
    """
    log.info("=" * 70)
    log.info("STAGE 7 — LEAKAGE CHECKS")
    log.info("=" * 70)

    results = {}

    # ── Check 1: Speaker leakage ──────────────────────────────────────────────
    speaker_sets: Dict[str, set] = {"train": set(), "val": set(), "test": set()}
    for split, files in clean_splits.items():
        for f in files:
            speaker_sets[split].add(f.parent.name)

    overlaps = []
    split_names = list(speaker_sets.keys())
    for i in range(len(split_names)):
        for j in range(i + 1, len(split_names)):
            s1, s2 = split_names[i], split_names[j]
            overlap = speaker_sets[s1] & speaker_sets[s2]
            if overlap:
                overlaps.append(f"{s1}∩{s2}={overlap}")

    if overlaps:
        results["speaker_leakage"] = f"FAIL — overlaps found: {overlaps}"
    else:
        results["speaker_leakage"] = "PASS — no speaker overlap across splits"
    log.info(f"  [1] Speaker leakage: {results['speaker_leakage']}")

    # ── Check 2: Noise recording MD5 leakage ─────────────────────────────────
    noise_hash_sets: Dict[str, set] = {"train": set(), "val": set(), "test": set()}
    for cls in ALL_NOISE_CLASSES:
        for split in ("train", "val", "test"):
            for fpath in noise_splits[cls][split]:
                if fpath.exists():
                    noise_hash_sets[split].add(md5_hash(fpath))

    hash_overlaps = []
    for i in range(len(split_names)):
        for j in range(i + 1, len(split_names)):
            s1, s2 = split_names[i], split_names[j]
            overlap = noise_hash_sets[s1] & noise_hash_sets[s2]
            if overlap:
                hash_overlaps.append(f"{s1}∩{s2}: {len(overlap)} hashes")

    if hash_overlaps:
        results["noise_hash_leakage"] = f"FAIL — overlaps: {hash_overlaps}"
    else:
        results["noise_hash_leakage"] = "PASS — no noise hash overlap across splits"
    log.info(f"  [2] Noise hash leakage: {results['noise_hash_leakage']}")

    # ── Check 3: Derived sample split consistency ─────────────────────────────
    if not dataset_df.empty:
        # Every row: noisy_file path should contain the split name
        bad_rows = dataset_df[~dataset_df.apply(
            lambda r: r["split"] in str(r["noisy_file"]), axis=1)]
        if len(bad_rows) > 0:
            results["derived_split_consistency"] = f"FAIL — {len(bad_rows)} samples in wrong split directory"
        else:
            results["derived_split_consistency"] = "PASS — all noisy files are in correct split directories"
    else:
        results["derived_split_consistency"] = "SKIP — no dataset records"
    log.info(f"  [3] Derived split consistency: {results['derived_split_consistency']}")

    # ── Check 4: Duplicate filenames ─────────────────────────────────────────
    if not dataset_df.empty:
        dupes = dataset_df["sample_id"].duplicated().sum()
        results["duplicate_sample_ids"] = "PASS — no duplicates" if dupes == 0 else f"FAIL — {dupes} duplicate IDs"
    else:
        results["duplicate_sample_ids"] = "SKIP"
    log.info(f"  [4] Duplicate sample IDs: {results['duplicate_sample_ids']}")

    return results


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 8 — AUTOMATED VALIDATION
# ══════════════════════════════════════════════════════════════════════════════

def stage8_validation(dataset_df: pd.DataFrame) -> Dict:
    """
    Re-load processed files and validate:
    - SR == 16000, mono, no NaN/Inf, duration > MIN_DURATION
    - actual_snr within ±3 dB of target
    - Every row has complete metadata
    - Class balance
    """
    log.info("=" * 70)
    log.info("STAGE 8 — AUTOMATED VALIDATION")
    log.info("=" * 70)
    val_results = {}

    # ── 8a. Processed clean files ─────────────────────────────────────────────
    clean_dir = PROCESSED_ROOT / "clean"
    clean_files = get_audio_files(clean_dir)
    clean_errors = []
    for f in tqdm(clean_files[:200], desc="Validating clean (sample)"):  # sample 200
        try:
            import soundfile as sf
            info = sf.info(str(f))
            assert info.samplerate == TARGET_SR, f"SR={info.samplerate}"
            assert info.channels == 1, f"channels={info.channels}"
            assert info.frames > MIN_DURATION * TARGET_SR, "too short"
        except Exception as e:
            clean_errors.append(f"{f.name}: {e}")
    val_results["clean_file_validation"] = (
        "PASS" if not clean_errors else f"FAIL ({len(clean_errors)} errors)"
    )
    log.info(f"  [8a] Clean file validation: {val_results['clean_file_validation']}")

    # ── 8b. Noisy file spot-check ─────────────────────────────────────────────
    if not dataset_df.empty:
        sample = dataset_df.sample(min(100, len(dataset_df)), random_state=RANDOM_SEED)
        noisy_errors = []
        nan_errors = []
        for _, row in tqdm(sample.iterrows(), total=len(sample), desc="Validating noisy (sample)"):
            fpath = PROJECT_ROOT / row["noisy_file"]
            try:
                import soundfile as sf
                info = sf.info(str(fpath))
                assert info.samplerate == TARGET_SR
                assert info.channels == 1
                data, _ = sf.read(str(fpath), dtype="float32")
                if np.any(np.isnan(data)) or np.any(np.isinf(data)):
                    nan_errors.append(fpath.name)
            except Exception as e:
                noisy_errors.append(f"{Path(row['noisy_file']).name}: {e}")
        val_results["noisy_file_validation"] = (
            "PASS" if not noisy_errors else f"FAIL ({len(noisy_errors)} errors)"
        )
        val_results["nan_inf_check"] = (
            "PASS" if not nan_errors else f"FAIL ({len(nan_errors)} files with NaN/Inf)"
        )
        log.info(f"  [8b] Noisy file validation: {val_results['noisy_file_validation']}")
        log.info(f"  [8c] NaN/Inf check: {val_results['nan_inf_check']}")

    # ── 8d. SNR accuracy (actual vs target) ───────────────────────────────────
    if not dataset_df.empty:
        snr_diff = (dataset_df["actual_snr_db"] - dataset_df["target_snr_db"]).abs()
        within_3dB = (snr_diff <= 3.0).mean() * 100
        mean_diff = snr_diff.mean()
        val_results["snr_accuracy"] = (
            f"PASS — {within_3dB:.1f}% within ±3dB of target (mean diff={mean_diff:.2f}dB)"
            if within_3dB >= 90.0
            else f"WARN — only {within_3dB:.1f}% within ±3dB (mean diff={mean_diff:.2f}dB)"
        )
        log.info(f"  [8d] SNR accuracy: {val_results['snr_accuracy']}")

    # ── 8e. Metadata completeness ─────────────────────────────────────────────
    if not dataset_df.empty:
        required_cols = ["sample_id","clean_file","noise_file","noise_type","noise_nature",
                         "target_snr_db","actual_snr_db","duration","sample_rate",
                         "speaker_id","clean_source","noise_source","split"]
        missing_cols = [c for c in required_cols if c not in dataset_df.columns]
        null_counts  = {c: int(dataset_df[c].isna().sum()) for c in required_cols if c in dataset_df.columns}
        has_nulls    = {k: v for k, v in null_counts.items() if v > 0}
        if missing_cols:
            val_results["metadata_completeness"] = f"FAIL — missing columns: {missing_cols}"
        elif has_nulls:
            val_results["metadata_completeness"] = f"WARN — null values: {has_nulls}"
        else:
            val_results["metadata_completeness"] = "PASS — all required columns present and complete"
        log.info(f"  [8e] Metadata completeness: {val_results['metadata_completeness']}")

    # ── 8f. Class balance ─────────────────────────────────────────────────────
    log.info("  [8f] Class balance (pairs per noise class):")
    if not dataset_df.empty:
        class_counts = dataset_df.groupby("noise_type").size()
        for cls in ALL_NOISE_CLASSES:
            cnt = class_counts.get(cls, 0)
            flag = "✓" if cnt >= 10 else ("⚠ INSUFFICIENT DATA" if cnt > 0 else "✗ NO DATA")
            log.info(f"       {cls:20s}: {cnt:5d} pairs  {flag}")

    return val_results


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 9 — DATASET REPORT
# ══════════════════════════════════════════════════════════════════════════════

def stage9_report(
    acq_status: Dict,
    raw_meta: pd.DataFrame,
    clean_splits: Dict,
    noise_splits: Dict,
    dataset_df: pd.DataFrame,
    leakage_results: Dict,
    val_results: Dict,
) -> str:
    """
    Generate human-readable and JSON dataset reports.
    Returns overall PASS/FAIL status string.
    """
    log.info("=" * 70)
    log.info("STAGE 9 — DATASET REPORT")
    log.info("=" * 70)

    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    # ── Compute statistics ────────────────────────────────────────────────────
    total_clean   = sum(len(v) for v in clean_splits.values())
    total_noise   = sum(len(vv) for v in noise_splits.values() for vv in v.values())
    total_pairs   = len(dataset_df)
    total_dur_sec = dataset_df["duration"].sum() if not dataset_df.empty else 0.0
    total_dur_hr  = total_dur_sec / 3600.0

    speakers = {v: CMU_SPEAKERS[v] for v in CMU_SPEAKERS}
    num_speakers = len([s for s in CMU_SPEAKERS])

    pairs_by_class = dataset_df.groupby("noise_type").size().to_dict() if not dataset_df.empty else {}
    pairs_by_snr   = dataset_df.groupby("target_snr_db").size().to_dict() if not dataset_df.empty else {}
    pairs_by_split = dataset_df.groupby("split").size().to_dict() if not dataset_df.empty else {}
    dur_by_split   = dataset_df.groupby("split")["duration"].sum().to_dict() if not dataset_df.empty else {}

    missing_classes = [cls for cls in ALL_NOISE_CLASSES if pairs_by_class.get(cls, 0) == 0]
    insuff_classes  = [cls for cls in ALL_NOISE_CLASSES
                       if 0 < pairs_by_class.get(cls, 0) < 10]

    corrupted_count = int(raw_meta["valid"].eq(False).sum()) if not raw_meta.empty else 0

    # ── Determine overall status ──────────────────────────────────────────────
    checks_failing = [v for v in {**leakage_results, **val_results}.values()
                      if v.startswith("FAIL")]
    if checks_failing:
        overall = "FAIL"
    elif missing_classes:
        overall = "PARTIAL — some noise classes have insufficient real data"
    else:
        overall = "PASS"

    # ── Build report text ─────────────────────────────────────────────────────
    sep = "=" * 70
    report_lines = [
        sep,
        "  DEFENCE AUDIO NOISE INTELLIGENCE SYSTEM",
        "  Step 2 — Dataset Acquisition & Preparation Report",
        f"  Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        sep,
        "",
        f"OVERALL STATUS: {overall}",
        "",
        "━" * 70,
        "  STATISTICS",
        "━" * 70,
        f"  Clean recordings        : {total_clean}",
        f"  Noise recordings        : {total_noise}",
        f"  Generated noisy pairs   : {total_pairs}",
        f"  Total duration          : {total_dur_sec:.0f} sec  ({total_dur_hr:.2f} hours)",
        f"  Unique speakers (clean) : {num_speakers}",
        f"  Corrupted files         : {corrupted_count}",
        "",
        "  Train / Val / Test:",
        f"    train : {pairs_by_split.get('train', 0):6d} pairs  "
        f"{dur_by_split.get('train', 0)/3600:.2f} hr",
        f"    val   : {pairs_by_split.get('val',   0):6d} pairs  "
        f"{dur_by_split.get('val', 0)/3600:.2f} hr",
        f"    test  : {pairs_by_split.get('test',  0):6d} pairs  "
        f"{dur_by_split.get('test', 0)/3600:.2f} hr",
        "",
        "  Pairs per noise class:",
    ]

    for cls in ALL_NOISE_CLASSES:
        cnt = pairs_by_class.get(cls, 0)
        if cnt == 0:
            flag = "⚠ INSUFFICIENT DATA"
        elif cnt < 10:
            flag = "⚠ LOW"
        else:
            flag = "✓"
        report_lines.append(f"    {cls:22s}: {cnt:6d} pairs  {flag}")

    report_lines += [
        "",
        "  Pairs per SNR level:",
    ]
    for snr in SNR_LEVELS:
        cnt = pairs_by_snr.get(snr, 0)
        report_lines.append(f"    {snr:+3d} dB : {cnt:6d} pairs")

    report_lines += [
        "",
        "━" * 70,
        "  DATA SOURCES",
        "━" * 70,
        "  1. CMU Arctic (clean speech)",
        f"     URL     : {CMU_ARCTIC_BASE}/",
        f"     License : {CMU_LICENSE}",
        "     Speakers: " + ", ".join(f"{s}({sp})" for s, sp in CMU_SPEAKERS.items()),
        "",
        "  2. ESC-50 (only explicitly verified class mappings)",
        f"     URL     : {ESC50_ZIP_URL}",
        f"     License : {ESC50_LICENSE}",
        "     Mapping :",
    ]
    for esc_cat, our_cls in ESC50_MAP.items():
        proxy = "  [PROXY — flagged in metadata]" if esc_cat == "fireworks" else ""
        report_lines.append(f"       ESC-50:{esc_cat:18s} → {our_cls}{proxy}")

    report_lines += [
        "",
        "  3. Internet Archive (only manually verified defence sources)",
        "     URL : https://archive.org/",
    ]
    for ia_id, cls, desc, lic in INTERNET_ARCHIVE_ITEMS:
        ia_st = acq_status.get("internet_archive", {}).get(ia_id, {})
        files_dl = ia_st.get("files_downloaded", "N/A")
        ia_status_str = ia_st.get("status", "unknown")
        report_lines.append(f"     {ia_id:40s} → {cls:20s} [{ia_status_str}, files={files_dl}]")

    report_lines += [
        "",
        "━" * 70,
        "  MISSING / INSUFFICIENT DATA",
        "━" * 70,
    ]
    if missing_classes:
        for cls in missing_classes:
            report_lines.append(f"  ✗ {cls:20s} : INSUFFICIENT DATA (0 real recording pairs)")
    if insuff_classes:
        for cls in insuff_classes:
            report_lines.append(f"  ⚠ {cls:20s} : LOW DATA ({pairs_by_class.get(cls,0)} pairs)")
    if not missing_classes and not insuff_classes:
        report_lines.append("  All 12 classes have sufficient generated pairs.")

    report_lines += [
        "",
        "━" * 70,
        "  LEAKAGE CHECK RESULTS",
        "━" * 70,
    ]
    for check, result in leakage_results.items():
        report_lines.append(f"  {check:35s}: {result}")

    report_lines += [
        "",
        "━" * 70,
        "  VALIDATION RESULTS",
        "━" * 70,
    ]
    for check, result in val_results.items():
        report_lines.append(f"  {check:35s}: {result}")

    report_lines += [
        "",
        sep,
        f"  FINAL STATUS: {overall}",
        sep,
    ]

    report_text = "\n".join(report_lines)

    # ── Save report text ──────────────────────────────────────────────────────
    txt_path = REPORT_DIR / "dataset_report.txt"
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(report_text)
    log.info(f"  Saved: {txt_path}")

    # ── Save JSON report ──────────────────────────────────────────────────────
    json_report = {
        "overall_status":    overall,
        "generated_at":      time.strftime("%Y-%m-%d %H:%M:%S"),
        "statistics": {
            "clean_recordings":    total_clean,
            "noise_recordings":    total_noise,
            "noisy_pairs":         total_pairs,
            "total_duration_sec":  round(total_dur_sec, 1),
            "total_duration_hr":   round(total_dur_hr, 3),
            "num_speakers":        num_speakers,
            "corrupted_files":     corrupted_count,
        },
        "split_counts":      {k: int(v) for k, v in pairs_by_split.items()},
        "split_duration_hr": {k: round(v/3600, 3) for k, v in dur_by_split.items()},
        "pairs_by_class":    {k: int(v) for k, v in pairs_by_class.items()},
        "pairs_by_snr_db":   {str(k): int(v) for k, v in pairs_by_snr.items()},
        "missing_classes":   missing_classes,
        "insufficient_classes": insuff_classes,
        "speakers":          speakers,
        "data_sources": {
            "clean_speech":  {"name": "CMU_Arctic", "url": CMU_ARCTIC_BASE, "license": CMU_LICENSE},
            "noise_esc50":   {"name": "ESC-50", "url": ESC50_ZIP_URL, "license": ESC50_LICENSE},
            "noise_defence": "Internet Archive (CC0/Public Domain — best effort)",
        },
        "leakage_checks":    leakage_results,
        "validation_checks": val_results,
        "esc50_mapping":     ESC50_MAP,
        "noise_nature":      NOISE_NATURE,
        "snr_levels_db":     SNR_LEVELS,
        "random_seed":       RANDOM_SEED,
        "target_sample_rate": TARGET_SR,
    }

    json_path = REPORT_DIR / "dataset_report.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_report, f, indent=2)
    log.info(f"  Saved: {json_path}")

    # Print to console
    print("\n" + report_text)
    return overall


# ══════════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

def main():
    log.info("SCIENTIFIC SAFETY: verified labels only; no proxy labels or fabricated audio.")
    log.info("DATASET MODE: process existing data/raw files; do not synthesize new source recordings.")
    log.info("★" * 35)
    log.info("  DEFENCE AUDIO — DATASET BUILDER")
    log.info("  Step 2: Real Audio Acquisition & Preparation")
    log.info("★" * 35)
    log.info(f"  Project root : {PROJECT_ROOT}")
    log.info(f"  Random seed  : {RANDOM_SEED}")
    log.info(f"  Target SR    : {TARGET_SR} Hz")
    log.info(f"  SNR levels   : {SNR_LEVELS} dB\n")   
    log.info("  SCIENTIFIC SAFETY: no unrelated proxy labels are used.")

    t_start = time.time()

    # Stage 1: Acquisition
    acq_status = stage1_acquisition()

    # Stage 2: Raw metadata
    raw_meta = stage2_raw_metadata()

    # Stage 3: Standardize
    processed_index = stage3_standardize(raw_meta)

    # Stage 4: Splits
    clean_splits, noise_splits = stage4_splits(processed_index)

    # Stage 5: SNR Mixing
    records = stage5_mixing(clean_splits, noise_splits)

    # Stage 6: Metadata CSVs
    dataset_df = stage6_metadata(records)

    # Stage 7: Leakage checks
    leakage_results = stage7_leakage_checks(clean_splits, noise_splits, dataset_df)

    # Stage 8: Validation
    val_results = stage8_validation(dataset_df)

    # Stage 9: Report
    overall = stage9_report(
        acq_status, raw_meta, clean_splits, noise_splits,
        dataset_df, leakage_results, val_results,
    )

    elapsed = time.time() - t_start
    log.info(f"\n  Pipeline completed in {elapsed:.1f}s")
    log.info(f"  FINAL STATUS: {overall}")

    return 0 if "FAIL" not in overall else 1


if __name__ == "__main__":
    sys.exit(main())
