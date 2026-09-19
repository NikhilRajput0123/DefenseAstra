import argparse
import torch
from torch.utils.data import DataLoader
from dataset import DefenseAstraDataset
from models.classifier import NoiseClassifier
from models.unet import SpectralUNet
from train import get_stft_features
from train_unet import get_spec

def evaluate(test_csv):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"🔍 Running Evaluation on device: {device}")
    
    test_dataset = DefenseAstraDataset(csv_file=test_csv)
    test_loader = DataLoader(test_dataset, batch_size=16, shuffle=False)

    # 1. Evaluate Noise Classifier
    clf = NoiseClassifier(num_classes=12).to(device)
    try:
        clf.load_state_dict(torch.load('checkpoints/best_classifier.pt', map_location=device))
        clf.eval()
        correct, total = 0, 0
        with torch.no_grad():
            for b in test_loader:
                wavs, labels = b['noisy'].to(device), b['label'].to(device)
                feats = get_stft_features(wavs).to(device)
                preds = torch.argmax(clf(feats), dim=1)
                correct += (preds == labels).sum().item()
                total += labels.size(0)
        print(f"📊 Test Classification Accuracy: {correct/total*100:.2f}% ({correct}/{total})")
    except Exception as e:
        print(f"⚠️ Classifier eval error: {e}")

    # 2. Evaluate Spectral U-Net
    unet = SpectralUNet().to(device)
    try:
        unet.load_state_dict(torch.load('checkpoints/best_unet.pt', map_location=device))
        unet.eval()
        l1_loss = 0.0
        crit = torch.nn.L1Loss()
        with torch.no_grad():
            for b in test_loader:
                noisy, clean = b['noisy'].to(device), b['clean'].to(device)
                ns, cs = get_spec(noisy, device), get_spec(clean, device)
                min_t = min(ns.size(3), cs.size(3))
                ns, cs = ns[:,:,:,:min_t], cs[:,:,:,:min_t]
                l1_loss += crit(ns * unet(ns), cs).item()
        print(f"🔊 Test U-Net L1 Spectral Loss: {l1_loss/len(test_loader):.4f}")
    except Exception as e:
        print(f"⚠️ U-Net eval error: {e}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--test_csv', type=str, default='val_metadata.csv')
    args = parser.parse_args()
    evaluate(args.test_csv)
