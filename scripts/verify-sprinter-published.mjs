import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.BAIKONUR_URL||'https://ifdiakov.github.io/baikonur-3d/';
const files=['assets/models/sprinter/model-v1.glb','assets/models/sprinter/manifest-v1.json','src/sprinter-source.js','src/sprinter-detail.js','assets/models/sprinter/hood-logo-v2.svg'];
const hash=b=>createHash('sha256').update(b).digest('hex'),expected=await Promise.all(files.map(f=>readFile(f).then(hash)));
for(let attempt=0;attempt<36;attempt++){
 const match=await Promise.all(files.map(async(f,i)=>{try{const r=await fetch(new URL(f+'?sprinter_verify='+Date.now(),base),{signal:AbortSignal.timeout(15000)});return r.ok&&hash(new Uint8Array(await r.arrayBuffer()))===expected[i];}catch{return false;}}));
 const entry=await fetch(new URL('?sprinter_verify='+Date.now(),base),{signal:AbortSignal.timeout(15000)}).then(r=>r.text()).catch(()=>'');
 if(match.every(Boolean)&&entry.includes("groundTraffic.focusSprinter()")&&entry.includes('ground-traffic.js?v=20261105-sprinter-detail-v2')){console.log('SPRINTER_PUBLISHED_BYTES_PASS',files.length);process.exit(0);}
 console.log('Waiting for Sprinter publication',files.filter((_,i)=>!match[i]));await new Promise(r=>setTimeout(r,5000));
}
throw Error('Published Sprinter model or entry point does not yet match this version');
