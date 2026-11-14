import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.BAIKONUR_URL||'https://ifdiakov.github.io/baikonur-3d/';
const files=['index.html','assets/models/sprinter/model-v1.glb','assets/models/sprinter/manifest-v1.json','src/sprinter-source.js','src/sprinter-detail.js','assets/models/sprinter/hood-logo-original-v1.png','assets/models/sprinter/decals-v3.json'];
const hash=b=>createHash('sha256').update(b).digest('hex'),expected=await Promise.all(files.map(f=>readFile(f).then(hash)));
for(let attempt=0;attempt<36;attempt++){
 const match=await Promise.all(files.map(async(f,i)=>{try{const r=await fetch(new URL(f+'?sprinter_verify='+Date.now(),base),{signal:AbortSignal.timeout(15000)});return r.ok&&hash(new Uint8Array(await r.arrayBuffer()))===expected[i];}catch{return false;}}));
 if(match.every(Boolean)){console.log('SPRINTER_PUBLISHED_BYTES_PASS',files.length);process.exit(0);}
 console.log('Waiting for Sprinter publication',files.filter((_,i)=>!match[i]));await new Promise(r=>setTimeout(r,5000));
}
throw Error('Published Sprinter model or entry point does not yet match this version');
