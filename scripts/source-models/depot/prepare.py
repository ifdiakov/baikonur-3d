"""Blender: crop and simplify the owner-supplied Metazeon depot scan.
Usage: blender -b -t 4 --python scripts/source-models/depot/prepare.py -- source.glb output.glb
"""
import bpy,bmesh,sys,json
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];source,out=args
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=source)
meshes=[o for o in bpy.data.objects if o.type=='MESH' and len(o.data.polygons)>20]
for o in meshes:
 m=o.matrix_world.copy();o.parent=None;o.matrix_world=m
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();o=bpy.context.object;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
for other in list(bpy.data.objects):
 if other!=o:bpy.data.objects.remove(other,do_unlink=True)
bm=bmesh.new();bm.from_mesh(o.data)
# Keep the workshop, office and working yard. Remove the scanned outer main
# line, long northern approaches and ragged survey perimeter.
for co,no in [((-92,0,0),(-1,0,0)),((65,0,0),(1,0,0)),((0,-10,0),(0,-1,0)),((0,283,0),(0,1,0))]:
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.001,plane_co=co,plane_no=no,clear_outer=True,clear_inner=False)
for v in bm.verts:
 v.co.x=-(v.co.x+13.5);v.co.y=-(v.co.y-136.5)
 # The scanned apron is uneven; keep structures, flatten its contact datum.
 z=v.co.z-3;v.co.z=max(0,z) if z>1 else max(0,z)*.15
bm.to_mesh(o.data);bm.free();o.data.update();o.name='Kosmotrans_depot_scan'
mod=o.modifiers.new('Lightweight scan','DECIMATE');mod.ratio=min(1,45000/max(1,len(o.data.polygons)));mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
for v in o.data.vertices:
 v.co.x=max(-78.5,min(78.5,v.co.x));v.co.y=max(-146.5,min(146.5,v.co.y));v.co.z=max(0,v.co.z)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.remove_doubles(threshold=.001);bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
for mat in o.data.materials:
 if not mat:continue
 mat.name='Depot photographic atlas';mat.use_nodes=True
 for n in mat.node_tree.nodes:
  if n.type=='BSDF_PRINCIPLED':n.inputs['Metallic'].default_value=0;n.inputs['Roughness'].default_value=.95
  if n.type=='TEX_IMAGE' and n.image:
   n.image.scale(1024,1024);n.image.file_format='JPEG'
o['source']='https://sketchfab.com/3d-models/railway-maintenance-depot-and-diesel-locomotive-0eaba418418447169f4d6a2f4926d4e9';o['author']='Metazeon';o['license']='CC-BY-4.0';o['adaptation']='Cropped working yard, flattened scan apron, decimated geometry. Illustrative Kosmotrans exhibit, not a survey of the actual depot.'
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',use_selection=False,export_extras=True,export_image_format='JPEG',export_jpeg_quality=84,export_yup=True,export_materials='EXPORT')
print('DEPOT_PREPARED',len(o.data.polygons),list(o.dimensions))
