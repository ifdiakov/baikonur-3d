# SPDX-License-Identifier: GPL-2.0-or-later
"""TUA primitives rebuilt from saved source parameters using the mesh data API."""
import json,math
from pathlib import Path
from tua_transforms import get_source
from source_scene import ROOT
from tua_geometry_common import SourceMeshWriter,assert_source_worlds

from shared_helpers import load_symbols
globals().update(load_symbols('repair_primitives.py',
    ('box_geometry','cylinder_geometry','sphere_geometry'),globals()))

def tube_geometry(p):
    outer,inner=max(p[0],p[1]),min(p[0],p[1]);height=p[2]
    sides,segments,caps=int(p[3]),int(p[4]),int(p[5])
    assert outer>inner>0 and height>0 and sides>=3 and segments>=1 and caps==1
    assert p[7]==0 and p[8]==p[9]==0,('Sliced tube unsupported',p)
    vertices=[];faces=[];smooth=[]
    for zlevel in range(segments+1):
        z=height*zlevel/segments
        for radius in [outer,inner]:
            vertices.extend([[radius*math.cos(2*math.pi*j/sides),radius*math.sin(2*math.pi*j/sides),z] for j in range(sides)])
    for ring in range(segments):
        a=ring*2*sides;b=a+2*sides
        for j in range(sides):
            n=(j+1)%sides
            faces.append([a+j,a+n,b+n,b+j]);smooth.append(bool(p[6]))
            faces.append([a+sides+n,a+sides+j,b+sides+j,b+sides+n]);smooth.append(bool(p[6]))
    end=segments*2*sides
    for j in range(sides):
        n=(j+1)%sides
        faces.append([n,j,sides+j,sides+n]);smooth.append(False)
        faces.append([end+j,end+n,end+sides+n,end+sides+j]);smooth.append(False)
    uv=[[(0,0)]*len(f) for f in faces]
    assert not p[10],'Unexpected Tube UV setting'
    return vertices,faces,uv,smooth,False

BUILDERS={'Box':box_geometry,'Cylinder':cylinder_geometry,'Sphere':sphere_geometry,'Tube':tube_geometry}

def primitive_targets(source):
    for index,node in source.nodes_by_index.items():
        mesh=node['meshSceneIndex']
        if mesh is None:continue
        while source.items[mesh][0] in (0x2032,0x2033):mesh=source.refs(mesh)[-1]
        kind=source.class_name(source.items[mesh][0])
        if kind in BUILDERS:yield index,node,kind,mesh

def recover_tua_primitives():
    source=get_source();writer=SourceMeshWriter();records=[];counts={k:0 for k in BUILDERS}
    for index,node,kind,leaf in primitive_targets(source):
        parameter=source.refs(leaf)[0];p=source.params(parameter)
        vertices,faces,uv,smooth,generate_uv=BUILDERS[kind](p)
        obj=writer.replace(index,vertices,faces,smooth=smooth,uv=uv if generate_uv else None)
        obj['sourcePrimitiveRecovered']=kind;obj['sourcePrimitiveParameterSceneIndex']=parameter
        obj.data.calc_loop_triangles();counts[kind]+=1
        records.append({'sourceSceneIndex':index,'sourceNodeName':node['name'],'primitive':kind,
                        'sourceBaseMeshIndex':leaf,'parameterSceneIndex':parameter,'parameters':p,
                        'vertices':len(vertices),'polygons':len(faces),'triangles':len(obj.data.loop_triangles)})
    assert counts=={'Box':78,'Cylinder':305,'Sphere':4,'Tube':1},counts
    error=assert_source_worlds()
    result={'counts':counts,'maximumWorldMatrixError':error,'records':records,
            'method':'Saved source parameters, base datum and radial/axial subdivision; Blender data API',
            'tubeSource':'https://help.autodesk.com/cloudhelp/2018/ENU/MAXScript-Help/files/GUID-924ACD1D-2B90-4CEF-A28B-4DCF5498E592.htm'}
    (ROOT/'tua_primitive_recovery.json').write_text(json.dumps(result,indent=2));print('TUA_PRIMITIVES',json.dumps(counts),flush=True)
    return result

if __name__=='__main__':
    source=get_source();counts={k:0 for k in BUILDERS}
    for index,node,kind,leaf in primitive_targets(source):
        p=source.params(source.refs(leaf)[0]);v,f,uv,smooth,generate=BUILDERS[kind](p)
        assert len(f)==len(uv)==len(smooth)
        assert all(0<=i<len(v) for face in f for i in face)
        counts[kind]+=1
    print('PRIMITIVE_PARAMETER_CHECK',json.dumps(counts))
