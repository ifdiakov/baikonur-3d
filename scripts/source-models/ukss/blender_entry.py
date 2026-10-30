# SPDX-License-Identifier: GPL-2.0-or-later
"""Internal entry point; only the three named local stages can be executed."""
from pathlib import Path
import runpy
import sys

import bpy

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ukss_config import BLENDER_BUILD_HASH, BLENDER_VERSION, WORK, require_paths, verify_importer

if bpy.app.version != BLENDER_VERSION or bpy.app.build_hash.decode('ascii') != BLENDER_BUILD_HASH:
    raise RuntimeError('Use the pinned official Blender 4.2.23 LTS build d0cbe84903e8.')
arguments = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if len(arguments) != 1 or arguments[0] not in {'import_ukss_fast', 'recover_ukss', 'validate_recovered_glb'}:
    raise RuntimeError('Unknown conversion stage.')
require_paths(source=arguments[0] != 'validate_recovered_glb')
verify_importer()
runpy.run_path(str(WORK/(arguments[0]+'.py')), run_name='__main__')
