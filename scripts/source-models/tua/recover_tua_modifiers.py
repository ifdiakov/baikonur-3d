# SPDX-License-Identifier: GPL-2.0-or-later
"""Recover the saved TUA spline geometry and supported modifier stacks.

No scene normalization or detail filtering occurs here. Source dimensions,
source paths, object identities and transforms are retained before display LOD.
"""
import collections
import json
import math
import struct
import numpy as np

from tua_transforms import get_source
from source_scene import ROOT
from tua_geometry_common import SourceMeshWriter,assert_source_worlds

SOURCES={
 'spline':'https://help.autodesk.com/cloudhelp/2021/ENU/3DSMax-MAXScript/files/GUID-6C6A35EB-DD5F-40C1-9869-0938849F6842.htm',
 'mirror':'https://help.autodesk.com/cloudhelp/2023/ENU/MAXScript-Help/files/3ds-Max-Objects-and-Interfaces/Modifier-MAXWrapper-and/Modifier-and-SpacewarpModifier/Modifiers/Parametric-Modifiers/GUID-20733738-BEBA-42D8-83B6-6CC3DB5CB803.html',
 'extrude':'https://help.autodesk.com/cloudhelp/2024/ENU/MAXScript-Help/files/3ds-Max-Objects-and-Interfaces/Modifier-MAXWrapper-and/Modifier-and-SpacewarpModifier/Modifiers/Mesh-Editing/GUID-C6D6E1AB-915F-47F6-8EC0-7955623CA5B3.html',
 'smooth':'https://help.autodesk.com/cloudhelp/2021/ENU/MAXScript-Help/files/3ds-Max-Objects-and-Interfaces/Modifier-MAXWrapper-and/Modifier-and-SpacewarpModifier/Modifiers/Mesh-Editing/GUID-2147DA88-06E0-4F90-B358-E98011E776B6.html',
}

def stack(source,index):
    layers=[]
    while source.items[index][0] in (0x2032,0x2033):
        refs=source.refs(index)
        layers.append({'derived':index,'modifiers':refs[:-1]});index=refs[-1]
    return index,layers

def read_splines(source,leaf):
    curves=[];steps=[]
    def walk(parts):
        fields={k:(a,b,c) for k,a,b,c in parts}
        if 0x290a in fields:
            a,b,_=fields[0x290a];assert (b-a)%52==0
            knots=[]
            for offset in range(a,b,52):
                v=struct.unpack_from('<iif9fI',source.data,offset)
                knots.append({'knotType':v[0],'lineType':v[1],'parameter':v[2],
                              'point':list(v[3:6]),'in':list(v[6:9]),'out':list(v[9:12]),'flags':v[12]})
            ca,cb,_=fields[0x290d];closed=bool(struct.unpack_from('<I',source.data,ca)[0])
            curves.append({'knots':knots,'closed':closed})
        for k,a,b,container in parts:
            if k==0x1050 and b-a==4:steps.append(struct.unpack_from('<I',source.data,a)[0])
            if container:walk(source.children(a,b))
    walk(source.parts(leaf));assert curves and steps and len(set(steps))==1
    return curves,steps[0]

def sample_curve(curve,steps):
    knots=curve['knots'];closed=curve['closed'];points=[]
    for i in range(len(knots) if closed else len(knots)-1):
        k=knots[i];n=knots[(i+1)%len(knots)]
        a,b,c,d=[np.asarray(v,dtype=float) for v in [k['point'],k['out'],n['in'],n['point']]]
        assert k['lineType'] in (0,1)
        count=steps+1 if k['lineType']==0 else 1
        for j in range(count):
            t=j/count
            p=(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d if k['lineType']==0 else a*(1-t)+d*t
            if not points or np.linalg.norm(p-points[-1])>1e-10:points.append(p)
    if not closed:
        last=np.asarray(knots[-1]['point'],dtype=float)
        if np.linalg.norm(last-points[-1])>1e-10:points.append(last)
    elif len(points)>1 and np.linalg.norm(points[0]-points[-1])<=1e-10:points.pop()
    assert len(points)>=2 and np.isfinite(points).all()
    return np.asarray(points)

def sweep_geometry(points,diameter,sides,angle=0):
    """Saved open centerline and diameter, with parallel-transport ring frames."""
    assert diameter>0 and sides>=3
    tangents=[]
    for i in range(len(points)):
        direction=points[min(i+1,len(points)-1)]-points[max(i-1,0)]
        length=np.linalg.norm(direction);assert length>1e-10
        tangents.append(direction/length)
    first=tangents[0];ref=np.eye(3)[int(np.argmin(np.abs(first)))]
    u=ref-first*np.dot(ref,first);u/=np.linalg.norm(u)
    vertices=[];previous=first;radius=diameter/2
    for point,tangent in zip(points,tangents):
        axis=np.cross(previous,tangent);sine=float(np.linalg.norm(axis));cosine=float(np.dot(previous,tangent))
        if sine>1e-10:
            axis/=sine;u=u*cosine+np.cross(axis,u)*sine+axis*np.dot(axis,u)*(1-cosine)
        u-=tangent*np.dot(u,tangent);u/=np.linalg.norm(u);v=np.cross(tangent,u)
        for j in range(sides):
            a=2*math.pi*j/sides+angle
            vertices.append((point+radius*(math.cos(a)*u+math.sin(a)*v)).tolist())
        previous=tangent
    faces=[list(reversed(range(sides)))]
    for ring in range(len(points)-1):
        a=ring*sides;b=a+sides
        for j in range(sides):n=(j+1)%sides;faces.append([a+j,a+n,b+n,b+j])
    faces.append(list(range((len(points)-1)*sides,len(points)*sides)))
    return vertices,faces

def extrude_geometry(source,leaf,params,context):
    curves,steps=read_splines(source,leaf);assert len(curves)==1 and curves[0]['closed']
    ring=sample_curve(curves[0],steps);assert np.ptp(ring[:,2])<2e-6
    assert params[0]>0 and params[1]==1 and params[2]==params[3]==1
    # Work in the saved ModContext. In this source its linear part is identity;
    # retaining the full conjugation also preserves its saved translation.
    c=np.asarray(context);inverse=np.linalg.inv(c)
    local=ring@c[:3,:3].T+c[:3,3]
    area=float(np.sum(local[:,0]*np.roll(local[:,1],-1)-np.roll(local[:,0],-1)*local[:,1])/2)
    if area<0:local=local[::-1]
    upper=local+np.array([0,0,params[0]])
    vertices=np.r_[local,upper]@inverse[:3,:3].T+inverse[:3,3]
    count=len(local);faces=[list(reversed(range(count))),list(range(count,2*count))]
    for i in range(count):j=(i+1)%count;faces.append([i,j,j+count,i+count])
    return vertices.tolist(),faces,{'curves':curves,'steps':steps,'sampledRingVertices':count,'params':params,'modContext':c.tolist()}

def smooth_parameters(source,modifier):
    values={}
    for k,a,b,c in source.parts(source.refs(modifier)[0]):
        if k!=0xa:continue
        raw=source.data[a:b];pid,kind=struct.unpack_from('<HI',raw)
        assert kind in (1,4,5)
        values[pid]=struct.unpack_from('<f' if kind==5 else '<i',raw,len(raw)-4)[0]
    assert set(values)=={0,1,2,3} and values[0]==values[3]==1 and values[2]==0
    return {'autoSmooth':True,'angleRadians':values[1],'angleDegrees':math.degrees(values[1]),
            'smoothingBits':values[2],'preventIndirect':True,'rawParameterValues':values}

def recover_tua_modifiers():
    import bpy
    from mathutils import Matrix
    source=get_source();writer=SourceMeshWriter()
    audit={'sources':SOURCES,'splines':[],'boolean':[],'mirror':[],'extrude':[],'smooth':[],
           'qualifications':['Spline centerlines, handles, diameter and radial sides come from source; ring orientation uses local parallel transport.',
                             'Spline sampling uses saved interpolation steps. No source-aware display simplification is applied here.',
                             'Smooth angles and flags are decoded from source; Blender sharp-edge normals implement the angle boundary, not native MAX smoothing-group IDs.']}
    for index,node in source.nodes_by_index.items():
        leaf,layers=stack(source,node['meshSceneIndex']);kind=source.class_name(source.items[leaf][0])
        if kind in ('Line','SplineShape') and not layers:
            params=source.params(source.refs(leaf)[0]);assert params[6]==params[8]==1 and params[9]==0
            assert params.get(11,0)==0 and params[2]==0 and params[7]==0
            curves,steps=read_splines(source,leaf);assert len(curves)==1 and not curves[0]['closed']
            points=sample_curve(curves[0],steps);vertices,faces=sweep_geometry(points,float(params[0]),int(params[1]),float(params[2]))
            obj=writer.replace(index,vertices,faces,smooth=False)
            obj['sourceSplineRecovered']=kind;obj['sourceSplineDiameter']=float(params[0]);obj['sourceSplineSides']=int(params[1])
            obj.data.calc_loop_triangles()
            audit['splines'].append({'sourceSceneIndex':index,'name':node['name'],'class':kind,'params':params,
                 'curves':curves,'steps':steps,'sampledPoints':len(points),'vertices':len(vertices),'triangles':len(obj.data.loop_triangles)})
        elif kind=='Boolean':
            refs=source.refs(leaf);assert len(refs)==5 and refs[1]==refs[3]==0xffffffff
            data=source.mesh(refs[0]);operand=source.prs(refs[2])
            vertices=np.asarray(data['vertices'])@operand[:3,:3].T+operand[:3,3]
            obj=writer.replace(index,vertices.tolist(),data['faces'],material_ids=data['materialIds'])
            obj['sourceBooleanRecovered']=True
            audit['boolean'].append({'sourceSceneIndex':index,'operandA':refs[0],'operandB':None,
                                    'operandMatrix':operand.tolist(),'vertices':len(vertices),'faces':len(data['faces'])})
        for layer in reversed(layers):
            for modifier in reversed(layer['modifiers']):
                mod_class=source.class_name(source.items[modifier][0]);refs=source.refs(modifier)
                if mod_class=='Extrude':
                    p=source.params(refs[0]);context=source.mod_context(layer['derived'])
                    vertices,faces,details=extrude_geometry(source,leaf,p,context)
                    obj=writer.replace(index,vertices,faces,smooth=bool(p[9]),material_ids=[0,1]+[2]*(len(faces)-2))
                    obj.data.polygons[0].use_smooth=False;obj.data.polygons[1].use_smooth=False
                    obj['sourceExtrudeRecovered']=True
                    audit['extrude'].append({'sourceSceneIndex':index,'modifierSceneIndex':modifier,**details})
                elif mod_class=='Mirror':
                    p=source.params(refs[1]);assert p=={0:0,1:0,2:0.0}
                    context=source.mod_context(layer['derived']);gizmo=source.prs(refs[0]);pivot=source.pivot(index)
                    deformation=np.linalg.inv(context)@gizmo@np.diag([-1,1,1,1])@np.linalg.inv(gizmo)@context
                    baked=pivot@deformation@np.linalg.inv(pivot)
                    obj=writer.objects[index][0];assert obj.type=='MESH'
                    obj.data=obj.data.copy();obj.data.transform(Matrix(baked.tolist()));obj.data.flip_normals();obj.data.update()
                    obj['sourceMirrorRecovered']=True
                    audit['mirror'].append({'sourceSceneIndex':index,'modifierSceneIndex':modifier,'params':p,
                                           'gizmo':gizmo.tolist(),'modContext':context.tolist(),'deformation':deformation.tolist()})
                elif mod_class=='Smooth':
                    p=smooth_parameters(source,modifier);obj=writer.objects[index][0];assert obj.type=='MESH'
                    obj.data=obj.data.copy();pivot=Matrix(source.pivot(index).tolist())
                    obj.data.transform(pivot.inverted())
                    for polygon in obj.data.polygons:polygon.use_smooth=True
                    obj.data.set_sharp_from_angle(angle=p['angleRadians'])
                    obj.data.transform(pivot);obj.data.update();obj['sourceSmoothRecovered']=True
                    audit['smooth'].append({'sourceSceneIndex':index,'modifierSceneIndex':modifier,**p})
                else:raise AssertionError(('Unsupported source modifier',index,mod_class))
    expected={'splines':966,'boolean':2,'mirror':56,'extrude':10,'smooth':13}
    assert {k:len(audit[k]) for k in expected}==expected
    audit['counts']=expected;audit['maximumWorldMatrixError']=assert_source_worlds()
    remaining=[{'id':o.get('sourceSceneIndex'),'name':o.name,'class':o.get('sourceDeferredGeometry')}
               for o in bpy.data.objects if o.get('sourceDeferredGeometry')]
    audit['remainingDeferred']=remaining;assert not remaining,remaining
    (ROOT/'tua_modifier_recovery.json').write_text(json.dumps(audit,indent=2))
    print('TUA_MODIFIERS',json.dumps(expected),flush=True)
    return audit

if __name__=='__main__':
    source=get_source();counts=collections.Counter();triangles=0
    for index,node in source.nodes_by_index.items():
        leaf,layers=stack(source,node['meshSceneIndex']);kind=source.class_name(source.items[leaf][0])
        if kind in ('Line','SplineShape') and not layers:
            p=source.params(source.refs(leaf)[0]);curves,steps=read_splines(source,leaf)
            v,f=sweep_geometry(sample_curve(curves[0],steps),p[0],int(p[1]),p[2]);counts[kind]+=1
            assert all(0<=i<len(v) for face in f for i in face)
            triangles+=sum(len(face)-2 for face in f)
        for layer in layers:
            for modifier in layer['modifiers']:
                mc=source.class_name(source.items[modifier][0])
                if mc=='Extrude':
                    v,f,info=extrude_geometry(source,leaf,source.params(source.refs(modifier)[0]),source.mod_context(layer['derived']))
                    assert all(0<=i<len(v) for face in f for i in face)
                elif mc=='Smooth':smooth_parameters(source,modifier)
    print('TUA_SPLINE_PARAMETER_CHECK',dict(counts),'triangles',triangles)
