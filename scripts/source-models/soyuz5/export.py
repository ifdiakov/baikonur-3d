"""Export the user-supplied Soyuz 5.blend, preserving original geometry and markings.
blender -b --factory-startup --disable-autoexec SOURCE.blend --python export.py -- OUTPUT.glb
Run optimize.mjs afterwards. Logo shader graphs are baked in their original UV domain.
"""
import bpy,sys,os,json
from mathutils import Vector
out=sys.argv[sys.argv.index('--')+1]
scene=bpy.context.scene
meshes=[o for o in scene.objects if o.type=='MESH' and len(o.data.polygons)]
original_hidden={o:o.hide_render for o in scene.objects}
scene.render.engine='CYCLES';scene.cycles.samples=4
scene.render.bake.margin=0
scene.world=None
for o in scene.objects:o.hide_render=True
# The logo graphs depend only on UVs, so bake a full [0,1] plane once per
# material. Reuse the source rocket UVs without repacking or degrading them.
for name in ['soyuz-5 logo','energia logo']:
 mat=bpy.data.materials[name];nodes=mat.node_tree.nodes;links=mat.node_tree.links
 bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
 output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
 color=bsdf.inputs['Base Color'].links[0].from_socket
 emission=nodes.new('ShaderNodeEmission');links.new(color,emission.inputs['Color']);links.new(emission.outputs[0],output.inputs['Surface'])
 image=bpy.data.images.new(name+' baked',width=512,height=2048,alpha=False)
 image.colorspace_settings.name='sRGB'
 source_extension=next(n.extension for n in nodes if n.type=='TEX_IMAGE')
 target=nodes.new('ShaderNodeTexImage');target.image=image;target.extension=source_extension;nodes.active=target
 bpy.ops.mesh.primitive_plane_add(size=2)
 plane=bpy.context.object;plane.name='temporary UV bake';plane.data.materials.append(mat)
 bpy.ops.object.bake(type='EMIT',use_clear=True)
 image.pack();links.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
 links.new(target.outputs['Color'],bsdf.inputs['Base Color'])
 # An unconnected image vector uses the original active UV layer.
 for n in list(nodes):
  if n not in [bsdf,output,target]:nodes.remove(n)
 bpy.data.objects.remove(plane,do_unlink=True)
for o,hidden in original_hidden.items():o.hide_render=hidden
# Fine procedural metal noise has no transferable UVs. Use source viewport
# metal colours while retaining the original PBR roughness/metallic values.
for name in ['Aluminium','DarkMetal']:
 mat=bpy.data.materials[name];bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 for link in list(bsdf.inputs['Base Color'].links):mat.node_tree.links.remove(link)
 bsdf.inputs['Base Color'].default_value=mat.diffuse_color
for o in list(scene.objects):
 if o not in meshes:bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
low=min((o.matrix_world@Vector(c)).z for o in meshes for c in o.bound_box)
for o in meshes:o.location.z-=low;o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
print('SOYUZ5_EXPORT_OK',out,os.path.getsize(out))
# A neutral source preview uses exactly the export materials and geometry.
world=bpy.data.worlds.new('Preview world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.26,.33,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
bpy.ops.object.camera_add(location=(35,-75,32));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,30.5))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=69;scene.camera=camera
for loc,power,size in [((15,-25,48),22000,35),((-20,10,25),16000,35)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,30))-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=700;scene.render.resolution_y=1300;scene.render.resolution_percentage=100;scene.cycles.samples=16
scene.render.filepath=os.path.splitext(out)[0]+'-source.png';bpy.ops.render.render(write_still=True)
