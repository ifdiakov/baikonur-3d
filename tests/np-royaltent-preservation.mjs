import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const baseline='2a26e38d5db58ace71001a40f8c69921ff1c2ef7';
const git=args=>execFileSync('git',args,{maxBuffer:32*1024*1024});
try{git(['cat-file','-e',baseline+'^{commit}']);}catch{git(['fetch','--no-tags','--depth=1','origin',baseline]);}
const old=path=>git(['show',baseline+':'+path]).toString();
for(const path of ['index.html','museum.html','workshop.html']){
 const after=await readFile(path,'utf8');assert.equal(after.replaceAll('site31-observation-platform.js?v=20261109-np-royaltent-v3','site31-observation-platform.js?v=20261108-np-photo-v2'),old(path),'Only NP cache revision may change in '+path);
}
const before=old('src/site31-observation-platform.js'),after=await readFile('src/site31-observation-platform.js','utf8');
const section=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
assert.equal(section(after,'export const NP_MAP_POSITION','// All dimensions'),section(before,'export const NP_MAP_POSITION','// All dimensions'),'NP placement, road clearance and orientation changed');
assert.equal(section(after,' // Portable crowd-control barriers',' for(const [key,geometries] of batches)'),section(before,' // Portable crowd-control barriers',' for(const [key,geometries] of batches)'),'Fencing, flags, toilets, parking or lights changed');
assert.equal(section(after,' // Plan:','  const height=').includes("const cx of [-11.65,11.65]"),true);
const changed=git(['diff','--name-only',baseline,'--','src','assets','data']).toString().trim().split('\n').filter(Boolean);
assert.deepEqual(changed.filter(p=>!['src/site31-observation-platform.js','src/np-royaltent.js'].includes(p)),[],'Unrelated museum resource changed');
await mkdir('qa-np-royaltent',{recursive:true});await writeFile('qa-np-royaltent/preservation.json',JSON.stringify({passed:true,baseline,entrypointsOnlyCacheRevision:true,positionOrientationPreserved:true,surroundingsPreserved:true,unrelatedAssetsUnchanged:true,changed},null,2));
console.log('NP_ROYALTENT_PRESERVATION_PASS');
