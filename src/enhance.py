import os
import argparse
import torch
import wave
import numpy as np
from models.classifier import NoiseClassifier
from models.unet import SpectralUNet
from train import get_stft_features

def load_wav_builtin(path):
    with wave.open(path, 'rb') as wf:
        sr = wf.getframerate()
        n_frames = wf.getnframes()
        n_channels = wf.getnchannels()
        frames = wf.readframes(n_frames)
        data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        if n_channels > 1:
            data = data.reshape(-1, n_channels).mean(axis=1)
        return torch.tensor(data).unsqueeze(0), sr

def save_wav_builtin(path, wav_tensor, sr=16000):
    data = wav_tensor.squeeze().detach().numpy()
    data_int16 = (data * 32767).clip(-32768, 32767).astype('int16')
    with wave.open(path, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(data_int16.tobytes())

def enhance_audio(input_wav, output_wav='outputs/enhanced.wav'):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    os.makedirs('outputs', exist_ok=True)
    
    wav, sr = load_wav_builtin(input_wav)
    wav_dev = wav.to(device)
    
    clf = NoiseClassifier(num_classes=12).to(device)
    unet = SpectralUNet().to(device)
    
    if os.path.exists('checkpoints/best_classifier.pt'):
        clf.load_state_dict(torch.load('checkpoints/best_classifier.pt', map_location=device))
    if os.path.exists('checkpoints/best_unet.pt'):
        unet.load_state_dict(torch.load('checkpoints/best_unet.pt', map_location=device))
        
    clf.eval()
    unet.eval()
    
    with torch.no_grad():
        feats = get_stft_features(wav_dev)
        logits = clf(feats)
        pred_class = torch.argmax(logits, dim=1).item()
        
        w_sq = wav_dev.squeeze(1) if wav_dev.dim() == 3 else wav_dev
        window = torch.hann_window(512, device=device)
        spec = torch.stft(w_sq, n_fft=512, hop_length=160, window=window, return_complex=True)
        mag = torch.abs(spec).unsqueeze(1)
        phase = torch.angle(spec)
        
        pred_mask = unet(mag)
        enhanced_mag = mag * pred_mask
        
        enhanced_complex = enhanced_mag.squeeze(1) * torch.exp(1j * phase)
        inv_wav = torch.istft(enhanced_complex, n_fft=512, hop_length=160, window=window, length=w_sq.size(-1))
        
    save_wav_builtin(output_wav, inv_wav.cpu().unsqueeze(0), sr)
    print(f"✅ Predicted Class ID: {pred_class} | Enhanced audio saved to {output_wav}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=str, required=True, help='Path to noisy wav')
    parser.add_argument('--output', type=str, default='outputs/enhanced.wav')
    args = parser.parse_args()
    enhance_audio(args.input, args.output)
