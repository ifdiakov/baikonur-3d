import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=['src/site31-exhibit.js','src/site31-source.js','src/gagarin-pad.js','src/gagarin-source-table.js','src/site31-pad.js','src/site31-trench.js','src/site31-trench-profile.js','src/soyuz-excavation-profile.js','src/soyuz-excavation-rim.js','src/soyuz-launch-paint.js','src/terrain-voids.js','assets/models/site31/model-v1.glb','assets/models/site31/manifest-v1.json'];
const hash=b=>createHash('sha256').update(b).digest('hex'),expected=await Promise.all(files.map(f=>readFile(f).then(hash)));
for(let attempt=0;attempt<36;attempt++){
 const match=await Promise.all(files.map(async(f,i)=>{try{const r=await fetch('https://ifdiakov.github.io/baikonur-3d/'+f+'?site31_verify='+Date.now(),{signal:AbortSignal.timeout(20000)});return r.ok&&hash(new Uint8Array(await r.arrayBuffer()))===expected[i];}catch{return false;}}));
 if(match.every(Boolean)){console.log('SITE31_PUBLISHED_BYTES_PASS',files.length);process.exit(0);}
 console.log('Waiting for Site31 publication',files.filter((_,i)=>!match[i]));await new Promise(r=>setTimeout(r,5000));
}
throw Error('Site31 published files do not yet match the checkout');
