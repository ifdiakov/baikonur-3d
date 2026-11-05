import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.BAIKONUR_URL||'https://ifdiakov.github.io/baikonur-3d/',files=['src/rail-stations.js','assets/models/rail-station/model-v1.glb','assets/models/rail-station/manifest-v1.json'],hash=b=>createHash('sha256').update(b).digest('hex');
const expected=await Promise.all(files.map(f=>readFile(f).then(hash)));
for(let n=0;n<48;n++){
 const ok=await Promise.all(files.map(async(f,i)=>{try{const r=await fetch(new URL(f+'?verify='+Date.now(),base),{signal:AbortSignal.timeout(10000)});return r.ok&&hash(new Uint8Array(await r.arrayBuffer()))===expected[i];}catch{return false;}}));
 const page=await fetch(new URL('?verify='+Date.now(),base)).then(r=>r.text());
 if(ok.every(Boolean)&&page.includes('rail-stations.js?v=20261105-station-lite-v1')){console.log('RAIL_STATION_PUBLIC_PASS');process.exit(0);}await new Promise(r=>setTimeout(r,5000));
}
throw Error('Station deployment not yet available');
