#!/usr/bin/env python3
"""Deterministic cylindrical museum finish drawn from the owner's four renders.

The references remain on Drive. No image pixels are copied into the texture;
panel lines and markings are drawn at their positions on the display model.
"""
import argparse
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
W, H, HEIGHT = 1024, 4096, 30.3
rng = np.random.default_rng(81664)

def noise(w, h):
    a = rng.integers(0, 256, (h, w), dtype=np.uint8)
    return np.asarray(Image.fromarray(a).resize((W, H), Image.Resampling.BICUBIC), dtype=float) / 255 - .5

cloud = noise(20, 92) * 6 + noise(90, 360) * 2.8
grain = rng.normal(0, .65, (H, W))
base = np.empty((H, W, 3), float)
base[:] = [69, 70, 53]
ys = HEIGHT * (1 - np.arange(H) / (H - 1))
base[ys >= 27.10] = [158, 153, 129]
base[ys >= 27.75] = [193, 185, 158]
image = Image.fromarray(np.uint8(np.clip(base + (cloud + grain)[..., None], 0, 255)))
draw = ImageDraw.Draw(image)
def y(height): return round((1 - height / HEIGHT) * (H - 1))
def u(degrees): return round(((degrees / 360 + .5) % 1) * W)
def ring(height, color, width=1): draw.line([(0, y(height)), (W, y(height))], fill=color, width=width)

# Fine circumferential seams and the repeating crimp seam visible in the renders.
for height in [3.5, 7.5, 9.5, 14.6, 15.8, 18.5, 21.7, 25.9, 27.1, 27.75]:
    ring(height, (43, 44, 33))
    ring(height + .022, (104, 104, 78))
    if height < 26:
        points = [(x, y(height + .22 + .11 * np.sin(2 * np.pi * x / 24))) for x in range(W)]
        draw.line(points, fill=(61, 62, 46), width=1)

def hatch(degrees, height, width, tall):
    cx, cy = u(degrees), y(height)
    rx, ry = round(width / 9.425 * W / 2), round(tall / HEIGHT * H / 2)
    for shift in [-W, 0, W]:
        bounds = [cx-rx+shift, cy-ry, cx+rx+shift, cy+ry]
        draw.rounded_rectangle(bounds, radius=max(3, rx//2), outline=(44, 45, 33), width=2)
        draw.rounded_rectangle([bounds[0]+3, bounds[1]+3, bounds[2]-3, bounds[3]-3], radius=max(2, rx//2-2), outline=(101, 101, 75), width=1)
        for a in [-.7, 0, .7]:
            for sx in [-1, 1]:
                px, py = cx+shift+sx*(rx-2), cy+a*(ry-3)
                draw.ellipse([px-1, py-1, px+1, py+1], fill=(40, 42, 34))

for degrees in [0, 90, 180, 270]:
    hatch(degrees, 1.55, .62, .82)
    hatch(degrees, 16.75, .50, .66)
for degrees in [35, 145, 215, 325]:
    for height in [5.1, 11.1, 20.2, 24.2]: hatch(degrees, height, .48, .65)

font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font = ImageFont.truetype(font_path, 15)
white = (209, 208, 189)
def stencil(degrees, height, label=False):
    cx, cy = u(degrees), y(height)
    for shift in [-W, 0, W]:
        x = cx + shift
        for row, length in enumerate([20, 27, 17, 24]):
            draw.line([(x-length/2, cy+row*4), (x+length/2, cy+row*4)], fill=white, width=1)
        draw.line([(x, cy-4), (x, cy+17)], fill=(89, 90, 67), width=1)
        if label:
            draw.text((x, cy+23), '8К64', anchor='mt', font=font, fill=white)
            draw.line([(x-19, cy+42), (x+19, cy+42)], fill=white, width=1)

for degrees in [38, 128, 218, 308]:
    for height in [3.0, 6.1, 8.0, 13.7, 17.8, 21.2, 25.4]: stencil(degrees, height, height == 6.1)
    for height in [3.5, 7.5, 9.5, 18.5, 21.7, 25.9]:
        for shift in [-W, 0, W]:
            cx, cy = u(degrees)+shift, y(height)
            for dy in [-4, 4]: draw.line([(cx+8, cy+dy), (cx+40, cy+dy)], fill=white, width=1)

image.save(out / 'r16-albedo.jpg', quality=91, subsampling=0, optimize=True)
# glTF ORM: green = roughness; blue = metallic. Paint remains predominantly matte.
rough = np.zeros((H, W, 3), dtype=np.uint8)
rough[..., 0] = 255
rough[..., 1] = np.uint8(np.clip(183 + cloud*3, 158, 204))
rough[..., 2] = 18
rough[ys >= 27.10, :, 1] = 169
rough[ys >= 27.10, :, 2] = 27
Image.fromarray(rough).save(out / 'r16-roughness.jpg', quality=85, subsampling=0, optimize=True)
print('R16_TEXTURES', W, H, sum(p.stat().st_size for p in out.glob('*.jpg')))
