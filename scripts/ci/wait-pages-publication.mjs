import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const PAGES_WORKFLOW={id:398066181,path:'dynamic/pages/pages-build-deployment',name:'pages build and deployment'};
export const PAGES_TIMEOUT_MS=12*60*1000;
export const PAGES_INTERVAL_MS=15*1000;

const describeRun=run=>run?{
 id:run.id,run_attempt:run.run_attempt??1,name:run.name,path:run.path,
 head_sha:run.head_sha,head_branch:run.head_branch,status:run.status,
 conclusion:run.conclusion??null,url:run.html_url??null,
}:null;

const logLines=text=>text.split(/\r?\n/).map(line=>line
 .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'')
 .replace(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z ?/,''));

function checkoutEvidence(text){
 const lines=logLines(text),commands=[];
 for(let i=0;i<lines.length;i++)if(/^\[command\](?:\/[^\s]+\/)?git log -1 --format=%H$/.test(lines[i]))commands.push(i);
 const output=commands.length===1?lines[commands[0]+1]??'':'';
 return {checkoutCommandCount:commands.length,
  actualCheckoutSha:/^[a-f0-9]{40}$/i.test(output)?output.toLowerCase():null};
}

function artifactIds(text,kind){
 const patterns=kind==='build'
  ?[/^Artifact github-pages\.zip successfully finalized\. Artifact ID (\d+)$/,
    /^Artifact github-pages has been successfully uploaded!.* Artifact ID is (\d+)$/]
  :[/^\s*"artifact_id":\s*(\d+),?\s*$/];
 return [...new Set(logLines(text).flatMap(line=>patterns.flatMap(pattern=>{
  const match=line.match(pattern);return match?[match[1]]:[];
 })))];
}

// This gate only observes Actions. A successful deployment still has to pass
// the browser suite's existing byte-for-byte checks of the public files.
export async function waitForPagesPublication({
 repository,sha,token,timeoutMs=PAGES_TIMEOUT_MS,intervalMs=PAGES_INTERVAL_MS,
 fetchImpl=fetch,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 onUpdate=async()=>{},acceptanceRunId=null,acceptanceRunAttempt=null,
}={}){
 const started=now(),deadline=started+timeoutMs;
 const report={version:2,passed:false,outcome:'waiting',repository,sha,branch:'main',
  workflow:PAGES_WORKFLOW,acceptanceRunId,acceptanceRunAttempt,timeoutMs,intervalMs,
  startedAt:new Date(started).toISOString(),elapsedMs:0,pagesRun:null,
  advertisedHeadSha:null,actualCheckoutSha:null,evidence:[],observations:[]};
 const update=async()=>{report.elapsedMs=now()-started;await onUpdate(report);};
 const finish=async(outcome,reason)=>{
  report.outcome=outcome;report.reason=reason;report.passed=outcome==='published';
  report.completedAt=new Date(now()).toISOString();await update();return report;
 };
 if(!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository||'')||!/^[a-f0-9]{40}$/.test(sha||'')||!token)
  return finish('configuration-error','GITHUB_REPOSITORY, full GITHUB_SHA and GITHUB_TOKEN are required.');
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>PAGES_TIMEOUT_MS||!Number.isFinite(intervalMs)||intervalMs<=0)
  return finish('configuration-error','The wait must be positive and bounded by twelve minutes.');

 const isPagesRun=run=>run.head_branch==='main'&&run.workflow_id===PAGES_WORKFLOW.id&&run.path===PAGES_WORKFLOW.path;
 async function get(path,format='json'){
  const remaining=deadline-now();if(remaining<=0)throw Error('Publication deadline reached.');
  const response=await fetchImpl('https://api.github.com'+path,{
   method:'GET',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'},
   signal:AbortSignal.timeout(Math.max(1,Math.min(PAGES_INTERVAL_MS,Math.ceil(remaining)))),
  });
  if(!response.ok)throw Error('GitHub Actions API returned HTTP '+response.status+'.');
  const data=await response[format]();if(now()>=deadline)throw Error('Publication deadline reached.');return data;
 }
 async function discover(){
  let received=0;
  for(let page=1;page<=10;page++){
   // Built-in Pages may advertise the previous SHA while checking out the new
   // main tip. Discover its official workflow, then prove the actual checkout.
   const data=await get(`/repos/${repository}/actions/runs?per_page=100&page=${page}`);
   if(!Array.isArray(data.workflow_runs))throw Error('GitHub Actions API returned an invalid workflow list.');
   received+=data.workflow_runs.length;
   const matches=data.workflow_runs.filter(isPagesRun).sort((a,b)=>b.id-a.id);
   if(matches.length)return matches[0];
   if(data.workflow_runs.length<100||received>=data.total_count)return null;
  }
  throw Error('Workflow list exceeded the bounded discovery window.');
 }

 const evidenceCache=new Map();
 async function inspectCompleted(run){
  const attempt=run.run_attempt??1,key=`${run.id}:${attempt}`;
  if(evidenceCache.has(key))return evidenceCache.get(key);
  const data=await get(`/repos/${repository}/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100`);
  if(!Array.isArray(data.jobs)||data.total_count>data.jobs.length)throw Error('Pages job list is missing or incomplete.');
  const builds=data.jobs.filter(job=>job.name==='build'),deploys=data.jobs.filter(job=>job.name==='deploy');
  const build=builds.length===1?builds[0]:null,deploy=deploys.length===1?deploys[0]:null;
  const evidence={runId:run.id,runAttempt:attempt,advertisedHeadSha:run.head_sha,
   buildJobId:build?.id??null,deployJobId:deploy?.id??null,
   buildStatus:build?.status??null,buildConclusion:build?.conclusion??null,
   deployStatus:deploy?.status??null,deployConclusion:deploy?.conclusion??null,issues:[]};
  for(const [name,jobs,job] of [['build',builds,build],['deploy',deploys,deploy]]){
   if(jobs.length!==1)evidence.issues.push(`Expected one exact ${name} job; found ${jobs.length}.`);
   else if(job.status!=='completed'||job.conclusion!=='success')
    evidence.issues.push(`Pages ${name} job ${job.id} is ${job.status}/${job.conclusion??'no conclusion'}.`);
  }
  const buildLog=build?.status==='completed'?await get(`/repos/${repository}/actions/jobs/${build.id}/logs`,'text'):'';
  const deployLog=deploy?.status==='completed'&&deploy.conclusion!=='skipped'
   ?await get(`/repos/${repository}/actions/jobs/${deploy.id}/logs`,'text'):'';
  Object.assign(evidence,checkoutEvidence(buildLog));
  if(evidence.checkoutCommandCount!==1||!evidence.actualCheckoutSha)
   evidence.issues.push('Build log must contain one exact git log -1 --format=%H command followed immediately by one full SHA.');
  const uploaded=artifactIds(buildLog,'build'),deployed=artifactIds(deployLog,'deploy');
  evidence.buildArtifactId=uploaded.length===1?uploaded[0]:null;
  evidence.deployArtifactId=deployed.length===1?deployed[0]:null;
  evidence.artifactCorrelation=uploaded.length===1&&deployed.length===1
   ?uploaded[0]===deployed[0]?'matched':'mismatch':'unavailable';
  if(evidence.artifactCorrelation==='unavailable')evidence.issues.push(
   `Pages artifact identity is missing or ambiguous: ${uploaded.length} uploaded IDs and ${deployed.length} deployed IDs.`);
  if(evidence.artifactCorrelation==='mismatch')evidence.issues.push('Uploaded and deployed Pages artifact IDs differ.');
  // Logs and jobs are attempt-specific. Recheck the run so a retry beginning
  // while evidence is read cannot silently turn that evidence into acceptance.
  const current=await get(`/repos/${repository}/actions/runs/${run.id}`);
  if(!isPagesRun(current)||current.id!==run.id||(current.run_attempt??1)!==attempt||
   current.status!==run.status||current.conclusion!==run.conclusion)
   throw Object.assign(Error('The Pages run or attempt changed while its completed evidence was read; no retry is followed automatically.'),{outcome:'publication-changed'});
  evidenceCache.set(key,evidence);report.evidence.push(evidence);return evidence;
 }

 let watched=null;
 try{
  await update();
  while(now()<deadline){
   const run=await discover();
   report.observations.push({checkedAt:new Date(now()).toISOString(),elapsedMs:now()-started,run:describeRun(run)});
   report.pagesRun=describeRun(run);
   report.advertisedHeadSha=run?.head_sha??null;report.actualCheckoutSha=null;
   if(watched&&(!run||run.id!==watched.id))
    return finish('publication-changed','The latest Pages run changed during this wait; no replacement is followed automatically.');
   if(run){
    if(watched&&(run.run_attempt??1)!==watched.run_attempt)
     return finish('publication-changed','The Pages attempt changed during this wait; no retry is followed automatically.');
    if(run.status==='completed'){
     const evidence=await inspectCompleted(run);
     report.actualCheckoutSha=evidence.actualCheckoutSha;
     report.observations.at(-1).evidenceKey=`${run.id}:${run.run_attempt??1}`;
     if(!watched&&evidence.actualCheckoutSha&&evidence.actualCheckoutSha!==sha){
      // An older completed publication can precede creation of this commit's
      // Pages run. Record and cache it, without latching it as our candidate.
      report.reason=`Pages run ${run.id} checked out ${evidence.actualCheckoutSha}; waiting for ${sha}.`;
     }else{
      watched??={id:run.id,run_attempt:run.run_attempt??1};
      if(run.conclusion!=='success')return finish('publication-failed',
       `Pages run ${run.id}, attempt ${watched.run_attempt}, completed with ${run.conclusion??'no conclusion'}; public acceptance is stopped. ${evidence.issues.join(' ')}`.trim());
      if(evidence.issues.length)return finish('publication-unverified',evidence.issues.join(' '));
      if(evidence.actualCheckoutSha!==sha)return finish('publication-mismatch',
       `The watched Pages run checked out ${evidence.actualCheckoutSha??'an unproven revision'} instead of ${sha}.`);
      return finish('published',`Pages run ${run.id}, attempt ${watched.run_attempt}, successfully built and deployed checkout ${sha} (advertised head ${run.head_sha}).`);
     }
    }else watched??={id:run.id,run_attempt:run.run_attempt??1};
   }
   await update();
   const remaining=deadline-now();if(remaining<=0)break;
   await sleep(Math.min(intervalMs,remaining));
  }
  return finish('timeout','No successful Pages publication for the requested commit within the deadline.');
 }catch(error){
  return finish(now()>=deadline?'timeout':error.outcome??'api-error',String(error.message||error).replaceAll(token,'[redacted]'));
 }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const path='qa-ci/mik112-pages-publication.json';await mkdir(dirname(path),{recursive:true});
 let previous='';
 const report=await waitForPagesPublication({repository:process.env.GITHUB_REPOSITORY,sha:process.env.GITHUB_SHA,token:process.env.GITHUB_TOKEN,
  acceptanceRunId:process.env.GITHUB_RUN_ID??null,acceptanceRunAttempt:process.env.GITHUB_RUN_ATTEMPT??null,
  async onUpdate(report){
   await writeFile(path,JSON.stringify(report,null,2)+'\n');
   const status=[report.outcome,report.pagesRun?.id,report.pagesRun?.run_attempt,report.pagesRun?.status,report.pagesRun?.conclusion,report.actualCheckoutSha].join(' ');
   if(status!==previous){console.log('MIK112_PAGES_GATE',status,report.reason||'Waiting for this commit.');previous=status;}
  },
 });
 process.exitCode=report.passed?0:report.outcome==='timeout'?124:1;
}
