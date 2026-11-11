import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {waitForPagesPublication,PAGES_WORKFLOW} from '../scripts/ci/wait-pages-publication.mjs';

const sha='a'.repeat(40),foreignSha='b'.repeat(40),token='test-only-token';
const run=(status,conclusion=null,extra={})=>({id:501,run_attempt:1,workflow_id:PAGES_WORKFLOW.id,
 name:PAGES_WORKFLOW.name,path:PAGES_WORKFLOW.path,head_sha:sha,head_branch:'main',status,conclusion,
 html_url:'https://github.com/example/museum/actions/runs/501',...extra});
const list=(...runs)=>({workflow_runs:runs,total_count:runs.length});
const checkoutLog=(value=sha,artifact='13842340455')=>[
 '2026-11-11T08:59:20.6802857Z [command]/usr/bin/git log -1 --format=%H',
 '2026-11-11T08:59:20.6836645Z '+value,
 '2026-11-11T08:59:25.8068366Z Artifact github-pages.zip successfully finalized. Artifact ID '+artifact,
 '2026-11-11T08:59:25.8069521Z Artifact github-pages has been successfully uploaded! Final size is 102778436 bytes. Artifact ID is '+artifact,
].join('\n');
const deploymentLog=(artifact='13842340455')=>[
 '2026-11-11T08:59:35.3644039Z Creating Pages deployment with payload:',
 '2026-11-11T08:59:35.3646096Z \t"artifact_id": '+artifact+',',
 '2026-11-11T08:59:35.3647198Z \t"pages_build_version": "'+foreignSha+'",',
].join('\n');

async function scenario(responses,{proofs={},...options}={}){
 let clock=0;const requests=[],sleeps=[],saved=[],knownRuns=new Map();
 const config=r=>proofs[`${r.id}:${r.run_attempt??1}`]??proofs[r.id]??{};
 const report=await waitForPagesPublication({repository:'example/museum',sha,token,timeoutMs:45,intervalMs:15,
  now:()=>clock,sleep:async ms=>{sleeps.push(ms);clock+=ms;},
  async fetchImpl(url,request){
   const parsed=new URL(url);assert.equal(parsed.origin,'https://api.github.com');
   assert.equal(request.method,'GET');assert.equal(request.headers.Authorization,'Bearer '+token);
   assert(request.signal instanceof AbortSignal);requests.push(parsed);
   let body;
   if(parsed.pathname==='/repos/example/museum/actions/runs'){
    assert(responses.length,'The gate made an unexpected discovery request');
    body=responses.shift();if(typeof body==='function')body=body({advance:ms=>clock+=ms,request:parsed});
    for(const item of body.workflow_runs??[])knownRuns.set(item.id,item);
   }else{
    const jobs=parsed.pathname.match(/\/actions\/runs\/(\d+)\/attempts\/(\d+)\/jobs$/);
    const logs=parsed.pathname.match(/\/actions\/jobs\/(\d+)\/logs$/);
    const snapshot=parsed.pathname.match(/\/actions\/runs\/(\d+)$/);
    if(jobs){
     const current=knownRuns.get(Number(jobs[1]));assert(current);
     assert.equal(Number(jobs[2]),current.run_attempt??1,'Jobs must be scoped to the discovered attempt');
     const spec=config(current),base=current.id*10;
     const job=(name,id,conclusion)=>({name,id,run_id:current.id,run_attempt:current.run_attempt??1,status:'completed',conclusion});
     const rows=spec.jobs??[
      job('build',base+1,spec.buildConclusion??'success'),
      job('report-build-status',base+3,'success'),
      job('deploy',base+2,spec.deployConclusion??(current.conclusion==='success'?'success':current.conclusion)),
     ];body={jobs:rows,total_count:rows.length};
    }else if(logs){
     const id=Number(logs[1]),current=knownRuns.get(Math.floor(id/10));assert(current);
     const spec=config(current);
     body=id%10===1?spec.buildLog??checkoutLog(spec.checkoutSha??sha,spec.buildArtifact??'13842340455')
      :spec.deployLog??deploymentLog(spec.deployArtifact??'13842340455');
    }else if(snapshot){
     const current=knownRuns.get(Number(snapshot[1]));assert(current);
     const spec=config(current);body={...current,run_attempt:spec.snapshotAttempt??current.run_attempt??1};
    }else assert.fail('Unexpected endpoint '+url);
   }
   return {ok:!body.httpError,status:body.httpError||200,json:async()=>body,text:async()=>String(body)};
  },
  onUpdate:async value=>saved.push(structuredClone(value)),...options,
 });
 assert.deepEqual(saved.at(-1),report,'The final success/failure is saved for the artifact');
 assert(!JSON.stringify(saved).includes(token),'Diagnostic output must not expose the token');
 return {report,requests,discoverRequests:requests.filter(url=>url.pathname.endsWith('/actions/runs')),sleeps,saved};
}

test('a fresh commit waits for discovery and the same Pages run to complete',async()=>{
 const {report,discoverRequests,sleeps,saved}=await scenario([list(),list(run('queued')),list(run('in_progress')),list(run('completed','success'))],{timeoutMs:60});
 assert(report.passed);assert.equal(report.outcome,'published');assert.equal(report.elapsedMs,45);
 assert.equal(report.pagesRun.head_sha,sha);assert.equal(report.actualCheckoutSha,sha);assert.equal(report.observations.length,4);
 assert.deepEqual(sleeps,[15,15,15]);assert.equal(discoverRequests.length,4);
 assert(discoverRequests.every(url=>!url.searchParams.has('head_sha')&&!url.searchParams.has('branch')&&!url.searchParams.has('status')));
 assert(saved.some(r=>r.outcome==='waiting'&&r.pagesRun?.status==='in_progress'));
});

test('an already successful exact publication preserves its run attempt',async()=>{
 const {report,requests,discoverRequests,sleeps}=await scenario([list(run('completed','success',{run_attempt:2}))],{acceptanceRunId:'900',acceptanceRunAttempt:'3'});
 assert(report.passed);assert.equal(report.pagesRun.run_attempt,2);assert.equal(report.acceptanceRunAttempt,'3');
 assert.equal(report.evidence[0].runAttempt,2);assert(requests.some(url=>url.pathname.endsWith('/attempts/2/jobs')));
 assert.equal(discoverRequests.length,1);assert.deepEqual(sleeps,[]);
});

test('success for another SHA, branch or named non-Pages workflow cannot unblock acceptance',async()=>{
 const irrelevant=list(run('completed','success',{head_sha:foreignSha}),run('completed','success',{id:502,head_branch:'other'}),
  run('completed','success',{id:503,path:'.github/workflows/something-else.yml'}));
 const {report,discoverRequests}=await scenario([irrelevant,irrelevant],{timeoutMs:30,proofs:{501:{checkoutSha:foreignSha}}});
 assert(!report.passed);assert.equal(report.outcome,'timeout');assert.equal(report.actualCheckoutSha,foreignSha);
 assert.equal(discoverRequests.length,2);assert.equal(report.evidence.length,1);
});

for(const conclusion of ['failure','cancelled'])test('Pages '+conclusion+' stops immediately without following another run',async()=>{
 const {report,discoverRequests,sleeps}=await scenario([list(run('in_progress')),list(run('completed',conclusion)),list(run('completed','success',{id:502}))]);
 assert(!report.passed);assert.equal(report.outcome,'publication-failed');assert.match(report.reason,new RegExp(conclusion));
 assert.equal(report.pagesRun.id,501);assert.equal(report.pagesRun.conclusion,conclusion);
 assert.equal(discoverRequests.length,2);assert.deepEqual(sleeps,[15]);
});

test('an older successful run cannot mask a newer failed Pages run for the same commit',async()=>{
 const {report,discoverRequests}=await scenario([list(run('completed','success',{id:500}),run('completed','failure',{id:502}))]);
 assert(!report.passed);assert.equal(report.outcome,'publication-failed');assert.equal(report.pagesRun.id,502);
 assert.equal(discoverRequests.length,1);
});

test('a pending publication expires at the bounded deadline',async()=>{
 const {report,sleeps}=await scenario([list(run('queued')),list(run('in_progress')),list(run('in_progress'))],{timeoutMs:32});
 assert(!report.passed);assert.equal(report.outcome,'timeout');assert.equal(report.elapsedMs,32);
 assert.deepEqual(sleeps,[15,15,2]);assert.equal(report.pagesRun.status,'in_progress');
});

test('HTTP failures are saved and stop without retrying the API or publication',async()=>{
 const {report,requests}=await scenario([{httpError:403},list(run('completed','success'))]);
 assert(!report.passed);assert.equal(report.outcome,'api-error');assert.match(report.reason,/HTTP 403/);assert.equal(requests.length,1);
});

test('a response arriving after the deadline cannot unlock the public matrix',async()=>{
 const {report,sleeps}=await scenario([({advance})=>{advance(46);return list(run('completed','success'));}]);
 assert(!report.passed);assert.equal(report.outcome,'timeout');assert.deepEqual(sleeps,[]);
});

test('a Pages retry during the wait is recorded but not followed automatically',async()=>{
 const {report,requests}=await scenario([list(run('in_progress')),list(run('completed','success',{run_attempt:2}))]);
 assert(!report.passed);assert.equal(report.outcome,'publication-changed');assert.equal(report.pagesRun.run_attempt,2);
 assert.equal(requests.length,2);
});

test('a new Pages run appearing during the wait cannot be hidden by success of the watched run',async()=>{
 const {report,requests}=await scenario([list(run('in_progress')),
  list(run('completed','success'),run('completed','failure',{id:502}))]);
 assert(!report.passed);assert.equal(report.outcome,'publication-changed');
 assert.equal(report.pagesRun.id,502);assert.equal(report.pagesRun.conclusion,'failure');assert.equal(requests.length,2);
});

test('discovery finds Pages beyond the first page of unrelated workflows',async()=>{
 const others=Array.from({length:100},(_,i)=>run('completed','success',{id:i+1,path:'.github/workflows/check-'+i+'.yml'}));
 const {report,discoverRequests}=await scenario([{workflow_runs:others,total_count:101},list(run('completed','success'))]);
 assert(report.passed);assert.equal(discoverRequests.length,2);assert.equal(discoverRequests[1].searchParams.get('page'),'2');
});

test('production defaults stop a pending deployment after twelve minutes in fifteen-second steps',async()=>{
 const responses=Array.from({length:48},(_,i)=>list(run(i===0?'queued':'in_progress')));
 const {report,requests,sleeps}=await scenario(responses,{timeoutMs:undefined,intervalMs:undefined});
 assert(!report.passed);assert.equal(report.outcome,'timeout');assert.equal(report.elapsedMs,720000);
 assert.equal(requests.length,48);assert.deepEqual(sleeps,Array(48).fill(15000));
});

test('stale advertised head with exact checkout and matching deployed artifact is accepted',async()=>{
 const {report}=await scenario([list(run('completed','success',{head_sha:foreignSha}))]);
 assert(report.passed);assert.equal(report.advertisedHeadSha,foreignSha);assert.equal(report.actualCheckoutSha,sha);
 assert.deepEqual(report.evidence.map(e=>[e.runId,e.buildJobId,e.deployJobId,e.buildArtifactId,e.deployArtifactId,e.artifactCorrelation]),
  [[501,5011,5012,'13842340455','13842340455','matched']]);
});

test('expected advertised head with wrong checkout stays closed and caches completed evidence',async()=>{
 const result=await scenario(Array.from({length:3},()=>list(run('completed','success'))),{proofs:{501:{checkoutSha:foreignSha}}});
 assert(!result.report.passed);assert.equal(result.report.outcome,'timeout');assert.equal(result.report.actualCheckoutSha,foreignSha);
 assert.equal(result.requests.filter(url=>url.pathname.endsWith('/5011/logs')).length,1);
 assert.equal(result.requests.filter(url=>url.pathname.endsWith('/5012/logs')).length,1);
 assert.equal(result.report.evidence.length,1);
});

test('an old completed wrong checkout is skipped before the new Pages run appears',async()=>{
 const old=run('completed','success',{id:500,head_sha:foreignSha});
 const {report,requests}=await scenario([list(old),list(old),list(old,run('in_progress',null,{head_sha:foreignSha})),
  list(old,run('completed','success',{head_sha:foreignSha}))],{timeoutMs:60,proofs:{500:{checkoutSha:foreignSha}}});
 assert(report.passed);assert.equal(report.pagesRun.id,501);assert.equal(report.evidence.length,2);
 assert.equal(requests.filter(url=>url.pathname.endsWith('/5001/logs')).length,1);
});

for(const [name,buildLog] of [
 ['SHA elsewhere in log without the checkout command','Some message contains '+sha],
 ['missing immediate output','[command]/usr/bin/git log -1 --format=%H\nChecking out '+sha],
 ['multiple checkout command outputs',checkoutLog()+'\n'+checkoutLog()],
])test(name+' fails closed',async()=>{
 const {report}=await scenario([list(run('completed','success'))],{proofs:{501:{buildLog}}});
 assert(!report.passed);assert.equal(report.outcome,'publication-unverified');assert.equal(report.actualCheckoutSha,null);
});

test('a failed deploy cannot be hidden by a successful run summary or checkout',async()=>{
 const {report}=await scenario([list(run('completed','success'))],{proofs:{501:{deployConclusion:'failure'}}});
 assert(!report.passed);assert.equal(report.outcome,'publication-unverified');assert.match(report.reason,/deploy job 5012.*failure/);
});

test('report-build-status is never mistaken for the exact build job',async()=>{
 const {report}=await scenario([list(run('completed','success'))],{proofs:{501:{jobs:[
  {name:'report-build-status',id:5013,status:'completed',conclusion:'success'},
  {name:'deploy',id:5012,status:'completed',conclusion:'success'},
 ]}}});
 assert(!report.passed);assert.equal(report.outcome,'publication-unverified');assert.match(report.reason,/one exact build job; found 0/);
});

test('different uploaded and deployed artifact IDs fail closed',async()=>{
 const {report}=await scenario([list(run('completed','success'))],{proofs:{501:{deployArtifact:'999'}}});
 assert(!report.passed);assert.equal(report.outcome,'publication-unverified');assert.equal(report.evidence[0].artifactCorrelation,'mismatch');
});

for(const [name,proof]of [
 ['missing uploaded artifact',{buildLog:'[command]/usr/bin/git log -1 --format=%H\n'+sha}],
 ['missing deployed artifact',{deployLog:'Creating Pages deployment with payload:'}],
 ['multiple uploaded artifact IDs',{buildLog:checkoutLog()+'\nArtifact github-pages.zip successfully finalized. Artifact ID 999'}],
 ['multiple deployed artifact IDs',{deployLog:deploymentLog()+'\n'+deploymentLog('999')}],
])test(name+' fails closed even with the correct checkout',async()=>{
 const {report}=await scenario([list(run('completed','success'))],{proofs:{501:proof}});
 assert(!report.passed);assert.equal(report.outcome,'publication-unverified');assert.equal(report.actualCheckoutSha,sha);
 assert.equal(report.evidence[0].artifactCorrelation,'unavailable');assert.match(report.reason,/artifact identity is missing or ambiguous/);
});

test('a retry beginning while completed logs are read cannot unlock acceptance',async()=>{
 const {report}=await scenario([list(run('completed','success'))],{proofs:{501:{snapshotAttempt:2}}});
 assert(!report.passed);assert.equal(report.outcome,'publication-changed');assert.match(report.reason,/attempt changed/);
});

test('a path imitation outside the known official Pages workflow cannot unlock acceptance',async()=>{
 const other=list(run('completed','success',{workflow_id:123}));
 const {report,requests}=await scenario([other,other],{timeoutMs:30});
 assert(!report.passed);assert.equal(report.outcome,'timeout');assert.equal(report.pagesRun,null);assert.equal(requests.length,2);
});

test('the actual workflow selects Buran for common gate-only changes and preserves direct model profiles',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/verify-mik112.yml',import.meta.url),'utf8');
 const block=workflow.split('      - name: Select the relevant existing acceptance suite\n')[1]
  .split('      - name: Prepare the approved integration only\n')[0].split('        run: |\n')[1];
 assert(block);
 const script=block.replace(/^          /gm,'').replaceAll("${{ github.ref_name }}",'main').replaceAll("${{ github.event_name }}",'push');
 const temp=mkdtempSync(join(tmpdir(),'pages-profile-'));
 try{
  mkdirSync(join(temp,'src'));writeFileSync(join(temp,'src/buran-launch.js'),'');
  const cases=[
   [['scripts/ci/wait-pages-publication.mjs','tests/mik112-publish-gate.mjs','.github/workflows/verify-mik112.yml','PROJECT_CONTEXT.md','docs/WORK_STATUS.md'],'buran-launch'],
   [['.github/workflows/verify-mik112.yml'],'buran-launch'],
   [['tests/mik112-publish-gate.mjs'],'buran-launch'],
   [['src/mik112.js','scripts/ci/wait-pages-publication.mjs'],'mik112'],
   [['tests/mik112-browser.mjs','.github/workflows/verify-mik112.yml'],'mik112'],
   [['src/bridge-ground-surface.js','scripts/ci/wait-pages-publication.mjs'],'bridge-sign112'],
   [['src/buran-launch.js'],'buran-launch'],
   [['src/buran-loss.js','scripts/ci/wait-pages-publication.mjs'],'buran-loss'],
  ];
  for(const [changed,expected]of cases){
   const output=join(temp,'output');writeFileSync(output,'');
   const result=spawnSync('bash',['-eu','-o','pipefail','-c',
    'git() { if [[ "$1" == diff ]]; then printf "%s\\n" "$CHANGED"; fi; }\n'+script],
    {cwd:temp,encoding:'utf8',env:{...process.env,BEFORE:foreignSha,REQUESTED_TARGET:'',CHANGED:changed.join('\n'),GITHUB_OUTPUT:output}});
   assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(output,'utf8').trim(),'target='+expected,changed.join(', '));
  }
 }finally{rmSync(temp,{recursive:true,force:true});}
});
