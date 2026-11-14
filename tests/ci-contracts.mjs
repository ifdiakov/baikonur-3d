import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import YAML from 'yaml';
import {selectedWorkflows} from '../scripts/ci/acceptance-gate.mjs';
import {assertMenuMarkup} from './helpers/menu-markup.mjs';
import {MUSEUM_SECTIONS} from '../src/museum-menu.js';
import {protonNeighborContract,assertProtonNeighborClearance,measureProtonNeighborClearance} from './proton-civil-geometry.mjs';

const cases=[];
function test(name,fn){fn();cases.push({name,passed:true});}
const html=readFileSync('index.html','utf8');
test('Current hidden navigation and all archive sections are preserved',()=>assert.equal(assertMenuMarkup(html,MUSEUM_SECTIONS).visibleSections,5));
test('HTML attribute order is not a navigation contract',()=>assertMenuMarkup(html.replace('id="complexHistoryAccordion" hidden','hidden id="complexHistoryAccordion"'),MUSEUM_SECTIONS));
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
const inventory=[];
for(const file of readdirSync('.github/workflows').filter(f=>f.endsWith('.yml'))){
 const source=readFileSync('.github/workflows/'+file,'utf8'),doc=YAML.parseDocument(source);assert.deepEqual(doc.errors,[],file+' YAML syntax');
 const workflow=doc.toJS();
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
