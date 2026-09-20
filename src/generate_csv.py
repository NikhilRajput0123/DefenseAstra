import os, glob, pandas as pd, torch, wave

def save_wav_builtin(path, wav_tensor, sr=16000):
    data = wav_tensor.squeeze().detach().numpy()
    data_int16 = (data * 32767).clip(-32768, 32767).astype('int16')
    with wave.open(path, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(data_int16.tobytes())

def setup_data():
    wavs = glob.glob("**/*.wav", recursive=True)
    wavs = [w for w in wavs if not any(x in w for x in ['venv', '.git', 'checkpoints'])]
    
    data = []
    if wavs:
        for f in wavs:
            clean_f = f.replace("noisy", "clean") if "noisy" in f else f
            label = abs(hash(os.path.basename(f))) % 12
            data.append({'noisy_path': f, 'clean_path': clean_f if os.path.exists(clean_f) else f, 'label': label})
    else:
        print("⚠️ No .wav files found in workspace. Creating synthetic dummy manifest & wavs...")
        os.makedirs("data/dummy", exist_ok=True)
        dummy_wav = "data/dummy/sample.wav"
        if not os.path.exists(dummy_wav):
            sr = 16000
            wav = torch.randn(1, sr)
            save_wav_builtin(dummy_wav, wav, sr)
        for i in range(100):
            data.append({'noisy_path': dummy_wav, 'clean_path': dummy_wav, 'label': i % 12})

    df = pd.DataFrame(data)
    shuffled = df.sample(frac=1.0, random_state=42).reset_index(drop=True)
    split_idx = int(0.8 * len(shuffled)) if len(shuffled) > 10 else max(1, len(shuffled)-2)
    shuffled.iloc[:split_idx].to_csv("train_metadata.csv", index=False)
    shuffled.iloc[split_idx:].to_csv("val_metadata.csv", index=False)
    print(f"✅ Manifest ready: train_metadata.csv ({split_idx} rows), val_metadata.csv ({len(shuffled)-split_idx} rows)")

if __name__ == '__main__':
    setup_data()
