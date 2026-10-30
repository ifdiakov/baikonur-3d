# SPDX-License-Identifier: GPL-2.0-or-later
"""Exact source-index hierarchy and transform repair for this MAX scene.

No MAX import is performed here. This operates on the completed stock .blend
and the stock import audit, preserving the latter as a separate checkpoint.
"""
import json
from pathlib import Path
import sys
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parent))
from secondary_source import SourceScene, ROOT

_source=None
def get_source():
    global _source
    if _source is None:_source=SourceScene()
    return _source

def source_pivot_matrix(scene_index):
    """4x4 column-vector mesh offset matrix, in source object coordinates."""
    from mathutils import Matrix
    return Matrix(get_source().pivot(int(scene_index)).tolist())

def source_local_matrix(scene_index):
    from mathutils import Matrix
    s=get_source();node=s.nodes_by_index[int(scene_index)]
    prs=node['references'].get('0',node['references'].get(0))
    return Matrix(s.prs(prs).tolist())

def source_world_matrix(scene_index):
    from mathutils import Matrix
    return Matrix(get_source().world(int(scene_index)).tolist())

def objects_by_source_index():
    import bpy
    result={}
    for obj in bpy.data.objects:
        if 'sourceSceneIndex' in obj:result.setdefault(int(obj['sourceSceneIndex']),[]).append(obj)
    return result

def source_materials(scene_index):
    """Reuse a material already decoded from the same exact source reference."""
    import bpy
    if scene_index is None:return []
    for material in bpy.data.materials:
        if material.get('sourceMaterialSceneIndex')==int(scene_index):return [material]
    for obj in bpy.data.objects:
        if obj.type=='MESH' and len(obj.data.materials) and obj.get('sourceMaterialSceneIndex')==int(scene_index):
            return list(obj.data.materials)
    # Some source materials belong only to skipped geometry. Decode their
    # exact Standard/Blinn values instead of assigning an invented fallback.
    from bpy_extras.node_shader_utils import PrincipledBSDFWrapper
    description=get_source().standard_material(int(scene_index))
    name=description['name']
    if bpy.data.materials.get(name) is not None:name+=" [source %s]"%scene_index
    material=bpy.data.materials.new(name)
    material['sourceMaterialSceneIndex']=int(scene_index)
    material['sourceMaterialDescription']=json.dumps(description)
    shader=PrincipledBSDFWrapper(material,is_readonly=False)
    shader.base_color=material.diffuse_color[:3]=description['diffuse']
    shader.specular_tint=material.specular_color[:3]=description['specular']
    shader.specular=material.specular_intensity=description['glossiness']
    shader.roughness=material.roughness=1-description['shininess']
    shader.alpha=material.diffuse_color[3]=description['opacity']
    shader.metallic=material.metallic=description['metallic']
    shader.emission_color=description['emissive']
    shader.ior=description['ior']
    return [material]

def _install_source_transform(obj,scene_index,source_objects,scale_helpers=None):
    """Preserve ScaleValue shear as two glTF-compatible TRS nodes.

    MAX local=T R Q D Q^-1. The helper holds T (R Q) D and the
    source object holds Q^-1. Source children remain children of the original
    object, so they receive the complete source transform without mesh baking.
    """
    import bpy
    from mathutils import Matrix
    s=get_source();index=int(scene_index);node=s.nodes_by_index[index]
    parents=source_objects.get(node['parentSceneIndex'],[])
    assert parents or node['parentSceneIndex'] not in s.nodes_by_index,('Source parent missing',index,node['parentSceneIndex'])
    parent=parents[0] if parents else None
    prs=node['references'].get('0',node['references'].get(0))
    pos,rotation,scale,orientation=s.prs_components(prs)
    basic=rotation@np.diag(scale)
    actual=s.prs(prs)[:3,:3]
    # Differences smaller than binary32 transform precision do not need an
    # extra node. The final world-matrix audit measures the actual residual.
    needs_helper=float(np.max(np.abs(actual-basic)))>1e-7
    if needs_helper:
        if scale_helpers is None:
            scale_helpers={int(o['sourceScaleBasisHelperFor']):o for o in bpy.data.objects if 'sourceScaleBasisHelperFor' in o}
        helper=scale_helpers.get(index)
        if helper is None:
            helper=bpy.data.objects.new('MAX scale basis [%s]'%index,None)
            bpy.context.scene.collection.objects.link(helper)
            helper['sourceScaleBasisHelperFor']=index
            helper['sourceScaleFactorization']='T R Q D · Q inverse'
            helper.empty_display_type='PLAIN_AXES'
            scale_helpers[index]=helper
        outer,inner=s.prs_factors(prs)
        helper.parent=parent;helper.matrix_parent_inverse=Matrix.Identity(4)
        helper.matrix_basis=Matrix(outer.tolist())
        obj.parent=helper;obj.matrix_parent_inverse=Matrix.Identity(4)
        obj.matrix_basis=Matrix(inner.tolist())
    else:
        obj.parent=parent;obj.matrix_parent_inverse=Matrix.Identity(4)
        obj.matrix_basis=Matrix(s.prs(prs).tolist())
    return needs_helper

def bind_source_object(obj,scene_index):
    """Assign exact identity and local parent transform to a recovered node."""
    s=get_source();node=s.nodes_by_index[int(scene_index)]
    obj['sourceSceneIndex']=int(scene_index);obj['sourceNodeName']=node['name']
    obj['sourceParentSceneIndex']=int(node['parentSceneIndex'])
    material=node['references'].get('3',node['references'].get(3))
    if material is not None:obj['sourceMaterialSceneIndex']=int(material)
    _install_source_transform(obj,scene_index,objects_by_source_index())
    return obj

def repair_hierarchy(report_path=ROOT/'ukss_import_report.json'):
    import bpy
    from mathutils import Matrix
    source=get_source();report=json.loads(Path(report_path).read_text())
    nodes=list(source.nodes_by_index.values());audits=report['nodes']
    assert len(nodes)==len(audits),(len(nodes),len(audits),'source/import node count mismatch')
    mapping={};repaired=[];unimported=[];seen=set();original_world={}
    for node,audit in zip(nodes,audits):
        assert node['name']==audit['name'],(node['sceneIndex'],node['name'],audit['name'])
        index=node['sceneIndex'];objects=[]
        for name in audit.get('createdObjects',[]):
            obj=bpy.data.objects.get(name)
            assert obj is not None,('Imported object missing',index,name)
            assert obj.as_pointer() not in seen,('Object mapped twice',name)
            seen.add(obj.as_pointer());original_world[obj.name]=[list(row) for row in obj.matrix_world]
            obj['sourceSceneIndex']=index;obj['sourceNodeName']=node['name']
            obj['sourceParentSceneIndex']=node['parentSceneIndex']
            material=node['references'].get('3',node['references'].get(3))
            if material is not None:obj['sourceMaterialSceneIndex']=material
            objects.append(obj)
        mapping[index]=objects
        if not objects:unimported.append({'sceneIndex':index,'name':node['name'],'status':audit['status']})
    # First break stale name-based links, then install each relationship by ID.
    for objects in mapping.values():
        for obj in objects:obj.parent=None
    missing_parent_ids=[];scale_helpers={}
    for index,objects in mapping.items():
        node=source.nodes_by_index[index];parents=mapping.get(node['parentSceneIndex'],[])
        if node['parentSceneIndex'] in mapping and not parents and objects:
            missing_parent_ids.append({'child':index,'parent':node['parentSceneIndex']})
        for obj in objects:
            before=original_world[obj.name]
            has_scale_helper=_install_source_transform(obj,index,mapping,scale_helpers)
            repaired.append({'sceneIndex':index,'name':node['name'],'objectName':obj.name,
                             'beforeWorld':before,'sourceWorld':source.world(index).tolist(),
                             'scaleBasisHelper':has_scale_helper})
    bpy.context.view_layer.update()
    maximum_error=0.0
    for index,objects in mapping.items():
        expected=source.world(index)
        for obj in objects:
            error=float(np.max(np.abs(np.asarray(obj.matrix_world)-expected)))
            maximum_error=max(maximum_error,error)
            assert error<2e-3,(index,obj.name,error,'hierarchy transform drift')
    # All stored pivot rotations are identity in this specific source. This
    # proves the stock importer's x/z quaternion swap does not alter this file.
    pivot_differences=[index for index in source.nodes_by_index
                       if not np.allclose(source.pivot(index),source.pivot(index,stock_order=True),atol=1e-8)]
    assert not pivot_differences,pivot_differences
    output={'sourceNodes':len(nodes),'assignedObjects':sum(map(len,mapping.values())),
            'maximumWorldMatrixError':maximum_error,'nonidentityPivotRotationCount':len(pivot_differences),
            'scaleBasisHelperCount':len(scale_helpers),'scaleBasisHelperNodeIds':list(scale_helpers),
            'unimportedNodes':unimported,'missingImportedParents':missing_parent_ids,'repaired':repaired}
    (ROOT/'ukss_hierarchy_repair_report.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
    print('SOURCE_HIERARCHY_REPAIRED',json.dumps({k:v for k,v in output.items() if k not in ('repaired','unimportedNodes','scaleBasisHelperNodeIds')}),flush=True)
    return output
