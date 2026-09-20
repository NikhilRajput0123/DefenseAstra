# 🛡️ DefenseAstra — AI Noise Intelligence & Suppression System
AI-driven military/defence acoustic intelligence and real-time spectral noise suppression pipeline.

## 📁 Architecture & Modules
- src/dataset.py: Lightweight built-in wave tensor loader (bypasses native backend constraints).
- src/models/classifier.py: 12-class multi-class CNN audio noise/threat classifier.
- src/models/unet.py: Spectral U-Net with dynamic spatial interpolation (F.interpolate) for feature alignment.
- src/train.py & src/train_unet.py: Multi-epoch training loops with CosineAnnealingLR and Hann-window STFT.
- src/evaluate.py: Evaluation suite for classification accuracy and spectral L1 reconstruction error.
- src/enhance.py: End-to-end inference utility (Classify threat ID -> Spectral Mask U-Net enhancement -> Inverse STFT reconstruction).

## 🚀 Quickstart Usage

### 1. Train 12-Class Noise Classifier
python src/train.py --train_csv train_metadata.csv --val_csv val_metadata.csv --epochs 25

### 2. Train Spectral U-Net Enhancement Model
python src/train_unet.py --train_csv train_metadata.csv --val_csv val_metadata.csv --epochs 25

### 3. Evaluate Metrics
python src/evaluate.py --test_csv val_metadata.csv

### 4. End-to-End Audio Enhancement & Threat Classification
python src/enhance.py --input data/dummy/sample.wav --output outputs/enhanced.wav
