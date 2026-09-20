import os
import argparse
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from dataset import DefenseAstraDataset
from models.unet import SpectralUNet

def get_spec(wav, device):
    w = wav.squeeze(1) if wav.dim() == 3 else wav
    window = torch.hann_window(512, device=device)
    spec = torch.stft(w, n_fft=512, hop_length=160, window=window, return_complex=True)
    return torch.abs(spec).unsqueeze(1)

def train_unet(train_csv, val_csv, epochs=5):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"🔥 U-Net Training running on device: {device}")

    train_loader = DataLoader(DefenseAstraDataset(csv_file=train_csv), batch_size=16, shuffle=True)
    val_loader = DataLoader(DefenseAstraDataset(csv_file=val_csv), batch_size=16, shuffle=False)

    model = SpectralUNet().to(device)
    criterion = nn.L1Loss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)

    os.makedirs('checkpoints', exist_ok=True)
    best_loss = float('inf')

    for epoch in range(epochs):
        model.train()
        total_loss = 0.0
        for batch in train_loader:
            noisy = batch['noisy'].to(device)
            clean = batch['clean'].to(device)
            
            noisy_spec = get_spec(noisy, device)
            clean_spec = get_spec(clean, device)
            # Match time dim if slightly off
            min_t = min(noisy_spec.size(3), clean_spec.size(3))
            noisy_spec, clean_spec = noisy_spec[:, :, :, :min_t], clean_spec[:, :, :, :min_t]

            optimizer.zero_grad()
            pred_mask = model(noisy_spec)
            enhanced_spec = noisy_spec * pred_mask
            loss = criterion(enhanced_spec, clean_spec)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        val_loss = 0.0
        model.eval()
        with torch.no_grad():
            for batch in val_loader:
                noisy = batch['noisy'].to(device)
                clean = batch['clean'].to(device)
                noisy_spec = get_spec(noisy, device)
                clean_spec = get_spec(clean, device)
                min_t = min(noisy_spec.size(3), clean_spec.size(3))
                noisy_spec, clean_spec = noisy_spec[:, :, :, :min_t], clean_spec[:, :, :, :min_t]
                pred_mask = model(noisy_spec)
                val_loss += criterion(noisy_spec * pred_mask, clean_spec).item()

        val_loss /= len(val_loader) if len(val_loader)>0 else 1
        print(f"Epoch {epoch+1}/{epochs} | Train L1 Loss: {total_loss/len(train_loader):.4f} | Val L1 Loss: {val_loss:.4f}")

        if val_loss < best_loss:
            best_loss = val_loss
            torch.save(model.state_dict(), 'checkpoints/best_unet.pt')

    print(f"✅ U-Net Training finished! Best Val Loss: {best_loss:.4f} -> saved to checkpoints/best_unet.pt")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--train_csv', type=str, required=True)
    parser.add_argument('--val_csv', type=str, required=True)
    parser.add_argument('--epochs', type=int, default=5)
    args = parser.parse_args()
    train_unet(args.train_csv, args.val_csv, args.epochs)
