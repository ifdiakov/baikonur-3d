# SPDX-License-Identifier: GPL-2.0-or-later
"""Preserve exact modifier parameters and mesh graph for targeted recovery."""
import collections
import json
from pathlib import Path
import runpy
import struct

from ukss_config import WORK, OUT
namespace=runpy.run_path(str(WORK/'index_max_nodes.py'))
items=namespace['items'];data=namespace['data'];children=namespace['children'];name_of=namespace['name_of'];nodes=namespace['nodes']
out=OUT

def parts(index):
    k,a,b,c=items[index]
    return children(a,b)

def references(index):
    for k,a,b,c in parts(index):
        if k==0x2034:return list(struct.unpack('<'+'I'*((b-a)//4),data[a:b]))
    return []

def encode_chunks(chunks):
    result=[]
    for kind,a,b,container in chunks:
        item={'kind':hex(kind),'size':b-a}
        if container:item['children']=encode_chunks(children(a,b))
        else:
            item['hex']=data[a:b].hex()
            if b-a==4:
                item['uint32']=struct.unpack_from('<I',data,a)[0]
                item['float32']=struct.unpack_from('<f',data,a)[0]
        result.append(item)
    return result

def stack(index,seen=None):
    seen=set() if seen is None else seen
    if index in seen:return {'cycle':index}
    seen.add(index)
    item={'sceneIndex':index,'class':name_of(items[index][0]),'references':references(index)}
    if items[index][0] in (0x2032,0x2033):
        refs=references(index)
        item['modifiers']=[{'sceneIndex':r,'class':name_of(items[r][0]),'references':references(r)} for r in refs[:-1]]
        item['base']=stack(refs[-1],seen) if refs else None
    return item

modified=[];parameters={};base_geometry={}
for node in nodes:
    mesh=node.get('meshSceneIndex')
    if mesh is None or items[mesh][0] not in (0x2032,0x2033):continue
    chain=stack(mesh);record={'nodeName':node['name'],'nodeSceneIndex':node['sceneIndex'],'stack':chain,
                              'stockImporterBehavior':'imports underlying base geometry; modifier operations are not evaluated'}
    modified.append(record)
    current=chain
    while current.get('base'):
        for modifier in current.get('modifiers',[]):
            if modifier['class'] in {'Lattice','Mirror','Extrude'}:
                for ref in modifier['references']:
                    key=str(ref)
                    if key not in parameters:
                        parameters[key]={'class':name_of(items[ref][0]),'chunks':encode_chunks(parts(ref))}
        current=current['base']
    if any(m['class']=='Lattice' for m in chain.get('modifiers',[])):
        key=str(current['sceneIndex'])
        if key not in base_geometry:
            base_geometry[key]={'class':current['class'],'chunks':encode_chunks(parts(current['sceneIndex']))}
    record['leafBase']=current

report={'modifiedNodeCount':len(modified),'modifierClasses':dict(collections.Counter(
    mod['class'] for record in modified for mod in record['stack'].get('modifiers',[]))),
    'modifiedNodes':modified,'parameterBlocks':parameters,'latticeBaseGeometry':base_geometry}
(out/'ukss_modifier_audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False))
print('MODIFIER_AUDIT',json.dumps({k:v for k,v in report.items() if k in ('modifiedNodeCount','modifierClasses')}),
      'baseGeometryRecords',len(base_geometry),'parameterBlocks',len(parameters))
