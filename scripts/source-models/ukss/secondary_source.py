# SPDX-License-Identifier: GPL-2.0-or-later
"""Read-only access to the audited MAX OLE/chunk data, with bounded chunks."""
import ast
from functools import lru_cache
import json
import math
from pathlib import Path
import struct
import numpy as np

from ukss_config import ROOT, WORK

def quaternion_matrix(values):
    """Normalized source x,y,z,w quaternion -> column-vector rotation."""
    q=np.asarray(values,dtype=float);norm=float(np.linalg.norm(q))
    assert norm>1e-12,('Zero quaternion',values)
    x,y,z,w=q/norm
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                     [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                     [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])

class SourceScene:
    def __init__(self):
        tree=ast.parse((WORK/'index_max_nodes.py').read_text())
        body=[]
        for node in tree.body:
            if isinstance(node,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='nodes' for x in node.targets):break
            body.append(node)
        namespace={}
        exec(compile(ast.Module(body=body,type_ignores=[]),'<reviewed_index>','exec'),namespace)
        self.data=namespace['data'];self.items=namespace['items'];self.children=namespace['children'];self.class_name=namespace['name_of']
        nodes=json.loads((ROOT/'ukss_source_node_index.json').read_text())['nodes']
        self.nodes={n['name']:n for n in nodes};self.nodes_by_index={n['sceneIndex']:n for n in nodes}

    def parts(self,index):
        return self.children(self.items[index][1],self.items[index][2])

    def first(self,index,kind):
        return next((p for p in self.parts(index) if p[0]==kind),None)

    def raw(self,index,kind):
        p=self.first(index,kind);return self.data[p[1]:p[2]] if p else b''

    def refs(self,index):
        data=self.raw(index,0x2034)
        return list(struct.unpack('<'+'I'*(len(data)//4),data)) if data else []

    def params(self,index):
        values={}
        for kind,a,b,c in self.parts(index):
            if kind!=2 or not c:continue
            fields={k:self.data[s:e] for k,s,e,ct in self.children(a,b)}
            pid=struct.unpack('<I',fields[3])[0]
            if 0x100 in fields:values[pid]=struct.unpack('<f',fields[0x100])[0]
            elif 0x101 in fields:values[pid]=struct.unpack('<i',fields[0x101])[0]
            elif 0x104 in fields:values[pid]=struct.unpack('<i',fields[0x104])[0]
        return values

    def param2_records(self,index):
        records={}
        for kind,a,b,container in self.parts(index):
            if kind==0xe:
                raw=self.data[a:b];records[struct.unpack_from('<H',raw)[0]]=raw
        return records

    def standard_material(self,index):
        """Decode only the source's ordinary untextured Standard/Blinn data.

        Field selection follows the pinned audited importer's
        get_standard_material(), while maintaining exact material-reference
        identity even where distinct MAX materials share a display name.
        """
        assert self.class_name(self.items[index][0])=='Standard',('Not a Standard material',index)
        refs=self.refs(index);assert len(refs)>4
        texdata=self.raw(refs[1],0x2035)
        assert len(texdata)<=4,('Unexpected texture references',index)
        assert self.class_name(self.items[refs[2]][0])=='Blinn',('Unexpected shader',index)
        shader=self.param2_records(self.refs(refs[2])[0]);extended=self.param2_records(refs[4])
        def rgb(records,key):return list(struct.unpack('<fff',records[key][-12:]))
        def number(records,key):return struct.unpack('<f',records[key][-4:])[0]
        container=self.first(index,0x4000)
        names=[self.data[a:b].decode('utf-16le').rstrip('\0') for k,a,b,c in self.children(container[1],container[2]) if k==0x4001]
        assert len(names)==1
        return {'sourceSceneIndex':index,'name':names[0],'diffuse':rgb(shader,1),
                'specular':rgb(shader,2),'emissive':rgb(shader,8),'shininess':number(shader,11),
                'opacity':number(extended,1),'glossiness':number(extended,2),
                'metallic':number(extended,5),'ior':number(extended,6),'textureReferences':[]}

    def float_controller(self,index):
        direct=self.raw(index,0x2501)
        if len(direct)==4:return struct.unpack('<f',direct)[0]
        point=self.first(index,0x7127)
        if point:
            values={k:self.data[a:b] for k,a,b,c in self.children(point[1],point[2])}
            if 0x2501 in values:return struct.unpack('<f',values[0x2501])[0]
        raise ValueError(('Unsupported float controller',index,self.class_name(self.items[index][0])))

    def xyz(self,index):
        refs=self.refs(index)
        assert len(refs)==3
        return [self.float_controller(r) for r in refs]

    @lru_cache(None)
    def prs_components(self,index):
        if index is None:return np.zeros(3),np.eye(3),np.ones(3),np.eye(3)
        refs=self.refs(index);assert len(refs)>=3,(index,refs)
        pos=self.xyz(refs[0]);rot=self.xyz(refs[1])
        scale_data=self.raw(refs[2],0x2505) or self.raw(refs[2],0x2501)
        scale=struct.unpack_from('<fff',scale_data)
        # Autodesk ScaleValue stores a Point3 plus the quaternion defining the
        # coordinate system in which the nonuniform scaling is applied.
        # https://help.autodesk.com/cloudhelp/2023/ENU/Max-Developer-Help/cpp_ref/class_scale_value.html
        orientation=quaternion_matrix(struct.unpack_from('<ffff',scale_data,12)) if len(scale_data)>=28 else np.eye(3)
        cx,cy,cz=[math.cos(v) for v in rot];sx,sy,sz=[math.sin(v) for v in rot]
        rx=np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]])
        ry=np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]])
        rz=np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]])
        return np.asarray(pos),rz@ry@rx,np.asarray(scale),orientation

    @lru_cache(None)
    def prs(self,index):
        pos,rotation,scale,orientation=self.prs_components(index)
        matrix=np.eye(4);matrix[:3,:3]=rotation@orientation@np.diag(scale)@orientation.T;matrix[:3,3]=pos
        return matrix

    def prs_factors(self,index):
        """Two exactly decomposable local TRS matrices with product source PRS."""
        pos,rotation,scale,orientation=self.prs_components(index)
        outer=np.eye(4);outer[:3,:3]=rotation@orientation@np.diag(scale);outer[:3,3]=pos
        inner=np.eye(4);inner[:3,:3]=orientation.T
        assert np.allclose(outer@inner,self.prs(index),atol=1e-10)
        return outer,inner

    @lru_cache(None)
    def world(self,index):
        node=self.nodes_by_index.get(index)
        if not node:return np.eye(4)
        local=self.prs(node['references'].get('0') or node['references'].get(0))
        return self.world(node['parentSceneIndex'])@local

    def pivot(self,index,stock_order=False):
        position=struct.unpack('<fff',self.raw(index,0x96a)) if self.raw(index,0x96a) else (0,0,0)
        q=struct.unpack('<ffff',self.raw(index,0x96b)) if self.raw(index,0x96b) else (0,0,0,1)
        scale_data=self.raw(index,0x96c)
        scale=struct.unpack_from('<fff',scale_data) if scale_data else (1,1,1)
        q=(q[2],q[1],q[0],q[3]) if stock_order else q
        orientation=quaternion_matrix(struct.unpack_from('<ffff',scale_data,12)) if len(scale_data)>=28 and not stock_order else np.eye(3)
        matrix=np.eye(4);matrix[:3,3]=position
        matrix[:3,:3]=quaternion_matrix(q)@orientation@np.diag(scale)@orientation.T
        return matrix

    def mod_context(self,index):
        container=self.first(index,0x2500)
        if not container:return np.eye(4)
        parts=self.children(container[1],container[2]);matrix_chunk=next((p for p in parts if p[0]==0x2510),None)
        if not matrix_chunk:return np.eye(4)
        values=struct.unpack_from('<12f',self.data,matrix_chunk[1])
        m=np.eye(4);m[:3,:]=np.asarray(values).reshape(4,3).T
        return m

    def mesh(self,index):
        geom=self.first(index,0x8fe);assert geom,(index,self.class_name(self.items[index][0]))
        fields={k:self.data[a:b] for k,a,b,c in self.children(geom[1],geom[2])}
        v=fields[0x914];count=struct.unpack_from('<I',v)[0]
        vertices=np.asarray(struct.unpack_from('<'+'f'*(count*3),v,4)).reshape(count,3)
        faces=[];materials=[];flags=[]
        f=fields[0x912];count=struct.unpack_from('<I',f)[0]
        for offset in range(4,4+count*20,20):
            a,b,c,smooth,edge,mat=struct.unpack_from('<IIIIHH',f,offset)
            faces.append([a,b,c]);materials.append(mat);flags.append(edge)
        return {'vertices':vertices.tolist(),'faces':faces,'materialIds':materials,'edgeFlags':flags}

    def bounds(self,vertices,matrix=None):
        vertices=np.asarray(vertices)
        if matrix is not None:vertices=(matrix@np.c_[vertices,np.ones(len(vertices))].T).T[:,:3]
        return {'min':vertices.min(axis=0).tolist(),'max':vertices.max(axis=0).tolist(),
                'size':np.ptp(vertices,axis=0).tolist()}
