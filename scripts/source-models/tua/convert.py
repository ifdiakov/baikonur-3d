#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Recover the documented TUA MAX with pinned local Blender and shared importer.

Downloads nothing, never executes scene scripts, and writes every generated
model, checkpoint and per-node report to the explicit output directory.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

sys.dont_write_bytecode = True
from tua_config import EXPECTED_SOURCE_SHA256, WORK, verify_dependencies, verify_source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='The exact original MAX; basename may differ.')
    parser.add_argument('--output', required=True, type=Path, help='Private destination for all generated files.')
    parser.add_argument('--blender', required=True, type=Path, help='Official Blender 4.2.23 LTS executable, build d0cbe84903e8.')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--reuse-checkpoint', action='store_true', help='Reuse tua_import_base.blend and matching tua_import_report.json in --output.')
    mode.add_argument('--validate-only', action='store_true', help='Validate existing raw GLB and manifest without a MAX or re-import.')
    args = parser.parse_args()
    if sys.version_info < (3, 11):
        parser.error('Python 3.11 or newer is required. NumPy is provided by Blender.')
    output = args.output.expanduser().resolve()
    blender = args.blender.expanduser().resolve()
    if not blender.is_file():
        parser.error('--blender must name an installed executable.')
    if output.is_relative_to(WORK.parent):
        parser.error('Keep generated models outside scripts/source-models/.')
    if args.source is None and not args.validate_only:
        parser.error('--source is required unless --validate-only is selected.')
    verify_dependencies()
    environment = os.environ.copy()
    environment['TUA_OUTPUT_DIR'] = str(output)
    environment['PYTHONDONTWRITEBYTECODE'] = '1'
    if args.source is not None:
        source = args.source.expanduser().resolve()
        verify_source(source)
        environment['TUA_SOURCE_PATH'] = str(source)
    else:
        environment.pop('TUA_SOURCE_PATH', None)
    output.mkdir(parents=True, exist_ok=True)

    def run(stage, blender_stage=False):
        log = output / (stage + '.log')
        command = ([str(blender), '--background', '--factory-startup', '--disable-autoexec',
                    '--threads', '4', '--python-exit-code', '1', '--python',
                    str(WORK / 'blender_entry.py'), '--', stage] if blender_stage else
                   [sys.executable, str(WORK / (stage + '.py'))])
        print(f'Running {stage}; log: {log.name}', flush=True)
        started = time.monotonic()
        with log.open('w', encoding='utf-8') as stream:
            result = subprocess.run(command, env=environment, stdout=stream,
                                    stderr=subprocess.STDOUT, check=False)
        if result.returncode:
            raise RuntimeError(f'{stage} failed with exit code {result.returncode}; inspect {log}.')
        print(f'Finished {stage} in {time.monotonic() - started:.2f}s', flush=True)

    if not args.validate_only:
        if args.reuse_checkpoint:
            checkpoint = output / 'tua_import_base.blend'
            report_path = output / 'tua_import_report.json'
            if not checkpoint.is_file() or not report_path.is_file():
                parser.error('--reuse-checkpoint requires the baseline .blend and import report in --output.')
            report = json.loads(report_path.read_text())
            if report.get('source', {}).get('sha256') != EXPECTED_SOURCE_SHA256 or report.get('fatalError'):
                parser.error('Checkpoint source differs or its import report records a failure.')
        run('inventory_max')
        if not args.reuse_checkpoint:
            run('import_tua', blender_stage=True)
        run('audit_tua_geometry', blender_stage=True)
        run('recover_tua', blender_stage=True)
    run('validate_tua_glb', blender_stage=True)
    result = json.loads((output / 'tua_glb_validation.json').read_text())
    print(json.dumps({'status': result['status'], 'sourceNodes': result['sourceNodeCount'],
                      'triangles': result['triangles'], 'rawGlbSha256': result['glbSha256'],
                      'output': str(output)}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print(f'TUA conversion failed: {error}', file=sys.stderr)
        sys.exit(1)
