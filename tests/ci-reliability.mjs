import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {classify,workflowPaths,matches} from '../scripts/ci/impact.mjs';
import {assertPublishHead,verifyReports} from '../scripts/ci/release-proof.mjs';
import {runBounded} from '../scripts/ci/run-bounded.mjs';
import {canonicalSignature} from '../scripts/ci/signature.mjs';
const start=Date.now(),cases=[];
function test(name,fn){fn();cases.push({name,passed:true});}
const html={path:'index.html',before:'<script src="./src/site31-observation-platform.js?v=old"></script>',after:'<script src="./src/site31-observation-platform.js?v=new"></script>'};
const tent=[html,{path:'src/site31-observation-platform.js'},{path:'src/np-royaltent.js'},{path:'scripts/apply-np-royaltent.mjs'},{path:'tests/site31-observation.mjs'},{path:'PROJECT_CONTEXT.md'}];
test('NP change selects NP-only release',()=>assert.equal(classify(tent).profile,'np'));
test('Cache-only HTML revision does not run a railway test',()=>assert.equal(classify(tent,['index.html','src/rail-stations.js']).run,false));
test('NP tests still selected',()=>assert(classify(tent,['index.html','src/site31-observation-platform.js']).run));
test('HTML logic edits do not get skipped',()=>assert(classify([{...html,after:html.after+'<button>new</button>'}],['index.html']).run));
test('Missing old HTML is fail-closed',()=>assert(classify([{...html,before:null}],['index.html']).run));
test('Road or worker edit uses full acceptance',()=>{assert.equal(classify([{path:'src/osm-transport.js'}]).profile,'full');assert.equal(classify([...tent,{path:'src/transport-detail-worker-entry.js'}]).profile,'full');});
test('Unknown source uses full acceptance',()=>assert.equal(classify([{path:'src/unknown.js'}]).profile,'full'));
test('Infrastructure change cannot republish the website',()=>assert.equal(classify([{path:'.github/workflows/nonblocking-detail.yml'},{path:'scripts/ci/impact.mjs'}]).runtime,false));
test('Path globs handle multiline and inline forms',()=>{assert.deepEqual(workflowPaths("on:\n  push:\n    paths: ['index.html','src/**']\npermissions:\n  contents: read\n"),['index.html','src/**']);assert(matches('src/deep/model.js','src/**'));assert(!matches('src/deep/model.js','src/*.js'));});
test('Stale deployment is rejected',()=>{assert.doesNotThrow(()=>assertPublishHead('a','a'));assert.throws(()=>assertPublishHead('a','b'),/STALE_RELEASE/);});
test('JSON serialization cannot cause a false geometry failure',()=>{const raw=[{hash:'abc',material:{color:7,vertexShader:undefined,roughness:.4}}];assert.deepEqual(canonicalSignature(raw),canonicalSignature(JSON.parse(JSON.stringify(raw))));});
test('Real geometry and material changes are still detected',()=>{for(const [a,b]of [[{hash:'abc'},{hash:'abd'}],[{color:7},{color:8}],[{fragmentShader:'a'},{fragmentShader:'b'}]])assert.notDeepEqual(canonicalSignature(a),canonicalSignature(b));assert.throws(()=>canonicalSignature({x:NaN}));});
mkdirSync('qa-ci/fixtures',{recursive:true});writeFileSync('qa-ci/fixtures/failure.json',JSON.stringify({passed:false}));writeFileSync('qa-ci/fixtures/empty.json','{}');
test('Failed or incomplete report cannot become complete',()=>{assert.throws(()=>verifyReports(['qa-ci/fixtures/failure.json']));assert.throws(()=>verifyReports(['qa-ci/fixtures/empty.json']));assert.throws(()=>verifyReports([]));});
const selected=[],skipped=[];
for(const f of readdirSync('.github/workflows').filter(f=>f.endsWith('.yml'))){const s=readFileSync('.github/workflows/'+f,'utf8'),paths=workflowPaths(s);if(s.startsWith('# CI_RELIABILITY_V1\n')&&f!=='nonblocking-detail.yml'){
 assert(paths.length>0,f+' lost scope');assert(s.includes('steps.ci_scope.outputs.run'),f+' lacks scope gate');(classify(tent,paths).run?selected:skipped).push(f);
}}
if(selected.length+skipped.length)test('All original suites retained; unrelated installs gated',()=>{assert.equal(selected.length+skipped.length,15);assert(skipped.length>=10);});
const ok=await runBounded(process.execPath,['-e','process.exit(0)'],{seconds:2,name:'runner-ok'});assert(ok.passed);cases.push({name:'Successful command recorded',passed:true});
const fail=await runBounded(process.execPath,['-e','process.exit(7)'],{seconds:2,name:'runner-fail'});assert.equal(fail.code,7);assert.equal(fail.passed,false);cases.push({name:'Failure code preserved, never retried',passed:true});
const hang=await runBounded(process.execPath,['-e','setInterval(()=>{},1000)'],{seconds:.2,name:'runner-timeout'});assert(hang.timedOut);assert.equal(hang.passed,false);cases.push({name:'Hung process stopped and diagnosed',passed:true});
const report={passed:true,elapsedMs:Date.now()-start,cases,scopedWorkflows:selected.length+skipped.length,tentSimulation:{selected,skipped,note:'Selection replay, not an end-to-end wall-clock benchmark'}};writeFileSync('qa-ci/unit-report.json',JSON.stringify(report,null,2));console.log('CI_RELIABILITY_PASS',JSON.stringify(report));
