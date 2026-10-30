# SPDX-License-Identifier: GPL-2.0-or-later
"""Shared exact source-ID transforms bound to TUA's collision-safe node index."""
import json
import numpy as np
from source_scene import SourceScene, ROOT
from shared_helpers import load_symbols

_source = None


def get_source():
    global _source
    if _source is None:
        _source = SourceScene()
    return _source


globals().update(load_symbols('source_scene_transforms.py', (
    'source_pivot_matrix', 'source_local_matrix', 'source_world_matrix',
    'objects_by_source_index', 'source_materials', '_install_source_transform',
    'bind_source_object',
), globals()))
