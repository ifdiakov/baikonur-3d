#!/usr/bin/env python3
"""Build the museum's local SRTM-derived terrain heightfield.

Requires Python 3.10+, NumPy, Pillow and Node.js. Source Terrarium tiles are
publicly readable; no API key or AWS account is needed. Only the JSON asset is
written to the repository. Downloaded source PNGs stay in a temporary cache.

    python scripts/build-terrain-dem.py --fetched-at 2026-11-01

See docs/terrain-relief.md for projection, filtering, credits and display scale.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import hashlib
from io import BytesIO
import json
import math
from pathlib import Path
import subprocess
import tempfile
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
WIDTH = HEIGHT = 321
BOUNDS = {"minX": -2600, "maxX": 3160, "minZ": -2500, "maxZ": 1980}
ZOOM = 10
TILE_SIZE = 256
TILE_X = range(690, 695)
TILE_Y = range(363, 367)
URL_TEMPLATE = (
    "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
)
DATASET_URL = "https://registry.opendata.aws/terrain-tiles/"
FORMAT_URL = "https://github.com/tilezen/joerd/blob/master/docs/formats.md"
ATTRIBUTION_URL = "https://github.com/tilezen/joerd/blob/master/docs/attribution.md"
SOURCES_URL = "https://github.com/tilezen/joerd/blob/master/docs/data-sources.md"
FILTER_SIZE = 5
FILTER_THRESHOLD_METRES = 12.0
SMOOTHING_KERNEL = (0.25, 0.5, 0.25)
METRES_PER_UNIT = 0.1
OFFSET_METRES = 0


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def decode_terrarium(data: bytes) -> np.ndarray:
    """Terrarium RGB: height in metres = R * 256 + G + B / 256 - 32768."""
    with Image.open(BytesIO(data)) as image:
        if image.size != (TILE_SIZE, TILE_SIZE):
            raise ValueError(f"Unexpected terrain tile dimensions: {image.size}")
        rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    return rgb[:, :, 0] * 256.0 + rgb[:, :, 1] + rgb[:, :, 2] / 256.0 - 32768.0


def load_tiles(cache_dir: Path, refresh: bool) -> tuple[np.ndarray, list[dict]]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    mosaic = np.empty(
        (len(TILE_Y) * TILE_SIZE, len(TILE_X) * TILE_SIZE), dtype=np.float32
    )
    manifest = []
    for tile_y in TILE_Y:
        for tile_x in TILE_X:
            url = URL_TEMPLATE.format(z=ZOOM, x=tile_x, y=tile_y)
            path = cache_dir / f"{ZOOM}-{tile_x}-{tile_y}.png"
            if refresh or not path.exists():
                request = Request(url, headers={"User-Agent": "baikonur-museum-terrain/1"})
                with urlopen(request, timeout=30) as response:
                    data = response.read()
                tile = decode_terrarium(data)
                temporary = path.with_suffix(".png.tmp")
                temporary.write_bytes(data)
                temporary.replace(path)
            else:
                data = path.read_bytes()
                tile = decode_terrarium(data)
            row = (tile_y - TILE_Y.start) * TILE_SIZE
            column = (tile_x - TILE_X.start) * TILE_SIZE
            mosaic[row:row + TILE_SIZE, column:column + TILE_SIZE] = tile
            manifest.append({
                "z": ZOOM, "x": tile_x, "y": tile_y,
                "url": url, "sha256": sha256(data), "bytes": len(data),
            })
    if not np.isfinite(mosaic).all():
        raise ValueError("Non-finite source elevation")
    return mosaic, manifest


def repair_outliers(mosaic: np.ndarray) -> tuple[np.ndarray, int]:
    """Replace only strong local outliers; leave ordinary terrain unchanged."""
    radius = FILTER_SIZE // 2
    padded = np.pad(mosaic, radius, mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(
        padded, (FILTER_SIZE, FILTER_SIZE)
    )
    median = np.median(windows, axis=(-2, -1))
    outliers = np.abs(mosaic - median) > FILTER_THRESHOLD_METRES
    return np.where(outliers, median, mosaic).astype(np.float32), int(outliers.sum())


def smooth_one_pixel(mosaic: np.ndarray) -> np.ndarray:
    """One separable 3x3 binomial pass, with a one-source-pixel support radius."""
    padded = np.pad(mosaic, ((0, 0), (1, 1)), mode="edge")
    horizontal = (
        padded[:, :-2] * SMOOTHING_KERNEL[0]
        + padded[:, 1:-1] * SMOOTHING_KERNEL[1]
        + padded[:, 2:] * SMOOTHING_KERNEL[2]
    )
    padded = np.pad(horizontal, ((1, 1), (0, 0)), mode="edge")
    return (
        padded[:-2] * SMOOTHING_KERNEL[0]
        + padded[1:-1] * SMOOTHING_KERNEL[1]
        + padded[2:] * SMOOTHING_KERNEL[2]
    ).astype(np.float32)


def museum_coordinates(node: str) -> dict:
    """Call the actual museum projection rather than maintaining a second copy."""
    program = """
import {readFile} from 'node:fs/promises';
import {createMuseumGeography,inverseProjectOsm,WORLD_UNITS_PER_MAP_UNIT}
  from './src/osm-geography.js';
import {FLANK_OUTLINE} from './src/flank-boundaries.js';
const {bounds,width,height}=JSON.parse(process.argv[1]);
const catalog=JSON.parse(await readFile('data/catalog.json','utf8'));
const matches=JSON.parse(await readFile('data/osm/catalog-matches.json','utf8'));
const geography=createMuseumGeography({catalog,matches});
const [originX,originY]=geography.projection.originPlan;
const worldToPlan=(x,z)=>[originX+x/WORLD_UNITS_PER_MAP_UNIT,
  originY+z/WORLD_UNITS_PER_MAP_UNIT];
const longitude=Array.from({length:width},(_,i)=>inverseProjectOsm(
  worldToPlan(bounds.minX+(bounds.maxX-bounds.minX)*i/(width-1),0))[0]);
const latitude=Array.from({length:height},(_,i)=>inverseProjectOsm(
  worldToPlan(0,bounds.minZ+(bounds.maxZ-bounds.minZ)*i/(height-1)))[1]);
const b=geography.bounds;
const geographyWorldBounds={
  minX:(b.minX-originX)*WORLD_UNITS_PER_MAP_UNIT,
  maxX:(b.maxX-originX)*WORLD_UNITS_PER_MAP_UNIT,
  minZ:(b.minY-originY)*WORLD_UNITS_PER_MAP_UNIT,
  maxZ:(b.maxY-originY)*WORLD_UNITS_PER_MAP_UNIT
};
const flankWorldBounds={
  minX:(Math.min(...FLANK_OUTLINE.map(p=>p[0]))-originX)*WORLD_UNITS_PER_MAP_UNIT,
  maxX:(Math.max(...FLANK_OUTLINE.map(p=>p[0]))-originX)*WORLD_UNITS_PER_MAP_UNIT,
  minZ:(Math.min(...FLANK_OUTLINE.map(p=>p[1]))-originY)*WORLD_UNITS_PER_MAP_UNIT,
  maxZ:(Math.max(...FLANK_OUTLINE.map(p=>p[1]))-originY)*WORLD_UNITS_PER_MAP_UNIT
};
const coverageWorldBounds={
  minX:Math.min(geographyWorldBounds.minX,flankWorldBounds.minX),
  maxX:Math.max(geographyWorldBounds.maxX,flankWorldBounds.maxX),
  minZ:Math.min(geographyWorldBounds.minZ,flankWorldBounds.minZ),
  maxZ:Math.max(geographyWorldBounds.maxZ,flankWorldBounds.maxZ)
};
console.log(JSON.stringify({longitude,latitude,projection:geography.projection,
  geographyWorldBounds,flankWorldBounds,coverageWorldBounds,
  worldUnitsPerMapUnit:WORLD_UNITS_PER_MAP_UNIT}));
"""
    parameters = json.dumps({"bounds": BOUNDS, "width": WIDTH, "height": HEIGHT})
    result = subprocess.run(
        [node, "--input-type=module", "-e", program, parameters],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    coordinates = json.loads(result.stdout)
    actual = coordinates["coverageWorldBounds"]
    margins = {
        "west": actual["minX"] - BOUNDS["minX"],
        "east": BOUNDS["maxX"] - actual["maxX"],
        "north": actual["minZ"] - BOUNDS["minZ"],
        "south": BOUNDS["maxZ"] - actual["maxZ"],
    }
    if min(margins.values()) < 200:
        raise ValueError(f"DEM bounds no longer cover geography and FLANK_OUTLINE plus 200 world units: {margins}")
    coordinates["coverageBufferWorld"] = margins
    return coordinates


def sample_mosaic(mosaic: np.ndarray, coordinates: dict) -> np.ndarray:
    longitude = np.asarray(coordinates["longitude"], dtype=np.float64)
    latitude = np.radians(np.asarray(coordinates["latitude"], dtype=np.float64))
    size = TILE_SIZE * (2 ** ZOOM)
    # Tile pixels are areas. Their elevation samples sit at their centres.
    column = (longitude + 180.0) / 360.0 * size - TILE_X.start * TILE_SIZE - 0.5
    row = (1.0 - np.arcsinh(np.tan(latitude)) / math.pi) / 2.0 * size
    row -= TILE_Y.start * TILE_SIZE + 0.5
    if not (
        column.min() >= 0 and column.max() < mosaic.shape[1] - 1
        and row.min() >= 0 and row.max() < mosaic.shape[0] - 1
    ):
        raise ValueError("DEM world bounds exceed the downloaded source mosaic")
    x = np.floor(column).astype(np.int64)
    y = np.floor(row).astype(np.int64)
    fx = (column - x)[None, :]
    fy = (row - y)[:, None]
    northwest = mosaic[y[:, None], x[None, :]]
    northeast = mosaic[y[:, None], x[None, :] + 1]
    southwest = mosaic[y[:, None] + 1, x[None, :]]
    southeast = mosaic[y[:, None] + 1, x[None, :] + 1]
    north = northwest * (1.0 - fx) + northeast * fx
    south = southwest * (1.0 - fx) + southeast * fx
    return north * (1.0 - fy) + south * fy


def build(args: argparse.Namespace) -> dict:
    raw, tiles = load_tiles(args.cache_dir, args.refresh)
    cleaned, replaced_pixels = repair_outliers(raw)
    if args.clean_mosaic:
        existing = np.load(args.clean_mosaic, allow_pickle=False)
        if existing.shape != cleaned.shape or not np.array_equal(existing, cleaned):
            raise ValueError("Supplied cleaned mosaic does not match the reproducible filter")
        cleaned = existing.astype(np.float32)
    smoothed = smooth_one_pixel(cleaned)
    coordinates = museum_coordinates(args.node)
    sampled = sample_mosaic(smoothed, coordinates)
    encoded = np.rint((sampled - OFFSET_METRES) / METRES_PER_UNIT)
    if not np.isfinite(encoded).all() or encoded.min() < 0 or encoded.max() > 65535:
        raise ValueError("Elevations cannot be represented as unsigned decimetres")
    encoded = encoded.astype(np.uint16)
    restored = encoded.astype(np.float64) * METRES_PER_UNIT + OFFSET_METRES
    projection = coordinates["projection"]
    centre_latitude = sum((coordinates["latitude"][0], coordinates["latitude"][-1])) / 2
    source_pixel_metres = (
        math.cos(math.radians(centre_latitude)) * 2 * math.pi * 6378137
        / (TILE_SIZE * 2 ** ZOOM)
    )
    step_x = (BOUNDS["maxX"] - BOUNDS["minX"]) / (WIDTH - 1)
    step_z = (BOUNDS["maxZ"] - BOUNDS["minZ"]) / (HEIGHT - 1)
    payload = {
        "version": 1,
        "width": WIDTH,
        "height": HEIGHT,
        "bounds": BOUNDS,
        "metresPerUnit": METRES_PER_UNIT,
        "offsetMetres": OFFSET_METRES,
        "values": encoded.ravel(order="C").tolist(),
        "rangeMetres": {
            "min": round(float(restored.min()), 1),
            "max": round(float(restored.max()), 1),
        },
        "layout": "row-major; x increases within rows; z increases between rows (north to south)",
        "grid": {
            "stepWorld": {"x": step_x, "z": step_z},
            "stepGroundMetres": {
                "x": step_x * projection["worldMetresPerUnit"],
                "z": step_z * projection["worldMetresPerUnit"],
            },
            "boundsLonLat": {
                "west": coordinates["longitude"][0],
                "east": coordinates["longitude"][-1],
                "south": coordinates["latitude"][-1],
                "north": coordinates["latitude"][0],
            },
            "geographyWorldBounds": coordinates["geographyWorldBounds"],
            "flankWorldBounds": coordinates["flankWorldBounds"],
            "coverageWorldBounds": coordinates["coverageWorldBounds"],
            "coverageBufferWorld": coordinates["coverageBufferWorld"],
            "projection": {"module": "src/osm-geography.js", **projection},
        },
        "source": {
            "name": "Mapzen Terrain Tiles / SRTM",
            "url": DATASET_URL,
            "urlTemplate": URL_TEMPLATE,
            "attribution": "Mapzen. SRTM data courtesy of the U.S. Geological Survey.",
            "attributionUrl": ATTRIBUTION_URL,
            "formatUrl": FORMAT_URL,
            "dataSourcesUrl": SOURCES_URL,
            "fetchedAt": args.fetched_at,
            "zoom": ZOOM,
            "tiles": tiles,
            "encoding": "Terrarium RGB; metres = R * 256 + G + B / 256 - 32768",
            "rasterProjection": "EPSG:3857",
            "nominalUnderlyingResolutionMetres": 30,
            "tilePixelGroundResolutionMetresAtCentre": round(source_pixel_metres, 3),
            "sourceBytes": sum(tile["bytes"] for tile in tiles),
            "filter": {
                "name": "conditional local median",
                "kernelSizePixels": FILTER_SIZE,
                "replaceWhenAbsoluteDifferenceExceedsMetres": FILTER_THRESHOLD_METRES,
                "edgeMode": "nearest",
                "passes": 1,
                "replacedPixelsInMosaic": replaced_pixels,
            },
            "smoothing": {
                "name": "separable binomial",
                "kernel": list(SMOOTHING_KERNEL),
                "supportRadiusSourcePixels": 1,
                "passes": 1,
                "edgeMode": "nearest",
            },
            "resampling": "bilinear from source pixel centres to museum world X/Z grid",
            "quantization": "nearest 0.1 metre, ties to even; unsigned 16-bit values",
            "cleanedMosaicFloat32LittleEndianSha256": sha256(cleaned.astype("<f4").tobytes()),
            "encodedUint16LittleEndianSha256": sha256(encoded.astype("<u2").tobytes()),
        },
        "displayGuidance": {
            "baseElevationMetres": 68,
            "verticalExaggeration": 2.5,
            "worldUnitsPerMetre": projection["worldUnitsPerMetre"],
            "edgeFadeBaked": False,
            "engineeringFlatteningBaked": False,
            "note": "Visual museum adaptation; runtime applies edge fades and protects engineered sites, transport and water. Not a surveying model.",
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n",
        encoding="utf-8",
    )
    return {
        "output": str(args.output),
        "bytes": args.output.stat().st_size,
        "samples": int(encoded.size),
        "bounds": BOUNDS,
        "rangeMetres": payload["rangeMetres"],
        "sourceBytes": payload["source"]["sourceBytes"],
        "replacedSourcePixels": replaced_pixels,
        "maximumQuantizationErrorMetres": float(np.max(np.abs(restored - sampled))),
        "valuesSha256": payload["source"]["encodedUint16LittleEndianSha256"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "data/terrain/baikonur-dem.json")
    parser.add_argument(
        "--cache-dir", type=Path,
        default=Path(tempfile.gettempdir()) / "baikonur-dem-cache",
    )
    parser.add_argument("--refresh", action="store_true", help="Download the 20 source tiles again")
    parser.add_argument(
        "--clean-mosaic", type=Path,
        help="Reuse a .npy filtered mosaic, after checking it exactly against the raw PNGs",
    )
    parser.add_argument("--node", default="node", help="Node.js executable used for inverseProjectOsm")
    parser.add_argument(
        "--fetched-at", default=datetime.now(timezone.utc).date().isoformat(),
        help="Source access date in YYYY-MM-DD; pin this for byte-for-byte reproduction",
    )
    args = parser.parse_args()
    try:
        date.fromisoformat(args.fetched_at)
        result = build(args)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        if isinstance(error, subprocess.CalledProcessError):
            parser.exit(1, f"Projection command failed: {error.stderr}\n")
        parser.exit(1, f"Terrain build failed: {error}\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
