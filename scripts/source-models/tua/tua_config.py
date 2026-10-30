# SPDX-License-Identifier: GPL-2.0-or-later
"""Configuration for the exact, offline TUA source-preservation pipeline."""
import hashlib
import os
from pathlib import Path

WORK = Path(__file__).resolve().parent
SHARED = WORK.parent / 'ukss'
SOURCE = Path(os.environ['TUA_SOURCE_PATH']).expanduser().resolve() if os.environ.get('TUA_SOURCE_PATH') else None
OUT = Path(os.environ['TUA_OUTPUT_DIR']).expanduser().resolve() if os.environ.get('TUA_OUTPUT_DIR') else None
ROOT = OUT
EXPECTED_SOURCE_SHA256 = '304c2317d335a4787d3748fb4e52ae8f537e48e04cf63057e4374f975b6a650e'
EXPECTED_SOURCE_BYTES = 7610880
BLENDER_VERSION = (4, 2, 23)
BLENDER_BUILD_HASH = 'd0cbe84903e8'
IMPORTER_FILES_SHA256 = {
    'import_max.py': '1b786ebe82d2a1c0df273514af449e8b91430672abafde3de4ee634f2432320d',
    '__init__.py': '9c677eabeac264e2cbaa84f3ab5d415822b2ba0210310b12830a1229bc6012fc',
    'blender_manifest.toml': '74fc748701f0126c4da877108b09ae3747f120d10b7986209b7d5eada1651993',
}
SHARED_HELPERS_SHA256 = {
    'secondary_source.py': '140baa4191b9df8620f7cabdd9287389fe10aa6612efeedda0c7984ef97e8fd6',
    'source_scene_transforms.py': 'de202e064740c22d3ce316f8e75b22b8702647b5acc4d11c3425f8fcbb80fe66',
    'repair_primitives.py': '3dd90d404022e268f6a0c49b25a153f751ee62aa43dfa9776343b5591bdb365c',
}


def checksum(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify_source(path):
    path = Path(path)
    if path.stat().st_size != EXPECTED_SOURCE_BYTES or checksum(path) != EXPECTED_SOURCE_SHA256:
        raise ValueError('This converter supports only the documented Transporter_railroad_assambly.MAX SHA256.')


def verify_dependencies():
    for name, expected in IMPORTER_FILES_SHA256.items():
        if checksum(SHARED / 'io_scene_max' / name) != expected:
            raise ValueError(f'Pinned importer file {name} has changed.')
    for name, expected in SHARED_HELPERS_SHA256.items():
        if checksum(SHARED / name) != expected:
            raise ValueError(f'Audited shared helper {name} has changed; review before updating its hash.')


def require_paths(source=True):
    if OUT is None or (source and SOURCE is None):
        raise RuntimeError('Run convert.py with --output and, for conversion, --source.')
