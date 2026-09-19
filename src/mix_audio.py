import soundfile as sf 
import numpy as np
speech,sr_speech=sf.read("data/clean/speech.wav")
noise,sr_noise=sf.read("data/noise/noise.wav")
print("Speech:",speech.shape)
print("Noise:",noise.shape)
print("Speech Sample Rate:",sr_speech)
print("Noise Sample Rate:",sr_noise)
if sr_speech!=sr_noise:
    raise ValueError("Sample rates are different ")
length=min(len(speech),len(noise))
speech=speech[:length]
noise=noise[:length]
noisy=speech+0.3*noise
noisy=np.clip(noisy,-1.0,1.0)
sf.write("outputs/noisy.wav",noisy,sr_speech)
print("Noisy audio saved Successfully ")