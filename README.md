# NIRVAN AI

### AI/ML-Based Adaptive Noise Cancellation for Defence Audio

**SIH26052 | Defence Audio Intelligence System**

NIRVAN AI is an AI/ML-based defence audio intelligence system designed to identify defence and environmental noise and enhance speech affected by challenging acoustic conditions.

The system combines a deep-learning noise classifier with a lightweight spectral speech-enhancement model and provides an interactive dashboard for audio processing, visualization, and analysis.

---

## 🚀 Key Features

- AI-based defence/environmental noise classification
- Neural speech enhancement using Lightweight Spectral U-Net
- Waveform comparison before and after enhancement
- Spectrogram visualization
- Top noise-class predictions with confidence scores
- SNR, SI-SNR and STOI evaluation
- Inference latency measurement
- Noisy vs enhanced audio playback
- FastAPI backend
- React + Vite frontend
- Real PyTorch model inference
- Backend-driven audio analysis

---

# 🧠 AI Models

NIRVAN AI uses two trained PyTorch models.

## 1. Noise Spectrogram Classifier

The classifier identifies the dominant noise/environmental class from the input audio.

### Architecture

```text
Input Audio
     ↓
STFT
     ↓
Log-Magnitude Spectrogram
     ↓
Convolutional Neural Network
     ↓
Adaptive Pooling
     ↓
Fully Connected Layers
     ↓
12-Class Noise Prediction
