import soundfile as sf
import torch
import matplotlib.pyplot as plt

audio, sample_rate = sf.read("data/clean/speech.wav")
audio = torch.tensor(audio, dtype=torch.float32)

print("Audio Shape:", audio.shape)
print("Sample Rate:", sample_rate)

plt.figure(figsize=(12, 4))
plt.plot(audio.numpy())
plt.title("Speech Waveform")
plt.xlabel("Sample")
plt.ylabel("Amplitude")
plt.tight_layout()

plt.savefig("outputs/waveform.png")
print("Waveform saved to outputs/waveform.png")

plt.show()