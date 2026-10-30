# SPDX-License-Identifier: GPL-2.0-or-later
"""Reproducible local MAX recovery; run after import_ukss_fast.py."""
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import time

import bpy
from mathutils import Vector
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parent))
from source_scene_transforms import get_source, repair_hierarchy, source_pivot_matrix
from repair_primitives import repair_primitives
from repair_lattice import repair_lattice
from repair_secondary import repair_secondary

from ukss_config import ROOT, SOURCE, WORK, EXPECTED_SOURCE_SHA256
INPUT=ROOT/'ukss_import_fast_base.blend'
REPORT=ROOT/'ukss_import_fast_report.json'
PREFIX=os.environ.get('UKSS_RECOVERY_PREFIX','ukss_recovered_raw')
EXPECTED=EXPECTED_SOURCE_SHA256
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
started=time.monotonic()
bpy.ops.wm.open_mainfile(filepath=str(INPUT))
hierarchy=repair_hierarchy(REPORT)
primitives=repair_primitives()
lattice=repair_lattice(source_pivot_matrix)
secondary=repair_secondary()
bpy.context.view_layer.update()

source=get_source();meshes=[o for o in bpy.data.objects if o.type=='MESH']
identified={int(o['sourceSceneIndex']):o for o in bpy.data.objects if 'sourceSceneIndex' in o}
missing=[{'sourceSceneIndex':i,'sourceNodeName':n['name'],'sourceClass':n['meshClass']}
         for i,n in source.nodes_by_index.items() if i not in identified]
assert not missing,('Unrecovered source nodes',missing)
assert len(identified)==len(source.nodes_by_index)==7119
assert len([o for o in bpy.data.objects if 'sourceSceneIndex' in o])==7119, 'Duplicate source identities'
maximum_error=0.0
for index,obj in identified.items():
    error=float(np.max(np.abs(np.asarray(obj.matrix_world)-source.world(index))))
    maximum_error=max(maximum_error,error)
    assert error<2e-3,(index,obj.name,error)

objects=[];bounds_min=[math.inf]*3;bounds_max=[-math.inf]*3
vertices=triangles=polygons=0;empty_meshes=[]
for obj in bpy.data.objects:
    entry={'objectName':obj.name,'type':obj.type,
           'sourceSceneIndex':obj.get('sourceSceneIndex'),'sourceNodeName':obj.get('sourceNodeName'),
           'parentObjectName':obj.parent.name if obj.parent else None,
           'matrixWorld':[list(row) for row in obj.matrix_world]}
    if obj.type=='MESH':
        obj.data.calc_loop_triangles()
        count=len(obj.data.vertices);tri_count=len(obj.data.loop_triangles)
        vertices+=count;triangles+=tri_count;polygons+=len(obj.data.polygons)
        if not count or not tri_count:empty_meshes.append(entry['sourceSceneIndex'])
        raw=np.empty(count*3,dtype=np.float32);obj.data.vertices.foreach_get('co',raw)
        assert np.isfinite(raw).all(),('Nonfinite source geometry',obj.name)
        points=[obj.matrix_world@Vector(p) for p in obj.bound_box]
        low=[min(p[i] for p in points) for i in range(3)];high=[max(p[i] for p in points) for i in range(3)]
        for i in range(3):bounds_min[i]=min(bounds_min[i],low[i]);bounds_max[i]=max(bounds_max[i],high[i])
        entry.update({'vertices':count,'polygons':len(obj.data.polygons),'triangles':tri_count,
                      'boundsMin':low,'boundsMax':high,'materials':[m.name if m else None for m in obj.data.materials],
                      'latticeRecovered':bool(obj.get('sourceLatticeRecovered')),
                      'primitiveRecovered':obj.get('sourcePrimitiveRecovered'),
                      'mirrorRecovered':bool(obj.get('sourceMirrorRestored'))})
    objects.append(entry)

report={'source':{'filename':SOURCE.name,'sha256':EXPECTED,'bytes':SOURCE.stat().st_size},
        'blender':bpy.app.version_string,'importer':json.loads((WORK/'addon-origin.json').read_text()),
        'inputCheckpoint':INPUT.name,'recoverySecondsBeforeExport':time.monotonic()-started,
        'coordinateConvention':{'source':'Unchanged source units, X/Y horizontal, +Z up; original datum retained',
                                'glTF':'Blender exporter converts +Z up to +Y up; no centering, normalization or exhibit transform applied'},
        'counts':{'sourceNodes':len(source.nodes_by_index),'sourceNodesPresent':len(identified),'objects':len(bpy.data.objects),
                  'meshObjects':len(meshes),'vertices':vertices,'polygons':polygons,'triangles':triangles,
                  'materials':len(bpy.data.materials),'images':len(bpy.data.images),
                  'scaleBasisHelpers':sum('sourceScaleBasisHelperFor' in o for o in bpy.data.objects)},
        'bounds':{'min':bounds_min,'max':bounds_max,'size':[b-a for a,b in zip(bounds_min,bounds_max)]},
        'maximumSourceWorldMatrixError':maximum_error,'unrecoveredNodes':missing,'emptySourceMeshes':empty_meshes,
        'recoveries':{'primitives':primitives['counts'],'latticeModifiers':lattice['recoveredModifiers'],
                      'latticeStruts':lattice['sourceBasedStruts'],'secondary':secondary['counts']},
        'materials':[{'name':m.name,'baseColor':list(m.diffuse_color),'roughness':m.roughness,'metallic':m.metallic} for m in bpy.data.materials],
        'objects':objects}

# A reviewable .blend is saved before GLB export. All source identifiers are
# retained as extras in the raw GLB; the runtime optimizer may strip them later.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/(PREFIX+'.blend')))
bpy.ops.export_scene.gltf(filepath=str(ROOT/(PREFIX+'.glb')),export_format='GLB',
                          export_yup=True,export_apply=False,export_extras=True,
                          export_animations=False,export_cameras=False,export_lights=False)
report['glb']={'filename':PREFIX+'.glb','bytes':(ROOT/(PREFIX+'.glb')).stat().st_size,
               'sha256':hashlib.sha256((ROOT/(PREFIX+'.glb')).read_bytes()).hexdigest()}
report['totalSeconds']=time.monotonic()-started
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
(ROOT/(PREFIX+'_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('UKSS_RECOVERED',json.dumps({k:v for k,v in report.items() if k not in ('objects','materials')}),flush=True)
