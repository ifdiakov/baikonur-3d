#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Recover the documented UKSS MAX source using the pinned local Blender.

This program downloads nothing and does not execute code from the scene.
All generated models, logs and per-node reports go to the explicit output dir.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

sys.dont_write_bytecode = True
from ukss_config import EXPECTED_SOURCE_SHA256, WORK, verify_importer, verify_source

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='The exact original ukss_scaled.max; required for conversion.')
    parser.add_argument('--output', type=Path, required=True, help='Private output directory for models, checkpoints, reports and logs.')
    parser.add_argument('--blender', type=Path, required=True, help='Official Blender 4.2.23 LTS executable (build d0cbe84903e8).')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--reuse-checkpoint', action='store_true', help='Reuse ukss_import_fast_base.blend and its matching report in --output.')
    mode.add_argument('--validate-only', action='store_true', help='Validate the existing raw GLB and manifest; no source file or import required.')
    args = parser.parse_args()
    if sys.version_info < (3,11):
        parser.error('Python 3.11 or newer is required; conversion uses NumPy bundled with Blender.')
    output = args.output.expanduser().resolve()
    blender = args.blender.expanduser().resolve()
    if not blender.is_file():
        parser.error('--blender must name an installed executable, not its directory.')
    if output.is_relative_to(WORK):
        parser.error('Keep generated model files outside the converter source directory.')
    if not args.validate_only and args.source is None:
        parser.error('--source is required unless --validate-only is selected.')
    verify_importer()
    environment = os.environ.copy()
    environment['UKSS_OUTPUT_DIR'] = str(output)
    environment['PYTHONDONTWRITEBYTECODE'] = '1'
    environment.pop('UKSS_RECOVERY_PREFIX', None)
    if args.source is not None:
        source = args.source.expanduser().resolve()
        verify_source(source)
        environment['UKSS_SOURCE_PATH'] = str(source)
    else:
        environment.pop('UKSS_SOURCE_PATH', None)
    output.mkdir(parents=True, exist_ok=True)

    def run(step, blender_stage=False):
        log = output/(step+'.log')
        if blender_stage:
            command = [str(blender), '--background', '--factory-startup', '--disable-autoexec',
                       '--threads', '4', '--python-exit-code', '1', '--python', str(WORK/'blender_entry.py'), '--', step]
        else:
            command = [sys.executable, str(WORK/(step+'.py'))]
        print(f'Running {step}; log: {log.name}', flush=True)
        start = time.monotonic()
        with log.open('w', encoding='utf-8') as stream:
            result = subprocess.run(command, env=environment, stdout=stream, stderr=subprocess.STDOUT, check=False)
        if result.returncode:
            raise RuntimeError(f'{step} failed with exit code {result.returncode}; inspect {log}.')
        print(f'Finished {step} in {time.monotonic()-start:.2f}s', flush=True)

    if not args.validate_only:
        if args.reuse_checkpoint:
            checkpoint = output/'ukss_import_fast_base.blend'
            report = output/'ukss_import_fast_report.json'
            if not checkpoint.is_file() or not report.is_file():
                parser.error('--reuse-checkpoint requires both the baseline .blend and import report in --output.')
            imported = json.loads(report.read_text())
            if imported.get('source',{}).get('sha256') != EXPECTED_SOURCE_SHA256 or imported.get('fatalError'):
                parser.error('The checkpoint import report has a different source or a recorded import failure.')
        run('index_max_nodes')
        run('audit_modifiers')
        run('audit_visibility')
        if not args.reuse_checkpoint:
            run('import_ukss_fast', blender_stage=True)
        run('recover_ukss', blender_stage=True)
    run('validate_recovered_glb', blender_stage=True)
    validation = json.loads((output/'ukss_glb_validation.json').read_text())
    print(json.dumps({'status':validation['status'], 'sourceNodes':validation['sourceNodeCount'],
                      'triangles':validation['triangles'], 'rawGlbSha256':validation['glbSha256'],
                      'output':str(output)}, indent=2))

if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print(f'UKSS conversion failed: {error}', file=sys.stderr)
        sys.exit(1)
