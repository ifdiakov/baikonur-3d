# SPDX-License-Identifier: GPL-2.0-or-later
"""Reuse reviewed generic declarations without executing UKSS pipeline stages.

The selected helpers are maintained once, in the sibling UKSS source folder.
Their exact file hashes are checked before evaluation. Only requested function
or class declarations are compiled; no module-level calls or imports execute.
The TUA SourceScene overrides the source-specific UKSS constructor.
"""
import ast
from tua_config import SHARED, SHARED_HELPERS_SHA256, checksum


def load_symbols(filename, names, namespace):
    if filename not in SHARED_HELPERS_SHA256:
        raise ValueError('Unapproved shared helper.')
    path = SHARED / filename
    if checksum(path) != SHARED_HELPERS_SHA256[filename]:
        raise ValueError(f'Shared helper {filename} differs from the audited revision.')
    declarations = [node for node in ast.parse(path.read_text()).body
                    if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names]
    if {node.name for node in declarations} != set(names):
        raise ValueError(f'Missing reviewed declaration in {filename}.')
    target = dict(namespace)
    exec(compile(ast.Module(body=declarations, type_ignores=[]),
                 f'<reviewed_shared_{filename}>', 'exec'), target)
    return {name: target[name] for name in names}
