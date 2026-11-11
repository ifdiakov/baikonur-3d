import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const out='qa-delivery';
await mkdir(out,{recursive:true});
const repo=process.env.GITHUB_REPOSITORY||'ifdiakov/baikonur-3d';
async function api(path){
 try{
  const response=await fetch('https://api.github.com/repos/'+repo+'/'+path,{
   headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'},
   signal:AbortSignal.timeout(15000)
  });
  return response.ok?await response.json():{error:response.status,path};
 }catch(error){return {error:error.message,path};}
}
function duration(a,b){return a&&b?(Date.parse(b)-Date.parse(a))/1000:null;}
function summarizeRun(r){return {id:r.id,path:r.path,name:r.name,branch:r.head_branch,sha:r.head_sha,event:r.event,status:r.status,conclusion:r.conclusion,created:r.created_at,started:r.run_started_at,updated:r.updated_at,seconds:duration(r.run_started_at,r.updated_at)};}
function summarizeJob(j){
 return {
  id:j.id,name:j.name,status:j.status,conclusion:j.conclusion,
  seconds:duration(j.started_at,j.completed_at),
  steps:(j.steps||[]).map(s=>({name:s.name,conclusion:s.conclusion,seconds:duration(s.started_at,s.completed_at)}))
 };
}
const [a,b,pages,branches]=await Promise.all([
 api('actions/runs?per_page=100'),api('actions/runs?per_page=100&page=2'),api('pages'),api('branches?per_page=100')
]);
const runs=[...(a.workflow_runs||[]),...(b.workflow_runs||[])];
const bySHA={};
for(const run of runs)(bySHA[run.head_sha]??=[]).push(summarizeRun(run));
const jobs=[];
const chosen=runs.filter(r=>r.conclusion==='failure'||/nonblocking-detail|card-share|workshop-network|verify-mik112|verify-site118/.test(r.path)).slice(0,24);
for(let i=0;i<chosen.length;i+=4){
 await Promise.all(chosen.slice(i,i+4).map(async run=>{
  const data=await api('actions/runs/'+run.id+'/jobs?per_page=100');
  jobs.push({run:summarizeRun(run),jobs:(data.jobs||[]).map(summarizeJob),error:data.error});
 }));
}
const workflows={};
for(const name of await readdir('.github/workflows')){
 if(/\.ya?ml$/.test(name))workflows[name]=await readFile('.github/workflows/'+name,'utf8');
}
const manifest=execFileSync('git',['ls-tree','-r','HEAD'],{encoding:'utf8',maxBuffer:30*1024*1024});
await writeFile(out+'/tree.txt',manifest);
await writeFile(out+'/workflows.json',JSON.stringify(workflows,null,2));
await writeFile(out+'/audit.json',JSON.stringify({head:process.env.GITHUB_SHA,pages,branches:Array.isArray(branches)?branches.map(b=>({name:b.name,sha:b.commit.sha})):branches,runs:runs.map(summarizeRun),bySHA,jobs},null,2));
const failures=jobs.flatMap(x=>x.jobs.flatMap(j=>j.steps.filter(s=>s.conclusion==='failure').map(s=>({run:x.run.id,path:x.run.path,step:s.name}))));
console.log(JSON.stringify({runCount:runs.length,workflowCount:Object.keys(workflows).length,pages:{build_type:pages.build_type,source:pages.source,error:pages.error},fanout:Object.entries(bySHA).map(([sha,rs])=>({sha,count:rs.length,failed:rs.filter(r=>r.conclusion==='failure').length})).sort((a,b)=>b.count-a.count).slice(0,8),failedSteps:failures},null,2));
