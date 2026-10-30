# SPDX-License-Identifier: GPL-2.0-or-later
"""Source-parameter primitive recovery with Blender's data API only.

Max Box/Cylinder are based at z=0; Blender's stock primitive operators use
centred geometry. The source segmentation is retained (cylinders: 8/12 sides,
one or five height segments), avoiding both offset errors and bpy.ops updates.
"""
import json
import math
from pathlib import Path

from source_scene_transforms import (get_source, source_pivot_matrix, bind_source_object,
                                     objects_by_source_index, source_materials)
from secondary_source import ROOT

def box_geometry(p):
    length,width,height=p[0],p[1],p[2]
    assert length>0 and width>0 and height>0 and [p[3],p[4],p[5]]==[1,1,1]
    x,y=width/2,length/2
    vertices=[[-x,-y,0],[x,-y,0],[x,y,0],[-x,y,0],[-x,-y,height],[x,-y,height],[x,y,height],[-x,y,height]]
    faces=[[3,2,1,0],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
    uv=[[(0,0),(1,0),(1,1),(0,1)] for _ in faces]
    return vertices,faces,uv,[False]*len(faces),bool(p[6])

def cylinder_geometry(p):
    radius,height,segments,cap_segments,sides=p[0],p[1],int(p[2]),int(p[3]),int(p[4])
    assert radius>0 and height>0 and segments>=1 and cap_segments==1 and sides>=3
    assert p[6]==0 and p[7]==p[8]==0,'Unexpected sliced source cylinder'
    vertices=[];faces=[];uv=[];smooth=[]
    for ring in range(segments+1):
        z=height*ring/segments
        vertices.extend([[radius*math.cos(2*math.pi*j/sides),radius*math.sin(2*math.pi*j/sides),z] for j in range(sides)])
    bottom=len(vertices);vertices.append([0,0,0]);top=len(vertices);vertices.append([0,0,height])
    for ring in range(segments):
        for j in range(sides):
            nxt=(j+1)%sides;a=ring*sides;b=a+sides
            faces.append([a+j,a+nxt,b+nxt,b+j]);smooth.append(bool(p[5]))
            uv.append([(j/sides,ring/segments),((j+1)/sides,ring/segments),((j+1)/sides,(ring+1)/segments),(j/sides,(ring+1)/segments)])
    def radial(j):return(.5+.5*math.cos(2*math.pi*j/sides),.5+.5*math.sin(2*math.pi*j/sides))
    for j in range(sides):
        nxt=(j+1)%sides;last=segments*sides
        faces.append([bottom,nxt,j]);uv.append([(.5,.5),radial(nxt),radial(j)]);smooth.append(False)
        faces.append([top,last+j,last+nxt]);uv.append([(.5,.5),radial(j),radial(nxt)]);smooth.append(False)
    return vertices,faces,uv,smooth,bool(p[9])

def sphere_geometry(p):
    radius=p[0];sides=int(p[1]);rings=max(2,sides//2)
    assert radius>0 and sides>=4 and p[3]==0 and p[4]==0 and p[5]==0 and p[7]==0
    vertices=[[0,0,-radius]];faces=[];uv=[]
    for ring in range(1,rings):
        a=-math.pi/2+math.pi*ring/rings
        vertices.extend([[radius*math.cos(a)*math.cos(2*math.pi*j/sides),radius*math.cos(a)*math.sin(2*math.pi*j/sides),radius*math.sin(a)] for j in range(sides)])
    top=len(vertices);vertices.append([0,0,radius])
    for j in range(sides):
        nxt=(j+1)%sides;faces.append([0,1+nxt,1+j]);uv.append([((j+.5)/sides,0),((j+1)/sides,1/rings),(j/sides,1/rings)])
    for ring in range(rings-2):
        a=1+ring*sides;b=a+sides
        for j in range(sides):
            nxt=(j+1)%sides;faces.append([a+j,a+nxt,b+nxt,b+j])
            uv.append([(j/sides,(ring+1)/rings),((j+1)/sides,(ring+1)/rings),((j+1)/sides,(ring+2)/rings),(j/sides,(ring+2)/rings)])
    last=1+(rings-2)*sides
    for j in range(sides):
        nxt=(j+1)%sides;faces.append([last+j,last+nxt,top]);uv.append([(j/sides,(rings-1)/rings),((j+1)/sides,(rings-1)/rings),((j+.5)/sides,1)])
    return vertices,faces,uv,[bool(p[2])]*len(faces),bool(p[6])

BUILDERS={'Box':box_geometry,'Cylinder':cylinder_geometry,'Sphere':sphere_geometry}

def primitive_targets(source):
    for index,node in source.nodes_by_index.items():
        mesh=node['meshSceneIndex']
        if mesh is None:continue
        while source.items[mesh][0] in (0x2032,0x2033):
            refs=source.refs(mesh);assert refs;mesh=refs[-1]
        kind=source.class_name(source.items[mesh][0])
        if kind in BUILDERS:yield index,node,kind,mesh

def repair_primitives():
    import bpy
    source=get_source();by_index=objects_by_source_index();materials={}
    for obj in bpy.data.objects:
        reference=obj.get('sourceMaterialSceneIndex')
        if reference is not None and obj.type=='MESH' and len(obj.data.materials):materials[int(reference)]=list(obj.data.materials)
    records=[];counts={key:0 for key in BUILDERS}
    for index,node,kind,base_mesh in primitive_targets(source):
        param_ref=source.refs(base_mesh)[0];params=source.params(param_ref)
        vertices,faces,uv,smooth,generate_uv=BUILDERS[kind](params)
        assert all(math.isfinite(v) for point in vertices for v in point)
        previous=by_index.get(index,[]);assert len(previous)<=1
        obj=previous[0] if previous else None
        material_ref=node['references'].get('3',node['references'].get(3))
        mats=list(obj.data.materials) if obj else materials.get(material_ref,[])
        if not mats and material_ref is not None:
            mats=source_materials(material_ref);materials[material_ref]=mats
            assert mats,('No source material available',index,node['name'],material_ref)
        mesh=bpy.data.meshes.new(node['name']+'__source_primitive');mesh.from_pydata(vertices,[],faces);mesh.update()
        assert not mesh.validate(verbose=False),('Invalid generated source primitive',index)
        for mat in mats:mesh.materials.append(mat)
        for polygon,shading in zip(mesh.polygons,smooth):polygon.use_smooth=shading
        if generate_uv:
            layer=mesh.uv_layers.new(name='Source generated UV')
            layer.data.foreach_set('uv',[value for face in uv for point in face for value in point])
        pivot=source_pivot_matrix(index);mesh.transform(pivot)
        if obj is None:
            obj=bpy.data.objects.new(node['name'],mesh);bpy.context.scene.collection.objects.link(obj)
            bind_source_object(obj,index)
        else:obj.data=mesh
        obj['sourcePrimitiveRecovered']=kind;obj['sourcePrimitiveParameterSceneIndex']=param_ref
        mesh.calc_loop_triangles();counts[kind]+=1
        records.append({'sourceSceneIndex':index,'sourceNodeName':node['name'],'objectName':obj.name,
                        'primitiveClass':kind,'parameterSceneIndex':param_ref,'parameters':params,
                        'sourceBaseMeshIndex':base_mesh,'underDerivedObject':base_mesh!=node['meshSceneIndex'],
                        'vertices':len(mesh.vertices),'polygons':len(mesh.polygons),'triangles':len(mesh.loop_triangles),
                        'generateUV':generate_uv,'replacedStockPrimitive':bool(previous)})
    assert counts=={'Box':760,'Cylinder':793,'Sphere':4}
    bpy.context.view_layer.update()
    report={'counts':counts,'records':records,'method':'Direct mesh data API; saved source dimensions, base datum and segmentation',
            'sources':[
                'https://help.autodesk.com/cloudhelp/2026/ENU/3DSMax-Modeling/files/GUID-97C903B3-A972-45BA-A6E4-1DE9A6343BAF.htm',
                'https://help.autodesk.com/cloudhelp/2023/ENU/3DSMax-Modeling/files/GUID-4F8C1168-C1D2-4348-AC1F-394A055DBE4C.htm']}
    (ROOT/'ukss_primitive_recovery.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print('SOURCE_PRIMITIVES_RECOVERED',json.dumps(counts),flush=True)
    return report

if __name__=='__main__':
    source=get_source();counts={key:0 for key in BUILDERS}
    for index,node,kind,base_mesh in primitive_targets(source):
        p=source.params(source.refs(base_mesh)[0]);v,f,uv,smooth,generate=BUILDERS[kind](p)
        assert len(f)==len(uv)==len(smooth)
        assert all(len(face)==len(face_uv) for face,face_uv in zip(f,uv))
        assert all(0<=i<len(v) for face in f for i in face)
        counts[kind]+=1
    print('SOURCE_PRIMITIVE_DATA_PASS',json.dumps(counts))
