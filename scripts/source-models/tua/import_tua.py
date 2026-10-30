# SPDX-License-Identifier: GPL-2.0-or-later
"""TUA-only MAX import, with exact source-ID hierarchy and preserved geometry.

The pinned importer decodes editable geometry/materials. Primitive/modifier/
renderable-spline recovery is separate and explicitly recorded in the checkpoint.
"""
import collections,hashlib,json,math,sys,time,traceback
from pathlib import Path,PureWindowsPath
import bpy
import numpy as np
from mathutils import Matrix,Vector
from tua_config import WORK, OUT, SOURCE, SHARED, EXPECTED_SOURCE_SHA256, verify_source
EXPECTED=EXPECTED_SOURCE_SHA256
verify_source(SOURCE)
sys.path.insert(0,str(WORK));sys.path.insert(0,str(SHARED))
from io_scene_max import import_max as im
from tua_transforms import get_source,source_pivot_matrix,_install_source_transform
source=get_source();started=time.monotonic()
report={'source':{'path':str(SOURCE),'bytes':SOURCE.stat().st_size,'sha256':EXPECTED},
 'blender':bpy.app.version_string,'importer':json.loads((SHARED/'addon-origin.json').read_text()),
 'settings':{'sourceUnitsUnchanged':True,'sourceAxes':'Native source author coordinates, physical Y-up','matrixMapping':'sourceSceneIndex','primitiveMode':'deferred data API','meshPivot':'exact source quaternion and ScaleValue'},
 'nodes':[],'textureReferences':[],'fatalError':None}
original_load_image=im.load_image

def local_image(filepath,dirname,**kwargs):
 basename=PureWindowsPath(str(filepath)).name;candidates=[OUT/basename,OUT/str(filepath)]
 found=next((p for p in candidates if p.resolve().is_relative_to(OUT.resolve()) and p.is_file()),None)
 record={'sourcePath':str(filepath),'basename':basename,'found':bool(found)}
 if record not in report['textureReferences']:report['textureReferences'].append(record)
 return original_load_image(str(found),str(OUT),**kwargs) if found else None
im.load_image=local_image

def make_source_scene(context,settings,mscale,transform,parent):
 mapping={}
 for index,record in source.nodes_by_index.items():
  node=parent.children[index];name=im.get_node_name(node)
  assert name==record['name'],(index,name,record['name'])
  entry={'sceneIndex':index,'name':name,'meshClass':record['meshClass'],'parentSceneIndex':record['parentSceneIndex'],'createdObjects':[]}
  try:
   _,objects=im.create_object(context,settings,node,False)
   objects=list(objects)
   if not objects:
    placeholder=bpy.data.objects.new(name,None);context.scene.collection.objects.link(placeholder)
    placeholder['sourceDeferredGeometry']=record['meshClass'] or 'none';objects=[placeholder];entry['status']='deferred'
   else:entry['status']='imported'
   matref=record['references'].get(3)
   for obj in objects:
    obj['sourceSceneIndex']=index;obj['sourceNodeName']=name;obj['sourceParentSceneIndex']=record['parentSceneIndex']
    if matref is not None and matref!=0xffffffff:obj['sourceMaterialSceneIndex']=matref
    if obj.type=='MESH':obj.data.transform(source_pivot_matrix(index));obj.data.update()
   mapping[index]=objects;entry['createdObjects']=[o.name for o in objects]
  except Exception:
   entry['status']='error';entry['error']=traceback.format_exc();report['nodes'].append(entry);raise
  report['nodes'].append(entry)
  if len(report['nodes'])%250==0:print('TUA_NODE_PROGRESS',len(report['nodes']),flush=True)
 helpers={}
 for index,objects in mapping.items():
  for obj in objects:_install_source_transform(obj,index,mapping,helpers)
 context.view_layer.update();maximum_error=0.0
 for index,objects in mapping.items():
  expected=source.world(index)
  for obj in objects:
   error=float(np.max(np.abs(np.asarray(obj.matrix_world)-expected)));maximum_error=max(maximum_error,error)
   assert error<.002,(index,obj.name,error,'source matrix drift')
 report['hierarchy']={'sourceNodes':len(source.nodes_by_index),'mappedSourceNodes':len(mapping),'scaleBasisHelpers':len(helpers),'maximumWorldMatrixError':maximum_error}
 print('TUA_HIERARCHY_PASS',json.dumps(report['hierarchy']),flush=True)
im.make_scene=make_source_scene
bpy.ops.wm.read_factory_settings(use_empty=True)
try:
 im.read(bpy.context,str(SOURCE),Matrix.Identity(4),obtypes={'MATERIAL','UV','EMPTY','ARMATURE'},search=False,transform=True)
except Exception:
 report['fatalError']=traceback.format_exc();(OUT/'tua_import_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));raise
bpy.context.view_layer.update()
objects=list(bpy.data.objects);meshes=[o for o in objects if o.type=='MESH'];points=[]
for o in meshes:
 o.data.calc_loop_triangles();points.extend(o.matrix_world@v.co for v in o.data.vertices)
if points:
 lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
 report['bounds']={'min':lo,'max':hi,'size':[b-a for a,b in zip(lo,hi)],'units':'source units; physical Y-up; no normalization'}
report['objects']=[]
for o in objects:
 row={'name':o.name,'type':o.type,'sourceSceneIndex':o.get('sourceSceneIndex'),'sourceDeferredGeometry':o.get('sourceDeferredGeometry'),'parent':o.parent.name if o.parent else None,'dimensions':list(o.dimensions),'matrixWorld':[list(r) for r in o.matrix_world]}
 if o.type=='MESH':row.update(vertices=len(o.data.vertices),triangles=len(o.data.loop_triangles),materials=[m.name if m else None for m in o.data.materials])
 report['objects'].append(row)
report['materials']=[{'name':m.name,'color':list(m.diffuse_color),'roughness':m.roughness,'metallic':m.metallic} for m in bpy.data.materials]
report['counts']={'sourceNodes':len(report['nodes']),'objects':len(objects),'meshObjects':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'triangles':sum(len(o.data.loop_triangles) for o in meshes),'materials':len(bpy.data.materials),'images':len(bpy.data.images),'sourceNodeStatuses':dict(collections.Counter(n['status'] for n in report['nodes'])),'deferredClasses':dict(collections.Counter(n['meshClass'] for n in report['nodes'] if n['status']=='deferred'))}
report['elapsedSeconds']=time.monotonic()-started
(OUT/'tua_import_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'tua_import_base.blend'))
print('TUA_BASE_SAVED',json.dumps(report['counts']),flush=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'tua_import_base.glb'),export_format='GLB',export_yup=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False)
print('TUA_BASE_EXPORT_FINISHED',time.monotonic()-started,flush=True)
