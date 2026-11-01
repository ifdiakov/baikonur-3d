#!/usr/bin/env python3
"""Build repeatable, seamless linear-data maps for the museum's dry terrain.

No photographs or downloaded textures are used. RGB channels are independent
scalar fields, not a colour image; sample them with RepeatWrapping/NoColorSpace.
The 511-sample torus is closed with a duplicate end row/column, so both pairs
of opposing edges in the delivered 512-pixel PNGs match exactly.

Usage:
    python scripts/build-steppe-textures.py
    python scripts/build-steppe-textures.py --preview-dir /tmp/steppe-texture-review
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import PIL
from PIL import Image, ImageDraw, ImageFont
import scipy
from scipy.ndimage import gaussian_filter, map_coordinates
from scipy.spatial import cKDTree


SIZE = 512
PERIOD = SIZE - 1
SEED = 20261101
ROOT = Path(__file__).resolve().parents[1]


def smoothstep(a: float, b: float, field: np.ndarray) -> np.ndarray:
    t = np.clip((field - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


class Fields:
    def __init__(self, seed: int):
        self.rng = np.random.default_rng(seed)
        self.y, self.x = np.mgrid[:PERIOD, :PERIOD].astype(np.float64)

    def noise(self, sigma: float | tuple[float, float]) -> np.ndarray:
        field = gaussian_filter(self.rng.standard_normal((PERIOD, PERIOD)), sigma, mode="wrap")
        return (field - field.mean()) / max(float(field.std()), 1e-8)

    def sample(self, field: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        return map_coordinates(field, [y % PERIOD, x % PERIOD], order=1, mode="grid-wrap")

    def stamp(self, target: np.ndarray, x: float, y: float, rx: float, ry: float,
              angle: float, amplitude: float, shade: bool = False) -> None:
        """A small smooth irregular grain, wrapped across the tile boundary."""
        radius = math.ceil(max(rx, ry) * 2.8)
        xi = np.arange(math.floor(x) - radius, math.floor(x) + radius + 1)
        yi = np.arange(math.floor(y) - radius, math.floor(y) + radius + 1)
        dx, dy = np.meshgrid(xi - x, yi - y)
        ca, sa = math.cos(angle), math.sin(angle)
        u, v = (ca * dx + sa * dy) / rx, (-sa * dx + ca * dy) / ry
        radius2 = u * u + v * v
        body = np.exp(-radius2 * 1.45)
        if shade:
            body = body * (0.8 - 0.5 * u - 0.3 * v) - np.exp(-radius2 * 0.65) * 0.18
        target[np.ix_(yi % PERIOD, xi % PERIOD)] += amplitude * body


def centred(field: np.ndarray, low: float = 0.06, high: float = 0.94) -> np.ndarray:
    field = np.clip(field - field.mean() + 0.5, low, high)
    return np.clip(field - field.mean() + 0.5, 0.0, 1.0)


def micro_soil(fields: Fields) -> np.ndarray:
    grain = 0.038 * fields.noise(0.55) + 0.040 * fields.noise(1.8)
    soil = grain + 0.030 * fields.noise(5.0) + 0.018 * fields.noise(16.0)
    for _ in range(1450):
        radius = float(np.clip(fields.rng.lognormal(-0.15, 0.44), 0.48, 2.7))
        fields.stamp(soil, *fields.rng.uniform(0, PERIOD, 2), radius,
                     radius * fields.rng.uniform(0.55, 1.1), fields.rng.uniform(0, math.tau),
                     fields.rng.uniform(0.10, 0.26), shade=True)
    return centred(soil)


def micro_sand(fields: Fields) -> np.ndarray:
    # Integer wave counts close on the torus. Domain distortion, irregular
    # interruption and two local directions prevent a continuous wave grating.
    wx = 10.0 * fields.noise(35.0) + 2.5 * fields.noise(8.0)
    wy = 9.0 * fields.noise(30.0) + 2.0 * fields.noise(7.0)
    x, y = fields.x + wx, fields.y + wy
    phase_a = math.tau * (17.0 * x + 46.0 * y) / PERIOD
    phase_b = math.tau * (38.0 * x - 24.0 * y) / PERIOD
    patches = smoothstep(-0.45, 0.95, fields.noise(21.0))
    breaks = smoothstep(-0.45, 0.75, fields.noise(8.0) + 0.35 * fields.noise(3.0))
    ripple_a = np.sin(phase_a) + 0.22 * np.sin(2.0 * phase_a + 0.6)
    ripple_b = np.sin(phase_b) + 0.17 * np.sin(2.0 * phase_b - 0.8)
    ripples = (ripple_a * patches + ripple_b * (1.0 - patches) * 0.65) * breaks
    sand = 0.046 * ripples + 0.036 * fields.noise(0.55) + 0.022 * fields.noise(1.5)
    sand += 0.014 * fields.noise(7.0)
    return centred(sand)


def micro_salt(fields: Fields) -> np.ndarray:
    # A nonuniform seed distribution produces mixed cell sizes. Warping the
    # distance field bends the boundaries; partial cracks and small branches
    # avoid a regular Voronoi outline on every salt plate.
    sites = []
    while len(sites) < 350:
        candidate = fields.rng.uniform(0, PERIOD, 2)
        if sites:
            delta = np.abs(np.asarray(sites) - candidate)
            delta = np.minimum(delta, PERIOD - delta)
            if np.min(np.sum(delta * delta, axis=1)) < 5.0 ** 2:
                continue
        sites.append(candidate)
    sites = np.asarray(sites)
    x = (fields.x + 4.0 * fields.noise(18.0) + 1.2 * fields.noise(4.0)) % PERIOD
    y = (fields.y + 4.0 * fields.noise(18.0) + 1.2 * fields.noise(4.0)) % PERIOD
    distance, nearest = cKDTree(sites, boxsize=PERIOD).query(np.column_stack([x.ravel(), y.ravel()]), k=2)
    distance = distance.reshape(PERIOD, PERIOD, 2)
    nearest = nearest[:, 0].reshape(PERIOD, PERIOD)
    width = 0.34 + 0.10 * np.tanh(fields.noise(9.0))
    edge = np.exp(-((distance[:, :, 1] - distance[:, :, 0]) / width) ** 2)
    edge *= 0.58 + 0.42 * smoothstep(-0.9, 0.7, fields.noise(19.0))

    branches = np.zeros((PERIOD, PERIOD), dtype=np.float64)
    candidates = np.argwhere(edge > 0.45)
    for iy, ix in candidates[fields.rng.choice(len(candidates), 300, replace=False)]:
        delta = sites[nearest[iy, ix]] - [x[iy, ix], y[iy, ix]]
        delta = (delta + PERIOD / 2.0) % PERIOD - PERIOD / 2.0
        direction = math.atan2(delta[1], delta[0]) + fields.rng.uniform(-0.45, 0.45)
        length = fields.rng.uniform(2.0, 7.0)
        bend = fields.rng.uniform(-0.8, 0.8)
        for step in np.arange(0.0, length, 0.55):
            angle = direction + bend * step / length
            strength = 0.28 * (1.0 - step / length) ** 0.65
            fields.stamp(branches, ix + math.cos(angle) * step, iy + math.sin(angle) * step,
                         0.34, 0.34, 0.0, strength)
    edge = np.maximum(edge, np.clip(branches, 0.0, 0.8))
    crust = np.clip(0.865 + 0.018 * fields.noise(5.0) + 0.010 * fields.noise(0.7), 0.78, 0.95)
    crack = np.clip(0.24 + 0.035 * fields.noise(2.5), 0.15, 0.4)
    return crust * (1.0 - edge) + crack * edge


def meso_soil(fields: Fields) -> np.ndarray:
    soil = 0.065 * fields.noise(43.0) + 0.043 * fields.noise(15.0) + 0.022 * fields.noise(4.0)
    erosion = fields.noise((1.6, 11.0))
    erosion = fields.sample(erosion, fields.x + 12.0 * fields.noise(32.0),
                            fields.y + 9.0 * fields.noise(27.0))
    soil -= 0.020 * np.maximum(erosion - 0.65, 0.0)
    return centred(soil, 0.15, 0.85)


def meso_gravel(fields: Fields) -> np.ndarray:
    # At the colour tile's scale these are gravel-rich regions, not individual
    # metre-sized stones. The little stones themselves are in micro R.
    patch = 0.80 * fields.noise(17.0) + 0.28 * fields.noise(5.0) + 0.12 * fields.noise(1.2)
    gravel = smoothstep(0.65, 1.45, patch)
    detail = np.clip(0.16 + 0.045 * fields.noise(0.75) + 0.025 * fields.noise(2.0), 0.035, 0.28)
    return centred(gravel * detail + 0.012 * fields.noise(9.0))


def meso_tufts(fields: Fields) -> tuple[np.ndarray, int]:
    supersample = 3
    canvas = Image.new("L", (PERIOD * supersample, PERIOD * supersample))
    draw = ImageDraw.Draw(canvas)
    density = smoothstep(-0.65, 1.15, fields.noise(27.0) + 0.25 * fields.noise(10.0))
    accepted = 0
    while accepted < 1550:
        x, y = fields.rng.uniform(0, PERIOD, 2)
        if fields.rng.random() > 0.04 + 0.96 * density[int(y), int(x)]:
            continue
        accepted += 1
        radius = float(np.clip(fields.rng.lognormal(0.83, 0.36), 1.1, 4.5))
        angle = fields.rng.uniform(0.0, math.tau)
        fan = fields.rng.uniform(3.1, 5.8)
        brightness = int(fields.rng.uniform(0.60, 1.0) * 255)
        margin = radius * 1.5 + 2.0
        offsets_x = [0] + ([PERIOD] if x < margin else []) + ([-PERIOD] if x > PERIOD - margin else [])
        offsets_y = [0] + ([PERIOD] if y < margin else []) + ([-PERIOD] if y > PERIOD - margin else [])
        strokes = []
        for _ in range(int(fields.rng.integers(8, 16))):
            theta = angle + fields.rng.uniform(-fan / 2.0, fan / 2.0)
            length = radius * fields.rng.uniform(0.45, 1.25)
            skew = fields.rng.uniform(-0.4, 0.4)
            mid = (x + math.cos(theta + skew) * length * 0.55,
                   y + math.sin(theta + skew) * length * 0.55)
            tip = (x + math.cos(theta) * length, y + math.sin(theta) * length)
            strokes.append(([(x, y), mid, tip], int(fields.rng.uniform(0.66, 1.0) * brightness),
                            max(1, round(fields.rng.uniform(0.30, 0.65) * supersample))))
        for ox in offsets_x:
            for oy in offsets_y:
                for points, value, width in strokes:
                    draw.line([((px + ox) * supersample, (py + oy) * supersample) for px, py in points],
                              fill=value, width=width)
                # Small dense roots tie the needle fan together without a
                # round shrub disk or a repeated star-shaped silhouette.
                r = radius * 0.17 * supersample
                cx, cy = (x + ox) * supersample, (y + oy) * supersample
                draw.ellipse((cx-r, cy-r, cx+r, cy+r), fill=brightness)
    # A periodic prefilter supplies antialiasing without a border resampler.
    high = np.asarray(canvas, dtype=np.float64) / 255.0
    high = gaussian_filter(high, 0.48, mode="wrap")
    tufts = high.reshape(PERIOD, supersample, PERIOD, supersample).mean(axis=(1, 3))
    tufts[tufts < 0.06] = 0.0
    return np.clip(tufts, 0.0, 1.0), accepted


def close_tile(channels: list[np.ndarray]) -> np.ndarray:
    tile = np.round(np.clip(np.stack(channels, axis=2), 0.0, 1.0) * 255.0).astype(np.uint8)
    return np.pad(tile, ((0, 1), (0, 1), (0, 0)), mode="wrap")


def stats(channel: np.ndarray) -> dict:
    field = channel.astype(np.float64) / 255.0
    return {"min": round(float(field.min()), 6), "max": round(float(field.max()), 6),
            "mean": round(float(field.mean()), 6), "standardDeviation": round(float(field.std()), 6)}


def previews(directory: Path, images: dict[str, np.ndarray]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    titles = [("MICRO R / soil grains", "MICRO G / broken sand ripples", "MICRO B / salt crust"),
              ("MESO R / soil variation", "MESO G / gravel regions", "MESO B / dry tufts")]
    font = ImageFont.load_default(size=20)
    sheet = Image.new("RGB", (SIZE * 3 + 48, (SIZE + 44) * 2 + 32), "#18212a")
    seam_sheet = Image.new("RGB", (SIZE * 3 + 48, (SIZE + 44) * 2 + 32), "#18212a")
    for row, (_, data) in enumerate(images.items()):
        for channel in range(3):
            tile = Image.fromarray(data[:, :, channel], "L")
            x, y = 12 + channel * (SIZE + 12), 12 + row * (SIZE + 44)
            for target in [sheet, seam_sheet]:
                ImageDraw.Draw(target).text((x, y), titles[row][channel], fill="#e8e7df", font=font)
            sheet.paste(tile, (x, y + 32))
            repeated = Image.fromarray(np.tile(data[:, :, channel], (2, 2)), "L")
            seam_sheet.paste(repeated.resize((SIZE, SIZE), Image.Resampling.LANCZOS), (x, y + 32))
    sheet.save(directory / "steppe-channels-v1.png")
    seam_sheet.save(directory / "steppe-seams-v1.png")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "assets/terrain")
    parser.add_argument("--preview-dir", type=Path)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()
    fields = Fields(args.seed)
    micro = close_tile([micro_soil(fields), micro_sand(fields), micro_salt(fields)])
    soil, gravel = meso_soil(fields), meso_gravel(fields)
    tufts, tuft_count = meso_tufts(fields)
    meso = close_tile([soil, gravel, tufts])
    images = {"steppe-micro-v1.png": micro, "steppe-meso-v1.png": meso}
    meanings = {
        "steppe-micro-v1.png": ["fine soil grains and occasional small pebbles", "weak broken sand ripples and grain", "salt crust with thin irregular branching cracks"],
        "steppe-meso-v1.png": ["soil patchiness and fine erosion", "sparse gravel-rich regions", "sparse needle-shaped dry vegetation tufts; zero background"],
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    for name, data in images.items():
        assert data.shape == (SIZE, SIZE, 3)
        assert np.array_equal(data[0], data[-1]) and np.array_equal(data[:, 0], data[:, -1])
        path = args.output_dir / name
        Image.fromarray(data, "RGB").save(path, optimize=True, compress_level=9)
        outputs.append({"file": name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                        "bytes": path.stat().st_size, "mode": "RGB", "opaque": True,
                        "size": [SIZE, SIZE], "oppositeEdgesIdentical": True,
                        "channels": {channel: {"meaning": meaning, **stats(data[:, :, i])}
                                     for i, (channel, meaning) in enumerate(zip("RGB", meanings[name]))}})
    coverage = float(np.mean(meso[:, :, 2] >= round(0.1 * 255)))
    assert 0.05 <= coverage <= 0.10, f"Unexpected vegetation coverage: {coverage}"
    total = sum(item["bytes"] for item in outputs)
    manifest = {"version": "steppe-textures-v1", "seed": args.seed,
                "generator": "scripts/build-steppe-textures.py",
                "generatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "method": "Original deterministic toroidal noise, periodic stamps and warped distance fields; no photographs or external texture inputs.",
                "colorSpace": "linear-data", "sampling": {"wrapS": "repeat", "wrapT": "repeat", "mipmaps": True},
                "suggestedWorldPeriods": {"micro": 2, "mesoColor": 64, "mesoVegetation": 10},
                "vegetation": {"tuftCount": tuft_count, "coverageAt0_1": round(coverage, 6),
                               "nonzeroCoverage": round(float(np.mean(meso[:, :, 2] > 0)), 6)},
                "dependencies": {"numpy": np.__version__, "Pillow": PIL.__version__, "scipy": scipy.__version__},
                "totalPngBytes": total, "files": outputs}
    (args.output_dir / "steppe-textures-v1.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    if args.preview_dir:
        previews(args.preview_dir, images)
    print(json.dumps({"ok": True, "seed": args.seed, "totalPngBytes": total,
                      "vegetationCoverage": round(coverage, 6),
                      "files": [{"file": item["file"], "bytes": item["bytes"], "sha256": item["sha256"]} for item in outputs]}, indent=2))


if __name__ == "__main__":
    main()
