# SPDX-License-Identifier: GPL-2.0-or-later
"""Local-only audited MAX import and evidence export; no source modifications."""
import collections
import hashlib
import json
import math
import os
from pathlib import Path, PureWindowsPath
import struct
import sys
import time
import traceback

import bpy
from mathutils import Matrix, Vector

from ukss_config import WORK, OUT, SOURCE, EXPECTED_SOURCE_SHA256
EXPECTED = EXPECTED_SOURCE_SHA256
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED
sys.path.insert(0, str(WORK))
from io_scene_max import import_max as im

report = {'source': {'path': str(SOURCE), 'bytes': SOURCE.stat().st_size, 'sha256': EXPECTED},
          'blender': bpy.app.version_string,
          'importer': json.loads((WORK / 'addon-origin.json').read_text()),
          'settings': {'scale_objects': 1.0, 'apply_matrix': True, 'image_search': False, 'primitive_mode': 'deferred source-parameter data API',
                       'axis_forward': 'Y', 'axis_up': 'Z'},
          'nodes': [], 'textureReferences': [], 'fatalError': None}


def property_value(stream, offset):
    kind = struct.unpack_from('<I', stream, offset)[0]
    pos = offset + 4
    if kind == 30:
        length = struct.unpack_from('<I', stream, pos)[0]
        return stream[pos+4:pos+4+length].rstrip(b'\0').decode('cp1252', 'replace')
    if kind == 31:
        length = struct.unpack_from('<I', stream, pos)[0]
        return stream[pos+4:pos+4+length*2].decode('utf-16le', 'replace').rstrip('\0')
    if kind in (2, 3, 19):
        return struct.unpack_from('<i', stream, pos)[0]
    if kind == 64:
        return {'filetime': struct.unpack_from('<Q', stream, pos)[0]}
    if kind == 71:
        length = struct.unpack_from('<I', stream, pos)[0]
        clip = stream[pos+4:pos+4+length]
        clipboard_format = struct.unpack_from('<I', clip, 0)[0]
        payload = clip[4:]
        item = {'clipboardFormat': clipboard_format, 'bytes': len(payload), 'headHex': payload[:40].hex()}
        # A SummaryInformation thumbnail is normally a CF_DIB bitmap.
        if clipboard_format == 8 and len(payload) >= 40:
            dib_size = struct.unpack_from('<I', payload)[0]
            bpp = struct.unpack_from('<H', payload, 14)[0]
            colors_used = struct.unpack_from('<I', payload, 32)[0]
            palette_size = (colors_used or (1 << bpp if bpp <= 8 else 0)) * 4
            offset_bits = 14 + dib_size + palette_size
            bmp = struct.pack('<2sIHHI', b'BM', 14+len(payload), 0, 0, offset_bits) + payload
            filename = OUT / 'ukss_source_thumbnail.bmp'
            filename.write_bytes(bmp)
            item['file'] = str(filename)
        elif payload.startswith(b'\xff\xd8'):
            filename = OUT / 'ukss_source_thumbnail.jpg'; filename.write_bytes(payload); item['file'] = str(filename)
        elif payload.startswith(b'\x89PNG'):
            filename = OUT / 'ukss_source_thumbnail.png'; filename.write_bytes(payload); item['file'] = str(filename)
        return item
    return {'variantType': kind}


with im.ImportMaxFile(str(SOURCE)) as compound:
    entries = [entry for entry in compound.direntries if entry]
    report['oleStreams'] = [{'name': e.name, 'size': e.size, 'type': e.entry_type} for e in entries]
    report['summaryInformation'] = {}
    for entry in entries:
        if 'SummaryInformation' not in entry.name:
            continue
        stream = compound.openstream(entry.name).read()
        properties = {}
        try:
            sections = struct.unpack_from('<I', stream, 24)[0]
            for section_index in range(sections):
                section = struct.unpack_from('<I', stream, 44+20*section_index)[0]
                count = struct.unpack_from('<I', stream, section+4)[0]
                for index in range(count):
                    prop_id, offset = struct.unpack_from('<II', stream, section+8+index*8)
                    properties[str(prop_id)] = property_value(stream, section+offset)
        except Exception as error:
            properties['parseError'] = repr(error)
        report['summaryInformation'][entry.name] = properties

# Resolve linked textures only within the local source folder. The source is
# a single MAX file; missing images are recorded, not replaced or downloaded.
original_load_image = im.load_image
def local_image(filepath, dirname, **kwargs):
    basename = PureWindowsPath(str(filepath)).name
    candidates = [SOURCE.parent / basename, SOURCE.parent / str(filepath)]
    found = next((p for p in candidates if p.resolve().is_relative_to(SOURCE.parent) and p.is_file()), None)
    record = {'sourcePath': str(filepath), 'basename': basename, 'found': bool(found)}
    if record not in report['textureReferences']:
        report['textureReferences'].append(record)
    return original_load_image(str(found), str(SOURCE.parent), **kwargs) if found else None
im.load_image = local_image

original_create_object = im.create_object
def audited_create_object(context, settings, node, transform):
    entry = {'name': im.get_node_name(node), 'nodeClass': im.get_cls_name(node)}
    try:
        prs, mesh, material, layer = im.get_matrix_mesh_material(node)
        entry.update({'meshClass': im.get_cls_name(mesh) if mesh else None,
                      'meshGuid': hex(im.get_guid(mesh)) if mesh else None,
                      'transformClass': im.get_cls_name(prs) if prs else None,
                      'materialClass': im.get_cls_name(material) if material else None})
        name, objects = original_create_object(context, settings, node, transform)
        entry['createdObjects'] = [o.name for o in objects]
        entry['status'] = 'imported' if objects else 'skipped'
        return name, objects
    except Exception as error:
        entry['status'] = 'error'; entry['error'] = repr(error)
        raise
    finally:
        report['nodes'].append(entry)
        if len(report['nodes']) % 500 == 0: print('IMPORTED_NODE_PROGRESS',len(report['nodes']),flush=True)
im.create_object = audited_create_object

bpy.ops.wm.read_factory_settings(use_empty=True)
started = time.monotonic()
try:
    im.read(bpy.context, str(SOURCE), Matrix.Identity(4),
            obtypes={'MATERIAL', 'UV', 'EMPTY', 'ARMATURE'}, search=False, transform=True)
except Exception:
    report['fatalError'] = traceback.format_exc()
    print(report['fatalError'], flush=True)
bpy.context.view_layer.update()
report['importSeconds'] = time.monotonic()-started

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
points = [o.matrix_world @ Vector(corner) for o in meshes for corner in o.bound_box]
if points:
    lower = [min(p[i] for p in points) for i in range(3)]
    upper = [max(p[i] for p in points) for i in range(3)]
    report['bounds'] = {'min': lower, 'max': upper, 'size': [b-a for a,b in zip(lower,upper)],
                        'center': [(a+b)/2 for a,b in zip(lower,upper)], 'units': 'source units; not converted to metres'}
report['sceneUnits'] = {'system': bpy.context.scene.unit_settings.system, 'scaleLength': bpy.context.scene.unit_settings.scale_length}
report['objects'] = []
for o in bpy.data.objects:
    item = {'name': o.name, 'type': o.type, 'parent': o.parent.name if o.parent else None,
            'location': list(o.location), 'scale': list(o.scale),
            'matrixWorld': [list(row) for row in o.matrix_world], 'dimensions': list(o.dimensions)}
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        item.update({'vertices': len(o.data.vertices), 'polygons': len(o.data.polygons),
                     'triangles': len(o.data.loop_triangles), 'uvLayers': len(o.data.uv_layers),
                     'materials': [m.name if m else None for m in o.data.materials]})
    report['objects'].append(item)
report['materials'] = [{'name': m.name, 'baseColor': list(m.diffuse_color), 'roughness': m.roughness,
                        'metallic': m.metallic, 'nodes': m.use_nodes} for m in bpy.data.materials]
report['images'] = [{'name': i.name, 'path': i.filepath, 'size': list(i.size)} for i in bpy.data.images]
report['counts'] = {'objects': len(bpy.data.objects), 'meshObjects': len(meshes), 'meshDatablocks': len(bpy.data.meshes),
                    'vertices': sum(len(o.data.vertices) for o in meshes),
                    'polygons': sum(len(o.data.polygons) for o in meshes),
                    'triangles': sum(len(o.data.loop_triangles) for o in meshes),
                    'materials': len(bpy.data.materials), 'images': len(bpy.data.images),
                    'sourceNodeStatuses': dict(collections.Counter(n['status'] for n in report['nodes'])),
                    'sourceMeshClasses': dict(collections.Counter(n.get('meshClass') for n in report['nodes']))}

(OUT / 'ukss_import_fast_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('IMPORT_COUNTS', json.dumps(report['counts']), flush=True)
print('IMPORT_BOUNDS', json.dumps(report.get('bounds')), flush=True)

if report['fatalError']:
    raise RuntimeError('The source import failed; see ukss_import_fast_report.json')
if meshes:
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'ukss_import_fast_base.blend'))
    print('FAST_BASE_CHECKPOINT_SAVED',flush=True)
else:
    raise RuntimeError('No mesh geometry recovered; see ukss_import_fast_report.json')
