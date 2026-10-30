#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Create a deterministic portable source archive with one shared importer copy."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import sys
import tarfile

sys.dont_write_bytecode = True
from tua_config import WORK, SHARED, verify_dependencies

TUA_FILES = [
    'README.md', 'source-summary.json', 'convert.py', 'bundle.py',
    'tua_config.py', 'shared_helpers.py', 'blender_entry.py', 'inventory_max.py',
    'source_scene.py', 'tua_transforms.py', 'import_tua.py',
    'tua_geometry_common.py', 'audit_tua_geometry.py',
    'recover_tua_primitives.py', 'recover_tua_modifiers.py', 'recover_tua.py',
    'validate_tua_glb.py',
]
SHARED_FILES = [
    'secondary_source.py', 'source_scene_transforms.py', 'repair_primitives.py',
    'addon-origin.json', 'blender-origin.json', 'io_scene_max/__init__.py',
    'io_scene_max/import_max.py', 'io_scene_max/blender_manifest.toml',
    'io_scene_max/COPYING-GPL-2.txt',
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    verify_dependencies()
    files = {}
    for folder, root, names in [('tua', WORK, TUA_FILES), ('ukss', SHARED, SHARED_FILES)]:
        for name in names:
            path = root / name
            if path.stat().st_size > 300000:
                raise RuntimeError(f'Refusing large non-code payload: {folder}/{name}.')
            files[f'tua-converter/{folder}/{name}'] = path.read_bytes()
    guide = WORK.parent / 'docs/tua-source-model.md'
    if not guide.is_file() and len(WORK.parents) > 2:
        guide = WORK.parents[2] / 'docs/tua-source-model.md'
    if not guide.is_file():
        raise RuntimeError('The full TUA source-model guide is missing.')
    files['tua-converter/docs/tua-source-model.md'] = guide.read_bytes().replace(
        b'../scripts/source-models/', b'../')
    files['tua-converter/tua/README.md'] = files['tua-converter/tua/README.md'].replace(
        b'../../../docs/tua-source-model.md', b'../docs/tua-source-model.md')
    manifest = {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                for name, data in sorted(files.items())}
    files['tua-converter/bundle-manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    target = args.output.expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('wb') as stream:
        with gzip.GzipFile(filename='', fileobj=stream, mode='wb', mtime=0, compresslevel=9) as compressed:
            with tarfile.open(fileobj=compressed, mode='w', format=tarfile.PAX_FORMAT) as archive:
                for name, data in sorted(files.items()):
                    entry = tarfile.TarInfo(name)
                    entry.size = len(data)
                    entry.mode = 0o644
                    entry.mtime = 0
                    entry.uid = entry.gid = 0
                    entry.uname = entry.gname = ''
                    archive.addfile(entry, io.BytesIO(data))
    print(json.dumps({'archive': str(target), 'files': len(files), 'bytes': target.stat().st_size,
                      'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}, indent=2))


if __name__ == '__main__':
    main()
