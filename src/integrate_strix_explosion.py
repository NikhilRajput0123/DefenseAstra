from pathlib import Path
import shutil
import csv
import soundfile as sf


# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = Path(r"C:\SIH26052")

SOURCE_DIR = (
    PROJECT_ROOT
    / "data"
    / "strix_explosion"
    / "train"
    / "explosion"
)

OUTPUT_DIR = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "explosion"
)

METADATA_DIR = (
    PROJECT_ROOT
    / "data"
    / "metadata"
)

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
METADATA_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_CSV = METADATA_DIR / "strix_explosion.csv"


# ============================================================
# VALIDATION
# ============================================================

if not SOURCE_DIR.exists():
    raise FileNotFoundError(
        f"Explosion source directory not found:\n{SOURCE_DIR}"
    )


# ============================================================
# START
# ============================================================

print("=" * 70)
print("STRIX EXPLOSION INTEGRATION")
print("=" * 70)

print(f"\nSource directory : {SOURCE_DIR}")
print(f"Output directory : {OUTPUT_DIR}")


# ============================================================
# FIND WAV FILES
# ============================================================

audio_files = sorted(
    SOURCE_DIR.glob("*.wav")
)

print(f"\nExplosion WAV files found : {len(audio_files)}")


# ============================================================
# COPY + METADATA
# ============================================================

metadata_rows = []

copied = 0
failed = 0

sample_rates = {}
channels = {}


for index, source_file in enumerate(audio_files, start=1):

    try:

        # ----------------------------------------------------
        # Read audio information
        # ----------------------------------------------------

        info = sf.info(source_file)

        sample_rates[info.samplerate] = (
            sample_rates.get(info.samplerate, 0) + 1
        )

        channels[info.channels] = (
            channels.get(info.channels, 0) + 1
        )

        # ----------------------------------------------------
        # Create unique filename
        # ----------------------------------------------------

        output_name = (
            f"strix_explosion_{index:05d}.wav"
        )

        destination = OUTPUT_DIR / output_name

        # ----------------------------------------------------
        # Copy
        # ----------------------------------------------------

        shutil.copy2(
            source_file,
            destination
        )

        copied += 1

        # ----------------------------------------------------
        # Metadata
        # ----------------------------------------------------

        metadata_rows.append(
            {
                "source": "STRIX",
                "source_split": "train",
                "source_file": source_file.name,
                "output_path": str(
                    destination.relative_to(PROJECT_ROOT)
                ),
                "target_class": "explosion",
                "sample_rate": info.samplerate,
                "channels": info.channels,
                "duration_sec": info.duration,
            }
        )

    except Exception as e:

        failed += 1

        print(
            f"[ERROR] {source_file.name}: {e}"
        )


# ============================================================
# SAVE METADATA
# ============================================================

fieldnames = [
    "source",
    "source_split",
    "source_file",
    "output_path",
    "target_class",
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
# FINAL REPORT
# ============================================================

print("\n" + "=" * 70)
print("INTEGRATION COMPLETE")
print("=" * 70)

print(f"\nSource files found    : {len(audio_files)}")
print(f"Copied successfully   : {copied}")
print(f"Failed                : {failed}")

print("\nSample-rate distribution:")

for sr, count in sorted(sample_rates.items()):
    print(f"  {sr} Hz -> {count}")

print("\nChannel distribution:")

for ch, count in sorted(channels.items()):
    print(f"  {ch} channel(s) -> {count}")

print("\nTarget class:")
print("  explosion")

print("\nMetadata saved:")
print(f"  {OUTPUT_CSV}")

print("\nOriginal STRIX files were NOT modified.")

print("\n" + "=" * 70)