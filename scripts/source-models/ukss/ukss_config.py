# SPDX-License-Identifier: GPL-2.0-or-later
"""Shared configuration for the source-specific, offline UKSS converter."""
import hashlib
import os
from pathlib import Path

WORK = Path(__file__).resolve().parent
SOURCE = Path(os.environ['UKSS_SOURCE_PATH']).expanduser().resolve() if os.environ.get('UKSS_SOURCE_PATH') else None
OUT = Path(os.environ['UKSS_OUTPUT_DIR']).expanduser().resolve() if os.environ.get('UKSS_OUTPUT_DIR') else None
ROOT = OUT
EXPECTED_SOURCE_SHA256 = '2e51706e5267564fba9fd6d90262a2fb67f3d84ccfd7c3a002b23895fc704ebb'
EXPECTED_SOURCE_BYTES = 53088256
BLENDER_VERSION = (4, 2, 23)
BLENDER_BUILD_HASH = 'd0cbe84903e8'
IMPORTER_SHA256 = '1b786ebe82d2a1c0df273514af449e8b91430672abafde3de4ee634f2432320d'

def checksum(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def verify_source(path):
    path = Path(path)
    if path.stat().st_size != EXPECTED_SOURCE_BYTES or checksum(path) != EXPECTED_SOURCE_SHA256:
        raise ValueError('This recovery pipeline supports only the documented ukss_scaled.max SHA256.')

IMPORTER_FILES_SHA256 = {'import_max.py': '1b786ebe82d2a1c0df273514af449e8b91430672abafde3de4ee634f2432320d', '__init__.py': '9c677eabeac264e2cbaa84f3ab5d415822b2ba0210310b12830a1229bc6012fc', 'blender_manifest.toml': '74fc748701f0126c4da877108b09ae3747f120d10b7986209b7d5eada1651993'}

def verify_importer():
    for name, expected in IMPORTER_FILES_SHA256.items():
        if checksum(WORK/'io_scene_max'/name) != expected:
            raise ValueError(f'Vendored importer file {name} differs from its inspected, pinned revision.')

def require_paths(source=True):
    if OUT is None or (source and SOURCE is None):
        raise RuntimeError('Run convert.py with --output and, for conversion, --source.')
