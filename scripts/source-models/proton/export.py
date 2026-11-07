"""Blender 4.3: safely export the supplied full Proton scene as rocket, gantry and pad.
blender -b --factory-startup --disable-autoexec proton.blend --python export.py -- OUTDIR
"""
import bpy,sys,os,json,math
from mathutils import Vector,Matrix
out=sys.argv[-1];os.makedirs(out,exist_ok=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=4;scene.cycles.use_denoising=False
scene.render.bake.margin=4;scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
selected=[o for o in scene.objects if o.visible_get() and o.type in ['MESH','CURVE'] and (o.name.startswith(('proton_','inspection_tower.')) or o.name in ['ground.001','ground.002','ground.005','ground.006','ground.007'])]
for o in list(scene.objects):
 if o not in selected:bpy.data.objects.remove(o,do_unlink=True)
# Keep mirrors and authored normals. Curve bevel tessellation is bounded.
for o in list(selected):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 if o.type=='CURVE':o.data.resolution_u=3;o.data.bevel_resolution=min(1,o.data.bevel_resolution)
 bpy.ops.object.convert(target='MESH')
selected=[o for o in scene.objects if o.type=='MESH' and len(o.data.polygons)]
for o in list(scene.objects):
 if o not in selected:bpy.data.objects.remove(o,do_unlink=True)
# An explicit source UV node prevents baking from reading the new atlas UVs.
for o in selected:
 o.data=o.data.copy()
 if o.data.uv_layers.active:o.data.uv_layers.active.name='SourceUV'
 else:
  layer=o.data.uv_layers.new(name='SourceUV')
  for loop in layer.data:loop.uv=(0,0)
 o.data.uv_layers.new(name='MuseumAtlas');o.data.uv_layers.active_index=len(o.data.uv_layers)-1;o.data.uv_layers.active.active_render=True
concrete=bpy.data.materials.new('source concrete fallback');concrete.use_nodes=True;concrete.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.22,.24,.23,1)
for o in selected:
 if not o.data.materials:o.data.materials.append(concrete)
for mat in bpy.data.materials:
 if not mat.use_nodes:continue
 nodes=mat.node_tree.nodes;links=mat.node_tree.links;uv=nodes.new('ShaderNodeUVMap');uv.uv_map='SourceUV'
 for n in list(nodes):
  if n.type=='TEX_COORD':
   for l in list(n.outputs['UV'].links):links.new(uv.outputs['UV'],l.to_socket)
 # Bake only albedo; removing metallic avoids black diffuse bakes on metals.
 for n in nodes:
  if n.type=='BSDF_PRINCIPLED':
   for key in ['Metallic','Transmission Weight','Coat Weight']:
    socket=n.inputs.get(key)
    if socket:
     for l in list(socket.links):links.remove(l)
     socket.default_value=0
rocket=[o for o in selected if o.name.startswith('proton_')]
minz=min((o.matrix_world@Vector(c)).z for o in rocket for c in o.bound_box)
maxz=max((o.matrix_world@Vector(c)).z for o in rocket for c in o.bound_box)
scale=58.2/(maxz-minz)
report={'sourceHeight':maxz-minz,'sourceRocketMinimum':minz,'scaleToMetres':scale,'rocketGroundOffset':minz*scale,'parts':{}}
original_names={o:o.name for o in selected}
groups={'rocket':rocket,'gantry':[o for o in selected if o.name.startswith('inspection_tower.')],'pad':[o for o in selected if o.name.startswith('ground.')]}
for label,objects in groups.items():
 original_count=len(objects)
 # Consolidate within each assembly before baking; original decal UVs survive.
 batches=[(i,[o for o in objects if f'_{i+1}' in o.name]) for i in range(3)] if label=='rocket' else [(0,objects)]
 objects=[]
 for stage,items in batches:
  if not items:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in items:o.select_set(True)
  bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join();joined=bpy.context.object
  joined.name='proton_'+str(stage+1)+'stage' if label=='rocket' else label+' combined'
  objects.append(joined)
 print('BAKE_BEGIN',label,len(objects),flush=True)
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.008);bpy.ops.object.mode_set(mode='OBJECT')
 size=2048 if label in ['rocket','gantry'] else 1024
 decal=bpy.data.materials['main_rocket'].node_tree.nodes['Image Texture.002'].image
 image=bpy.data.images.new('Proton '+label+' albedo',width=size,height=size,alpha=False);image.generated_color=(.3,.3,.3,1);image.colorspace_settings.name='sRGB'
 materials=set(m for o in objects for m in o.data.materials if m)
 for m in materials:
  n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=image;m.node_tree.nodes.active=n
 bpy.ops.object.bake(type='DIFFUSE',pass_filter={'COLOR'},use_clear=False)
 image.pack()
 replacements={}
 for m in materials:
  new=bpy.data.materials.new(label+' '+m.name);new.use_nodes=True;p=new.node_tree.nodes.get('Principled BSDF');t=new.node_tree.nodes.new('ShaderNodeTexImage');t.image=image;t.extension='EXTEND';new.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
  p.inputs['Metallic'].default_value=.55 if m.name in ['metal','f-1_engine','copper'] else .18
  p.inputs['Roughness'].default_value=.56 if label!='pad' else .85
  uv=new.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='MuseumAtlas';new.node_tree.links.new(uv.outputs['UV'],t.inputs['Vector'])
  if label=='rocket' and m.name=='main_rocket':
   t.image=decal;t.extension='REPEAT';uv.uv_map='SourceUV';p.inputs['Metallic'].default_value=.18;p.inputs['Roughness'].default_value=.45
  replacements[m]=new
 for o in objects:
  for i,m in enumerate(o.data.materials):o.data.materials[i]=replacements[m]
  # Structures use the atlas; rocket paint retains its original decal UVs.
  if label!='rocket':o.data.uv_layers.remove(o.data.uv_layers['SourceUV'])
 # Join per rocket stage to retain exploded-view controls; each structure is one mesh.
 parts=[]
 stages=[(i,[o for o in objects if f'_{i+1}' in o.name]) for i in range(3)] if label=='rocket' else [(0,objects)]
 for stage,items in stages:
  if not items:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in items:o.select_set(True)
  bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join();joined=bpy.context.object;joined.name='Proton '+label+(' stage '+str(stage+1) if label=='rocket' else '')
  bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
  if label=='rocket':
   for v in joined.data.vertices:v.co.z-=minz
   joined['inspectionStage']=stage
  elif label=='gantry':
   low=min(v.co.z for v in joined.data.vertices)
   for v in joined.data.vertices:v.co.z-=low
  for v in joined.data.vertices:v.co*=scale
  parts.append(joined)
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 filepath=os.path.join(out,label+'-raw.glb')
 bpy.ops.export_scene.gltf(filepath=filepath,export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
 report['parts'][label]={'objects':original_count,'exportedMeshes':len(parts),'rawBytes':os.path.getsize(filepath),'textureSize':size}
 print('EXPORT_OK',label,report['parts'][label],flush=True)
json.dump(report,open(os.path.join(out,'export.json'),'w'),indent=2)
