# SPDX-License-Identifier: GPL-2.0-or-later
"""Finish TUA source recovery from the fast baseline; preserve native poses."""
import hashlib,json,math,sys,time
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

from tua_config import WORK, SOURCE, EXPECTED_SOURCE_SHA256
sys.path.insert(0,str(WORK))
from source_scene import ROOT
from tua_transforms import get_source
from tua_geometry_common import assert_source_worlds
from recover_tua_primitives import recover_tua_primitives
from recover_tua_modifiers import recover_tua_modifiers

SHA=EXPECTED_SOURCE_SHA256
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==SHA
start=time.monotonic()
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'tua_import_base.blend'))
primitives=recover_tua_primitives()
modifiers=recover_tua_modifiers()
maximum=assert_source_worlds()
source=get_source();objects=[];low=np.full(3,np.inf);high=np.full(3,-np.inf)
vertices=triangles=polygons=mesh_count=0
for obj in bpy.data.objects:
    item={'objectName':obj.name,'type':obj.type,'sourceSceneIndex':obj.get('sourceSceneIndex'),
          'sourceNodeName':obj.get('sourceNodeName'),'parentObjectName':obj.parent.name if obj.parent else None,
          'matrixWorld':[list(row) for row in obj.matrix_world]}
    if obj.type=='MESH':
        mesh_count+=1;obj.data.calc_loop_triangles();v=len(obj.data.vertices);f=len(obj.data.polygons);t=len(obj.data.loop_triangles)
        vertices+=v;polygons+=f;triangles+=t
        coordinates=np.empty(v*3,dtype=np.float32);obj.data.vertices.foreach_get('co',coordinates)
        assert np.isfinite(coordinates).all()
        actual=coordinates.reshape(-1,3).astype(float)@np.asarray(obj.matrix_world)[:3,:3].T+np.asarray(obj.matrix_world)[:3,3]
        if v:
            minimum=actual.min(axis=0);maximum_vertex=actual.max(axis=0);low=np.minimum(low,minimum);high=np.maximum(high,maximum_vertex)
            item['boundsMin']=minimum.tolist();item['boundsMax']=maximum_vertex.tolist()
        item.update(vertices=v,polygons=f,triangles=t,materials=[m.name if m else None for m in obj.data.materials])
    objects.append(item)
identified=[o for o in bpy.data.objects if 'sourceSceneIndex' in o]
assert len(identified)==len({int(o['sourceSceneIndex']) for o in identified})==2786
report={'source':{'file':SOURCE.name,'sha256':SHA,'bytes':SOURCE.stat().st_size},
        'blender':bpy.app.version_string,'importerCommit':'37db107126f956f7219152671443080360565691',
        'counts':{'sourceNodes':2786,'sourceNodesPresent':len(identified),'objects':len(bpy.data.objects),
                  'meshObjects':mesh_count,'vertices':vertices,'polygons':polygons,'triangles':triangles,
                  'materials':len(bpy.data.materials),'images':len(bpy.data.images),
                  'scaleBasisHelpers':sum('sourceScaleBasisHelperFor' in o for o in bpy.data.objects)},
        'boundsSourceCoordinates':{'min':low.tolist(),'max':high.tolist(),'size':(high-low).tolist()},
        'maximumSourceWorldMatrixError':maximum,'remainingDeferredNodes':[],
        'recoveries':{'primitives':primitives['counts'],'modifiers':modifiers['counts']},
        'coordinateConvention':{'source':'Native coordinates and units unchanged; this author uses physical Y-up and longitudinal +Z',
          'rawGlTF':'Blender standard exporter maps coordinates (X,Y,Z) to (X,Z,-Y). Museum normalization must undo this automatic basis conversion before choosing its own placement; no normalization is baked here.'},
        'qualifications':modifiers['qualifications']+[
          'Source hidden/renderable object flags have not been reliably decoded; all source node identities are retained.',
          'VIFS1031 (source ID 35591) has a sole original degenerate face [0,1,0] and is retained as an empty glTF node.',
          'Eight source mesh objects have no assigned MAX material; their slots remain unassigned in the full raw scene.'
        ],
        'materials':[{'name':m.name,'baseColor':list(m.diffuse_color),'roughness':m.roughness,'metallic':m.metallic} for m in bpy.data.materials],
        'objects':objects}
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tua_recovered_raw.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'tua_recovered_raw.glb'),export_format='GLB',export_yup=True,
                          export_apply=False,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
blob=(ROOT/'tua_recovered_raw.glb').read_bytes()
report['glb']={'file':'tua_recovered_raw.glb','bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()}
report['totalSeconds']=time.monotonic()-start
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==SHA
(ROOT/'tua_recovered_raw_report.json').write_text(json.dumps(report,indent=2))
print('TUA_RECOVERED',json.dumps({k:v for k,v in report.items() if k not in ('objects','materials')}),flush=True)
