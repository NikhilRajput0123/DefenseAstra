import soundfile as sf
import torch
import matplotlib.pyplot as plt
clean_audio, clean_sr = sf.read("data/clean/speech.wav")
noisy_audio, noisy_sr = sf.read("outputs/noisy.wav")


clean_audio = torch.tensor(clean_audio, dtype=torch.float32)
noisy_audio = torch.tensor(noisy_audio, dtype=torch.float32)

print("Clean Audio Shape:", clean_audio.shape)
print("Noisy Audio Shape:", noisy_audio.shape)
print("Sample Rate:", clean_sr)


n_fft = 1024
hop_length = 256

window = torch.hann_window(n_fft)

clean_stft = torch.stft(
    clean_audio,
    n_fft=n_fft,
    hop_length=hop_length,
    window=window,
    return_complex=True
)

noisy_stft = torch.stft(
    noisy_audio,
    n_fft=n_fft,
    hop_length=hop_length,
    window=window,
    return_complex=True
)


print("Clean STFT Shape:", clean_stft.shape)
print("Noisy STFT Shape:", noisy_stft.shape)
clean_magnitude = clean_stft.abs()
noisy_magnitude = noisy_stft.abs()
clean_db = 20 * torch.log10(clean_magnitude + 1e-6)
noisy_db = 20 * torch.log10(noisy_magnitude + 1e-6)


plt.figure(figsize=(12, 5))

plt.imshow(
    clean_db.numpy(),
    origin="lower",
    aspect="auto",
    cmap="magma"
)

plt.colorbar(label="Magnitude (dB)")
plt.title("Clean Speech Spectrogram")
plt.xlabel("Time Frame")
plt.ylabel("Frequency Bin")

plt.tight_layout()
plt.savefig("outputs/clean_spectrogram.png")

print("Clean spectrogram saved!")

plt.figure(figsize=(12, 5))

plt.imshow(
    noisy_db.numpy(),
    origin="lower",
    aspect="auto",
    cmap="magma"
)

plt.colorbar(label="Magnitude (dB)")
plt.title("Noisy Speech Spectrogram")
plt.xlabel("Time Frame")
plt.ylabel("Frequency Bin")

plt.tight_layout()
plt.savefig("outputs/noisy_spectrogram.png")

print("Noisy spectrogram saved!")

plt.show()

print("STFT pipeline completed successfully!")