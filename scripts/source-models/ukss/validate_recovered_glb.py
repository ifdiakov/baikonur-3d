# SPDX-License-Identifier: GPL-2.0-or-later
"""Validate the exported file independently of bpy and the exporter.

Checks original identities, actual glTF world matrices, index ranges and finite
geometry. Uses only the final local GLB and its pre-export source-space manifest.
"""
from pathlib import Path
import hashlib
import json
import struct
import numpy as np

from ukss_config import ROOT
path = ROOT / 'ukss_recovered_raw.glb'
blob = path.read_bytes()
magic, version, length = struct.unpack_from('<III', blob)
assert magic == 0x46546C67 and version == 2 and length == len(blob)
json_length, json_type = struct.unpack_from('<II', blob, 12)
assert json_type == 0x4E4F534A
g = json.loads(blob[20:20 + json_length])
bin_at = 20 + json_length
bin_length, bin_type = struct.unpack_from('<II', blob, bin_at)
assert bin_type == 0x004E4942 and bin_at + 8 + bin_length == len(blob)
binary = memoryview(blob)[bin_at + 8:]
assert len(g['buffers']) == 1 and 'uri' not in g['buffers'][0]
assert not g.get('images'), 'Unexpected image dependency'

DTYPES = {5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
SIZES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}
def accessor(index):
    a = g['accessors'][index]
    assert 'sparse' not in a
    view = g['bufferViews'][a['bufferView']]
    dtype = np.dtype(DTYPES[a['componentType']])
    components = SIZES[a['type']]
    offset = view.get('byteOffset',0) + a.get('byteOffset',0)
    stride = view.get('byteStride', dtype.itemsize * components)
    assert offset + (a['count'] - 1) * stride + dtype.itemsize * components <= len(binary)
    return np.ndarray((a['count'],components),dtype=dtype,buffer=binary,
                      offset=offset,strides=(stride,dtype.itemsize))

def local_matrix(node):
    if 'matrix' in node:
        return np.asarray(node['matrix'],dtype=float).reshape(4,4,order='F')
    x,y,z,w = node.get('rotation',[0,0,0,1])
    q = np.array([
        [1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
        [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
        [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    m = np.eye(4)
    m[:3,:3] = q @ np.diag(node.get('scale',[1,1,1]))
    m[:3,3] = node.get('translation',[0,0,0])
    return m

parents = {}
for index,node in enumerate(g['nodes']):
    for child in node.get('children',[]):
        assert child not in parents, 'Multiple glTF parents'
        parents[child] = index
worlds = {}
def world(index):
    if index not in worlds:
        m = local_matrix(g['nodes'][index])
        worlds[index] = world(parents[index]) @ m if index in parents else m
    return worlds[index]

manifest = json.loads((ROOT/'ukss_recovered_raw_report.json').read_text())
expected = {o['sourceSceneIndex']:o for o in manifest['objects']
            if o['sourceSceneIndex'] is not None}
source_nodes = [(i,n) for i,n in enumerate(g['nodes'])
                if 'sourceSceneIndex' in n.get('extras',{})]
ids = [n['extras']['sourceSceneIndex'] for _,n in source_nodes]
assert len(ids) == len(set(ids)) == len(expected) == 7119
assert set(ids) == set(expected)
# Blender +Z up to glTF +Y up, also applied to local geometry by its exporter.
C = np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]],dtype=float)
max_error = 0.0
for index,node in source_nodes:
    source_id = node['extras']['sourceSceneIndex']
    target = C @ np.asarray(expected[source_id]['matrixWorld']) @ C.T
    error = float(np.max(np.abs(world(index)-target)))
    max_error = max(max_error,error)
    assert error < 2e-3,(source_id,node['name'],error)

primitive_count = triangles = mesh_instances = 0
minimum = np.full(3,np.inf);maximum = np.full(3,-np.inf)
for index,node in enumerate(g['nodes']):
    if 'mesh' not in node: continue
    mesh_instances += 1
    matrix = world(index)
    for primitive in g['meshes'][node['mesh']]['primitives']:
        assert primitive.get('mode',4) == 4
        positions = accessor(primitive['attributes']['POSITION'])
        assert np.isfinite(positions).all()
        for attribute,acc in primitive['attributes'].items():
            assert np.isfinite(accessor(acc)).all(),(node['name'],attribute)
        indices = accessor(primitive['indices']) if 'indices' in primitive else np.arange(len(positions))
        assert indices.size % 3 == 0 and indices.min() >= 0 and indices.max() < len(positions)
        triangles += indices.size // 3
        primitive_count += 1
        transformed = positions.astype(float) @ matrix[:3,:3].T + matrix[:3,3]
        minimum = np.minimum(minimum,transformed.min(axis=0))
        maximum = np.maximum(maximum,transformed.max(axis=0))
assert triangles == manifest['counts']['triangles'] == 265429
assert mesh_instances == manifest['counts']['meshObjects'] - 1 == 5668
empty = next(n for _,n in source_nodes if n['extras']['sourceSceneIndex']==28890)
assert 'mesh' not in empty # Original zero-area face [0,1,0], node preserved.

report = {
    'status':'PASS','glbSha256':hashlib.sha256(blob).hexdigest(),
    'sourceNodeCount':len(ids),'uniqueSourceIds':len(set(ids)),
    'glTFNodeCount':len(g['nodes']),'glTFMeshInstances':mesh_instances,
    'meshPrimitives':primitive_count,'triangles':triangles,
    'maximumGlTFWorldMatrixError':max_error,
    'actualVertexBoundsGlTF':{'min':minimum.tolist(),'max':maximum.tolist(),
                             'size':(maximum-minimum).tolist()},
    'retainedDegenerateSourceNode':{'sourceSceneIndex':28890,'name':'VIFS7370',
       'sourceVertices':2,'sourceFace':[0,1,0],
       'handling':'Zero-area face removed by mesh validation; original node and transform preserved'},
    'externalImageDependencies':0,'extensionsUsed':g.get('extensionsUsed',[])
}
(ROOT/'ukss_glb_validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
