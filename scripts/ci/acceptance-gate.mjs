import {readFileSync,readdirSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import YAML from 'yaml';
import {matches} from './impact.mjs';

export function selectedWorkflows(files,branch,definitions){
 return definitions.filter(({path,workflow})=>{
  if(path.endsWith('/ci-reliability.yml'))return false; // This job owns the aggregate.
  const push=workflow.on?.push;if(!push)return false;
  if(push.branches&&!push.branches.some(pattern=>matches(branch,pattern)))return false;
  if(push['branches-ignore']?.some(pattern=>matches(branch,pattern)))return false;
  return !push.paths||files.some(file=>push.paths.some(pattern=>matches(file,pattern)));
 }).map(({path,workflow})=>({path,name:workflow.name}));
}

export async function main(){
 const repo=process.env.GITHUB_REPOSITORY,sha=process.env.GITHUB_SHA,branch=process.env.GITHUB_REF_NAME;
 const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
 if(!repo||!sha||!branch||!token)throw Error('GitHub repository, exact SHA, branch and read token are required');
 const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
 if(process.env.GITHUB_EVENT_NAME!=='push')throw Error('Aggregate acceptance requires an actual push diff');
 const before=event.before;
 if(!/^[a-f\d]{40}$/.test(before||'')||/^0+$/.test(before))throw Error('Create the candidate from the base before updating it; no reliable before SHA');
 try{execFileSync('git',['cat-file','-e',before+'^{commit}'],{stdio:'ignore'});}catch{execFileSync('git',['fetch','--no-tags','--depth=1','origin',before],{stdio:'inherit'});}
 const files=execFileSync('git',['diff','--name-only','-z',before,sha],{encoding:'utf8'}).split('\0').filter(Boolean);
 const definitions=readdirSync('.github/workflows').filter(f=>f.endsWith('.yml')).map(file=>({path:'.github/workflows/'+file,workflow:YAML.parse(readFileSync('.github/workflows/'+file,'utf8'))}));
 const required=selectedWorkflows(files,branch,definitions);

 const report={passed:false,sha,branch,before,files,required,checks:[],skippedJobs:[],started:new Date().toISOString()};
 mkdirSync('qa-ci',{recursive:true});const save=()=>writeFileSync('qa-ci/acceptance.json',JSON.stringify(report,null,2));save();
 async function api(path){const r=await fetch('https://api.github.com/repos/'+repo+path,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('GitHub acceptance API '+r.status+' '+path);return r.json();}
 const deadline=Date.now()+40*60*1000;let signature='';
 try{
  if(!required.length){report.passed=true;report.coverage='No application workflow selected by this diff; pipeline policy passed separately, no browser pass is claimed';save();console.log('ACCEPTANCE_POLICY_ONLY',sha);return report;}
  while(Date.now()<deadline){
   const response=await api('/actions/runs?head_sha='+sha+'&event=push&per_page=100');
   report.checks=required.map(w=>{const run=response.workflow_runs.filter(r=>r.path===w.path&&r.head_branch===branch&&r.head_sha===sha).sort((a,b)=>b.id-a.id)[0];return {...w,id:run?.id,url:run?.html_url,status:run?.status||'not_started',conclusion:run?.conclusion};});save();
   const next=report.checks.map(c=>c.path+':'+c.status+':'+c.conclusion).join('|');
   if(next!==signature){console.log('ACCEPTANCE_PROGRESS',JSON.stringify(report.checks));signature=next;}
   const failures=report.checks.filter(c=>c.status==='completed'&&c.conclusion!=='success');
   if(failures.length)throw Error('Required acceptance failed: '+failures.map(c=>c.name+' ('+c.conclusion+')').join(', '));
   if(report.checks.every(c=>c.status==='completed'&&c.conclusion==='success')){
    for(const check of report.checks){const {jobs}=await api('/actions/runs/'+check.id+'/jobs?per_page=100');report.skippedJobs.push(...jobs.filter(j=>j.conclusion==='skipped').map(j=>({workflow:check.path,job:j.name,status:'not_run'})));}
    report.passed=true;report.finished=new Date().toISOString();save();
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n## Exact-revision acceptance\n${sha}: ${report.checks.length} selected workflows passed. ${report.skippedJobs.length} conditional jobs were not run; see acceptance.json.\n`);
    console.log('ACCEPTANCE_PASS',sha,report.checks.length);return report;
   }
   await new Promise(resolve=>setTimeout(resolve,15000));
  }
  throw Error('Acceptance deadline exceeded; pending workflows are not passed');
 }catch(error){report.error=error.message;save();throw error;}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
