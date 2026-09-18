
import os
import glob
import soundfile as sf

SRC = r"C:\SIH26052\temp_helicopter"
OUT = r"C:\SIH26052\temp_helicopter_clips"

os.makedirs(OUT, exist_ok=True)

files = sorted(glob.glob(os.path.join(SRC, "HELICOPTER_*.wav")))

print(f"Processing {len(files)} files...")

total = 0

for file_path in files:
    name = os.path.splitext(os.path.basename(file_path))[0]

    data, samplerate = sf.read(file_path)

    if data.ndim != 2 or data.shape[1] != 2:
        print(f"SKIP: {name} - unexpected shape {data.shape}")
        continue

    segment_samples = int(samplerate * 5)

    segments = {
        "L1": data[:segment_samples, 0],
        "L2": data[segment_samples:2 * segment_samples, 0],
        "R1": data[:segment_samples, 1],
        "R2": data[segment_samples:2 * segment_samples, 1],
    }

    for suffix, audio in segments.items():
        output_path = os.path.join(OUT, f"{name}_{suffix}.wav")
        sf.write(output_path, audio, samplerate)
        total += 1

print(f"Done. Created {total} clips.")
