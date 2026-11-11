import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const PAGES_WORKFLOW={path:'dynamic/pages/pages-build-deployment',name:'pages build and deployment'};
export const PAGES_TIMEOUT_MS=12*60*1000;
export const PAGES_INTERVAL_MS=15*1000;

const describeRun=run=>run?{
 id:run.id,run_attempt:run.run_attempt??1,name:run.name,path:run.path,
 head_sha:run.head_sha,head_branch:run.head_branch,status:run.status,
 conclusion:run.conclusion??null,url:run.html_url??null,
}:null;

// This gate only observes Actions. A successful deployment still has to pass
// the browser suite's existing byte-for-byte checks of the public files.
export async function waitForPagesPublication({
 repository,sha,token,timeoutMs=PAGES_TIMEOUT_MS,intervalMs=PAGES_INTERVAL_MS,
 fetchImpl=fetch,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 onUpdate=async()=>{},acceptanceRunId=null,acceptanceRunAttempt=null,
}={}){
 const started=now(),deadline=started+timeoutMs;
 const report={version:1,passed:false,outcome:'waiting',repository,sha,branch:'main',
  workflow:PAGES_WORKFLOW,acceptanceRunId,acceptanceRunAttempt,timeoutMs,intervalMs,
  startedAt:new Date(started).toISOString(),elapsedMs:0,pagesRun:null,observations:[]};
 const update=async()=>{report.elapsedMs=now()-started;await onUpdate(report);};
 const finish=async(outcome,reason)=>{
  report.outcome=outcome;report.reason=reason;report.passed=outcome==='published';
  report.completedAt=new Date(now()).toISOString();await update();return report;
 };
 if(!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository||'')||!/^[a-f0-9]{40}$/.test(sha||'')||!token)
  return finish('configuration-error','GITHUB_REPOSITORY, full GITHUB_SHA and GITHUB_TOKEN are required.');
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>PAGES_TIMEOUT_MS||!Number.isFinite(intervalMs)||intervalMs<=0)
  return finish('configuration-error','The wait must be positive and bounded by twelve minutes.');

 const isExpectedRun=run=>run.head_sha===sha&&run.head_branch==='main'&&
  (run.path===PAGES_WORKFLOW.path||(!run.path&&run.name===PAGES_WORKFLOW.name));
 async function get(path){
  const remaining=deadline-now();if(remaining<=0)throw Error('Publication deadline reached.');
  const response=await fetchImpl('https://api.github.com'+path,{
   method:'GET',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'},
   signal:AbortSignal.timeout(Math.max(1,Math.min(PAGES_INTERVAL_MS,Math.ceil(remaining)))),
  });
  if(!response.ok)throw Error('GitHub Actions API returned HTTP '+response.status+'.');
  const data=await response.json();if(now()>=deadline)throw Error('Publication deadline reached.');return data;
 }
 async function discover(){
  const matches=[];let received=0;
  for(let page=1;page<=10;page++){
   const data=await get(`/repos/${repository}/actions/runs?head_sha=${sha}&branch=main&per_page=100&page=${page}`);
   if(!Array.isArray(data.workflow_runs))throw Error('GitHub Actions API returned an invalid workflow list.');
   received+=data.workflow_runs.length;matches.push(...data.workflow_runs.filter(isExpectedRun));
   if(data.workflow_runs.length<100||received>=data.total_count)
    return matches.sort((a,b)=>b.id-a.id)[0]??null;
  }
  throw Error('Workflow list exceeded the bounded discovery window.');
 }

 let watched=null;
 try{
  await update();
  while(now()<deadline){
   const run=await discover();
   report.observations.push({checkedAt:new Date(now()).toISOString(),elapsedMs:now()-started,run:describeRun(run)});
   report.pagesRun=describeRun(run);
   if(watched&&(!run||run.id!==watched.id))
    return finish('publication-changed','The latest Pages run changed during this wait; no replacement is followed automatically.');
   if(run){
    if(watched&&(run.run_attempt??1)!==watched.run_attempt)
     return finish('publication-changed','The Pages attempt changed during this wait; no retry is followed automatically.');
    watched??={id:run.id,run_attempt:run.run_attempt??1};
    if(run.status==='completed')return run.conclusion==='success'
     ?finish('published',`Pages run ${run.id}, attempt ${watched.run_attempt}, succeeded for ${sha}.`)
     :finish('publication-failed',`Pages run ${run.id}, attempt ${watched.run_attempt}, completed with ${run.conclusion??'no conclusion'}; public acceptance is stopped.`);
   }
   await update();
   const remaining=deadline-now();if(remaining<=0)break;
   await sleep(Math.min(intervalMs,remaining));
  }
  return finish('timeout','No successful Pages publication for the requested commit within the deadline.');
 }catch(error){
  return finish(now()>=deadline?'timeout':'api-error',String(error.message||error).replaceAll(token,'[redacted]'));
 }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const path='qa-ci/mik112-pages-publication.json';await mkdir(dirname(path),{recursive:true});
 let previous='';
 const report=await waitForPagesPublication({repository:process.env.GITHUB_REPOSITORY,sha:process.env.GITHUB_SHA,token:process.env.GITHUB_TOKEN,
  acceptanceRunId:process.env.GITHUB_RUN_ID??null,acceptanceRunAttempt:process.env.GITHUB_RUN_ATTEMPT??null,
  async onUpdate(report){
   await writeFile(path,JSON.stringify(report,null,2)+'\n');
   const status=[report.outcome,report.pagesRun?.id,report.pagesRun?.run_attempt,report.pagesRun?.status,report.pagesRun?.conclusion].join(' ');
   if(status!==previous){console.log('MIK112_PAGES_GATE',status,report.reason||'Waiting for this commit.');previous=status;}
  },
 });
 process.exitCode=report.passed?0:report.outcome==='timeout'?124:1;
}
