"""Render exported intermediate Blender geometry for visual review (not a generated image).
blender -b -t 4 -P render.py -- INTERMEDIATE_DIR MODEL_ID
"""
import bpy,sys,pathlib,math
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];p=pathlib.Path(args[0]);name=args[1]
bpy.ops.wm.open_mainfile(filepath=str(p/(name+'.blend')))
points=[o.matrix_world@Vector(c) for o in bpy.context.scene.objects if o.type=='MESH' for c in o.bound_box];lo=Vector([min(c[i] for c in points) for i in range(3)]);hi=Vector([max(c[i] for c in points) for i in range(3)]);size=hi-lo;center=(hi+lo)/2
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=48;s.cycles.use_denoising=False;s.render.resolution_x=1000;s.render.resolution_y=750;s.render.resolution_percentage=100;s.world=bpy.data.worlds.new('World');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.6,.65,.72,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.5
for location,power,scale in [((4,-5,7),1200,5),((-5,-1,4),800,4),((1,6,5),1400,3)]:
 bpy.ops.object.light_add(type='AREA',location=location);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=scale;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01));plane=bpy.context.object;m=bpy.data.materials.new('Ground');m.diffuse_color=(.17,.19,.22,1);plane.data.materials.append(m)
s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG'
for i,v in enumerate([(1.6,-2.6,1.15),(-1.6,2.6,1.15)]):
 bpy.ops.object.camera_add(location=center+Vector(v)*max(size));cam=bpy.context.object;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=max(size)*1.18;cam.data.clip_end=1000;s.camera=cam;s.render.filepath=str(p/(name+str(i)+'.png'));bpy.ops.render.render(write_still=True)
