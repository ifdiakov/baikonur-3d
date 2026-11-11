import assert from 'node:assert/strict';
import test from 'node:test';
import {waitForPagesPublication,PAGES_WORKFLOW} from '../scripts/ci/wait-pages-publication.mjs';

const sha='a'.repeat(40),foreignSha='b'.repeat(40),token='test-only-token';
const run=(status,conclusion=null,extra={})=>({id:501,run_attempt:1,...PAGES_WORKFLOW,
 head_sha:sha,head_branch:'main',status,conclusion,html_url:'https://github.com/example/museum/actions/runs/501',...extra});
const list=(...runs)=>({workflow_runs:runs,total_count:runs.length});

async function scenario(responses,options={}){
 let clock=0;const requests=[],sleeps=[],saved=[];
 const report=await waitForPagesPublication({repository:'example/museum',sha,token,timeoutMs:45,intervalMs:15,
  now:()=>clock,sleep:async ms=>{sleeps.push(ms);clock+=ms;},
  async fetchImpl(url,request){
   const parsed=new URL(url);assert.equal(parsed.origin,'https://api.github.com');
   assert.equal(request.method,'GET');assert.equal(request.headers.Authorization,'Bearer '+token);
   assert(request.signal instanceof AbortSignal);requests.push(parsed);
   assert(responses.length,'The gate made an unexpected API request');
   let body=responses.shift();if(typeof body==='function')body=body({advance:ms=>clock+=ms,request:parsed});
   return {ok:!body.httpError,status:body.httpError||200,json:async()=>body};
  },
  onUpdate:async value=>saved.push(structuredClone(value)),...options,
 });
 assert.deepEqual(saved.at(-1),report,'The final success/failure is saved for the artifact');
 assert(!JSON.stringify(saved).includes(token),'Diagnostic output must not expose the token');
 return {report,requests,sleeps,saved};
}

test('a fresh commit waits for discovery and the same Pages run to complete',async()=>{
 const {report,requests,sleeps,saved}=await scenario([list(),list(run('queued')),list(run('in_progress')),list(run('completed','success'))],{timeoutMs:60});
 assert(report.passed);assert.equal(report.outcome,'published');assert.equal(report.elapsedMs,45);
 assert.equal(report.pagesRun.head_sha,sha);assert.equal(report.observations.length,4);
 assert.deepEqual(sleeps,[15,15,15]);assert.equal(requests[0].searchParams.get('head_sha'),sha);
 assert.equal(requests[0].searchParams.get('branch'),'main');assert(!requests[0].searchParams.has('status'));
 assert(requests.every(url=>url.searchParams.get('head_sha')===sha));
 assert(saved.some(r=>r.outcome==='waiting'&&r.pagesRun?.status==='in_progress'));
});

test('an already successful exact publication preserves its run attempt',async()=>{
 const {report,requests,sleeps}=await scenario([list(run('completed','success',{run_attempt:2}))],{acceptanceRunId:'900',acceptanceRunAttempt:'3'});
 assert(report.passed);assert.equal(report.pagesRun.run_attempt,2);assert.equal(report.acceptanceRunAttempt,'3');
 assert.equal(requests.length,1);assert.deepEqual(sleeps,[]);
});

test('success for another SHA, branch or named non-Pages workflow cannot unblock acceptance',async()=>{
 const irrelevant=list(run('completed','success',{head_sha:foreignSha}),run('completed','success',{head_branch:'other'}),
  run('completed','success',{path:'.github/workflows/something-else.yml'}));
 const {report,requests}=await scenario([irrelevant,irrelevant],{timeoutMs:30});
 assert(!report.passed);assert.equal(report.outcome,'timeout');assert.equal(report.pagesRun,null);
 assert.equal(requests.length,2);
});

for(const conclusion of ['failure','cancelled'])test('Pages '+conclusion+' stops immediately without following another run',async()=>{
 const {report,requests,sleeps}=await scenario([list(run('in_progress')),list(run('completed',conclusion)),list(run('completed','success',{id:502}))]);
 assert(!report.passed);assert.equal(report.outcome,'publication-failed');assert.match(report.reason,new RegExp(conclusion));
 assert.equal(report.pagesRun.id,501);assert.equal(report.pagesRun.conclusion,conclusion);
 assert.equal(requests.length,2);assert.deepEqual(sleeps,[15]);
});

test('an older successful run cannot mask a newer failed Pages run for the same commit',async()=>{
 const {report,requests}=await scenario([list(run('completed','success',{id:500}),run('completed','failure',{id:502}))]);
 assert(!report.passed);assert.equal(report.outcome,'publication-failed');assert.equal(report.pagesRun.id,502);
 assert.equal(requests.length,1);
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
 const {report,requests}=await scenario([{workflow_runs:others,total_count:101},list(run('completed','success'))]);
 assert(report.passed);assert.equal(requests.length,2);assert.equal(requests[1].searchParams.get('page'),'2');
});

test('production defaults stop a pending deployment after twelve minutes in fifteen-second steps',async()=>{
 const responses=Array.from({length:48},(_,i)=>list(run(i===0?'queued':'in_progress')));
 const {report,requests,sleeps}=await scenario(responses,{timeoutMs:undefined,intervalMs:undefined});
 assert(!report.passed);assert.equal(report.outcome,'timeout');assert.equal(report.elapsedMs,720000);
 assert.equal(requests.length,48);assert.deepEqual(sleeps,Array(48).fill(15000));
});
