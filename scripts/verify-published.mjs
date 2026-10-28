import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Verify the deployed bytes, including modules loaded through relative imports.
// A stale CDN module must not be mistaken for a tested publication.
const base=process.env.BAIKONUR_PUBLIC_URL||'https://ifdiakov.github.io/baikonur-3d/';
const files=['index.html','data/catalog.json','data/transport-network.json',
 ...(await readdir('src')).filter(file=>file.endsWith('.js')).map(file=>'src/'+file)];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const expected=new Map(await Promise.all(files.map(async file=>[file,digest(await readFile(file))])));
let pending=[...files];
for(let attempt=1;attempt<=24;attempt++){
 const failed=[];
 for(let i=0;i<pending.length;i+=4){
  const results=await Promise.all(pending.slice(i,i+4).map(async file=>{
   const url=new URL(file,base);url.searchParams.set('verify',process.env.GITHUB_SHA||'museum4');url.searchParams.set('attempt',String(attempt));
   try{const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(!response.ok)return file;
    return digest(new Uint8Array(await response.arrayBuffer()))===expected.get(file)?null:file;
   }catch{return file;}
  }));failed.push(...results.filter(Boolean));
 }
 if(!failed.length){console.log('PUBLISHED_BYTES_VERIFIED',JSON.stringify({base,files:files.length,commit:process.env.GITHUB_SHA||null}));process.exit(0);}
 pending=failed;console.log('Awaiting published files',attempt,JSON.stringify(pending));
 if(attempt<24)await new Promise(resolve=>setTimeout(resolve,8000));
}
throw new Error('Published museum differs from this checkout: '+pending.join(', '));
