import torch
from torch.utils.data import Dataset
import pandas as pd
import wave
import numpy as np

def load_wav_builtin(path):
    with wave.open(path, 'rb') as wf:
        sr = wf.getframerate()
        n_frames = wf.getnframes()
        n_channels = wf.getnchannels()
        frames = wf.readframes(n_frames)
        data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        if n_channels > 1:
            data = data.reshape(-1, n_channels).mean(axis=1)
        tensor_wav = torch.tensor(data).unsqueeze(0) # Shape:
        return tensor_wav, sr

class DefenseAstraDataset(Dataset):
    def __init__(self, csv_file, transform=None):
        self.data = pd.read_csv(csv_file)
        self.transform = transform

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        row = self.data.iloc[idx]
        noisy_path = row['noisy_path']
        clean_path = row['clean_path']
        label = int(row['label'])

        noisy_wav, sr = load_wav_builtin(noisy_path)
        clean_wav, _ = load_wav_builtin(clean_path)

        sample = {
            'noisy': noisy_wav,
            'clean': clean_wav,
            'label': torch.tensor(label, dtype=torch.long),
            'sr': sr
        }

        if self.transform:
            sample = self.transform(sample)

        return sample
