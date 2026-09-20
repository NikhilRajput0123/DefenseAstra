import torch
import torch.nn as nn
import torch.nn.functional as F

class SpectralUNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.enc1 = nn.Sequential(nn.Conv2d(1, 16, 3, padding=1), nn.ReLU(), nn.BatchNorm2d(16))
        self.down1 = nn.MaxPool2d(2, 2)
        self.enc2 = nn.Sequential(nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(), nn.BatchNorm2d(32))
        self.down2 = nn.MaxPool2d(2, 2)

        self.bottleneck = nn.Sequential(nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.BatchNorm2d(64))

        self.up2 = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=False)
        self.dec2 = nn.Sequential(nn.Conv2d(64 + 32, 16, 3, padding=1), nn.ReLU())
        self.up1 = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=False)
        self.dec1 = nn.Sequential(nn.Conv2d(16 + 16, 1, 3, padding=1), nn.Sigmoid())

    def forward(self, x):
        e1 = self.enc1(x)
        d1 = self.down1(e1)
        e2 = self.enc2(d1)
        d2 = self.down2(e2)

        b = self.bottleneck(d2)

        u2 = self.up2(b)
        if u2.size()[2:] != e2.size()[2:]:
            u2 = F.interpolate(u2, size=e2.size()[2:], mode='bilinear', align_corners=False)
        cat2 = torch.cat([u2, e2], dim=1)
        out2 = self.dec2(cat2)

        u1 = self.up1(out2)
        if u1.size()[2:] != e1.size()[2:]:
            u1 = F.interpolate(u1, size=e1.size()[2:], mode='bilinear', align_corners=False)
        cat1 = torch.cat([u1, e1], dim=1)
        out1 = self.dec1(cat1)
        return out1
