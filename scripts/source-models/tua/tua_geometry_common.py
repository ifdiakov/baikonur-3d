# SPDX-License-Identifier: GPL-2.0-or-later
"""Data-API replacement of deferred source objects; source hierarchy is kept."""
import math
import numpy as np

from tua_transforms import get_source, source_pivot_matrix, objects_by_source_index, source_materials

class SourceMeshWriter:
    def __init__(self):
        import bpy
        self.objects=objects_by_source_index()
        self.materials={}
        for obj in bpy.data.objects:
            ref=obj.get('sourceMaterialSceneIndex')
            if ref not in (None,0xffffffff) and obj.type=='MESH' and obj.data.materials:
                self.materials[int(ref)]=list(obj.data.materials)

    def replace(self,index,vertices,faces,*,smooth=False,material_ids=None,uv=None,coordinates_have_pivot=False):
        import bpy
        source=get_source();node=source.nodes_by_index[index]
        old=self.objects.get(index,[])
        assert len(old)==1,('Source placeholder identity',index,len(old))
        old=old[0]
        assert all(math.isfinite(float(x)) for v in vertices for x in v)
        mesh=bpy.data.meshes.new(node['name']+' · source recovery')
        mesh.from_pydata(vertices,[],faces);mesh.update()
        assert not mesh.validate(verbose=False),('Invalid reconstructed topology',index,node['name'])
        ref=node['references'].get('3',node['references'].get(3))
        materials=list(old.data.materials) if old.type=='MESH' else self.materials.get(ref,[])
        if not materials and ref not in (None,0xffffffff):
            materials=source_materials(ref);self.materials[ref]=materials
            assert materials,('Missing source material',index,ref)
        for m in materials:mesh.materials.append(m)
        for i,polygon in enumerate(mesh.polygons):
            polygon.use_smooth=bool(smooth[i] if isinstance(smooth,(list,tuple)) else smooth)
            if material_ids is not None:polygon.material_index=min(int(material_ids[i]),max(0,len(materials)-1))
        if uv:
            assert len(uv)==len(mesh.polygons)
            layer=mesh.uv_layers.new(name='Source generated UV')
            layer.data.foreach_set('uv',[v for face in uv for point in face for v in point])
        if not coordinates_have_pivot:mesh.transform(source_pivot_matrix(index))
        if old.type=='MESH':
            obj=old;obj.data=mesh
        else:
            old_name=old.name;obj=bpy.data.objects.new(old_name+' · recovered',mesh)
            bpy.context.scene.collection.objects.link(obj)
            for key in old.keys():obj[key]=old[key]
            obj.parent=old.parent;obj.matrix_parent_inverse=old.matrix_parent_inverse.copy();obj.matrix_basis=old.matrix_basis.copy()
            for child in list(old.children):
                inverse=child.matrix_parent_inverse.copy();basis=child.matrix_basis.copy()
                child.parent=obj;child.matrix_parent_inverse=inverse;child.matrix_basis=basis
            bpy.data.objects.remove(old,do_unlink=True);obj.name=old_name
            self.objects[index]=[obj]
        if 'sourceDeferredGeometry' in obj:del obj['sourceDeferredGeometry']
        obj['sourceGeometryRecovered']=True
        return obj

def assert_source_worlds():
    import bpy
    bpy.context.view_layer.update();source=get_source();maximum=0.0
    ids=[]
    for obj in bpy.data.objects:
        if 'sourceSceneIndex' not in obj:continue
        index=int(obj['sourceSceneIndex']);ids.append(index)
        error=float(np.max(np.abs(np.asarray(obj.matrix_world)-source.world(index))))
        maximum=max(maximum,error)
        assert error<2e-3,(index,obj.name,error)
    assert len(ids)==len(set(ids))==len(source.nodes_by_index)==2786
    return maximum
