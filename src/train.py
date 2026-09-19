import os
import argparse
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from dataset import DefenseAstraDataset
from models.classifier import NoiseClassifier

def get_stft_features(wav):
    w = wav.squeeze(1) if wav.dim() == 3 else wav
    window = torch.hann_window(512, device=w.device)
    spec = torch.stft(w, n_fft=512, hop_length=160, window=window, return_complex=True)
    mag = torch.abs(spec).unsqueeze(1)
    return mag

def train_classifier(train_csv, val_csv, epochs=10):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"🔥 Training running on device: {device}")

    train_dataset = DefenseAstraDataset(csv_file=train_csv)
    val_dataset = DefenseAstraDataset(csv_file=val_csv)

    train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=32, shuffle=False)

    model = NoiseClassifier(num_classes=12).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    os.makedirs('checkpoints', exist_ok=True)
    best_val_acc = 0.0

    for epoch in range(epochs):
        model.train()
        total_loss = 0.0
        for batch in train_loader:
            wavs = batch['noisy'].to(device)
            labels = batch['label'].to(device)
            feats = get_stft_features(wavs).to(device)
            
            optimizer.zero_grad()
            logits = model(feats)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        scheduler.step()
        
        model.eval()
        correct, total = 0, 0
        with torch.no_grad():
            for batch in val_loader:
                wavs = batch['noisy'].to(device)
                labels = batch['label'].to(device)
                feats = get_stft_features(wavs).to(device)
                
                logits = model(feats)
                preds = torch.argmax(logits, dim=1)
                correct += (preds == labels).sum().item()
                total += labels.size(0)

        val_acc = correct / total if total > 0 else 0
        print(f"Epoch {epoch+1}/{epochs} | Train Loss: {total_loss/len(train_loader):.4f} | Val Acc: {val_acc*100:.2f}%")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), 'checkpoints/best_classifier.pt')

    print(f"✅ Training finished! Best Val Acc: {best_val_acc*100:.2f}% -> saved to checkpoints/best_classifier.pt")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--train_csv', type=str, required=True, help='Path to train metadata CSV')
    parser.add_argument('--val_csv', type=str, required=True, help='Path to val metadata CSV')
    parser.add_argument('--epochs', type=int, default=10, help='Number of epochs')
    args = parser.parse_args()

    train_classifier(args.train_csv, args.val_csv, args.epochs)
