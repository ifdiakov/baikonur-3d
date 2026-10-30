# SPDX-License-Identifier: GPL-2.0-or-later
"""Read source classes and node links without Blender scene construction."""
import ast
import collections
import json
from pathlib import Path
import struct
import types

from ukss_config import WORK as work, OUT as out, SOURCE, verify_importer
verify_importer()
# Only the inspected OLE container reader and standard-library imports.
tree=ast.parse((work/'io_scene_max/import_max.py').read_text());body=[]
for node in tree.body:
    if isinstance(node,ast.ClassDef) and node.name=='MaxChunk':break
    if isinstance(node,ast.Import) and all(a.name in {'io','os','re','sys','zlib','array','struct','math'} for a in node.names):body.append(node)
    elif isinstance(node,(ast.Assign,ast.FunctionDef,ast.ClassDef)):body.append(node)
module=types.ModuleType('reviewed_ole_reader')
exec(compile(ast.Module(body=body,type_ignores=[]),'<reviewed_ole_reader>','exec'),module.__dict__)
with module.ImportMaxFile(str(SOURCE)) as compound:
    data=compound.openstream('Scene').read()
    class_data=compound.openstream('ClassDirectory3').read()

def buffer_chunk(buffer,offset,end):
    assert offset+6<=end
    kind,size=struct.unpack_from('<Hi',buffer,offset);head=6
    if size==0:
        assert offset+14<=end
        size=struct.unpack_from('<q',buffer,offset+head)[0];head+=8;length=size&0x7fffffffffffffff
    else:length=size&0x7fffffff
    assert length>=head and offset+length<=end
    return kind,offset+head,offset+length,size<0

def buffer_children(buffer,start,end):
    items=[]
    while start<end:
        item=buffer_chunk(buffer,start,end)
        items.append(item);start=item[2]
    return items

def chunk(offset):return buffer_chunk(data,offset,len(data))
def children(start,end):return buffer_children(data,start,end)

# The original exploratory workflow had already extracted this table. Generate
# it directly here so a clean output directory has no unstated dependencies.
# Field layouts follow the pinned ClassIDChunk: 0x2042 UTF-16LE class name and
# 0x2060 <IQI> DLL index / class ID / superclass ID.
classes=[]
for class_index,(kind,start,end,is_container) in enumerate(buffer_children(class_data,0,len(class_data))):
    assert is_container
    fields={k:class_data[a:b] for k,a,b,c in buffer_children(class_data,start,end)}
    classes.append({'index':class_index,'name':fields[0x2042].decode('utf-16le').rstrip('\0'),
                    'identity':list(struct.unpack('<IQI',fields[0x2060]))})
(out/'ukss_source_classes.json').write_text(json.dumps(classes,ensure_ascii=False,indent=2))
root=chunk(0);items=children(root[1],root[2])
def name_of(index):return classes[index]['name'] if 0<=index<len(classes) else hex(index)
nodes=[]
for index,(kind,start,end,is_container) in enumerate(items):
    if name_of(kind)!='Node':continue
    fields={k:(a,b,c) for k,a,b,c in children(start,end)}
    def raw(k):
        part=fields.get(k);return data[part[0]:part[1]] if part else b''
    name=raw(0x962).decode('utf-16le','replace').rstrip('\0')
    parent=struct.unpack_from('<I',raw(0x960))[0] if len(raw(0x960))>=4 else None
    refs=raw(0x2034)
    reference_list=list(struct.unpack('<'+'I'*(len(refs)//4),refs)) if refs else []
    refs=raw(0x2035)
    if refs:
        values=struct.unpack('<'+'I'*(len(refs)//4),refs)
        reference_dict=dict(zip(values[1::2],values[2::2]))
    else:reference_dict=dict(enumerate(reference_list))
    mesh=reference_dict.get(1)
    nodes.append({'sceneIndex':index,'name':name,'parentSceneIndex':parent,'meshSceneIndex':mesh,
                  'meshClass':name_of(items[mesh][0]) if mesh is not None and mesh<len(items) else None,
                  'references':reference_dict})
by_index={n['sceneIndex']:n for n in nodes}
for node in nodes:
    node['parentName']=by_index.get(node['parentSceneIndex'],{}).get('name')
summary={'sourceNodes':len(nodes),'sceneRecords':len(items),
         'meshClasses':dict(collections.Counter(n['meshClass'] for n in nodes)),
         'topLevelNodes':[n for n in nodes if n['parentSceneIndex'] not in by_index],
         'nodes':nodes}
(out/'ukss_source_node_index.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps({'sourceNodes':len(nodes),'sceneRecords':len(items),'meshClasses':summary['meshClasses'],
                  'topLevelCount':len(summary['topLevelNodes']),'topLevelNames':[n['name'] for n in summary['topLevelNodes'][:20]]},ensure_ascii=False))
