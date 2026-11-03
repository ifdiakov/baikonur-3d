import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.BAIKONUR_URL||'https://ifdiakov.github.io/baikonur-3d/';
const files=['src/site250a.js','src/site250a-layout.js'];
const hash=b=>createHash('sha256').update(b).digest('hex'),expected=await Promise.all(files.map(f=>readFile(f).then(hash)));
for(let attempt=0;attempt<36;attempt++){
 const match=await Promise.all(files.map(async(f,i)=>{try{const r=await fetch(new URL(f+'?site250a_verify='+Date.now(),base),{signal:AbortSignal.timeout(15000)});return r.ok&&hash(new Uint8Array(await r.arrayBuffer()))===expected[i];}catch{return false;}}));
 const entry=await fetch(new URL('?site250a_verify='+Date.now(),base),{signal:AbortSignal.timeout(15000)}).then(r=>r.text()).catch(()=>'');
 if(match.every(Boolean)&&entry.includes("get('view')==='site250a'")&&entry.includes('archive-models.js?v=20261103-site250a-photo-v1')){console.log('SITE250A_PUBLISHED_BYTES_PASS');process.exit(0);}
 console.log('Waiting for Site 250A publication');await new Promise(r=>setTimeout(r,5000));
}
throw Error('Published Site 250A does not yet match this version');
