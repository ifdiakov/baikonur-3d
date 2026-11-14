import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import {TRANSPORT_GROUND_VERSION} from '../src/transport-ground-profile.js';

const folder=await mkdtemp(join(tmpdir(),'museum-lod-branches-'));
try{
 const bakePath=join(folder,'routes.json.gz'),lodPath=join(folder,'lod.json.gz');
 const roads=Array.from({length:101},(_,i)=>({id:'road-'+i,width:2,tags:{highway:'secondary'},points:[[i,-2.73,0],[i,-2.73,20]]}));
 const shared=[10,-2.755,10],rails=[
  {sourceWayId:'branch-a',width:.448,points:[shared,[20,-2.755,20]]},
  {sourceWayId:'branch-b',width:.448,points:[shared,[30,-2.755,15]]}
 ];
 const bake={version:'transport-geometry-bake-v1',cacheKind:'routes-only',groundVersion:TRANSPORT_GROUND_VERSION,editable:roads,terrain:{rails:[...rails,structuredClone(rails[0])]}};
 await writeFile(bakePath,gzipSync(JSON.stringify(bake)));
 const result=spawnSync(process.execPath,[new URL('../scripts/build-authoritative-road-lod.mjs',import.meta.url).pathname,'--bake',bakePath,'--output',lodPath],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.stdout);
 const lod=JSON.parse(gunzipSync(await readFile(lodPath)));
 for(const name of ['far','medium']){
  const actual=lod.levels[name].rails;assert.equal(actual.length,2,'Distinct branches sharing their first point survive; exact duplicate is removed');
  assert.deepEqual(actual.map(row=>[row.points.at(-1)[0],row.points.at(-1)[2]]),[[20,20],[30,15]]);
 }
 console.log('AUTHORITATIVE_LOD_BRANCHES_PASS shared-start distinct branches preserved in both levels; exact duplicate removed');
}finally{await rm(folder,{recursive:true,force:true});}
