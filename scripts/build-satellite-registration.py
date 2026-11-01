#!/usr/bin/env python3
"""Build the numerical satellite UV grid from its checked-in registration JSON.

This reads no photograph and changes no image pixels. Target/source controls use
top-left image pixels; the output uses bottom-left UV coordinates, with row zero
at v=0. NumPy and SciPy are the only non-standard-library dependencies.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import math
from pathlib import Path
import sys

try:
    import numpy as np
    from scipy.interpolate import RBFInterpolator
except ImportError as exc:
    raise SystemExit(
        "Satellite registration requires NumPy and SciPy; install them in the "
        "active Python environment (python3 -m pip install numpy scipy)."
    ) from exc


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_METADATA = REPO_ROOT / "assets/terrain/satellite-uv-correction-v1.json"
DEFAULT_OUTPUT = DEFAULT_METADATA.with_suffix(".bin")


def smootherstep(low, high, value):
    if not np.isscalar(low) or not np.isscalar(high) or high <= low:
        raise ValueError("smootherstep requires increasing scalar limits")
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * t * (t * (t * 6 - 15) + 10)


def formula_value(expression: str, variables: dict):
    """Evaluate the small arithmetic mask language, never Python source code."""
    operators = {
        ast.Add: lambda a, b: a + b,
        ast.Sub: lambda a, b: a - b,
        ast.Mult: lambda a, b: a * b,
        ast.Div: lambda a, b: a / b,
    }
    functions = {"smootherstep": (smootherstep, 3), "abs": (np.abs, 1)}

    def visit(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            if math.isfinite(node.value):
                return node.value
        elif isinstance(node, ast.Name) and node.id in variables:
            return variables[node.id]
        elif isinstance(node, ast.BinOp) and type(node.op) in operators:
            return operators[type(node.op)](visit(node.left), visit(node.right))
        elif isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = visit(node.operand)
            return -value if isinstance(node.op, ast.USub) else value
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            function = functions.get(node.func.id)
            if function and not node.keywords and len(node.args) == function[1]:
                return function[0](*(visit(arg) for arg in node.args))
        raise ValueError(f"Unsupported confidence-mask expression: {expression!r}")

    return visit(ast.parse(expression, mode="eval").body)


def finite_pairs(values, name):
    pairs = np.asarray(values, dtype=np.float64)
    if pairs.ndim != 2 or pairs.shape[1] != 2 or not np.isfinite(pairs).all():
        raise ValueError(f"{name} must contain finite coordinate pairs")
    return pairs


def build_grid(metadata: dict) -> bytes:
    for key, expected in {
        "format": "RGBA8",
        "kernel": "thin_plate_spline",
        "gridAt": "texel centers",
        "rowOrder": "v ascending, bottom row first",
    }.items():
        if metadata.get(key) != expected:
            raise ValueError(f"Unsupported {key}: expected {expected!r}")

    width, height = metadata["width"], metadata["height"]
    if any(type(n) is not int or n < 2 for n in (width, height)):
        raise ValueError("Grid width and height must be integers of at least two")
    image = np.asarray(metadata["imageResolution"], dtype=np.float64)
    limits = np.asarray(metadata["maxOffset"], dtype=np.float64)
    for name, value in (("imageResolution", image), ("maxOffset", limits)):
        if value.shape != (2,) or not np.isfinite(value).all() or np.any(value <= 0):
            raise ValueError(f"{name} must contain two finite positive values")

    controls = metadata["controls"]
    target = finite_pairs([row["target"] for row in controls], "Control targets")
    source = finite_pairs([row["source"] for row in controls], "Control sources")
    pins = finite_pairs(metadata["zeroPins"], "Zero-displacement pins")
    points = np.vstack((target, pins))
    offsets = np.vstack((source - target, np.zeros_like(pins)))
    # Both axes use the same scale; this is part of the recorded TPS solution.
    field = RBFInterpolator(
        points / image[0], offsets,
        kernel=metadata["kernel"], smoothing=0, degree=1,
    )
    x, y = np.meshgrid(
        (np.arange(width) + 0.5) * image[0] / width,
        (np.arange(height) + 0.5) * image[1] / height,
    )
    displacement = field(np.column_stack((x.ravel(), y.ravel())) / image[0])
    offset_uv = displacement.reshape(height, width, 2) / image
    offset_uv[:, :, 1] *= -1  # Image y increases down; texture v increases up.
    if not np.isfinite(offset_uv).all() or np.any(np.abs(offset_uv) > limits + 1e-12):
        raise ValueError("The fitted field exceeds the declared UV offset limits")

    masks = metadata["confidenceMask"]
    variables = {"x": x, "y": y}
    for key, expression in masks.items():
        if key.endswith("Formula"):
            variables[key[:-7]] = formula_value(expression, variables)
    confidence = np.broadcast_to(formula_value(masks["combine"], variables), x.shape)
    if not np.isfinite(confidence).all() or np.any((confidence < 0) | (confidence > 1)):
        raise ValueError("Confidence formulas must produce finite values in [0, 1]")

    data = np.empty((height, width, 4), dtype=np.uint8)
    data[:, :, :2] = np.clip(np.round(128 + 127 * offset_uv / limits), 1, 255)
    data[:, :, 2] = np.round(confidence * 255)
    data[:, :, 3] = 255
    return data[::-1].copy().tobytes()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, default=DEFAULT_METADATA,
                        help="Registration JSON (default: checked-in v1 metadata)")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT,
                        help="RGBA8 binary to write or compare (default: checked-in v1 grid)")
    parser.add_argument("--check", action="store_true",
                        help="Compare generated bytes and metadata hash without writing")
    args = parser.parse_args()
    try:
        metadata = json.loads(args.metadata.read_text(encoding="utf-8"))
        generated = build_grid(metadata)
        digest = hashlib.sha256(generated).hexdigest()
        if args.check:
            existing = args.output.read_bytes()
            if generated != existing:
                common = min(len(generated), len(existing))
                first = next((i for i in range(common) if generated[i] != existing[i]), common)
                raise ValueError(
                    f"Grid differs at byte {first}: generated {len(generated)} bytes, "
                    f"checked-in asset {len(existing)} bytes"
                )
            if metadata.get("bytes") != len(generated) or metadata.get("sha256") != digest:
                raise ValueError("Generated grid matches the asset but not its metadata length/hash")
            print(f"Satellite registration matches: {len(generated)} bytes; sha256 {digest}")
        else:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_bytes(generated)
            print(f"Wrote {args.output}: {len(generated)} bytes; sha256 {digest}")
        return 0
    except (OSError, ValueError, KeyError, TypeError, SyntaxError) as exc:
        print(f"Satellite registration build failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
