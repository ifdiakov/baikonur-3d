import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {packTransportLayers,packGeometry} from '../src/transport-detail-codec.js';
import {createTransportDetailJob} from '../src/transport-detail-job.js';

const startupSource=await readFile(new URL('../src/museum-startup.js',import.meta.url),'utf8');
const site2Source=await readFile(new URL('../src/site2-exhibit.js',import.meta.url),'utf8');
const results=[];
const gate=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(test,message){
 const deadline=performance.now()+1200;
 while(!test()){
  if(performance.now()>deadline)assert.fail(message);
  await turn();
 }
}
async function bounded(promise,message){
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),1500);})]);}
 finally{clearTimeout(timer);}
}

// Run the real classic startup script. Only browser primitives are replaced;
// its queue, priority, accounting and lifecycle code remain intact.
function startupFixture({saveData=false}={}){
 const timers=new Set(),classes=new Set();
 const schedule=(fn,ms=0)=>{const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);return timer;};
 const cancel=timer=>{clearTimeout(timer);timers.delete(timer);};
 const sandbox={console,performance,Map,Set,Promise,URL,AbortController,
  navigator:{connection:{saveData}},location:{href:'https://museum.example/museum.html'},
  document:{hidden:false,activeElement:null,body:{dataset:{},classList:{add:value=>classes.add(value)}},
   getElementById:()=>null,querySelector:()=>null},
  setTimeout:schedule,clearTimeout:cancel,
  requestAnimationFrame:fn=>schedule(()=>fn(performance.now())),cancelAnimationFrame:cancel,
  requestIdleCallback:fn=>schedule(()=>fn({didTimeout:false,timeRemaining:()=>20})),
  addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:true}),
  fetch:()=>{throw Error('Unexpected network request in startup lifecycle test');}};
 sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(startupSource,sandbox,{filename:'museum-startup.js'});
 const api=sandbox.__MUSEUM_STARTUP;
 return {api,sandbox,async ready(){api.ready();await until(()=>api.stats().interactive,'Startup failed to reveal');},
  dispose(){for(const timer of timers)clearTimeout(timer);timers.clear();}};
}

async function test(name,run){await run();results.push(name);}

await test('startup drains active jobs and holds queued work',async()=>{
 const fixture=startupFixture();const {api}=fixture;
 try{
  await fixture.ready();
  const a=gate(),b=gate(),starts=[];
  const first=api.defer(()=>{starts.push('first');return a.promise;},{key:'first',priority:30});
  const failed=api.defer(()=>{starts.push('failed');return b.promise;},{key:'failed',priority:20});
  const failure=failed.catch(error=>error);
  await until(()=>starts.length===2,'Both active jobs must start before suspension');
  const queued=api.defer(()=>{starts.push('queued');return 42;},{key:'queued',priority:1});
  const lease=api.suspend('energia-test');
  const nested=api.suspend('energia-test-nested');
  assert.equal(api.isSuspended(),true);assert.equal(api.stats().suspensionCount,2);
  let resumed=false;api.whenResumed().then(()=>{resumed=true;});
  let drained=false;lease.ready.then(()=>{drained=true;});
  api.promote('queued',1000);
  a.resolve('done');await first;await turn();
  assert.equal(drained,false,'Preparation waits for every already-active job');
  assert.deepEqual(starts,['first','failed'],'Promotion must not bypass the suspension');
  b.reject(Error('Expected optional asset failure'));assert.match((await failure).message,/Expected optional/);
  await bounded(Promise.all([lease.ready,nested.ready]),'Failed active job deadlocked launch preparation');
  assert.equal(api.stats().active,0);
  assert.equal(api.stats().queued,1);
  assert.equal(drained,true);
  lease.release();lease.release();await turn();
  assert.equal(api.isSuspended(),true);assert.equal(api.stats().suspensionCount,1);assert.equal(resumed,false);
  assert.deepEqual(starts,['first','failed'],'One release cannot cancel a different active lease');
  nested.release();assert.equal(await bounded(queued,'Queued work never resumed'),42);
  assert.equal(api.isSuspended(),false);assert.equal(api.stats().suspensionCount,0);assert.equal(resumed,true);
  assert.deepEqual(starts,['first','failed','queued']);
 }finally{fixture.dispose();}
});

await test('startup closes pending and repeated leases without deadlock',async()=>{
 const fixture=startupFixture();const {api}=fixture;
 try{
  await fixture.ready();
  const running=gate(),starts=[];
  const first=api.defer(()=>{starts.push('running');return running.promise;},{key:'running'});
  await until(()=>starts.length===1,'Active job did not start');
  const lease=api.suspend('closed-while-loading');
  const resumed=gate();
  const next=api.defer(()=>{starts.push('after-close');return resumed.promise;},{key:'after-close'});
  lease.release();lease.release();
  await until(()=>starts.includes('after-close'),'Closing launch left the queue suspended');
  running.resolve();await first;await bounded(lease.ready,'Released lease never settled');
  assert.equal(api.stats().active,1,'Lease readiness must not wait for newly resumed jobs');
  resumed.resolve('resumed');assert.equal(await bounded(next,'Resumed job failed to complete'),'resumed');
  for(let cycle=0;cycle<3;cycle++){
   const held=api.suspend('repeat-'+cycle);await bounded(held.ready,'Empty queue lease did not settle');
   let started=false;const pending=api.defer(()=>{started=true;return cycle;},{key:'repeat-job-'+cycle});
   await turn();assert.equal(started,false,'Replayed launch must hold newly scheduled work');
   held.release();assert.equal(await bounded(pending,'Repeated lease failed to release'),cycle);
  }
 }finally{fixture.dispose();}
});

await test('scheduled pump rechecks suspension before starting a job',async()=>{
 const fixture=startupFixture();const {api}=fixture;
 try{
  await fixture.ready();let started=false;
  const pending=api.defer(()=>{started=true;return true;},{key:'scheduled'});
  const held=api.suspend('before-idle-callback');await held.ready;await turn();
  assert.equal(started,false,'A previously scheduled idle callback must honor a new suspension');
  held.release();assert.equal(await bounded(pending,'Scheduled job did not resume'),true);
 }finally{fixture.dispose();}
});

// Execute the real site2 module with only its asset/aircraft dependencies
// replaced. The prerequisite itself uses the real one-slot startup queue.
await test('site2 queues its asset dependency before its construction job',async()=>{
 const fixture=startupFixture({saveData:true});const {api}=fixture;
 const asset=gate(),events=[];let sourceCalls=0;
 const source=site2Source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')
  .replace(/import\('\.\/buran-landing-aircraft\.js[^']*'\)/g,'Promise.resolve(globalThis.__aircraftModule)')
  +'\n;globalThis.__site2Test={installSite2Exhibit};';
 const sandbox={console,Promise,THREE,mergeGeometries,window:{__MUSEUM_STARTUP:api},
  SITE2_VERSION:'fixture',SITE2_BURAN:{position:[0,0,0],yaw:0},
  loadRocketSource(){sourceCalls++;return api.defer(()=>{events.push('source-start');return asset.promise;},{key:'rocket:energia-buran',priority:20});},
  buildLandingAircraft(){
   events.push('aircraft-built');const buran=new THREE.Group();
   buran.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,2),new THREE.MeshBasicMaterial()));
   return {buran,update(){},stats:()=>({source:{retainedTriangles:12,bounds:{size:[1,1,2]},retainedMaterials:1}})};
  }};
 sandbox.__aircraftModule={buildLandingAircraft:sandbox.buildLandingAircraft};
 vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:'site2-exhibit.js'});
 const root=new THREE.Group();root.userData.site2Model={};
 root.addEventListener('museum-exhibit-loaded',()=>events.push('installed'));
 try{
  const controller=sandbox.__site2Test.installSite2Exhibit(root);
  await fixture.ready();
  await until(()=>events.includes('source-start'),'Source dependency deadlocked behind the queued site2 construction job');
  const held=api.suspend('launch-during-site2-request');
  asset.resolve({scene:new THREE.Group()});
  await bounded(held.ready,'Source completion could not drain before launch');
  await turn();
  assert.equal(events.includes('installed'),false,'Completing the source must not install the heavy model during launch');
  assert.equal(events.includes('aircraft-built'),false,'Heavy preparation must remain queued too');
  held.release();assert.equal(await bounded(controller.ready,'Site2 did not resume after launch'),true,JSON.stringify(controller.stats()));
  assert.deepEqual(events,['source-start','aircraft-built','installed']);assert.equal(sourceCalls,1);
  assert.equal(controller.stats().status,'ready');
  assert.equal(await controller.load(),true);assert.equal(sourceCalls,1,'Ready model must not request its dependency again');
 }finally{root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});fixture.dispose();}
});

class FakeWorker{
 static instances=[];
 constructor(){this.messages=[];this.terminated=false;FakeWorker.instances.push(this);}
 postMessage(value){this.messages.push(value);}
 terminate(){this.terminated=true;}
 reply(value,extra={}){const message=this.messages.at(-1);this.onmessage({data:{id:message.id,elapsedMs:4,value,...extra}});}
 crash(message){this.onerror({message,preventDefault(){}});}
}
const previousWorker=globalThis.Worker;globalThis.Worker=FakeWorker;
try{
 await test('transport holds raw worker result until release before decoding',async()=>{
  const road=new THREE.Mesh(new THREE.BoxGeometry(2,1,4),new THREE.MeshBasicMaterial());
  road.name='fixture-road';const roads=new THREE.Group();roads.add(road);
  const packed=packTransportLayers({roads}),packet={...packed};let decodeReads=0;
  Object.defineProperty(packet,'geometries',{enumerable:true,get(){decodeReads++;return packed.geometries;}});
  const fixture=startupFixture();await fixture.ready();const held=fixture.api.suspend('energia-test');
  const job=createTransportDetailJob({beforeInstall:()=>fixture.api.whenResumed()});let settled=false;
  try{
   const pending=job.build({fixture:true}).then(value=>{settled=true;return value;});
   FakeWorker.instances.at(-1).reply({packet,fixture:17});
   await turn();assert.equal(settled,false,'A raw result must not be installed while launch is active');
   assert.equal(decodeReads,0,'The typed-buffer decoder must also stay out of the launch frame');
   assert.equal(job.stats().pendingInstalls,1,'A held raw result remains observable');
   held.release();held.release();
   const replay=fixture.api.suspend('replay-in-same-turn');await turn();
   assert.equal(settled,false,'Release followed by immediate replay must keep the old worker result held');
   assert.equal(decodeReads,0,'whenResumed must recheck a new lease before decoding');
   assert.equal(job.stats().pendingInstalls,1);replay.release();
   const output=await bounded(pending,'Held transport result never resumed');
   assert.equal(output.fixture,17);assert.equal(output.roots.roads[0].name,'fixture-road');
   assert.equal(decodeReads,1,'The raw packet is decoded once on release');
   assert.equal(job.stats().pendingInstalls,0);
   assert.equal(output.roots.roads[0].geometry.attributes.position.count,road.geometry.attributes.position.count);
   output.roots.roads[0].geometry.dispose();output.roots.roads[0].material.dispose();
   job.finish();assert.equal(FakeWorker.instances.at(-1).terminated,true);
  }finally{held.release();job.dispose();road.geometry.dispose();road.material.dispose();fixture.dispose();}
 });

 await test('transport holds cut geometry decoding as well as whole layers',async()=>{
  const fixture=startupFixture();await fixture.ready();
  const job=createTransportDetailJob({beforeInstall:()=>fixture.api.whenResumed()});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,1,3),new THREE.MeshBasicMaterial());
  const packed=packGeometry(mesh.geometry,{copy:true});let reads=0,settled=false;
  const raw={stats:{cut:1}};Object.defineProperty(raw,'rows',{get(){reads++;return[packed];}});
  const held=fixture.api.suspend('held-cut');
  try{
   const pending=job.cut({meshes:[mesh],fixture:true}).then(value=>{settled=true;return value;});
   FakeWorker.instances.at(-1).reply(raw);await turn();
   assert.equal(reads,0,'Cut geometry decoding must wait for release');assert.equal(settled,false);
   assert.equal(job.stats().pendingInstalls,1);
   held.release();const output=await bounded(pending,'Held cut result did not resume');
   assert.equal(output.geometries.length,1);assert.equal(reads,1);assert.equal(output.stats.cut,1);
   output.geometries[0].dispose();assert.equal(job.stats().pendingInstalls,0);job.finish();
  }finally{held.release();job.dispose();mesh.geometry.dispose();mesh.material.dispose();fixture.dispose();}
 });

 await test('transport failure and close release held promises',async()=>{
  const fixture=startupFixture();await fixture.ready();
  const job=createTransportDetailJob({beforeInstall:()=>fixture.api.whenResumed()});
  try{
   const pending=job.build({fixture:true}).catch(error=>error);
   const held=fixture.api.suspend('close-on-error');FakeWorker.instances.at(-1).crash('Expected worker failure');
   const error=await bounded(pending,'Worker failure was hidden behind a suspension');
   assert.match(error.message,/Expected worker failure/);held.release();held.release();
   assert.equal(job.stats().state,'error');
  }finally{job.dispose();fixture.dispose();}
 });

 await test('failed install gate rejects without decoding or retaining an install',async()=>{
  let decoded=false;
  const packet={get geometries(){decoded=true;throw Error('Must never decode');}};
  const job=createTransportDetailJob({beforeInstall:()=>Promise.reject(Error('Expected install gate failure'))});
  try{
   const pending=job.build({fixture:true}).catch(error=>error);
   FakeWorker.instances.at(-1).reply({packet});
   assert.match((await bounded(pending,'Rejected install gate did not settle')).message,/Expected install gate failure/);
   assert.equal(decoded,false);assert.equal(job.stats().pendingInstalls,0);
  }finally{job.dispose();}
 });

 await test('disposed transport cannot install a held raw result after release',async()=>{
  const fixture=startupFixture();await fixture.ready();const held=fixture.api.suspend('held-at-disposal');
  let decoded=false;const packet={get geometries(){decoded=true;throw Error('Must never decode');}};
  const job=createTransportDetailJob({beforeInstall:()=>fixture.api.whenResumed()});
  try{
   const pending=job.build({fixture:true}).catch(error=>error);
   FakeWorker.instances.at(-1).reply({packet});await turn();
   assert.equal(job.stats().pendingInstalls,1);
   job.dispose(Error('Expected disposed request'));held.release();
   assert.match((await bounded(pending,'Disposed raw result never settled')).message,/Expected disposed request/);
   assert.equal(decoded,false);assert.equal(job.stats().pendingInstalls,0);
  }finally{held.release();job.dispose();fixture.dispose();}
 });
}finally{if(previousWorker===undefined)delete globalThis.Worker;else globalThis.Worker=previousWorker;}

console.log('ENERGIA_BACKGROUND_LOADING_PASS '+JSON.stringify({checks:results.length,results}));
