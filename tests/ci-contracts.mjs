import {classifyRequestFailures} from './helpers/request-failures.mjs';
import {createServer} from 'node:http';
import {resolveNavigationURL} from './helpers/navigation-url.mjs';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import YAML from 'yaml';
import {selectedWorkflows,verificationInputs,changedVerificationInputs,latestCompatibleRun} from '../scripts/ci/acceptance-gate.mjs';
import {assertMenuMarkup} from './helpers/menu-markup.mjs';
import {MUSEUM_SECTIONS} from '../src/museum-menu.js';
import {protonNeighborContract,assertProtonNeighborClearance,measureProtonNeighborClearance} from './proton-civil-geometry.mjs';

const cases=[];
function test(name,fn){fn();cases.push({name,passed:true});}
const html=readFileSync('index.html','utf8');
test('Current hidden navigation and all archive sections are preserved',()=>assert.equal(assertMenuMarkup(html,MUSEUM_SECTIONS).visibleSections,5));
test('HTML attribute order is not a navigation contract',()=>assertMenuMarkup(html.replace('id="complexHistoryAccordion" hidden','hidden id="complexHistoryAccordion"'),MUSEUM_SECTIONS));
test('Runtime item counters do not become section titles',()=>{const runtime=html.replace(/(<span class="sites-accordion-count"[^>]*>)(<\/span>)/g,'$117$2');assert(runtime.includes('>17</span>'));assertMenuMarkup(runtime,MUSEUM_SECTIONS);});
test('Changed section text still fails with counters',()=>assert.throws(()=>assertMenuMarkup(html.replace('СТАРТОВЫЕ КОМПЛЕКСЫ','LOST SECTION'),MUSEUM_SECTIONS)));
test('Accidentally revealing history is a real failure',()=>assert.throws(()=>assertMenuMarkup(html.replace('id="complexHistoryAccordion" hidden','id="complexHistoryAccordion"'),MUSEUM_SECTIONS)));
test('Losing the retained history section is a real failure',()=>assert.throws(()=>assertMenuMarkup(html.replace('id="complexHistoryAccordion"','id="lostHistory"'),MUSEUM_SECTIONS)));
test('Accidentally revealing encyclopedia is a real failure',()=>assert.throws(()=>assertMenuMarkup(html.replace('id="encyclopediaNavLink" hidden','id="encyclopediaNavLink"'),MUSEUM_SECTIONS)));
test('Proton checks retain visible neighbors and explicitly reject hidden ones',()=>{
 assert.deepEqual(protonNeighborContract('pad-81'),{neighbors:['pad-82'],excludedNeighbors:['pad-84','sector-nw2']});
 assert.deepEqual(protonNeighborContract('pad-200'),{neighbors:['pad-201','pad-202'],excludedNeighbors:[]});
 assert.throws(()=>protonNeighborContract('unknown'));
 assert.throws(()=>assertProtonNeighborClearance({siteId:'pad-81',neighbors:[],excludedNeighbors:['pad-84','sector-nw2']}));
 for(const id of ['pad-84','sector-nw2'])assert.throws(()=>measureProtonNeighborClearance({siteId:'pad-81',...protonNeighborContract('pad-81'),objects:[{record:{id}}],THREE:{}}),/Intentionally hidden neighbor restored/);
});

test('Aggregate selects actual push dependencies and never waits on itself',()=>{
 const definitions=[{path:'.github/workflows/a.yml',workflow:{name:'A',on:{push:{branches:['main','fix/**'],paths:['src/**','tests/a.mjs']}}}},{path:'.github/workflows/manual.yml',workflow:{name:'Manual',on:{workflow_dispatch:null}}},{path:'.github/workflows/ci-reliability.yml',workflow:{name:'Gate',on:{push:{branches:['main']}}}}];
 assert.deepEqual(selectedWorkflows(['tests/a.mjs'],'fix/candidate',definitions).map(w=>w.name),['A']);
 assert.deepEqual(selectedWorkflows(['README.md'],'main',definitions),[]);
 assert.deepEqual(selectedWorkflows(['src/a.js'],'other',definitions),[]);
});
test('Cumulative candidate changes keep feature checks after a documentation-only push',()=>{
 const definition={path:'.github/workflows/feature.yml',workflow:{name:'Feature',on:{push:{branches:['fix/**'],paths:['tests/feature.mjs']}}}};
 assert.equal(selectedWorkflows(['docs/task.txt'],'fix/candidate',[definition]).length,0);
 assert.equal(selectedWorkflows(['tests/feature.mjs','docs/task.txt'],'fix/candidate',[definition]).length,1);
});
test('Reuse requires unchanged entry script, transitive helper, fixture and application',()=>{
 const path='.github/workflows/feature.yml',workflow={on:{push:{paths:['tests/feature.mjs']}},jobs:{check:{steps:[{run:'node tests/feature.mjs'}]}}};
 const sources={'tests/feature.mjs':`import './helpers/check.mjs';`, 'tests/helpers/check.mjs':`readFileSync('../fixtures/check.json');`, 'tests/fixtures/check.json':'{}'};
 const inputs=verificationInputs(path,workflow,p=>sources[p]??null);
 for(const changed of [path,'package-lock.json','tests/feature.mjs','tests/helpers/check.mjs','tests/fixtures/check.json','src/scene.js','assets/model.glb','data/sites.json','workshop/editor.js','museum.html','CNAME']){
  assert.deepEqual(changedVerificationInputs([changed],path,workflow,inputs),[changed]);
 }
 assert.deepEqual(changedVerificationInputs(['docs/task.txt','tests/unrelated.mjs'],path,workflow,inputs),[]);
 assert.throws(()=>verificationInputs(path,workflow,()=>null),/Missing verification input/);
 const deleted=verificationInputs(path,workflow,p=>p==='tests/helpers/check.mjs'?null:sources[p]??null);
 assert.deepEqual(changedVerificationInputs(['tests/helpers/check.mjs'],path,workflow,deleted),['tests/helpers/check.mjs']);
 const deletedFixture=verificationInputs(path,workflow,p=>p==='tests/fixtures/check.json'?null:sources[p]??null);
 assert.deepEqual(changedVerificationInputs(['tests/fixtures/check.json'],path,workflow,deletedFixture),['tests/fixtures/check.json']);
});
test('A newer failure blocks an older success for identical inputs',()=>{
 const runs=[{id:1,path:'feature',head_branch:'fix/candidate',head_sha:'a',conclusion:'success'}, {id:2,path:'feature',head_branch:'fix/candidate',head_sha:'b',conclusion:'failure'}, {id:3,path:'feature',head_branch:'other',head_sha:'c',conclusion:'success'}];
 assert.equal(latestCompatibleRun(runs,'feature','fix/candidate',()=>true).conclusion,'failure');
 assert.equal(latestCompatibleRun(runs,'feature','fix/candidate',r=>r.head_sha==='a').id,1);
 assert.equal(latestCompatibleRun(runs,'feature','fix/candidate',()=>false),undefined);
});
// Real two-origin HTTP regression: diagnostic HTML must use the final origin.
{
 const canonical=createServer((req,res)=>{if(req.url.startsWith('/missing')){res.writeHead(404);res.end('missing');return;}res.setHeader('Content-Type','text/html');res.end('<html>museum</html>');});
 let redirect;
 try{
  await new Promise(resolve=>canonical.listen(0,'127.0.0.1',resolve));
  const target='http://127.0.0.1:'+canonical.address().port;
  redirect=createServer((req,res)=>{res.writeHead(302,{Location:target+req.url});res.end();});
  await new Promise(resolve=>redirect.listen(0,'127.0.0.1',resolve));
  const original='http://127.0.0.1:'+redirect.address().port;
  for(const entry of ['museum.html','workshop.html'])assert.equal(await resolveNavigationURL(original+'/'+entry+'?tour=0'),target+'/'+entry+'?tour=0');
  await assert.rejects(resolveNavigationURL(original+'/missing'),/Navigation HTTP 404/);
  cases.push({name:'Real redirects preserve canonical origin and query; missing pages fail',passed:true});
 }finally{for(const server of [redirect,canonical].filter(Boolean)){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
test('Only aborted stylesheets proven loaded in the current document are classified as harmless',()=>{
 const url='https://museum.test/src/museum-mobile.css?v=current';
 const cancelled={url,reason:'net::ERR_ABORTED',resourceType:'stylesheet'};
 const loaded=[{href:url,loaded:true,rules:3}];
 assert.deepEqual(classifyRequestFailures([cancelled],loaded),{cancelledLoadedStylesheets:[cancelled],unexpected:[]});
 for(const sheets of [[],[{href:url,loaded:false,rules:0}],[{href:url,loaded:true,rules:0}],[{href:url+'-different',loaded:true,rules:3}]])assert.deepEqual(classifyRequestFailures([cancelled],sheets).unexpected,[cancelled]);
 for(const failure of [{...cancelled,resourceType:'script'},{...cancelled,reason:'net::ERR_CONNECTION_RESET'}])assert.deepEqual(classifyRequestFailures([failure],loaded).unexpected,[failure]);
});
const inventory=[];
for(const file of readdirSync('.github/workflows').filter(f=>f.endsWith('.yml'))){
 const source=readFileSync('.github/workflows/'+file,'utf8'),doc=YAML.parseDocument(source);assert.deepEqual(doc.errors,[],file+' YAML syntax');
 const workflow=doc.toJS();
 if(source.includes('QA_MOBILE_EXCLUDED_BY_OWNER')){
  assert.equal(workflow.env.QA_SKIP_MOBILE,'1',file+' lost owner mobile exclusion');
  for(const job of Object.values(workflow.jobs))assert(!job.strategy?.matrix?.mode?.includes('mobile'),file+' schedules excluded mobile mode');
 }
 assert.notEqual(workflow.permissions,'write-all',file+' grants write-all');
 assert.notEqual(workflow.permissions?.contents,'write',file+' can write repository');
 const scripts=[];
 for(const job of Object.values(workflow.jobs)){
  assert.notEqual(job.permissions,'write-all',file+' job grants write-all');
  assert.notEqual(job.permissions?.contents,'write',file+' job can write repository');
  for(const step of job.steps||[]){
   if(step.uses?.startsWith('actions/checkout@'))assert.equal(step.with?.['persist-credentials'],false,file+' retains checkout credentials');
   if(step.run){scripts.push(step.run);assert.doesNotMatch(step.run,/\bgit\s+(?:push|commit)\b/,file+' publishes from verification');assert.doesNotMatch(step.run,/npm install\b/,file+' bypasses the lockfile');}
  }
 }
 if(scripts.some(s=>s.includes('node tests/menu-catalog-contract.mjs'))){
  for(const event of ['push','pull_request'])if(workflow.on?.[event]){
   const paths=workflow.on[event].paths||[];
   for(const required of ['tests/menu-catalog-contract.mjs','tests/helpers/menu-markup.mjs','package.json','package-lock.json'])assert(paths.includes(required)||paths.includes('tests/helpers/**')&&required==='tests/helpers/menu-markup.mjs',file+' misses dependency '+required);
  }
 }
 inventory.push({file,jobs:Object.keys(workflow.jobs).length,automatic:!!workflow.on?.push});
}
cases.push({name:'All workflows parse, preserve read-only verification and common dependencies',passed:true});
for(const folder of ['.','scripts/ci/historical-deps']){
 const pkg=JSON.parse(readFileSync(folder+'/package.json')),lock=JSON.parse(readFileSync(folder+'/package-lock.json'));
 assert.deepEqual(lock.packages[''].devDependencies,pkg.devDependencies,'Manifest and lock agree: '+folder);
 for(const [name,version]of Object.entries(pkg.devDependencies))assert.equal(lock.packages['node_modules/'+name].version,version,'Pinned direct QA dependency: '+name);
}
cases.push({name:'Current and archived QA dependency locks preserve exact versions',passed:true});
mkdirSync('qa-ci',{recursive:true});writeFileSync('qa-ci/contracts.json',JSON.stringify({passed:true,cases,inventory},null,2));
console.log('CI_CONTRACTS_PASS',cases.length,'cases;',inventory.length,'workflows');
