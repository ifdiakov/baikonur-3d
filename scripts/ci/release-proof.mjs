import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',timeout:30000}).trim();
const hash=b=>createHash('sha256').update(b).digest('hex');
export function assertPublishHead(local,remote){if(local!==remote)throw Error(`STALE_RELEASE: tested ${local}, main is ${remote}. Refusing older publication.`);}
export async function fetchBounded(url,timeout=12000){const r=await fetch(url,{signal:AbortSignal.timeout(timeout)});if(!r.ok)throw Error(`HTTP ${r.status}: ${url}`);return Buffer.from(await r.arrayBuffer());}
function reports(dir){let out=[];for(const f of readdirSync(dir,{withFileTypes:true})){const p=join(dir,f.name);if(f.isDirectory())out.push(...reports(p));else if(f.name==='report.json')out.push(p);}return out;}
export function verifyReports(paths){
 if(!paths.length)throw Error('No browser acceptance reports');
 const checks=[];for(const path of paths){const r=JSON.parse(readFileSync(path));if(r.passed!==true)throw Error('Acceptance incomplete or failed: '+path);checks.push({path,passed:r.passed,modes:r.checks?.map(c=>c.mode)||[]});}return checks;
}
async function main(){
 const mode=process.argv[2],dir=process.argv[3]||'/tmp/museum-pages';mkdirSync('qa-ci',{recursive:true});
 if(mode==='guard'){const head=git('rev-parse','HEAD'),remote=git('ls-remote','origin','refs/heads/main').split(/\s/)[0];assertPublishHead(head,remote);console.log('CURRENT_TESTED_RELEASE',head);return;}
 if(mode==='manifest'){
  const proof={sourceSha:git('rev-parse','HEAD'),triggerSha:process.env.GITHUB_SHA||null,runId:process.env.GITHUB_RUN_ID||null,createdAt:new Date().toISOString(),files:{}};
  for(const f of ['index.html','museum.html','workshop.html','src/transport-detail-worker.bundle.js','src/site31-observation-platform.js','src/np-royaltent.js'])proof.files[f]=hash(readFileSync(join(dir,f)));
  writeFileSync(join(dir,'release-manifest.json'),JSON.stringify(proof,null,2));writeFileSync('qa-ci/release-candidate.json',JSON.stringify(proof,null,2));console.log('EXACT_RELEASE_MANIFEST',proof.sourceSha);return;
 }
 if(mode==='confirm'){
  const expected=JSON.parse(readFileSync('qa-ci/release-candidate.json')),base=process.env.BAIKONUR_URL||'https://ifdiakov.github.io/baikonur-3d/';
  let manifest,last;const deadline=Date.now()+90000;
  while(Date.now()<deadline){try{manifest=JSON.parse((await fetchBounded(new URL('release-manifest.json?v='+expected.sourceSha,base))).toString());if(manifest.sourceSha===expected.sourceSha)break;last='Different published source SHA';}catch(e){last=e.message;}await new Promise(r=>setTimeout(r,5000));}
  if(manifest?.sourceSha!==expected.sourceSha)throw Error('PUBLIC_REVISION_UNCONFIRMED: '+last);
  for(const [file,digest]of Object.entries(expected.files)){const data=await fetchBounded(new URL(file+'?release='+expected.sourceSha,base));if(hash(data)!==digest)throw Error('PUBLIC_FILE_MISMATCH: '+file);}
  writeFileSync('qa-ci/public-hashes.json',JSON.stringify({passed:true,sourceSha:expected.sourceSha,checkedFiles:Object.keys(expected.files)},null,2));console.log('PUBLIC_REVISION_VERIFIED',expected.sourceSha);return;
 }
 if(mode==='complete'){
  const checks=verifyReports(reports(dir)),sha=git('rev-parse','HEAD');
  const publicProof=JSON.parse(readFileSync('qa-ci/public-hashes.json'));if(!publicProof.passed||publicProof.sourceSha!==sha)throw Error('Current public revision has not been verified');
  const publicModes=new Set(checks.filter(c=>c.path.includes('/public/')).flatMap(c=>c.modes));for(const m of ['desktop','mobile','workshop'])if(!publicModes.has(m))throw Error('Missing required public acceptance mode: '+m);
  const proof={status:'verified',sourceSha:sha,checks,publicProof,at:new Date().toISOString()};writeFileSync('qa-ci/completion.json',JSON.stringify(proof,null,2));console.log('RELEASE_COMPLETE',JSON.stringify(proof));return;
 }
 throw Error('Unknown proof mode');
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname)await main();
