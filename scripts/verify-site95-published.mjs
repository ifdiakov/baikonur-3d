import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.BAIKONUR_URL||'https://ifdiakov.github.io/baikonur-3d/',files=['src/site95.js','src/site95-layout.js','src/site95-courtyard-plan.js','src/site95-landscape.js','src/archive-buildings.js','src/archive-models.js'],hash=b=>createHash('sha256').update(b).digest('hex');
const expected=await Promise.all(files.map(f=>readFile(f).then(hash)));const deadline=Date.now()+180000;let checks=[];
while(Date.now()<deadline){
 checks=await Promise.all(files.map(async(f,i)=>{try{const r=await fetch(new URL(f+'?verify='+Date.now(),base),{signal:AbortSignal.timeout(10000)});return {file:f,passed:r.ok&&hash(new Uint8Array(await r.arrayBuffer()))===expected[i],sha256:expected[i]};}catch(e){return {file:f,passed:false,error:e.message};}}));
 if(checks.every(x=>x.passed)){await mkdir('qa-site95',{recursive:true});await writeFile('qa-site95/public-files.json',JSON.stringify({passed:true,checks},null,2));console.log('SITE95_PUBLIC_FILES_PASS');process.exit(0);}await new Promise(r=>setTimeout(r,5000));
}throw Error('Published site95 source does not yet match: '+JSON.stringify(checks.filter(x=>!x.passed)));
