"""Restyle the event photos as cyanotype prints to match the song's cover art.

Layout and people stay as they are; only tone and texture change:
Prussian-blue shadows, paper-white highlights, a soft glow on lights and screens,
paper grain and uneven chemistry. Borders are drawn by the film itself.

  python3 stylize.py            # src/*.jpg -> styled/*.jpg
"""
import glob, os
import numpy as np
from PIL import Image, ImageFilter

DARK = np.array([8, 30, 72], np.float32)       # deep Prussian blue
MID = np.array([38, 92, 160], np.float32)
LIGHT = np.array([236, 242, 246], np.float32)  # paper white
rng = np.random.default_rng(404)


def smooth_noise(h, w, scale, seed):
    r = np.random.default_rng(seed)
    small = r.random((max(2, h // scale), max(2, w // scale))).astype(np.float32)
    return np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255


def stylize(path, out):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im, np.float32) / 255
    h, w, _ = a.shape
    # Luminance with a bit of local contrast so faces and screens keep their shape.
    lum = a @ np.array([0.30, 0.55, 0.15], np.float32)
    blur = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(24)), np.float32) / 255
    lum = np.clip(lum + 0.55 * (lum - blur), 0, 1)
    lum = np.clip((lum - 0.06) / 0.86, 0, 1) ** 0.95
    # Line work: faint edges pressed into the print, like a contact exposure.
    L = Image.fromarray((lum * 255).astype(np.uint8))
    edges = np.asarray(L.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255
    lum = np.clip(lum - 0.35 * edges, 0, 1)
    # Tri-tone map.
    t = lum[..., None]
    lo = DARK + (MID - DARK) * np.clip(t / 0.5, 0, 1)
    col = np.where(t < 0.5, lo, MID + (LIGHT - MID) * np.clip((t - 0.5) / 0.5, 0, 1) ** 0.85)
    # Halation around bright areas (lamps, screens).
    hi = np.clip((lum - 0.72) / 0.28, 0, 1)
    glow = np.asarray(Image.fromarray((hi * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(28)), np.float32)[..., None] / 255
    col = col + glow * np.array([70, 90, 90], np.float32) * 0.9
    # Uneven chemistry: large soft blotches and paper grain.
    blot = smooth_noise(h, w, 180, rng.integers(1e9))
    col = col * (0.9 + 0.16 * blot[..., None])
    grain = rng.normal(0, 1, (h, w)).astype(np.float32)
    grain = np.asarray(Image.fromarray(np.clip(grain * 40 + 128, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), np.float32) - 128
    col = col + grain[..., None] * 0.35
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).save(out, quality=92)
    print('styled', out)


if __name__ == '__main__':
    os.makedirs('styled', exist_ok=True)
    for p in sorted(glob.glob('src/*.jpg')):
        stylize(p, 'styled/' + os.path.basename(p))
