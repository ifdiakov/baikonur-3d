"""Normalize user-supplied road vehicles, keep four real separable wheel assemblies.
Blender 4.3+: blender -b -t 4 -P export.py -- SOURCE_DIR OUTPUT_DIR MODEL_ID
MODEL_ID: land-cruiser, uaz-patriot, uaz-bukhanka. Output is intermediate GLB;
run optimize.mjs afterwards. Original source GLBs are intentionally not committed.
"""
import bpy,bmesh,sys,pathlib,json,math,numpy as np
from mathutils import Vector,Matrix
source_dir,out_dir,model_id=sys.argv[sys.argv.index('--')+1:]
source_dir=pathlib.Path(source_dir);out_dir=pathlib.Path(out_dir);out_dir.mkdir(parents=True,exist_ok=True)
config={
 'land-cruiser':{'file':'land-cruiser.glb','scale':100.,'paint':'black','wheel_y':[-1.6124,1.2545],'wheel_x':.82,'wheel_z':.407,'radius':.417},
 'uaz-patriot':{'file':'vehicle-extra.glb','scale':1.,'paint':'original','wheel_y':[-1.5873,1.2674],'wheel_x':.937,'wheel_z':-.473,'radius':.431},
 'uaz-bukhanka':{'file':'bukhanka.glb','scale':1.,'paint':'grey','wheel_y':[-1.18925,1.19268],'wheel_x':.76215,'wheel_z':-.781828,'radius':.399632},
}[model_id]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source_dir/config['file']))
# Flatten existing source hierarchy without changing geometry.
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':continue
 matrix=o.matrix_world.copy();o.parent=None;o.data.transform(Matrix.Scale(config['scale'],4)@matrix);o.matrix_world=Matrix.Identity(4)
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
def bounds(o):
 # Blender's bound_box may be stale immediately after mesh.transform().
 co=np.empty(len(o.data.vertices)*3,dtype=np.float32);o.data.vertices.foreach_get('co',co);co=co.reshape(-1,3)
 return Vector(co.min(axis=0).tolist()),Vector(co.max(axis=0).tolist())
def tris(o):return sum(len(p.vertices)-2 for p in o.data.polygons)
def remove(o):bpy.data.objects.remove(o,do_unlink=True)
# Hidden cabin detail is not useful at road-traffic scale. Exterior paint, badges,
# mirrors, lamp lenses and silhouette are retained from the supplied models.
removed=[]
for o in list(bpy.context.scene.objects):
 mats={m.name for m in o.data.materials if m};drop=False
 if model_id=='land-cruiser':
  drop=bool(mats & {'Leather_Handles','White_Leather_Body','Buttons','Plastic_Beige','Wood','Black_Leather','Leather_Points','White_Leather_Seats','Screens','Fabric'})
 elif model_id=='uaz-patriot':
  drop=bool(mats & {'Salon_tkane1','Tablo1','Tkane_color1','salon_plasric_base_color1','Back_tcane1','skin_mkpp1','emissive'})
  # Keep both complementary body skins. Remove only the dense additional tread
  # shells; the original base tyres retain their complete surface.
  drop=drop or o.name.startswith('group71_polySurface275_polySurface64')
 if drop:removed.append(o.name);remove(o)
# Separate Bukhanka's disconnected original wheel components. UV loops survive
# vertex welding; no primitive replacement wheels are introduced.
if model_id=='uaz-bukhanka':
 for o in list(bpy.context.scene.objects):
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(o.data);bm.free()
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='LOOSE');bpy.ops.object.mode_set(mode='OBJECT')
# Source paint material -> black. The UAZ Patriot paint is left exactly as supplied.
if model_id=='land-cruiser':
 m=bpy.data.materials.get('CarPaint');bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.008,.011,.014,1);bs.inputs['Roughness'].default_value=.23;m.diffuse_color=(.008,.011,.014,1)
# The Bukhanka atlases mix paint, glass, lamps and tyres. Reassign only polygons
# sampling the olive paint region to grey PBR materials; retain original UVs and
# roughness/normal maps, and retain colored lamp and rubber atlas islands.
if model_id=='uaz-bukhanka':
 cache={};grey={}
 for m in list(bpy.data.materials):
  if not m.use_nodes:continue
  bs=m.node_tree.nodes.get('Principled BSDF');links=list(bs.inputs['Base Color'].links)
  if not links or links[0].from_node.type!='TEX_IMAGE':continue
  im=links[0].from_node.image;cache[m.name]=(np.array(im.pixels[:],dtype=np.float32).reshape(im.size[1],im.size[0],4),im.size[:])
  g=m.copy();g.name=m.name+'_grey_paint';gbs=g.node_tree.nodes.get('Principled BSDF')
  for link in list(gbs.inputs['Base Color'].links):g.node_tree.links.remove(link)
  gbs.inputs['Base Color'].default_value=(.15,.16,.16,1);g.diffuse_color=(.15,.16,.16,1)
  for key in ['Roughness','Metallic']:
   for link in list(gbs.inputs[key].links):g.node_tree.links.remove(link)
  gbs.inputs['Roughness'].default_value=.65;gbs.inputs['Metallic'].default_value=.08;grey[m.name]=g
 for o in bpy.context.scene.objects:
  if not o.data.uv_layers:continue
  uv=o.data.uv_layers.active.data;oldm=list(o.data.materials)
  for m in oldm:
   if m.name in grey:o.data.materials.append(grey[m.name])
  slots={m.name:i for i,m in enumerate(o.data.materials)}
  for f in o.data.polygons:
   m=oldm[f.material_index]
   if m.name not in cache:continue
   pix,(w,h)=cache[m.name];c=sum((uv[i].uv for i in f.loop_indices),Vector((0,0)))/len(f.loop_indices)
   r,g,b,a=pix[int((c.y%1)*h)%h,int((c.x%1)*w)%w]
   if m.name=='.004' or (g>b*1.3 and r>b*1.25 and g>r*.9 and g<.5):f.material_index=slots[grey[m.name].name]
# Opaque, slightly tinted glass hides removed high-poly interiors. Original
# windshield geometry and all exterior lamp geometry remain intact.
for m in bpy.data.materials:
 if not m.use_nodes:continue
 bs=m.node_tree.nodes.get('Principled BSDF')
 if not bs:continue
 if m.name in {'ClearGlass','Glass'}:
  bs.inputs['Base Color'].default_value=(.025,.045,.055,1);bs.inputs['Alpha'].default_value=1;bs.inputs['Roughness'].default_value=.22;m.diffuse_color=(.025,.045,.055,1)
 # Fine cabin/tyre texture normal maps are unnecessary in small moving vehicles.
 for imnode in m.node_tree.nodes:
  if imnode.type=='TEX_IMAGE' and imnode.image:
   im=imnode.image;w,h=im.size
   if max(w,h)>512:im.scale(round(w*512/max(w,h)),round(h*512/max(w,h)))
# Name and bucket original meshes into 4 wheels plus body. Each tiny original
# part is accepted as a wheel part only when its entire bounds fit a wheel box.
parts={};wheel_centers={};wheel_part_sources={}
for front,y in zip(['Front','Rear'],config['wheel_y']):
 for side,s in [('Left',-1),('Right',1)]:
  name='wheel'+front+side;wheel_centers[name]=Vector((s*config['wheel_x'],y,config['wheel_z']));wheel_part_sources[name]=[]
for o in list(bpy.context.scene.objects):
 lo,hi=bounds(o);group='body'
 for name,c in wheel_centers.items():
  r=config['radius'];extent=hi-lo
  if (lo.x>c.x-.26 and hi.x<c.x+.26 and lo.y>c.y-r-.025 and hi.y<c.y+r+.025 and lo.z>c.z-r-.025 and hi.z<c.z+r+.025):
   # Keep brake calipers / mud flaps attached to body; tyre, hub and rim rotate.
   if 'brake_wheel' not in o.name:group=name;wheel_part_sources[name].append(o.name)
   break
 # Separate material slots so material-specific simplification budgets preserve
 # body contour and small badges rather than spending triangles on internals.
 if len(o.data.materials)>1:
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
  objects=list(bpy.context.selected_objects)
 else:objects=[o]
 for q in objects:
  mat=q.data.materials[0].name if q.data.materials else 'none';parts.setdefault((group,mat),[]).append(q)
# Caps are visual budgets, not blind percentage decimation across all parts.
def cap(group,mat,n):
 if group!='body':
  if model_id=='uaz-bukhanka':return min(n,700)
  if model_id=='land-cruiser':return min(n,360 if mat=='Wheel' else 280)
  return min(n,350 if mat=='Rubber_color1' else 300)
 if model_id=='land-cruiser':
  return min(n,{'CarPaint':5200,'Chrome':1700,'Textures_A':650,'BlackPlastic_Shiny2':1100,'BlackPlastic_Rough':650,'BlackPlastic_Shiny':500,'ClearGlass':400,'MetalBlack':300}.get(mat,160))
 if model_id=='uaz-patriot':
  return min(n,{'Base_color1':6500,'Black_plastic_color1':1000,'Rubber_color1':280,'Bottom':220,'metal_other1':250,'Glass':480,'logo1':250,'hedlight_inside_color1':300}.get(mat,160))
 return min(n,3200 if mat=='.004_grey_paint' else 2200 if mat=='.004' else 1800 if mat.endswith('_grey_paint') else 1800)
merged=[];budget=[]
for (group,mat),objs in parts.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();o=bpy.context.object;o.name=group+'__'+mat
 # Remove duplicate source vertices but preserve UV loops.
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(o.data);bm.free()
 before=tris(o);target=cap(group,mat,before)
 if before>target:
  mod=o.modifiers.new('Traffic polygon budget','DECIMATE');mod.ratio=target/before;mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 for f in o.data.polygons:f.use_smooth=True
 merged.append((group,o));budget.append({'group':group,'material':mat,'before':before,'after':tris(o)})
# Center horizontally, seat on wheel contact plane. glTF exporter maps Blender
# -Y to glTF +Z and Blender +Z to glTF +Y.
lo=Vector((min(bounds(o)[0].x for _,o in merged),min(bounds(o)[0].y for _,o in merged),min(bounds(o)[0].z for _,o in merged)));hi=Vector((max(bounds(o)[1].x for _,o in merged),max(bounds(o)[1].y for _,o in merged),max(bounds(o)[1].z for _,o in merged)))
shift=Vector((-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z))
for _,o in merged:o.data.transform(Matrix.Translation(shift))
# Join each wheel assembly to exactly one stable named node. No parent rotation
# is required; downstream creates a pivot at the recorded centre, about local X.
for group in ['body']+list(wheel_centers):
 objects=[o for g,o in merged if g==group];assert objects,group+' has no original geometry'
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name=group
bpy.ops.object.select_all(action='SELECT')
output=out_dir/(model_id+'.raw.glb')
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_image_format='AUTO',export_extras=True)
wheelmeta=[]
for name,c in wheel_centers.items():
 c=c+shift;wheelmeta.append({'name':name,'center':[c.x,c.z,-c.y],'radius':config['radius']})
meta={'id':model_id,'paint':config['paint'],'wheels':wheelmeta,'removedObjects':removed,'wheelSourceObjects':wheel_part_sources,'budgets':budget,'sourceFile':config['file']}
(out_dir/(model_id+'.conversion.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(out_dir/(model_id+'.blend')))
print('ROAD_VEHICLE_EXPORTED',model_id,output.stat().st_size,'triangles',sum(tris(o) for o in bpy.context.scene.objects if o.type=='MESH'),flush=True)
