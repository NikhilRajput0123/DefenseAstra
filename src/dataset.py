"""
PyTorch Dataset & DataLoader for SIH26052 Step 3.

Reads data/metadata/dataset.csv and serves:
    (noisy, clean, label, meta)

Design rules:
- Never leaks val/test into train.
- Audio is loaded on-demand.
- Invalid audio samples are skipped, never replaced with fake zero audio.
- Invalid samples are logged.
- Deterministic pad/crop to CLIP_SAMPLES.
- Labels are always valid class indices 0..NUM_CLASSES-1.
"""

import csv
import os
import sys
import traceback
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
import soundfile as sf
import torch
from torch.utils.data import DataLoader, Dataset

sys.path.insert(0, os.path.dirname(__file__))

from config import (
    BATCH_SIZE,
    CLASS_TO_IDX,
    CLIP_SAMPLES,
    DATASET_CSV,
    NUM_CLASSES,
    NUM_WORKERS,
    SAMPLE_RATE,
    SEED,
    SKIPPED_SAMPLES,
    set_seed,
)


def _load_wav(path: str, target_sr: int = SAMPLE_RATE) -> np.ndarray:
    """Load audio as float32 mono at target_sr."""
    data, sr = sf.read(path, dtype="float32")

    if data.ndim > 1:
        data = data.mean(axis=1)

    if data.size == 0:
        raise ValueError("Audio file is empty")

    if sr != target_sr:
        # Avoid torchaudio for normal 16 kHz files. If resampling is
        # required, use torchaudio only for that specific file.
        import torchaudio

        tensor = torch.from_numpy(data).unsqueeze(0)
        resampler = torchaudio.transforms.Resample(
            orig_freq=sr,
            new_freq=target_sr,
        )
        data = resampler(tensor).squeeze(0).numpy()

    data = np.asarray(data, dtype=np.float32)

    if data.size == 0:
        raise ValueError("Audio became empty after resampling")

    if not np.isfinite(data).all():
        raise ValueError("Audio contains NaN or Inf")

    return data


def _pad_or_crop(audio: np.ndarray, length: int) -> np.ndarray:
    """Deterministically crop or repeat-pad audio to exactly length samples."""
    if audio is None or len(audio) == 0:
        raise ValueError("Cannot pad/crop empty audio")

    n = len(audio)

    if n == length:
        return audio.astype(np.float32, copy=False)

    if n > length:
        return audio[:length].astype(np.float32, copy=False)

    reps = int(np.ceil(length / n))
    return np.tile(audio, reps)[:length].astype(np.float32, copy=False)


class SkipLogger:
    """Single-process logger for invalid/skipped samples."""

    def __init__(self, csv_path: str):
        self.csv_path = csv_path
        os.makedirs(os.path.dirname(os.path.abspath(csv_path)), exist_ok=True)
        self._rows: List[Dict] = []

    def log(self, sample_id: str, path: str, reason: str) -> None:
        row = {
            "sample_id": sample_id,
            "path": path,
            "reason": reason,
        }
        self._rows.append(row)
        print(
            f"  [SKIP] {sample_id} | "
            f"{os.path.basename(path)} | {reason}"
        )

    def save(self) -> None:
        with open(
            self.csv_path,
            "w",
            newline="",
            encoding="utf-8",
        ) as f:
            writer = csv.DictWriter(
                f,
                fieldnames=["sample_id", "path", "reason"],
            )
            writer.writeheader()
            writer.writerows(self._rows)

        print(
            f"  Skipped samples log saved -> "
            f"{self.csv_path} ({len(self._rows)} entries)"
        )

    @property
    def count(self) -> int:
        return len(self._rows)


_skip_logger: Optional[SkipLogger] = None


def get_skip_logger() -> SkipLogger:
    global _skip_logger

    if _skip_logger is None:
        _skip_logger = SkipLogger(SKIPPED_SAMPLES)

    return _skip_logger


def reset_skip_logger() -> None:
    global _skip_logger
    _skip_logger = SkipLogger(SKIPPED_SAMPLES)


class SIHAudioDataset(Dataset):
    """
    Dataset for SIH26052.

    Returns:
        noisy: Tensor [CLIP_SAMPLES]
        clean: Tensor [CLIP_SAMPLES]
        label: int in [0, NUM_CLASSES-1]
        meta: dict
    """

    def __init__(
        self,
        split: str,
        csv_path: str = DATASET_CSV,
        clip_samples: int = CLIP_SAMPLES,
        sample_rate: int = SAMPLE_RATE,
        load_clean: bool = True,
        project_root: Optional[str] = None,
    ):
        if split not in {"train", "val", "test"}:
            raise ValueError(f"Unknown split: {split}")

        self.split = split
        self.clip_samples = clip_samples
        self.sample_rate = sample_rate
        self.load_clean = load_clean

        # Always resolve paths relative to the project root.
        if project_root is None:
            project_root = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..")
            )

        self.project_root = os.path.abspath(project_root)

        if not os.path.isabs(csv_path):
            csv_path = os.path.join(self.project_root, csv_path)

        csv_path = os.path.abspath(csv_path)

        if not os.path.isfile(csv_path):
            raise FileNotFoundError(
                f"dataset.csv not found: {csv_path}"
            )

        df = pd.read_csv(csv_path)

        required = [
            "sample_id",
            "clean_file",
            "noisy_file",
            "noise_type",
            "target_snr_db",
            "split",
        ]

        missing = [c for c in required if c not in df.columns]
        if missing:
            raise ValueError(
                f"Missing required columns: {missing}"
            )

        self.df = (
            df[df["split"] == split]
            .reset_index(drop=True)
            .copy()
        )

        if self.df.empty:
            raise ValueError(
                f"No samples found for split='{split}'"
            )

        # Validate all class labels before training starts.
        invalid_classes = sorted(
            set(self.df["noise_type"].astype(str))
            - set(CLASS_TO_IDX.keys())
        )

        if invalid_classes:
            raise ValueError(
                f"Unknown noise classes in {split}: "
                f"{invalid_classes}"
            )

        self._skip_logger = get_skip_logger()
        self._invalid_indices = set()

        print(
            f"  Dataset [{split}]: "
            f"{len(self.df)} samples loaded from CSV."
        )

    def __len__(self) -> int:
        return len(self.df)

    def _resolve(self, rel_path: str) -> str:
        """Resolve a CSV path relative to project root."""
        p = str(rel_path).replace("\\", os.sep).replace("/", os.sep)

        if os.path.isabs(p):
            return os.path.abspath(p)

        return os.path.abspath(
            os.path.join(self.project_root, p)
        )

    def __getitem__(self, idx: int):
        row = self.df.iloc[idx]

        sample_id = str(row["sample_id"])
        noise_type = str(row["noise_type"])
        target_snr = float(row["target_snr_db"])

        label = CLASS_TO_IDX[noise_type]

        if not (0 <= label < NUM_CLASSES):
            raise ValueError(
                f"Invalid label {label} for class {noise_type}"
            )

        noisy_path = self._resolve(row["noisy_file"])
        clean_path = self._resolve(row["clean_file"])

        meta = {
            "sample_id": sample_id,
            "noise_type": noise_type,
            "target_snr_db": target_snr,
            "split": self.split,
            "noisy_path": noisy_path,
            "clean_path": clean_path,
        }

        # Load noisy audio. A failure means the complete sample is invalid.
        try:
            noisy_np = _load_wav(
                noisy_path,
                self.sample_rate,
            )
            noisy_np = _pad_or_crop(
                noisy_np,
                self.clip_samples,
            )
        except Exception as exc:
            self._invalid_indices.add(idx)
            self._skip_logger.log(
                sample_id,
                noisy_path,
                f"noisy audio load failed: {exc}",
            )
            return None

        # Load clean audio only when requested.
        if self.load_clean:
            try:
                clean_np = _load_wav(
                    clean_path,
                    self.sample_rate,
                )
                clean_np = _pad_or_crop(
                    clean_np,
                    self.clip_samples,
                )
            except Exception as exc:
                self._invalid_indices.add(idx)
                self._skip_logger.log(
                    sample_id,
                    clean_path,
                    f"clean audio load failed: {exc}",
                )
                return None
        else:
            # Classifier does not need the clean target.
            clean_np = np.zeros(
                self.clip_samples,
                dtype=np.float32,
            )

        noisy_t = torch.from_numpy(noisy_np)
        clean_t = torch.from_numpy(clean_np)

        return noisy_t, clean_t, label, meta


def collate_fn(batch):
    """
    Collate valid samples and discard None entries.

    If every sample in a batch is invalid, return None.
    """
    valid_batch = [item for item in batch if item is not None]

    if not valid_batch:
        return None

    noisy_list, clean_list, labels, metas = zip(*valid_batch)

    noisy_batch = torch.stack(
        noisy_list,
        dim=0,
    )

    clean_batch = torch.stack(
        clean_list,
        dim=0,
    )

    labels_t = torch.tensor(
        labels,
        dtype=torch.long,
    )

    if not torch.all(
        (labels_t >= 0) & (labels_t < NUM_CLASSES)
    ):
        raise ValueError(
            f"Invalid labels reached collate_fn: "
            f"{labels_t.tolist()}"
        )

    return (
        noisy_batch,
        clean_batch,
        labels_t,
        list(metas),
    )


def make_dataloader(
    split: str,
    batch_size: int = BATCH_SIZE,
    shuffle: Optional[bool] = None,
    load_clean: bool = True,
    num_workers: int = NUM_WORKERS,
    project_root: Optional[str] = None,
) -> DataLoader:
    """Build a DataLoader for train, val, or test."""
    if shuffle is None:
        shuffle = split == "train"

    dataset = SIHAudioDataset(
        split=split,
        load_clean=load_clean,
        project_root=project_root,
    )

    return DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=shuffle,
        num_workers=num_workers,
        collate_fn=collate_fn,
        pin_memory=False,
        drop_last=False,
    )


def run_smoke_test(
    project_root: Optional[str] = None,
) -> bool:
    """Load one batch from every split and verify integrity."""
    set_seed(SEED)

    print("\n" + "=" * 60)
    print("  DataLoader Smoke Test")
    print("=" * 60)

    if project_root is None:
        project_root = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..")
        )

    all_ok = True

    for split in ["train", "val", "test"]:
        print(f"\n  [{split.upper()}]")

        try:
            loader = make_dataloader(
                split=split,
                batch_size=4,
                load_clean=True,
                project_root=project_root,
            )

            batch = next(iter(loader))

            if batch is None:
                raise RuntimeError(
                    f"First {split} batch contained no valid samples"
                )

            noisy, clean, labels, metas = batch

            print(f"    noisy shape : {tuple(noisy.shape)}")
            print(f"    clean shape : {tuple(clean.shape)}")
            print(f"    labels      : {labels.tolist()}")
            print(
                "    noise_types : "
                f"{[m['noise_type'] for m in metas]}"
            )
            print(
                "    snr_db      : "
                f"{[m['target_snr_db'] for m in metas]}"
            )
            print(
                "    sample_ids  : "
                f"{[m['sample_id'] for m in metas]}"
            )

            B = noisy.shape[0]

            assert noisy.shape == (
                B,
                CLIP_SAMPLES,
            )
            assert clean.shape == (
                B,
                CLIP_SAMPLES,
            )
            assert labels.shape == (B,)

            assert noisy.dtype == torch.float32
            assert clean.dtype == torch.float32
            assert labels.dtype == torch.long

            assert torch.isfinite(noisy).all()
            assert torch.isfinite(clean).all()

            assert torch.all(
                (labels >= 0) & (labels < NUM_CLASSES)
            )

            print("    [OK] Shape/dtype/value checks passed.")

        except Exception as exc:
            print(f"    [FAIL] {exc}")
            traceback.print_exc()
            all_ok = False

    print("\n  [LEAKAGE CHECK]")

    try:
        csv_path = DATASET_CSV

        if not os.path.isabs(csv_path):
            csv_path = os.path.join(
                project_root,
                csv_path,
            )

        df = pd.read_csv(csv_path)

        train_ids = set(
            df[df["split"] == "train"]["sample_id"]
        )
        val_ids = set(
            df[df["split"] == "val"]["sample_id"]
        )
        test_ids = set(
            df[df["split"] == "test"]["sample_id"]
        )

        tv = train_ids & val_ids
        tt = train_ids & test_ids
        vt = val_ids & test_ids

        if tv or tt or vt:
            print(
                "    [FAIL] Sample-ID leakage: "
                f"train&val={len(tv)}, "
                f"train&test={len(tt)}, "
                f"val&test={len(vt)}"
            )
            all_ok = False
        else:
            print("    [OK] No sample-ID overlap.")
            print(
                f"      train={len(train_ids)}, "
                f"val={len(val_ids)}, "
                f"test={len(test_ids)}"
            )

    except Exception as exc:
        print(f"    [FAIL] Leakage check failed: {exc}")
        all_ok = False

    print("\n" + "=" * 60)
    print(
        f"  Smoke test {'PASSED' if all_ok else 'FAILED'}"
    )
    print("=" * 60)

    return all_ok


if __name__ == "__main__":
    root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..")
    )

    ok = run_smoke_test(project_root=root)
    sys.exit(0 if ok else 1)
