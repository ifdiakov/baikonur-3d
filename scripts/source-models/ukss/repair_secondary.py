# SPDX-License-Identifier: GPL-2.0-or-later
"""Targeted secondary MAX recovery, applied after source hierarchy repair.

Modifies 60 Mirror nodes, four Capsule nodes, two single-operand Boolean
nodes, one Extrude node and two explicitly renderable Line nodes. No export is performed. Source IDs, parameters,
contexts, pivots and corrected matrices are retained in an audit JSON.
"""
import argparse
import json
import math
from pathlib import Path
import struct
import sys
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parent))
from source_scene_transforms import (get_source, source_pivot_matrix, source_world_matrix,
                                     bind_source_object, objects_by_source_index, source_materials)
from secondary_source import ROOT

SOURCES={
 'mirror':'https://help.autodesk.com/cloudhelp/2023/ENU/MAXScript-Help/files/3ds-Max-Objects-and-Interfaces/Modifier-MAXWrapper-and/Modifier-and-SpacewarpModifier/Modifiers/Parametric-Modifiers/GUID-20733738-BEBA-42D8-83B6-6CC3DB5CB803.html',
 'modContext':'https://help.autodesk.com/cloudhelp/2023/ENU/Max-Developer-Help/cpp_ref/class_mod_context.html',
 'capsule':'https://help.autodesk.com/cloudhelp/2026/ENU/MAXScript-Help/files/3ds-Max-Objects-and-Interfaces/Node-MAXWrapper/Node-Subclasses/GeometryClass-Node/Geometry-Extended-Objects/GUID-8BA587BB-37EA-467C-ABB5-9796E4A74F8D.html',
 'extrude':'https://help.autodesk.com/cloudhelp/2024/ENU/MAXScript-Help/files/3ds-Max-Objects-and-Interfaces/Modifier-MAXWrapper-and/Modifier-and-SpacewarpModifier/Modifiers/Mesh-Editing/GUID-C6D6E1AB-915F-47F6-8EC0-7955623CA5B3.html',
 'splineLineTypes':'https://help.autodesk.com/cloudhelp/2026/ENU/MAXDEV-CPP-API-REF/group___line__types.html',
 'splineKnot':'https://help.autodesk.com/cloudhelp/2026/ENU/MAXDEV-CPP-API-REF/class_spline_knot.html',
 'renderableLine':'https://help.autodesk.com/cloudhelp/2024/ENU/MAXScript-Help/files/3ds-Max-Objects-and-Interfaces/Node-MAXWrapper/Node-Subclasses/Shape-Node/Shapes-Splines/GUID-B2A4BCD6-2A44-4C6E-BA95-0EF67D80448B.html'
}

def node_audit(node):
    s=get_source();index=node['sceneIndex']
    return {'sourceSceneIndex':index,'name':node['name'],'parentSceneIndex':node['parentSceneIndex'],
            'sourceMeshIndex':node['meshSceneIndex'],'worldMatrix':s.world(index).tolist(),
            'sourcePivotMatrix':s.pivot(index).tolist()}

def capsule_geometry(params):
    radius=float(params[0]);height=float(params[1]);heighttype=int(params[2]);sides=int(params[3]);segments=int(params[4])
    assert radius>0 and height>0 and sides>=3 and segments>=1
    assert not params[6] and params[7]==0 and params[8]==0,'Sliced capsule is not supported by this targeted repair'
    overall=height if heighttype==0 else height+2*radius
    assert overall>=2*radius
    # Use the saved radial side count and height-segment count. The analytic
    # hemispheres share the exact source radius. Their axial tessellation is
    # explicitly recorded because MAX stores no independent cap-segment field.
    cap_segments=max(2,math.ceil(sides/4))
    rings=[]
    for i in range(1,cap_segments+1):
        angle=-math.pi/2+math.pi/2*i/cap_segments
        rings.append((radius*math.cos(angle),radius+radius*math.sin(angle)))
    for i in range(1,segments+1):rings.append((radius,radius+(overall-2*radius)*i/segments))
    for i in range(1,cap_segments):
        angle=math.pi/2*i/cap_segments;rings.append((radius*math.cos(angle),overall-radius+radius*math.sin(angle)))
    vertices=[[0,0,0]]
    for r,z in rings:
        vertices.extend([[r*math.cos(2*math.pi*j/sides),r*math.sin(2*math.pi*j/sides),z] for j in range(sides)])
    top=len(vertices);vertices.append([0,0,overall]);faces=[]
    for j in range(sides):faces.append([0,1+(j+1)%sides,1+j])
    for ring in range(len(rings)-1):
        a=1+ring*sides;b=a+sides
        for j in range(sides):faces.append([a+j,a+(j+1)%sides,b+(j+1)%sides,b+j])
    last=1+(len(rings)-1)*sides
    for j in range(sides):faces.append([last+j,last+(j+1)%sides,top])
    return vertices,faces,{'radius':radius,'height':height,'heightType':heighttype,'overallHeight':overall,
                           'sides':sides,'heightSegments':segments,'capSegmentsUsed':cap_segments,
                           'surfaceBasis':'exact analytic capsule parameters; cap tessellation reproduced locally'}

def spline_geometry(mesh_index,require_closed=True,require_planar=True):
    s=get_source();knots=[];closed=None;steps=6
    def walk(parts):
        nonlocal closed,steps
        for kind,a,b,container in parts:
            if kind==0x290a:
                raw=s.data[a:b];assert len(raw)%52==0
                for offset in range(0,len(raw),52):
                    value=struct.unpack_from('<iif9fI',raw,offset)
                    knots.append({'knotType':value[0],'lineType':value[1],'parameter':value[2],
                                  'point':list(value[3:6]),'in':list(value[6:9]),'out':list(value[9:12]),'flags':value[12]})
            elif kind==0x290d:closed=struct.unpack_from('<I',s.data,a)[0]
            elif kind==0x1050 and b-a==4:steps=struct.unpack_from('<I',s.data,a)[0]
            if container:walk(s.children(a,b))
    walk(s.parts(mesh_index));assert knots and closed in (0,1)
    if require_closed:assert closed==1
    points=[]
    limit=len(knots) if closed else len(knots)-1
    for index,knot in enumerate(knots[:limit]):
        nxt=knots[(index+1)%len(knots)]
        samples=1 if knot['lineType']==1 else steps+1
        a=np.array(knot['point']);b=np.array(knot['out']);c=np.array(nxt['in']);d=np.array(nxt['point'])
        for j in range(samples):
            t=j/samples
            p=(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d if knot['lineType']==0 else a*(1-t)+d*t
            points.append(p.tolist())
    if not closed:points.append(knots[-1]['point'])
    if require_planar:assert max(abs(p[2]) for p in points)<1e-6
    area=sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points)))/2
    if require_planar and require_closed and area<0:points.reverse()
    return points,{'closed':bool(closed),'knots':knots,'sourceInterpolationSteps':steps,'sampledVertices':len(points),'signedXYArea':area}

def source_line_geometry(mesh_index):
    """Saved 3D spline sampled with its step count and radial render settings."""
    s=get_source();params=s.params(s.refs(mesh_index)[0])
    # Legacy ShapeObject PB order: renderer thickness/sides/angle [0..2],
    # viewport settings [3..5], renderable [6], UV [7], viewport mesh [8],
    # separate viewport settings [9], settings selector [10], rectangle [11].
    # The defaults and fields align with Autodesk's documented Line properties;
    # compare the source's non-renderable Line469 PB: p6/p8 are both zero.
    assert params[6]==1 and params[8]==1 and params[9]==0 and params[11]==0,params
    assert params[0]>0 and params[1]>=3 and params[2]==0
    points,shape=spline_geometry(mesh_index,require_closed=False,require_planar=False)
    assert not shape['closed']
    points=np.asarray(points,dtype=float);sides=int(params[1]);radius=float(params[0])/2
    tangents=[]
    for i in range(len(points)):
        d=points[min(i+1,len(points)-1)]-points[max(i-1,0)]
        length=np.linalg.norm(d);assert length>1e-10
        tangents.append(d/length)
    first=tangents[0];reference=np.eye(3)[int(np.argmin(np.abs(first)))]
    u=reference-first*np.dot(reference,first);u/=np.linalg.norm(u)
    vertices=[];previous=first
    for p,tangent in zip(points,tangents):
        axis=np.cross(previous,tangent);sin=float(np.linalg.norm(axis));cos=float(np.dot(previous,tangent))
        if sin>1e-10:
            axis/=sin;u=u*cos+np.cross(axis,u)*sin+axis*np.dot(axis,u)*(1-cos)
        u-=tangent*np.dot(u,tangent);u/=np.linalg.norm(u)
        v=np.cross(tangent,u)
        for side in range(sides):
            angle=2*math.pi*side/sides
            vertices.append((p+radius*(math.cos(angle)*u+math.sin(angle)*v)).tolist())
        previous=tangent
    faces=[list(reversed(range(sides)))]
    for i in range(len(points)-1):
        a=i*sides;b=a+sides
        for j in range(sides):faces.append([a+j,a+(j+1)%sides,b+(j+1)%sides,b+j])
    faces.append(list(range((len(points)-1)*sides,len(points)*sides)))
    description={'params':params,'renderable':True,'displayRenderMesh':True,'useViewportSettings':False,
                 'diameter':params[0],'radius':radius,'sides':sides,'spline':shape,
                 'geometryBasis':'saved Bezier points and handles; saved diameter/sides; local parallel-transport tube frames',
                 'flagMappingBasis':'legacy ShapeObject parameter ordering; cross-checked against source Line469 defaults and documented Line properties'}
    return vertices,faces,description

def make_source_mesh(node,vertices,faces,material_ids=None,smooth=False):
    import bpy
    index=node['sceneIndex'];assert not objects_by_source_index().get(index),('Node already exists',index,node['name'])
    mesh=bpy.data.meshes.new(node['name']+' · recovered source mesh');mesh.from_pydata(vertices,[],faces);mesh.update()
    assert not mesh.validate(verbose=False),'Recovered source topology needed correction'
    mesh.transform(source_pivot_matrix(index))
    obj=bpy.data.objects.new(node['name'],mesh);bpy.context.scene.collection.objects.link(obj)
    bind_source_object(obj,index)
    material_ref=node['references'].get('3',node['references'].get(3))
    materials=source_materials(material_ref) if material_ref is not None else []
    assert materials,('No imported material for source reference',material_ref,node['name'])
    for material in materials:mesh.materials.append(material)
    for i,polygon in enumerate(mesh.polygons):
        polygon.use_smooth=bool(smooth)
        if material_ids is not None:polygon.material_index=min(material_ids[i],len(materials)-1)
    obj['sourceRecovered']=True
    return obj

def repair_secondary():
    import bpy
    from mathutils import Matrix
    s=get_source();audit={'sources':SOURCES,'mirror':[],'capsule':[],'boolean':[],'extrude':[],'directLine':[]}
    modified=json.loads((ROOT/'ukss_modifier_audit.json').read_text())['modifiedNodes']
    by_index=objects_by_source_index();reflection=np.diag([-1,1,1,1])
    for record in modified:
        mods=record['stack'].get('modifiers',[])
        if not any(m['class']=='Mirror' for m in mods):continue
        assert len(mods)==1
        node=s.nodes_by_index[record['nodeSceneIndex']];index=node['sceneIndex'];mod=mods[0]
        props=s.params(mod['references'][1]);assert props=={0:0,1:0,2:0.0},props
        context=s.mod_context(node['meshSceneIndex']);gizmo=s.prs(mod['references'][0]);pivot=s.pivot(index)
        # Autodesk ModContext: object -> context -> deformation -> inverse
        # context. Mirror gizmo is itself placed in that modifier space.
        deformation=np.linalg.inv(context)@gizmo@reflection@np.linalg.inv(gizmo)@context
        baked=pivot@deformation@np.linalg.inv(pivot)
        objects=by_index.get(index,[]);assert len(objects)==1,(index,node['name'],objects)
        obj=objects[0];assert obj.type=='MESH' and not obj.get('sourceMirrorRestored')
        obj.data=obj.data.copy();obj.data.transform(Matrix(baked.tolist()));obj.data.flip_normals();obj.data.update()
        obj['sourceMirrorRestored']=True
        entry=node_audit(node);entry.update({'params':props,'modifierSceneIndex':mod['sceneIndex'],
                                           'gizmoMatrix':gizmo.tolist(),'modContextMatrix':context.tolist(),
                                           'rawDeformationMatrix':deformation.tolist(),'bakedMeshCorrectionMatrix':baked.tolist(),
                                           'objectName':obj.name,'vertices':len(obj.data.vertices),'faces':len(obj.data.polygons)})
        audit['mirror'].append(entry)
    for index,node in s.nodes_by_index.items():
        if node['meshClass']=='Capsule':
            param_index=s.refs(node['meshSceneIndex'])[0];params=s.params(param_index)
            vertices,faces,description=capsule_geometry(params)
            obj=make_source_mesh(node,vertices,faces,smooth=bool(params[5]));obj['sourceCapsuleRestored']=True
            entry=node_audit(node);entry.update({'parameterSceneIndex':param_index,'params':params,'geometry':description,
                                                'objectName':obj.name,'vertices':len(vertices),'faces':len(faces)})
            audit['capsule'].append(entry)
        elif node['meshClass']=='Boolean':
            refs=s.refs(node['meshSceneIndex']);assert len(refs)==5 and refs[1]==refs[3]==0xffffffff
            mesh=s.mesh(refs[0]);operand_matrix=s.prs(refs[2]);assert np.allclose(operand_matrix,np.eye(4),atol=1e-8)
            obj=make_source_mesh(node,mesh['vertices'],mesh['faces'],mesh['materialIds']);obj['sourceBooleanRestored']=True
            entry=node_audit(node);entry.update({'operandA':refs[0],'operandB':None,'operandMatrix':operand_matrix.tolist(),
                                                'geometryBasis':'exact stored operand A mesh; no operand B exists in source',
                                                'objectName':obj.name,'vertices':len(mesh['vertices']),'faces':len(mesh['faces'])})
            audit['boolean'].append(entry)
        elif node['meshClass']=='Line':
            assert node['name'] in ('Line717','Line718'),node
            vertices,faces,description=source_line_geometry(node['meshSceneIndex'])
            obj=make_source_mesh(node,vertices,faces,smooth=bool(description['params'][20]))
            obj.data.polygons[0].use_smooth=False;obj.data.polygons[-1].use_smooth=False
            obj['sourceDirectLineRestored']=True
            entry=node_audit(node);entry.update({'geometry':description,'objectName':obj.name,
                                                'vertices':len(vertices),'faces':len(faces),
                                                'worldBounds':s.bounds(vertices,s.world(index)@s.pivot(index))})
            audit['directLine'].append(entry)
    for record in modified:
        mods=record['stack'].get('modifiers',[])
        if not any(m['class']=='Extrude' for m in mods):continue
        assert len(mods)==1
        node=s.nodes_by_index[record['nodeSceneIndex']];params=s.params(mods[0]['references'][0]);assert params[0]==.25
        assert params[1]==1 and params[2]==params[3]==1
        ring,shape=spline_geometry(record['leafBase']['sceneIndex']);count=len(ring)
        vertices=ring+[[x,y,z+params[0]] for x,y,z in ring]
        faces=[list(reversed(range(count))),list(range(count,2*count))]
        for i in range(count):j=(i+1)%count;faces.append([i,j,j+count,i+count])
        material_ids=[0,1]+[2]*count
        obj=make_source_mesh(node,vertices,faces,material_ids,smooth=bool(params[9]));obj['sourceExtrudeRestored']=True
        obj.data.polygons[0].use_smooth=False;obj.data.polygons[1].use_smooth=False
        entry=node_audit(node);entry.update({'params':params,'spline':shape,'objectName':obj.name,'vertices':len(vertices),'faces':len(faces)})
        audit['extrude'].append(entry)
    bpy.context.view_layer.update()
    expected={'mirror':60,'capsule':4,'boolean':2,'extrude':1,'directLine':2}
    assert {k:len(audit[k]) for k in expected}==expected
    for kind in expected:
        for entry in audit[kind]:
            obj=bpy.data.objects[entry['objectName']];want=s.world(entry['sourceSceneIndex'])
            assert np.max(np.abs(np.array(obj.matrix_world)-want))<2e-3,(kind,entry['name'],'world matrix changed')
    audit['counts']=expected
    (ROOT/'ukss_secondary_modifier_audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    print('SECONDARY_MODIFIERS_REPAIRED',json.dumps(expected),flush=True)
    return audit

if __name__=='__main__':
    import bpy
    parser=argparse.ArgumentParser();parser.add_argument('--input');parser.add_argument('--output')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.input:bpy.ops.wm.open_mainfile(filepath=str(Path(args.input).resolve()))
    repair_secondary()
    if args.output:bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.output).resolve()))
