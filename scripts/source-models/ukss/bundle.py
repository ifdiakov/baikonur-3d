#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Create a deterministic source-only archive; models and reports are excluded."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile

PACKAGE_FILES = [
    'README.md', 'addon-origin.json', 'blender-origin.json', 'source-summary.json',
    'convert.py', 'bundle.py', 'blender_entry.py', 'ukss_config.py',
    'index_max_nodes.py', 'audit_modifiers.py', 'audit_visibility.py',
    'import_ukss_fast.py', 'secondary_source.py', 'source_scene_transforms.py',
    'repair_primitives.py', 'repair_lattice.py', 'repair_secondary.py',
    'recover_ukss.py', 'validate_recovered_glb.py',
    'io_scene_max/__init__.py', 'io_scene_max/import_max.py',
    'io_scene_max/blender_manifest.toml', 'io_scene_max/COPYING-GPL-2.txt',
]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    files = {}
    for name in PACKAGE_FILES:
        path = root/name
        if path.stat().st_size > 300000:
            raise RuntimeError(f'Refusing large non-code payload: {path.name}')
        files['ukss-converter/'+name] = path.read_bytes()
    guide = root/'docs/ukss-source-model.md'
    if not guide.is_file() and len(root.parents)>2:
        guide = root.parents[2]/'docs/ukss-source-model.md'
    if not guide.is_file():
        raise RuntimeError('The full source model guide is missing.')
    files['ukss-converter/docs/ukss-source-model.md'] = guide.read_bytes().replace(
        b'../scripts/source-models/ukss/', b'../')
    files['ukss-converter/README.md'] = files['ukss-converter/README.md'].replace(
        b'../../../docs/ukss-source-model.md', b'docs/ukss-source-model.md')
    manifest = {name:{'bytes':len(data), 'sha256':hashlib.sha256(data).hexdigest()}
                for name,data in sorted(files.items())}
    files['ukss-converter/bundle-manifest.json'] = (json.dumps(manifest,indent=2)+'\n').encode()
    target = args.output.expanduser().resolve()
    target.parent.mkdir(parents=True,exist_ok=True)
    with target.open('wb') as stream:
        with gzip.GzipFile(filename='',fileobj=stream,mode='wb',mtime=0,compresslevel=9) as compressed:
            with tarfile.open(fileobj=compressed,mode='w',format=tarfile.PAX_FORMAT) as archive:
                for name,data in sorted(files.items()):
                    entry = tarfile.TarInfo(name)
                    entry.size = len(data)
                    entry.mode = 0o644
                    entry.mtime = 0
                    entry.uid = entry.gid = 0
                    entry.uname = entry.gname = ''
                    archive.addfile(entry,io.BytesIO(data))
    print(json.dumps({'archive':str(target),'files':len(files),'bytes':target.stat().st_size,
                      'sha256':hashlib.sha256(target.read_bytes()).hexdigest()},indent=2))

if __name__ == '__main__':
    main()
