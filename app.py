from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
import torch
import os
import shutil
import wave
import numpy as np

from src.models.classifier import NoiseClassifier
from src.models.unet import SpectralUNet
from src.train import get_stft_features

app = FastAPI(title='DefenseAstra API', description='AI Acoustic Intelligence & Enhancement Backend')

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
UPLOAD_DIR = 'temp_uploads'
OUTPUT_DIR = 'outputs'
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

clf = NoiseClassifier(num_classes=12).to(device)
unet = SpectralUNet().to(device)

if os.path.exists('checkpoints/best_classifier.pt'):
    clf.load_state_dict(torch.load('checkpoints/best_classifier.pt', map_location=device))
if os.path.exists('checkpoints/best_unet.pt'):
    unet.load_state_dict(torch.load('checkpoints/best_unet.pt', map_location=device))
    
clf.eval()
unet.eval()

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

@app.get('/')
def health_check():
    return {'status': 'online', 'device': str(device)}

@app.post('/classify')
async def classify_audio(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, 'wb') as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        wav, sr = load_wav_builtin(file_path)
        wav_dev = wav.to(device)
        with torch.no_grad():
            feats = get_stft_features(wav_dev)
            logits = clf(feats)
            pred_class = torch.argmax(logits, dim=1).item()
            confidences = torch.softmax(logits, dim=1)[0].tolist()
        return {'predicted_class_id': pred_class, 'class_probabilities': confidences}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.post('/enhance')
async def enhance_audio_endpoint(file: UploadFile = File(...)):
    in_path = os.path.join(UPLOAD_DIR, file.filename)
    out_filename = f'enhanced_{file.filename}'
    out_path = os.path.join(OUTPUT_DIR, out_filename)
    
    with open(in_path, 'wb') as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        wav, sr = load_wav_builtin(in_path)
        wav_dev = wav.to(device)
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
            
        save_wav_builtin(out_path, inv_wav.cpu().unsqueeze(0), sr)
        return FileResponse(out_path, media_type='audio/wav', filename=out_filename, headers={'X-Predicted-Class': str(pred_class)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(in_path):
            os.remove(in_path)
