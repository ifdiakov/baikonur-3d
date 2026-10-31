#!/usr/bin/env python3
"""Recover the user's bCAD 3.5 rocket meshes without executing source content.

The reader accepts the length-delimited BDF subset actually present in the five
reviewed source files. All coordinates are baked by bCAD; CONTAINER holds an
object list, not a transform. Source meshes, grid closure, smoothing groups,
embedded colour maps and source-layer attribution survive recovery. Reflection
and bump maps are not misinterpreted as diffuse imagery. Camera, light and CAD
annotation records are intentionally not renderable rocket geometry.
"""
import argparse
import collections
import hashlib
import io
import json
import math
from pathlib import Path
import struct

import numpy as np
from PIL import Image


def varint(data, offset):
    value = shift = 0
    while True:
        if offset >= len(data) or shift > 63:
            raise ValueError('Invalid BDF integer')
        byte = data[offset]
        offset += 1
        value |= (byte & 127) << shift
        if not byte & 128:
            return value, offset
        shift += 7


def chunks(data, start=0, end=None):
    end = len(data) if end is None else end
    result = []
    while start < end:
        tag, cursor = varint(data, start)
        size = struct.unpack_from('<I', data, cursor)[0]
        cursor += 4
        if cursor + size > end:
            raise ValueError('BDF chunk exceeds its parent')
        result.append((tag, memoryview(data)[cursor:cursor+size]))
        start = cursor + size
    if start != end:
        raise ValueError('BDF chunk boundary mismatch')
    return result


def string(data):
    size, offset = varint(data, 0)
    if offset+size != len(data):
        raise ValueError('Unexpected BDF string length')
    return bytes(data[offset:]).decode('cp1251')


def first(records, tag, default=None):
    return next((data for kind, data in records if kind == tag), default)


def array(data, width):
    count, offset = varint(data, 0)
    if len(data)-offset != count*width*4:
        raise ValueError('Unexpected BDF array size')
    return np.frombuffer(data[offset:], dtype='<f4').reshape(count, width).copy()


def geometry(data):
    """Yield source positions, triangles, smoothing groups and optional UVs."""
    for kind, surface in chunks(data):
        if kind == 51:
            fields = chunks(surface)
            positions = array(first(fields, 0), 3)
            raw = first(fields, 4)
            count, offset = varint(raw, 0)
            faces = np.empty((count, 3), dtype=np.uint32)
            smoothing = np.empty(count, dtype=np.uint32)
            for i in range(count):
                for k in range(3):
                    faces[i, k], offset = varint(raw, offset)
                smoothing[i], offset = varint(raw, offset)
                _, offset = varint(raw, offset)  # edge/visibility flags
            if offset != len(raw) or (count and faces.max() >= len(positions)):
                raise ValueError('Invalid BDF triangle indices')
            uv_data = first(fields, 3)
            uv = array(uv_data, 2) if uv_data is not None else None
            if uv is not None and len(uv) != len(positions):
                raise ValueError('BDF UV count differs from vertex count')
            yield positions, faces, smoothing, uv
        elif kind == 52:
            m, offset = varint(surface, 0)
            n, offset = varint(surface, offset)
            flags, offset = varint(surface, offset)
            if flags & ~3:
                raise ValueError('Unknown BDF grid closure flags')
            fields = chunks(surface, offset)
            positions = array(first(fields, 0), 3)
            rows, columns = m + (not flags & 1), n + (not flags & 2)
            if len(positions) != rows*columns:
                raise ValueError('BDF grid dimensions differ from vertex count')
            faces = np.empty((2*m*n, 3), dtype=np.uint32)
            for r in range(m):
                for c in range(n):
                    # bCAD stores the first/profile dimension contiguously.
                    # On a surface of revolution each next block is a rotated
                    # copy of that entire profile, not an azimuthal ring.
                    a, b = c*rows+r, c*rows+(r+1) % rows
                    d, e = ((c+1) % columns)*rows+r, ((c+1) % columns)*rows+(r+1) % rows
                    faces[2*(r*n+c):2*(r*n+c)+2] = [[a, b, e], [a, e, d]]
            uv_data = first(fields, 3)
            yield positions, faces, np.ones(len(faces), dtype=np.uint32), array(uv_data, 2) if uv_data is not None else None
        else:
            raise ValueError('Unreviewed BDF mesh surface '+str(kind))


class Bdf:
    def __init__(self, path):
        self.path = Path(path)
        self.bytes = self.path.read_bytes()
        self.sha256 = hashlib.sha256(self.bytes).hexdigest()
        root = chunks(self.bytes, 12)
        if len(root) != 1 or root[0][0] != 1024:
            raise ValueError('Not a reviewed bCAD 3.5 scene')
        self.root = chunks(root[0][1])
        self.images = {}
        for kind, value in self.root:
            if kind != 126:
                continue
            fields = chunks(value)
            if string(first(fields, 127)) != 'MATRPMMF':
                continue
            data_fields = [d for t, d in fields if t == 0]
            if len(data_fields) != 2:
                raise ValueError('Unexpected embedded bCAD image')
            _, offset = varint(data_fields[0], 0)
            name = string(first(chunks(data_fields[0], offset), 1024))
            raw = data_fields[1]
            version, offset = varint(raw, 0)
            size, offset = varint(raw, offset)
            offset += size  # original filename is metadata, never a fetch path
            size, offset = varint(raw, offset)
            if version not in (1, 2) or offset+size != len(raw):
                raise ValueError('Invalid embedded image boundary')
            image = Image.open(io.BytesIO(raw[offset:])).convert('RGB')
            # Museum maps need inscriptions and thermal-tile layout, not large
            # hidden environment maps. Preserve source aspect ratio and colours.
            image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            encoded = io.BytesIO()
            image.save(encoded, format='JPEG', quality=90, optimize=True)
            self.images[name.lower()] = {'name': name, 'bytes': encoded.getvalue(), 'size': list(image.size)}

    def layers(self):
        return [string(first(chunks(value), 1024)) for kind, value in self.root if kind == 17]

    def meshes(self):
        def walk(records, layer):
            for kind, value in records:
                if kind == 16:
                    yield from walk(chunks(value), layer)
                elif kind in (6, 17, 126):
                    fields = chunks(value)
                    type_data = first(fields, 127)
                    if type_data is None:
                        continue
                    object_type = string(type_data)
                    if object_type == 'LAYER':
                        yield from walk(fields, string(first(fields, 1024)))
                    elif object_type == 'CONTAINER':
                        yield from walk(fields, layer)
                    elif object_type == 'MESH3':
                        yield layer, string(first(fields, 119)), fields
        yield from walk(self.root, 'default')


def read_material(fields):
    source = first(fields, 1027)
    if source is None:
        return {'color': [.7, .7, .7], 'texture': None}
    properties = chunks(source)
    rgb = first(properties, 1026)
    color = np.frombuffer(rgb[:24], dtype='<f8').tolist() if rgb is not None else [.7]*3
    if not all(math.isfinite(v) and 0 <= v <= 1.0001 for v in color):
        raise ValueError('Invalid BDF material colour')
    result = {'color': color, 'texture': None}
    slot = first(properties, 1027)
    if slot is not None:
        values = chunks(slot)
        filename = first(values, 1037)
        if filename is not None:
            name = string(filename)
            if name:
                matrices = first(values, 1025)
                if matrices is None or len(matrices) != 192:
                    raise ValueError('Unsupported BDF texture transform')
                result.update(texture=name, matrix=np.frombuffer(matrices, '<f8').reshape(2, 4, 3)[1].copy(),
                              settings=list(first(values, 1029)), projection=bytes(first(values, 1031)))
    return result


def normals_and_groups(positions, faces, smoothing, uv):
    # bCAD smoothing masks are retained at their source boundaries. A mask of
    # zero is a hard face. No welding across separately authored assemblies.
    corner_groups = np.repeat(smoothing.astype(np.int64), 3)
    hard = corner_groups == 0
    corner_groups[hard] = -np.repeat(np.arange(len(faces))+1, 3)[hard]
    keys = np.column_stack((faces.ravel(), corner_groups))
    unique, inverse = np.unique(keys, axis=0, return_inverse=True)
    out_positions = positions[unique[:, 0]]
    out_faces = inverse.reshape(-1, 3).astype(np.uint32)
    cross = np.cross(positions[faces[:, 1]]-positions[faces[:, 0]], positions[faces[:, 2]]-positions[faces[:, 0]])
    out_normals = np.zeros_like(out_positions)
    for i in range(3):
        np.add.at(out_normals, out_faces[:, i], cross)
    lengths = np.linalg.norm(out_normals, axis=1)
    out_normals /= np.where(lengths > 1e-20, lengths, 1)[:, None]
    return out_positions, out_faces, out_normals, uv[unique[:, 0]] if uv is not None else None


def material_uv(material, positions, uv):
    if not material.get('texture'):
        return None
    if uv is not None:
        result = uv.copy()
        result[:, 1] *= -1  # bCAD stores image-down V as a negative coordinate.
        return result
    matrix = material['matrix']
    projected = positions @ matrix[:3] + matrix[3]
    # The legacy planar texture frame has its origin at the image centre.
    return np.column_stack((projected[:, 0]+.5, .5-projected[:, 1])).astype(np.float32)


class Glb:
    def __init__(self, title):
        self.data = bytearray()
        self.json = {'asset': {'version': '2.0', 'generator': 'bCAD source recovery / Baikonur museum'},
                     'scene': 0, 'scenes': [{'name': title, 'nodes': []}], 'nodes': [], 'meshes': [],
                     'materials': [], 'textures': [], 'images': [], 'samplers': [{'wrapS': 10497, 'wrapT': 10497}],
                     'accessors': [], 'bufferViews': [], 'buffers': []}
        self.texture_indices = {}
        self.material_indices = {}

    def buffer_view(self, data, target=None):
        self.data.extend(b'\0' * (-len(self.data) % 4))
        view = {'buffer': 0, 'byteOffset': len(self.data), 'byteLength': len(data)}
        if target:
            view['target'] = target
        index = len(self.json['bufferViews'])
        self.json['bufferViews'].append(view)
        self.data.extend(data)
        return index

    def accessor(self, value, target, component=5126):
        width = value.shape[1] if value.ndim > 1 else 1
        kind = {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3'}[width]
        data = value.astype('<f4' if component == 5126 else '<u4').tobytes()
        accessor = {'bufferView': self.buffer_view(data, target), 'componentType': component,
                    'count': len(value), 'type': kind}
        if target == 34962:
            accessor.update(min=np.min(value, axis=0).tolist(), max=np.max(value, axis=0).tolist())
        index = len(self.json['accessors'])
        self.json['accessors'].append(accessor)
        return index

    def material(self, source, images):
        filename = (source.get('texture') or '').lower()
        # Source RGB is display/sRGB; glTF factors are linear. Textured diffuse
        # maps already carry the authored colour and therefore use white factor.
        color = tuple(round(v, 5) for v in source['color'])
        key = (color if not filename else (1, 1, 1), filename)
        if key in self.material_indices:
            return self.material_indices[key]
        rgb = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in color]
        pbr = {'baseColorFactor': [*rgb, 1], 'metallicFactor': .08, 'roughnessFactor': .74}
        if filename:
            if filename not in images:
                raise ValueError('Embedded source texture missing: '+filename)
            if filename not in self.texture_indices:
                image = images[filename]
                self.json['images'].append({'name': image['name'], 'mimeType': 'image/jpeg', 'bufferView': self.buffer_view(image['bytes'])})
                self.texture_indices[filename] = len(self.json['textures'])
                self.json['textures'].append({'sampler': 0, 'source': len(self.json['images'])-1})
            pbr.update(baseColorFactor=[1, 1, 1, 1], baseColorTexture={'index': self.texture_indices[filename]})
        index = len(self.json['materials'])
        self.json['materials'].append({'name': source.get('texture') or 'bCAD RGB '+','.join(map(str, color)),
                                       'pbrMetallicRoughness': pbr, 'doubleSided': True})
        self.material_indices[key] = index
        return index

    def add_mesh(self, name, layer, material, positions, faces, normals, uv):
        attrs = {'POSITION': self.accessor(positions, 34962), 'NORMAL': self.accessor(normals, 34962)}
        if uv is not None:
            attrs['TEXCOORD_0'] = self.accessor(uv, 34962)
        primitive = {'attributes': attrs, 'indices': self.accessor(faces.ravel(), 34963, 5125), 'material': material}
        node = len(self.json['nodes'])
        self.json['scenes'][0]['nodes'].append(node)
        self.json['nodes'].append({'name': name, 'mesh': len(self.json['meshes']), 'extras': {'sourceLayer': layer}})
        self.json['meshes'].append({'name': name, 'primitives': [primitive]})

    def write(self, path):
        self.data.extend(b'\0' * (-len(self.data) % 4))
        self.json['buffers'] = [{'byteLength': len(self.data)}]
        encoded = json.dumps(self.json, ensure_ascii=False, separators=(',', ':')).encode()
        encoded += b' ' * (-len(encoded) % 4)
        blob = struct.pack('<III', 0x46546c67, 2, 12+8+len(encoded)+8+len(self.data))
        blob += struct.pack('<II', len(encoded), 0x4e4f534a)+encoded
        blob += struct.pack('<II', len(self.data), 0x004e4942)+self.data
        Path(path).write_bytes(blob)
        return len(blob)


CLOSED_BURAN = {'НЧФ', 'Ф-2', 'ОДУ', 'Крыло', 'Элевоны', 'Плитка стык крыло-элевон', 'Руль направления', 'Киль',
                'Створки ОСШ (закрыты)', 'Створка НСШ (закрыта)', 'Створка люка ОНА-2 (закрыта)',
                'Балансировочный щиток 0', 'Створки ОПГ (закрыты)', 'Створки ОПГ (close)', 'Створки перепуска',
                'Иллюминаторы кабина-ОПГ', 'Энергия (1 ступень)', 'Энергия (2 ступень)'}


def recover(source, output, model):
    bdf = Bdf(source)
    selected = set(bdf.layers())
    if model == 'energia-buran':
        selected &= CLOSED_BURAN
    elif model == 'energia':
        selected = {'Энергия (1 ступень)', 'Энергия (2 ступень)'}
    elif model == 'energia-polyus':
        selected = {'Энергия (1 ступень)', 'Энергия (2 ступень)', 'Полюс'}
    scale = 1 if model == 'soyuz' else .001
    z_up = model not in ('soyuz', 'energia-m')
    stats = {'sourceFile': bdf.path.name, 'sourceSha256': bdf.sha256, 'sourceBytes': len(bdf.bytes),
             'sourceMeshCount': 0, 'selectedMeshCount': 0, 'sourceTriangles': 0, 'selectedTriangles': 0,
             'discardedInvalidTriangles': 0, 'discardedDegenerateTriangles': 0,
             'selectedLayers': sorted(selected), 'omittedLayers': sorted(set(bdf.layers())-selected),
             'sourceUnitMetres': scale, 'sourceUp': '+Z' if z_up else '+Y', 'layers': {}}
    records = []
    bounds_min, bounds_max = np.full(3, np.inf), np.full(3, -np.inf)
    for layer, name, fields in bdf.meshes():
        stats['sourceMeshCount'] += 1
        material = read_material(fields)
        geometry_data = first(fields, 6)
        if geometry_data is None:
            raise ValueError('Source mesh has no geometry')
        for positions, faces, smooth, uv in geometry(geometry_data):
            stats['sourceTriangles'] += len(faces)
            if layer not in selected:
                continue
            uv = material_uv(material, positions, uv)
            good = np.isfinite(positions).all(1)[faces].all(1)
            stats['discardedInvalidTriangles'] += int((~good).sum())
            faces, smooth = faces[good], smooth[good]
            cross = np.cross(positions[faces[:, 1]]-positions[faces[:, 0]], positions[faces[:, 2]]-positions[faces[:, 0]])
            good = np.linalg.norm(cross, axis=1)*scale*scale > 1e-12
            stats['discardedDegenerateTriangles'] += int((~good).sum())
            faces, smooth = faces[good], smooth[good]
            if not len(faces):
                continue
            positions = positions[:, [0, 2, 1]] * [1, 1, -1] if z_up else positions
            positions = (positions*scale).astype(np.float32)
            positions, faces, normals, uv = normals_and_groups(positions, faces, smooth, uv)
            bounds_min = np.minimum(bounds_min, positions.min(0))
            bounds_max = np.maximum(bounds_max, positions.max(0))
            stats['selectedTriangles'] += len(faces)
            stats['layers'][layer] = stats['layers'].get(layer, 0)+len(faces)
            records.append((name, layer, material, positions, faces, normals, uv))
        if layer in selected:
            stats['selectedMeshCount'] += 1
    # Source Energia axes have a small translation. Core centre is the midpoint
    # of the symmetric booster envelope, not the asymmetric payload envelope.
    rocket_records = [r for r in records if ('Энергия' in r[1] or model in ('soyuz', 'energia-m'))]
    axis_lo = np.min([r[3].min(0) for r in rocket_records], axis=0)
    axis_hi = np.max([r[3].max(0) for r in rocket_records], axis=0)
    origin = np.array([(axis_lo[0]+axis_hi[0])/2, bounds_min[1], (axis_lo[2]+axis_hi[2])/2])
    glb = Glb(model)
    for name, layer, material, positions, faces, normals, uv in records:
        glb.add_mesh(name, layer, glb.material(material, bdf.images), positions-origin, faces, normals, uv)
    stats.update(bounds={'min': (bounds_min-origin).tolist(), 'max': (bounds_max-origin).tolist(), 'size': (bounds_max-bounds_min).tolist()},
                 originMetres=origin.tolist(), rawBytes=glb.write(output), materials=len(glb.json['materials']), textures=len(glb.json['textures']))
    Path(str(output)+'.json').write_text(json.dumps(stats, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k: stats[k] for k in ['sourceFile', 'sourceMeshCount', 'selectedMeshCount', 'sourceTriangles', 'selectedTriangles', 'discardedInvalidTriangles', 'discardedDegenerateTriangles', 'bounds', 'rawBytes', 'materials', 'textures']}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--model', required=True, choices=['soyuz', 'energia-polyus', 'energia-buran', 'energia', 'energia-m'])
    args = parser.parse_args()
    recover(args.source, args.output, args.model)
