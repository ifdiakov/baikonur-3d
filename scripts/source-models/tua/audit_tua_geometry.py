# SPDX-License-Identifier: GPL-2.0-or-later
import sys,json,collections,struct
from pathlib import Path
from tua_config import WORK
sys.path.insert(0,str(WORK))
from source_scene import SourceScene,ROOT
s=SourceScene();records=[];param_sets=collections.defaultdict(collections.Counter)
def describe(index,depth=0):
 out=[]
 for k,a,b,c in s.parts(index):
  out.append({'kind':hex(k),'bytes':b-a,'container':c})
 return out
def geometry_tree(parts,depth=0):
 out=[]
 for k,a,b,c in parts:
  row={'kind':hex(k),'bytes':b-a,'container':c}
  if c:row['children']=geometry_tree(s.children(a,b),depth+1)
  elif b-a<=32:row['hex']=s.data[a:b].hex()
  out.append(row)
 return out
def stack(index):
 out=[]
 while s.items[index][0] in (0x2032,0x2033):
  refs=s.refs(index);mods=[]
  for m in refs[:-1]:
   mr=s.refs(m);ps=[{'index':r,'class':s.class_name(s.items[r][0]),'params':s.params(r)} for r in mr if r!=0xffffffff]
   mods.append({'id':m,'class':s.class_name(s.items[m][0]),'refs':mr,'parameterReferences':ps})
   param_sets[s.class_name(s.items[m][0])].update([json.dumps(ps,sort_keys=True)])
  out.append({'derived':index,'mods':mods,'context':s.mod_context(index).tolist()});index=refs[-1]
 return index,out
for n in s.nodes_by_index.values():
 leaf,layers=stack(n['meshSceneIndex']);kind=s.class_name(s.items[leaf][0]);refs=s.refs(leaf)
 if kind not in ['Box','Cylinder','Sphere','Tube','Line','SplineShape','Boolean'] and not layers:continue
 ps=[{'index':r,'class':s.class_name(s.items[r][0]),'params':s.params(r)} for r in refs if r!=0xffffffff and s.class_name(s.items[r][0]) in ['ParamBlock','ParamBlock2']]
 r={'id':n['sceneIndex'],'name':n['name'],'leaf':leaf,'kind':kind,'refs':refs,'params':ps,'layers':layers};records.append(r)
 if ps:param_sets[kind].update([json.dumps([p['params'] for p in ps],sort_keys=True)])
report={'records':records,'parameterSets':{k:[{'count':count,'values':json.loads(key)} for key,count in rows.most_common()] for k,rows in param_sets.items()}}
for kind in ['Line','SplineShape','Tube','Boolean']:
 sample=next((r for r in records if r['kind']==kind),None)
 if sample:report[kind+'Example']={'node':sample,'geometryTree':geometry_tree(s.parts(sample['leaf']))}
(ROOT/'source-geometry-audit.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'kinds':dict(collections.Counter(r['kind'] for r in records)),'parameterSetCounts':{k:len(v) for k,v in report['parameterSets'].items()}},indent=2))
for k in ['Line','SplineShape','Tube','Mirror','Extrude','Smooth','Boolean']:
 print(k,json.dumps(report['parameterSets'].get(k,[])[:5]))
for kind in ['Box','Cylinder','Sphere']:
 ps=[r['params'][0]['params'] for r in records if r['kind']==kind]
 keys=sorted(set().union(*(p.keys() for p in ps)))
 print(kind,'PARAM_DISTRIBUTION',json.dumps({str(k):dict(collections.Counter(str(p.get(k)) for p in ps)) for k in keys if k not in [0,1,2] or kind=='Sphere'}))
