# SPDX-License-Identifier: GPL-2.0-or-later
"""TUA source index with shared read-only MAX chunk/PRS/material helpers."""
import ast
from functools import lru_cache
import json
import math
from pathlib import Path
import struct
import numpy as np
from tua_config import ROOT, WORK
from shared_helpers import load_symbols

_shared = load_symbols('secondary_source.py', ('quaternion_matrix', 'SourceScene'), globals())


class SourceScene(_shared['SourceScene']):
    def __init__(self):
        import contextlib
        import io
        import runpy
        with contextlib.redirect_stdout(io.StringIO()):
            namespace = runpy.run_path(str(WORK / 'inventory_max.py'))
        self.data = namespace['data']
        self.items = namespace['items']
        self.children = lambda a, b: namespace['children'](self.data, a, b)
        self.class_name = namespace['name_of']
        self.nodes_by_index = {node['sceneIndex']: node for node in namespace['nodes']}
        self.nodes_by_name = {}
        for node in self.nodes_by_index.values():
            self.nodes_by_name.setdefault(node['name'], []).append(node)
