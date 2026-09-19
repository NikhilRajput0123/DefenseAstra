from pathlib import Path
import csv
import shutil
import soundfile as sf

# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = Path(r"C:\SIH26052")

MAD_ROOT = Path(
    r"C:\Users\Nikhil\Downloads\archive (7)\MAD_dataset"
)

TRAINING_CSV = MAD_ROOT / "training.csv"

OUTPUT_DIR = PROJECT_ROOT / "data" / "raw" / "artillery"
METADATA_DIR = PROJECT_ROOT / "data" / "metadata"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
METADATA_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_CSV = METADATA_DIR / "mad_artillery.csv"


# ============================================================
# ARTILLERY GROUPS
# ============================================================

ARTILLERY_GROUPS = {
    "026",
    "027",
    "030",
    "031",
    "033",
    "035",
    "040",
    "041",
    "045",
    "058",
    "060",
    "061",
    "065",
    "139",
    "183",
    "246",
    "249",
    "284",
    "286",
    "290",
    "333",
    "340",
    "430",
    "435",
    "449",
    "452",
    "465",
}


# ============================================================
# VALIDATION
# ============================================================

if not TRAINING_CSV.exists():
    raise FileNotFoundError(
        f"MAD training.csv not found:\n{TRAINING_CSV}"
    )

print("=" * 70)
print("MAD ARTILLERY INTEGRATION")
print("=" * 70)

print(f"\nMAD dataset       : {MAD_ROOT}")
print(f"Training CSV      : {TRAINING_CSV}")
print(f"Selected groups   : {len(ARTILLERY_GROUPS)}")
print(f"Output directory  : {OUTPUT_DIR}")


# ============================================================
# HELPER
# ============================================================

def extract_group(path_string: str) -> str:
    """
    Example:
    training/026/0.wav -> 026
    """
    parts = Path(path_string).parts

    try:
        training_index = parts.index("training")
        return parts[training_index + 1]
    except (ValueError, IndexError):
        return ""


# ============================================================
# PROCESS
# ============================================================

metadata_rows = []

selected_clips = 0
copied = 0
failed = 0

sample_rates = {}
channels = {}

with open(TRAINING_CSV, "r", encoding="utf-8-sig", newline="") as f:

    reader = csv.DictReader(f)

    for row in reader:

        relative_path = row["path"]
        group = extract_group(relative_path)

        if group not in ARTILLERY_GROUPS:
            continue

        selected_clips += 1

        source_file = MAD_ROOT / relative_path

        if not source_file.exists():
            print(f"[WARNING] Missing: {source_file}")
            failed += 1
            continue

        output_name = (
            f"mad_{group}_{Path(relative_path).name}"
        )

        destination_file = OUTPUT_DIR / output_name

        try:

            # ------------------------------------------------
            # Audio inspection
            # ------------------------------------------------

            info = sf.info(source_file)

            sample_rates[info.samplerate] = (
                sample_rates.get(info.samplerate, 0) + 1
            )

            channels[info.channels] = (
                channels.get(info.channels, 0) + 1
            )

            # ------------------------------------------------
            # Copy original WAV
            # ------------------------------------------------

            shutil.copy2(
                source_file,
                destination_file
            )

            copied += 1

            # ------------------------------------------------
            # Metadata
            # ------------------------------------------------

            metadata_rows.append(
                {
                    "source": "MAD",
                    "source_split": "training",
                    "source_group": group,
                    "source_path": relative_path,
                    "output_path": str(
                        destination_file.relative_to(PROJECT_ROOT)
                    ),
                    "target_class": "artillery",
                    "mad_label": row["label"],
                    "youtube_title": row["youtube title"],
                    "youtube_url": row["youtube url"],
                    "sample_rate": info.samplerate,
                    "channels": info.channels,
                    "duration_sec": info.duration,
                }
            )

        except Exception as e:

            print(
                f"[ERROR] {source_file.name}: {e}"
            )

            failed += 1


# ============================================================
# SAVE METADATA
# ============================================================

fieldnames = [
    "source",
    "source_split",
    "source_group",
    "source_path",
    "output_path",
    "target_class",
    "mad_label",
    "youtube_title",
    "youtube_url",
    "sample_rate",
    "channels",
    "duration_sec",
]

with open(
    OUTPUT_CSV,
    "w",
    encoding="utf-8",
    newline=""
) as f:

    writer = csv.DictWriter(
        f,
        fieldnames=fieldnames
    )

    writer.writeheader()
    writer.writerows(metadata_rows)


# ============================================================
# REPORT
# ============================================================

print("\n" + "=" * 70)
print("INTEGRATION COMPLETE")
print("=" * 70)

print(f"\nSelected source groups : {len(ARTILLERY_GROUPS)}")
print(f"Selected audio clips   : {selected_clips}")
print(f"Copied successfully    : {copied}")
print(f"Failed                 : {failed}")

print("\nSample-rate distribution:")
for sr, count in sorted(sample_rates.items()):
    print(f"  {sr} Hz -> {count}")

print("\nChannel distribution:")
for ch, count in sorted(channels.items()):
    print(f"  {ch} channel(s) -> {count}")

print(f"\nMetadata saved:")
print(f"  {OUTPUT_CSV}")

print("\nTarget class:")
print("  artillery")

print("\nIMPORTANT:")
print("  MAD source files were NOT modified.")
print("  Original MAD labels were preserved as metadata.")
print("  Artillery mapping is based on source recording/group context.")
print("  Mortar-only groups were intentionally excluded.")

print("\n" + "=" * 70)