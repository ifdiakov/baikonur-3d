import {selectDeliveryChecks} from './delivery-policy.mjs';
import {readFileSync,appendFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {basename,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const ENTRYPOINTS=['index.html','museum.html','workshop.html'];
export const normalizeEntry=s=>s.replace(/(\.(?:js|css))\?v=[\w.-]+/g,'$1?v=REVISION');
export const infrastructure=p=>p.startsWith('.github/')||p.startsWith('scripts/ci/')||p==='scripts/apply-ci-reliability.mjs'||p==='tests/ci-reliability.mjs'||p.startsWith('docs/')||p==='AGENTS.md'||p==='PROJECT_CONTEXT.md';
export function matches(path,glob){const r=glob.split('**').map(s=>s.split('*').map(t=>t.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('[^/]*')).join('.*');return new RegExp('^'+r+'$').test(path);}
export function workflowPaths(source){
 const trigger=source.match(/^on:\s*\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m)?.[1]||'';
 const lines=trigger.split('\n'),patterns=[];
 for(let i=0;i<lines.length;i++){
  const m=lines[i].match(/^(\s*)paths:\s*(.*)$/);if(!m)continue;
  if(m[2].trim().startsWith('[')){for(const v of m[2].matchAll(/['"]([^'"]+)['"]/g))patterns.push(v[1]);continue;}
  for(let j=i+1;j<lines.length;j++){if(!lines[j].trim()||lines[j].trim().startsWith('#'))continue;if(lines[j].match(/^\s*/)[0].length<=m[1].length)break;const v=lines[j].match(/^\s*-\s*['"]([^'"]+)['"]\s*$/);if(!v)throw Error('Unsupported path expression '+lines[j]);patterns.push(v[1]);}
 }
 return [...new Set(patterns)];
}
export function classify(changes,patterns=null){
 const meaningful=changes.filter(c=>!infrastructure(c.path)&&!((/\.(?:html|js|css)$/.test(c.path))&&typeof c.before==='string'&&typeof c.after==='string'&&normalizeEntry(c.before)===normalizeEntry(c.after)));
 const appChanges=changes.filter(c=>!infrastructure(c.path)&&!c.path.startsWith('tests/')&&!c.path.startsWith('scripts/'));
 const adminFiles=new Set(['workshop.html','src/workshop-panel.js','src/workshop-panel.css','src/workshop-network-core.js','src/workshop-network-editor.js','src/workshop-rail-editor.js','src/workshop-state-network.js']);
 const workshopOnly=appChanges.length>0&&appChanges.every(c=>adminFiles.has(c.path));
 const runtime=appChanges.length>0&&!workshopOnly;
 const npPaths=new Set(['src/np-royaltent.js','src/site31-observation-platform.js']);
 const npOnly=runtime&&meaningful.some(c=>npPaths.has(c.path))&&meaningful.every(c=>npPaths.has(c.path)||c.path.startsWith('tests/np-royaltent')||c.path.startsWith('tests/site31-observation')||c.path==='tests/fixtures/np-photo.html'||c.path==='tests/transport-transition-browser.mjs'||c.path==='scripts/apply-np-royaltent.mjs');
 const selected=!patterns||!patterns.length?meaningful.length>0:meaningful.some(c=>patterns.some(p=>matches(c.path,p)));
 return {run:selected,runtime,profile:workshopOnly?'workshop':!runtime?'infrastructure':npOnly?'np':'full',meaningful:meaningful.map(c=>c.path),cacheOnlyEntries:changes.filter(c=>ENTRYPOINTS.includes(c.path)&&!meaningful.includes(c)).map(c=>c.path)};
}
export function readChanges(base){
 const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024,timeout:30000});
 if(!/^[a-f\d]{40}$/.test(base||'')||/^0+$/.test(base))throw Error('No reliable comparison SHA');
 try{execFileSync('git',['cat-file','-e',base+'^{commit}'],{stdio:'ignore'});}catch{git(['fetch','--no-tags','--depth=1','origin',base]);}
 const paths=git(['diff','--name-only','-z',base,'HEAD']).split('\0').filter(Boolean);
 return paths.map(path=>{let before=null,after=null;if(/\.(?:html|js|css)$/.test(path)){try{before=git(['show',base+':'+path]);}catch{}try{after=readFileSync(path,'utf8');}catch{}}return {path,before,after};});
}
export function main(){
 const name=process.argv[2]||'release';let event={};try{event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));}catch{}
 let decision;
 try{
  if(process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&!process.env.CI_BASE)throw Error('Manual request: run all requested checks');
  const base=process.env.CI_BASE||event.before||event.pull_request?.base?.sha,changes=readChanges(base);
  const patterns=name==='release'?null:workflowPaths(readFileSync('.github/workflows/'+basename(name),'utf8'));
  decision={...classify(changes,patterns),base,files:changes.map(c=>c.path),policy:'feature-sources-plus-common-integration'};
  if(patterns&&process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'){const filtered=changes.filter(c=>decision.meaningful.includes(c.path)||c.path==='.github/workflows/'+name);Object.assign(decision,selectDeliveryChecks(name,filtered,patterns,matches));}
 }catch(e){decision={run:true,runtime:true,profile:'full',reason:'FAIL_CLOSED: '+e.message};}
 if(name==='verify-osm-release.yml'&&process.env.GITHUB_EVENT_NAME!=='workflow_dispatch')decision.run=false;
 const out=process.env.GITHUB_OUTPUT;if(out)appendFileSync(out,Object.entries({run:decision.run,runtime:decision.runtime,profile:decision.profile}).map(([k,v])=>`${k}=${v}\n`).join(''));
 mkdirSync('qa-ci',{recursive:true});writeFileSync('qa-ci/impact-'+basename(name)+'.json',JSON.stringify(decision,null,2));console.log('CI_IMPACT',name,JSON.stringify(decision));
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n### ${name}\n${decision.run?'Selected relevant checks':'NOT RUN: no relevant application change'}; profile: ${decision.profile}.\n\n${decision.reason||decision.meaningful?.join(', ')||'Infrastructure/cache references only'}\n`);
 return decision;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
