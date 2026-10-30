# SPDX-License-Identifier: GPL-2.0-or-later
"""Recover this scene's 63 Lattice meshes from their saved topology/parameters.

No freehand members: every strut is a source mesh edge. Autodesk describes
Lattice and its visible-edge option here:
https://help.autodesk.com/cloudhelp/2021/ENU/3DSMax-Modifiers/files/GUID-9D61922D-9155-4DB6-A259-1B800C49CBC6.htm
The source face visibility bits are documented in MeshFaceFlagConstants.h:
https://help.autodesk.com/cloudhelp/2024/ENU/Max-Developer-Help/cpp_ref/_mesh_face_flag_constants_8h.html
"""
import json
import math
from pathlib import Path
import struct

from ukss_config import OUT

def parameter_values(block):
    values={}
    for chunk in block['chunks']:
        if chunk['kind']!='0x2':continue
        fields=chunk['children']
        index=next(p['uint32'] for p in fields if p['kind']=='0x3')
        value=next(p for p in fields if p['kind'] in ('0x100','0x101'))
        values[index]=value['float32'] if index in (1,7) else value['uint32']
    return values

def mesh_topology(base,ignore_hidden):
    fields=next(c['children'] for c in base['chunks'] if c['kind']=='0x8fe')
    raw={int(c['kind'],16):bytes.fromhex(c.get('hex','')) for c in fields}
    faces=[];flags=[]
    if base['class']=='Editable Mesh':
        chunk=raw[0x914];count=struct.unpack_from('<I',chunk)[0]
        assert len(chunk)==4+count*12
        vertices=[struct.unpack_from('<fff',chunk,4+i*12) for i in range(count)]
        chunk=raw[0x912];count=struct.unpack_from('<I',chunk)[0]
        assert len(chunk)==4+count*20
        for i in range(count):
            a,b,c,smoothing,visibility,material=struct.unpack_from('<IIIIHH',chunk,4+i*20)
            faces.append((a,b,c));flags.append(visibility)
    elif base['class']=='Editable Poly':
        chunk=raw[0x100];count=struct.unpack_from('<I',chunk)[0]
        assert len(chunk)==4+count*16
        vertices=[struct.unpack_from('<fff',chunk,8+i*16) for i in range(count)]
        chunk=raw[0x11a];face_count=struct.unpack_from('<I',chunk)[0];offset=4
        while offset<len(chunk):
            count=struct.unpack_from('<I',chunk,offset)[0];offset+=4
            face=struct.unpack_from('<'+'I'*count,chunk,offset);offset+=count*4
            options=struct.unpack_from('<H',chunk,offset)[0];offset+=2
            if options&0x01:offset+=4
            if options&0x08:offset+=2
            if options&0x10:offset+=4
            if options&0x20:offset+=8*(count-3)
            faces.append(face);flags.append((1<<count)-1)
        assert len(faces)==face_count and offset==len(chunk)
    else:raise AssertionError('Unsupported Lattice base '+base['class'])
    all_edges=set();visible_edges=set()
    for face,visibility in zip(faces,flags):
        for index,a in enumerate(face):
            b=face[(index+1)%len(face)];assert a<len(vertices) and b<len(vertices)
            edge=tuple(sorted((a,b)));all_edges.add(edge)
            if visibility&(1<<index):visible_edges.add(edge)
    edges=visible_edges if ignore_hidden else all_edges
    assert vertices and edges and all(math.isfinite(x) for v in vertices for x in v)
    return vertices,sorted(edges),{'sourceVertices':len(vertices),'sourceFaces':len(faces),
                                  'allSourceEdges':len(all_edges),'visibleSourceEdges':len(visible_edges)}

def recovery_records():
    audit=json.loads((OUT/'ukss_modifier_audit.json').read_text())
    records=[]
    for node in audit['modifiedNodes']:
        modifiers=[m for m in node['stack'].get('modifiers',[]) if m['class']=='Lattice']
        if not modifiers:continue
        assert len(modifiers)==1 and len(node['stack']['modifiers'])==1,'Unexpected compound modifier stack'
        modifier=modifiers[0]
        params=parameter_values(audit['parameterBlocks'][str(modifier['references'][0])])
        # These saved nodes all use whole-object struts; their unused joint
        # radius remains the default 5.0. Preserve all raw values in the report.
        assert params[0]==0 and params[14]==1
        assert params[2]==1 and params[3] in (3,4)
        vertices,edges,stats=mesh_topology(audit['latticeBaseGeometry'][str(node['leafBase']['sceneIndex'])],bool(params[5]))
        records.append({'sourceSceneIndex':node['nodeSceneIndex'],'sourceNodeName':node['nodeName'],
                        'sourceModifierIndex':modifier['sceneIndex'],'sourceBaseIndex':node['leafBase']['sceneIndex'],
                        'rawParameters':params,'vertices':vertices,'edges':edges,**stats})
    assert len(records)==63
    return records

def strut_mesh(vertices,edges,radius,sides,caps):
    from mathutils import Vector
    positions=[];faces=[];side_face_count=0;nonzero=0
    for start,end in edges:
        a,b=Vector(vertices[start]),Vector(vertices[end]);axis=b-a
        assert axis.length>1e-8,'Degenerate source edge'
        axis.normalize()
        reference=Vector((0,0,1)) if abs(axis.z)<.9 else Vector((0,1,0))
        u=axis.cross(reference).normalized();v=axis.cross(u).normalized()
        base=len(positions)
        for center in (a,b):
            for index in range(sides):
                angle=2*math.pi*index/sides
                positions.append(tuple(center+radius*(u*math.cos(angle)+v*math.sin(angle))))
        for index in range(sides):
            nxt=(index+1)%sides
            faces.append((base+index,base+nxt,base+sides+nxt,base+sides+index));side_face_count+=1
        if caps:
            faces.append(tuple(base+index for index in reversed(range(sides))))
            faces.append(tuple(base+sides+index for index in range(sides)))
        nonzero+=1
    return positions,faces,nonzero

def repair_lattice(source_pivot_matrix):
    import bpy
    records=recovery_records();report=[]
    by_source={int(o['sourceSceneIndex']):o for o in bpy.data.objects if 'sourceSceneIndex' in o and o.type=='MESH'}
    for record in records:
        scene_index=record['sourceSceneIndex'];obj=by_source.get(scene_index)
        assert obj is not None,'Missing imported Lattice base '+record['sourceNodeName']
        params=record['rawParameters'];radius=params[1];sides=params[3];caps=bool(params[6])
        positions,faces,struts=strut_mesh(record['vertices'],record['edges'],radius,sides,caps)
        old_data=obj.data;mesh=bpy.data.meshes.new(old_data.name+'__source_lattice')
        mesh.from_pydata(positions,[],faces);mesh.update();assert not mesh.validate()
        for mat in old_data.materials:mesh.materials.append(mat)
        material=min(params[4],max(0,len(mesh.materials)-1))
        per_strut=sides+(2 if caps else 0)
        for poly in mesh.polygons:
            poly.material_index=material
            poly.use_smooth=bool(params[11]) and poly.index%per_strut<sides
        pivot=source_pivot_matrix(scene_index);mesh.transform(pivot)
        obj.data=mesh;obj['sourceLatticeRecovered']=True
        obj['sourceLatticeStrutRadius']=radius;obj['sourceLatticeStrutCount']=struts
        obj['sourceLatticeSides']=sides;obj['sourceLatticeIgnoreHiddenEdges']=bool(params[5])
        mesh.calc_loop_triangles()
        report.append({k:v for k,v in record.items() if k not in ('vertices','edges')}|{
            'objectName':obj.name,'recoveredStruts':struts,'radius':radius,'sides':sides,'endCaps':caps,
            'previousPolygons':len(old_data.polygons),'newPolygons':len(mesh.polygons),
            'newTriangles':len(mesh.loop_triangles),'sourcePivotMatrix':[list(row) for row in pivot]})
    bpy.context.view_layer.update()
    summary={'recoveredModifiers':len(report),'sourceBasedStruts':sum(r['recoveredStruts'] for r in report),
             'addedTriangles':sum(r['newTriangles'] for r in report),'records':report,
             'basis':'Preserved source mesh edges, visibility flags, ParamBlock radii/sides/caps and source object offsets; no hand-drawn braces.',
             'parameterInterpretation':{'geometryMode0':'struts only, inferred from all saved modes and the source thumbnail: unused joint radius 5 would produce large polyhedra absent from the source image',
                 'publicDocumentationLimit':'Autodesk documents modifier behaviour and visibility bits but does not publish all legacy ParamBlock indices.'}}
    (OUT/'ukss_lattice_recovery.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
    print('LATTICE_RECOVERY',json.dumps({k:v for k,v in summary.items() if k!='records'}),flush=True)
    return summary

if __name__=='__main__':
    records=recovery_records()
    (OUT/'ukss_lattice_recovery_plan.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
    print('LATTICE_PLAN',len(records),'modifiers',sum(len(r['edges']) for r in records),'source edges')
