import soundfile as sf
import matplotlib.pyplot as plt
audio,sample_rate=sf.read("outputs/noisy.wav")
print("Audio Shape:",audio.shape)
print("Sample Rate:",sample_rate)
plt.figure(figsize=(12,4))
plt.plot(audio)
plt.title("Noisy Speech Waveform")
plt.xlabel("Sample")
plt.ylabel("Amplitude")
plt.tight_layout()
plt.savefig("outputs/noisy_waveform.png")
plt.show()