# SPDX-License-Identifier: GPL-2.0-or-later
"""Read-only TUA MAX inventory from the pinned, inspected OLE reader.

Only compound-document bytes and numeric/string MAX chunks are interpreted.
No embedded scripts are run; there are no source-specific node/class IDs.
"""
import ast,collections,hashlib,json,struct,types,zlib
from pathlib import Path
from tua_config import SOURCE, OUT, SHARED, EXPECTED_SOURCE_SHA256, require_paths, verify_dependencies, verify_source
require_paths()
verify_dependencies()
verify_source(SOURCE)
EXPECTED=EXPECTED_SOURCE_SHA256
PINNED=SHARED/'io_scene_max/import_max.py'
body=[]
for node in ast.parse(PINNED.read_text()).body:
 if node.lineno>=567:break
 if isinstance(node,ast.Import) and all(a.name in {'io','os','re','sys','zlib','array','struct','math'} for a in node.names):body.append(node)
 elif isinstance(node,(ast.Assign,ast.FunctionDef,ast.ClassDef)):body.append(node)
reader=types.ModuleType('reviewed_ole_reader')
exec(compile(ast.Module(body=body,type_ignores=[]),'<reviewed_ole_reader>','exec'),reader.__dict__)

def unpack_stream(data):
 return zlib.decompress(data,zlib.MAX_WBITS|32) if data[:2]==b'\x1f\x8b' else data

def chunk(data,offset):
 kind,size=struct.unpack_from('<Hi',data,offset);head=6
 if size==0:size=struct.unpack_from('<q',data,offset+head)[0];head+=8;length=size&0x7fffffffffffffff
 else:length=size&0x7fffffff
 assert length>=head and offset+length<=len(data),(offset,kind,size,len(data))
 return kind,offset+head,offset+length,size<0

def children(data,start=0,end=None):
 end=len(data) if end is None else end;items=[]
 while start<end:
  item=chunk(data,start);assert item[2]<=end;items.append(item);start=item[2]
 assert start==end
 return items

def properties(data):
 result={}
 sections=struct.unpack_from('<I',data,24)[0]
 for section_index in range(sections):
  section=struct.unpack_from('<I',data,44+20*section_index)[0]
  count=struct.unpack_from('<I',data,section+4)[0]
  for index in range(count):
   prop,offset=struct.unpack_from('<II',data,section+8+index*8);offset+=section
   kind=struct.unpack_from('<I',data,offset)[0];pos=offset+4;value={'variantType':kind}
   if kind in (30,31):
    length=struct.unpack_from('<I',data,pos)[0];length*=2 if kind==31 else 1
    value=data[pos+4:pos+4+length].decode('utf-16le' if kind==31 else 'cp1252','replace').rstrip('\0')
   elif kind in (2,3,19):value=struct.unpack_from('<i',data,pos)[0]
   elif kind==64:value={'filetime':struct.unpack_from('<Q',data,pos)[0]}
   elif kind==71:
    length=struct.unpack_from('<I',data,pos)[0];clip=data[pos+4:pos+4+length]
    fmt=struct.unpack_from('<I',clip,0)[0];payload=clip[4:];value={'clipboardFormat':fmt,'bytes':len(payload)}
    if fmt==0xffffffff and payload[:4]==struct.pack('<I',3):
     # Windows CF_METAFILEPICT thumbnail: preserve its embedded DIB image.
     for at in range(0,len(payload)-40):
      if payload[at:at+4]!=struct.pack('<I',40):continue
      width,height,planes,bpp=struct.unpack_from('<iiHH',payload,at+4)
      if not(0<width<=4096 and 0<height<=4096 and planes==1 and bpp in (8,24,32)):continue
      colors=struct.unpack_from('<I',payload,at+32)[0];palette=(colors or (1<<bpp if bpp<=8 else 0))*4
      length=40+palette+((width*bpp+31)//32)*4*height
      if at+length>len(payload):continue
      payload=payload[at:at+length];fmt=8;value['embeddedMetafileDib']={'width':width,'height':height,'bpp':bpp};break
    if fmt==8 and len(payload)>=40:
     dib=struct.unpack_from('<I',payload)[0];bpp=struct.unpack_from('<H',payload,14)[0];colors=struct.unpack_from('<I',payload,32)[0]
     palette=(colors or (1<<bpp if bpp<=8 else 0))*4
     bmp=struct.pack('<2sIHHI',b'BM',14+len(payload),0,0,14+dib+palette)+payload
     path=OUT/'source-thumbnail.bmp';path.write_bytes(bmp);value['file']=str(path)
    elif payload.startswith(b'\xff\xd8'):
     path=OUT/'source-thumbnail.jpg';path.write_bytes(payload);value['file']=str(path)
    elif payload.startswith(b'\x89PNG'):
     path=OUT/'source-thumbnail.png';path.write_bytes(payload);value['file']=str(path)
   result[str(prop)]=value
 return result

with reader.ImportMaxFile(str(SOURCE)) as compound:
 streams=[{'name':e.name,'size':e.size} for e in compound.direntries if e]
 summaries={}
 for e in streams:
  if 'SummaryInformation' in e['name']:
   try:summaries[e['name']]=properties(compound.openstream(e['name']).read())
   except Exception as err:summaries[e['name']]={'parseError':type(err).__name__}
 try:class_data=unpack_stream(compound.openstream('ClassDirectory3').read())
 except Exception:class_data=unpack_stream(compound.openstream('ClassDirectory').read())
 data=unpack_stream(compound.openstream('Scene').read())
classes=[]
for i,(_,start,end,_) in enumerate(children(class_data)):
 fields={k:class_data[a:b] for k,a,b,_ in children(class_data,start,end)}
 row={'index':i,'name':fields.get(0x2042,b'').decode('utf-16le','replace').rstrip('\0')}
 if 0x2060 in fields:
  dll,cls,superid=struct.unpack_from('<IQI',fields[0x2060]);row.update(dll=dll,classId=hex(cls),superId=hex(superid))
 classes.append(row)
def name_of(i):return classes[i]['name'] if 0<=i<len(classes) else hex(i)
root=chunk(data,0);items=children(data,root[1],root[2]);nodes=[]
def parts(i):
 _,a,b,_=items[i];return children(data,a,b)
def refs_for(i):
 fields={k:data[a:b] for k,a,b,_ in parts(i)}
 refs=fields.get(0x2035)
 if refs:
  values=struct.unpack('<'+'I'*(len(refs)//4),refs);return dict(zip(values[1::2],values[2::2]))
 refs=fields.get(0x2034,b'');return dict(enumerate(struct.unpack('<'+'I'*(len(refs)//4),refs))) if refs else {}
for i,(kind,a,b,_) in enumerate(items):
 if name_of(kind)!='Node':continue
 fields={k:data[c:d] for k,c,d,_ in children(data,a,b)}
 refs=refs_for(i);mesh=refs.get(1)
 nodes.append({'sceneIndex':i,'name':fields.get(0x962,b'').decode('utf-16le','replace').rstrip('\0'),
  'parentSceneIndex':struct.unpack_from('<I',fields[0x960])[0] if len(fields.get(0x960,b''))>=4 else None,
  'meshSceneIndex':mesh,'meshClass':name_of(items[mesh][0]) if mesh is not None and mesh<len(items) else None,'references':refs})
by_index={n['sceneIndex']:n for n in nodes}
for n in nodes:n['parentName']=by_index.get(n['parentSceneIndex'],{}).get('name')
def stack(i,seen=None):
 seen=set() if seen is None else seen
 if i in seen:return {'cycle':i}
 seen.add(i);record={'sceneIndex':i,'class':name_of(items[i][0])}
 if items[i][0] in (0x2032,0x2033):
  refs=list(refs_for(i).values());record['modifiers']=[{'sceneIndex':j,'class':name_of(items[j][0])} for j in refs[:-1]]
  record['base']=stack(refs[-1],seen) if refs else None
 return record
modified=[]
for n in nodes:
 i=n['meshSceneIndex']
 if i is not None and items[i][0] in (0x2032,0x2033):modified.append({'nodeSceneIndex':n['sceneIndex'],'nodeName':n['name'],'stack':stack(i)})
modifier_counts=collections.Counter()
for n in modified:
 cur=n['stack']
 while cur and cur.get('base'):
  modifier_counts.update(m['class'] for m in cur.get('modifiers',[]));cur=cur['base']
summary={'source':{'name':SOURCE.name,'bytes':SOURCE.stat().st_size,'sha256':EXPECTED},
 'oleStreams':streams,'summaryInformation':summaries,'classCount':len(classes),'sourceNodes':len(nodes),'sceneRecords':len(items),
 'meshClasses':dict(collections.Counter(n['meshClass'] for n in nodes)),'duplicateNames':{k:v for k,v in collections.Counter(n['name'] for n in nodes).items() if v>1},
 'topLevelNodes':[n for n in nodes if n['parentSceneIndex'] not in by_index],
 'modifierClasses':dict(modifier_counts),'modifiedNodes':modified,'nodes':nodes}
(OUT/'source-classes.json').write_text(json.dumps(classes,ensure_ascii=False,indent=2))
(OUT/'source-inventory.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps({'source':summary['source'],'classCount':len(classes),'sourceNodes':len(nodes),'sceneRecords':len(items),'meshClasses':summary['meshClasses'],'duplicateNameCount':len(summary['duplicateNames']),'topLevelCount':len(summary['topLevelNodes']),'modifierClasses':summary['modifierClasses']},ensure_ascii=False))
print('SUMMARY',json.dumps(summaries,ensure_ascii=False))
