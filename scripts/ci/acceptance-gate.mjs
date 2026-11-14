import {readFileSync,readdirSync,mkdirSync,writeFileSync,appendFileSync,existsSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve,posix} from 'node:path';
import YAML from 'yaml';
import {matches} from './impact.mjs';

export function selectedWorkflows(files,branch,definitions){
 return definitions.filter(({path,workflow})=>{
  if(path.endsWith('/ci-reliability.yml'))return false;
  const push=workflow.on?.push;if(!push)return false;
  if(push.branches&&!push.branches.some(pattern=>matches(branch,pattern)))return false;
  if(push['branches-ignore']?.some(pattern=>matches(branch,pattern)))return false;
  return (!push.paths||files.some(file=>push.paths.some(pattern=>matches(file,pattern))))&&
   (!push['paths-ignore']||files.some(file=>!push['paths-ignore'].some(pattern=>matches(file,pattern))));
 }).map(({path,workflow})=>({path,name:workflow.name}));
}

// Include entry scripts and their local import/fixture closure, not only trigger globs.
export function verificationInputs(workflowPath,workflow,read=path=>existsSync(path)&&statSync(path).isFile()?readFileSync(path,'utf8'):null){
 const inputs=new Set([workflowPath,'package.json','package-lock.json']),queue=[];
 const enqueue=path=>{path=posix.normalize(path.split(/[?#]/)[0]);if(path.startsWith('../')||path.startsWith('/'))throw Error('Input escapes checkout: '+path);if(!inputs.has(path)){inputs.add(path);queue.push(path);}};
 const scripts=Object.values(workflow.jobs||{}).flatMap(job=>(job.steps||[]).map(step=>step.run||'')).join('\n');
 for(const match of scripts.matchAll(/\b((?:tests|scripts)\/[\w./-]+\.(?:m?js|json|html|css|py))\b/g))enqueue(match[1]);
 while(queue.length){
  const path=queue.shift(),source=read(path);if(source==null)throw Error('Missing verification input '+path);
  for(const match of source.matchAll(/["'`]((?:\.\.?\/|tests\/|scripts\/)[^"'`\n$]+\.(?:m?js|json|html|css|py)(?:\?[^"'`\n]*)?)["'`]/g)){
   const dependency=match[1].startsWith('.')?posix.join(posix.dirname(path),match[1]):match[1];
   const clean=dependency.split(/[?#]/)[0];
   // Production directories are compared as a whole below; optional runtime files
   // need not be read to prove their committed identities.
   if(/^(?:src|data|assets|workshop)\//.test(clean))continue;
   if(read(clean)!=null)enqueue(clean);
   else inputs.add(posix.normalize(clean)); // A deleted fixture/helper must invalidate prior evidence too.
  }
 }
 return [...inputs].sort();
}
export function changedVerificationInputs(files,workflowPath,workflow,inputs){
 const explicit=new Set(inputs),patterns=workflow.on?.push?.paths||[];
 return files.filter(path=>explicit.has(path)||path===workflowPath||
  /^(?:src|data|assets|workshop)\//.test(path)||/^[^/]+\.(?:html|css)$/.test(path)||path==='CNAME'||
  patterns.some(pattern=>matches(path,pattern)));
}
export function latestCompatibleRun(runs,path,branch,compatible){
 return runs.filter(run=>run.path===path&&run.head_branch===branch).sort((a,b)=>b.id-a.id).find(compatible);
}

export async function main(){
 const repo=process.env.GITHUB_REPOSITORY,sha=process.env.GITHUB_SHA,branch=process.env.GITHUB_REF_NAME;
 const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
 if(!repo||!sha||!branch||!token)throw Error('Repository, exact SHA, branch and read token are required');
 const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
 if(process.env.GITHUB_EVENT_NAME!=='push')throw Error('Aggregate requires an actual push');
 const defaultBranch=event.repository?.default_branch||'main';
 const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024,timeout:60000});
 git(['fetch','--no-tags','--filter=blob:none','--depth=250','origin',`refs/heads/${branch}:refs/remotes/origin/${branch}`]);
 if(branch!==defaultBranch)git(['fetch','--no-tags','--filter=blob:none','--depth=250','origin',`refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`]);
 const baseline=branch===defaultBranch?event.before:git(['rev-parse','refs/remotes/origin/'+defaultBranch]).trim();
 if(!/^[a-f\d]{40}$/.test(baseline||'')||/^0+$/.test(baseline))throw Error('Reliable acceptance baseline is required');
 git(['merge-base','--is-ancestor',baseline,sha]);
 const ancestors=new Set(git(['rev-list','--max-count=250',sha]).trim().split('\n'));
 const diffCache=new Map(),diff=from=>{if(!diffCache.has(from))diffCache.set(from,git(['diff','--name-only','-z',from,sha]).split('\0').filter(Boolean));return diffCache.get(from);};
 const files=diff(baseline);
 const definitions=readdirSync('.github/workflows').filter(f=>f.endsWith('.yml')).map(file=>({path:'.github/workflows/'+file,workflow:YAML.parse(readFileSync('.github/workflows/'+file,'utf8'))}));
 const required=selectedWorkflows(files,branch,definitions).map(item=>{const workflow=definitions.find(d=>d.path===item.path).workflow;return {...item,workflow,inputs:verificationInputs(item.path,workflow)};});
 const report={passed:false,sha,branch,baseline,pushBefore:event.before,files,required:required.map(({workflow,...item})=>item),checks:[],skippedJobs:[],excludedScopes:process.env.QA_SKIP_MOBILE==='1'?[{scope:'mobile',status:'not_run',reason:'Excluded by owner on 2026-11-14'}]:[],started:new Date().toISOString()};
 mkdirSync('qa-ci',{recursive:true});const save=()=>writeFileSync('qa-ci/acceptance.json',JSON.stringify(report,null,2));save();
 async function api(path){const r=await fetch('https://api.github.com/repos/'+repo+path,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Acceptance API '+r.status+' '+path);return r.json();}
 const deadline=Date.now()+40*60*1000;let signature='';
 try{
  while(Date.now()<deadline){
   let runs=[];
   for(let page=1;page<=3;page++){const response=await api('/actions/runs?branch='+encodeURIComponent(branch)+'&event=push&per_page=100&page='+page);runs.push(...response.workflow_runs);if(response.workflow_runs.length<100)break;}
   report.checks=required.map(w=>{
    const run=latestCompatibleRun(runs,w.path,branch,r=>ancestors.has(r.head_sha)&&changedVerificationInputs(diff(r.head_sha),w.path,w.workflow,w.inputs).length===0);
    return {path:w.path,name:w.name,id:run?.id,url:run?.html_url,testedSha:run?.head_sha,status:run?.status||'not_started',conclusion:run?.conclusion,
     inputProof:run?{unchanged:true,reused:run.head_sha!==sha,comparedChanges:diff(run.head_sha),explicitInputs:w.inputs}:null};
   });save();
   const next=report.checks.map(c=>c.path+':'+c.status+':'+c.conclusion).join('|');if(next!==signature){console.log('ACCEPTANCE_PROGRESS',JSON.stringify(report.checks));signature=next;}
   const failures=report.checks.filter(c=>c.status==='completed'&&c.conclusion!=='success');
   if(failures.length)throw Error('Required acceptance failed: '+failures.map(c=>c.name+' ('+c.conclusion+')').join(', '));
   if(report.checks.every(c=>c.status==='completed'&&c.conclusion==='success')){
    const main=await api('/branches/'+encodeURIComponent(defaultBranch));
    if(main.commit.sha!==(branch===defaultBranch?sha:baseline))throw Error('Main advanced during acceptance; reconcile and verify the new base');
    for(const check of report.checks){const {jobs}=await api('/actions/runs/'+check.id+'/jobs?per_page=100');report.skippedJobs.push(...jobs.filter(j=>j.conclusion==='skipped').map(j=>({workflow:check.path,job:j.name,status:'not_run'})));}
    report.passed=true;report.finished=new Date().toISOString();report.reusedRuns=report.checks.filter(c=>c.inputProof.reused).length;save();
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n## Cumulative candidate acceptance\n${sha}: ${report.checks.length} required workflows passed; ${report.reusedRuns} reused with unchanged committed test and application inputs. ${report.skippedJobs.length} conditional jobs not run. Excluded scopes: ${report.excludedScopes.map(x=>x.scope).join(', ')||'none'}. See acceptance.json.\n`);
    console.log('ACCEPTANCE_PASS',sha,report.checks.length,'unchanged-input reuse',report.reusedRuns);return report;
   }
   await new Promise(resolve=>setTimeout(resolve,15000));
  }
  throw Error('Acceptance deadline exceeded; pending or unverified workflows are not passed');
 }catch(error){report.error=error.message;save();throw error;}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
