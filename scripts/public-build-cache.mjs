import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const stampPath='data/public-build-cache.json';
const inputs=['index.html','src','data','assets','scripts/build-public-scene.mjs','scripts/bake-site-road-ink.mjs','scripts/prepare-workshop.mjs'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function git(args){return execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
export async function verifyCache({allowFetch=false}={}){
 try{
  const stamp=JSON.parse(await readFile(stampPath,'utf8'));
  if(stamp.version!==1||!/^[a-f0-9]{40}$/.test(stamp.sourceCommit))return {valid:false,reason:'Invalid cache certificate'};
  try{git(['cat-file','-e',stamp.sourceCommit+'^{commit}']);}catch(error){
   if(!allowFetch)return {valid:false,reason:'Certified source commit is unavailable'};
   git(['fetch','--no-tags','--depth=1','origin',stamp.sourceCommit]);
  }
  const changes=git(['diff','--name-only',stamp.sourceCommit,'--',...inputs]).split('\n').filter(p=>p&&p!==stampPath);
  if(changes.length)return {valid:false,reason:'Build inputs or generated assets changed',changes};
  if(sha(await readFile('data/public-scene.json'))!==stamp.manifestSha256)return {valid:false,reason:'Generated manifest checksum differs'};
  return {valid:true,reason:'Exact tested scene and inputs are unchanged',sourceCommit:stamp.sourceCommit};
 }catch(error){return {valid:false,reason:error.message};}
}
export async function recordCache(){
 const existing=await verifyCache();if(existing.valid)return existing;
 const stamp={version:1,sourceCommit:git(['rev-parse','HEAD']),manifestSha256:sha(await readFile('data/public-scene.json'))};
 await writeFile(stampPath,JSON.stringify(stamp,null,2)+'\n');return stamp;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2];
 if(mode==='check'){const result=await verifyCache({allowFetch:true});if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,'rebuild='+(!result.valid)+'\n');console.log('PUBLIC_BUILD_CACHE',JSON.stringify(result));}
 else if(mode==='record')console.log('PUBLIC_BUILD_CERTIFICATE',JSON.stringify(await recordCache()));
 else throw Error('Expected check or record');
}
