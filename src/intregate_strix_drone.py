import os
import csv
import shutil
import soundfile as sf

SOURCE_DIR = r"C:\SIH26052\data\strix_drone\train\drone"
TARGET_DIR = r"C:\SIH26052\data\raw\drone"
METADATA_DIR = r"C:\SIH26052\data\metadata"

METADATA_FILE = os.path.join(
    METADATA_DIR,
    "strix_drone.csv"
)

os.makedirs(TARGET_DIR, exist_ok=True)
os.makedirs(METADATA_DIR, exist_ok=True)

print("=" * 70)
print("STRIX DRONE INTEGRATION")
print("=" * 70)

files = sorted(
    f for f in os.listdir(SOURCE_DIR)
    if f.lower().endswith(".wav")
)

print(f"Source drone files : {len(files)}")

rows = []
copied = 0
failed = 0

for i, filename in enumerate(files, start=1):

    source_path = os.path.join(SOURCE_DIR, filename)

    new_filename = f"strix_drone_{i:05d}.wav"
    target_path = os.path.join(TARGET_DIR, new_filename)

    try:
        audio, sr = sf.read(source_path, dtype="float32")

        channels = 1 if audio.ndim == 1 else audio.shape[1]
        duration = len(audio) / sr

        shutil.copy2(source_path, target_path)

        rows.append({
            "filename": new_filename,
            "source": "STRIX",
            "source_dataset": "Tairooonz/dataset_strix",
            "label": "drone",
            "sample_rate": sr,
            "channels": channels,
            "duration_sec": round(duration, 4),
            "original_filename": filename
        })

        copied += 1

    except Exception as e:
        failed += 1
        print(f"[FAILED] {filename}: {e}")

with open(
    METADATA_FILE,
    "w",
    newline="",
    encoding="utf-8"
) as f:

    writer = csv.DictWriter(
        f,
        fieldnames=rows[0].keys()
    )

    writer.writeheader()
    writer.writerows(rows)

print()
print("=" * 70)
print("INTEGRATION COMPLETE")
print("=" * 70)

print(f"Source files       : {len(files)}")
print(f"Copied successfully: {copied}")
print(f"Failed             : {failed}")
print(f"Metadata            : {METADATA_FILE}")

print()
print("Verification:")

target_files = [
    f for f in os.listdir(TARGET_DIR)
    if f.lower().endswith(".wav")
]

print(f"Drone WAVs in raw : {len(target_files)}")

if target_files:
    sample = os.path.join(TARGET_DIR, target_files[0])
    audio, sr = sf.read(sample, dtype="float32")

    channels = 1 if audio.ndim == 1 else audio.shape[1]

    print(f"Sample rate       : {sr} Hz")
    print(f"Channels          : {channels}")
    print(f"Duration          : {len(audio) / sr:.2f} sec")