import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.BAIKONUR_URL||'https://ifdiakov.github.io/baikonur-3d/';
const files=['src/checkpoint7.js','src/checkpoint7-layout.js','src/checkpoint7-road-grade.js','src/osm-transport.js'];
const hash=b=>createHash('sha256').update(b).digest('hex'),expected=await Promise.all(files.map(f=>readFile(f).then(hash)));
for(let attempt=0;attempt<36;attempt++){
 const match=await Promise.all(files.map(async(f,i)=>{try{const r=await fetch(new URL(f+'?checkpoint7_verify='+Date.now(),base),{signal:AbortSignal.timeout(15000)});return r.ok&&hash(new Uint8Array(await r.arrayBuffer()))===expected[i];}catch{return false;}}));
 const entry=await fetch(new URL('?checkpoint7_verify='+Date.now(),base),{signal:AbortSignal.timeout(15000)}).then(r=>r.text()).catch(()=>'');
 if(match.every(Boolean)&&entry.includes("get('view')==='kpp7'")&&entry.includes('archive-models.js?v=20261103-checkpoint7-flat-v2')){console.log('CHECKPOINT7_PUBLISHED_BYTES_PASS');process.exit(0);}
 console.log('Waiting for Checkpoint 7 publication');await new Promise(r=>setTimeout(r,5000));
}
throw Error('Published Checkpoint 7 does not yet match this version');
