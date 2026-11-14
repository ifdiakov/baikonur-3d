import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';

registerHooks({resolve(specifier,context,next){
 if(specifier==='three')return{url:new URL('../src/vendor/three-r160/build/three.module.js',import.meta.url).href,shortCircuit:true};
 if(specifier.startsWith('three/addons/'))return{url:new URL('../src/vendor/three-r160/examples/jsm/'+specifier.slice(13),import.meta.url).href,shortCircuit:true};
 return next(specifier,context);
}});
const [THREE,{createMuseumGeography},{buildOsmGraph},{buildMik112,MIK112},{adaptTuaRails},
 {createMik112RailSourcePlan,createMik112RailApproaches,createMik112RailGroundProfile},
 {RAIL_PROFILE},{roundRailCorners},{buildTransportGroundSupport,transportGroundSupportHeightAt,createTransportGroundSupportSampler},
 {createVerticalGroundQuery}]=await Promise.all([
 import('three'),import('../src/osm-geography.js'),import('../src/osm-transport.js'),import('../src/mik112.js'),import('../src/tua-rails.js'),
 import('../src/mik112-rail-plan.js'),import('../src/rail-profile.js'),import('../src/rail-road-clearance.js'),
 import('../src/transport-ground-support.js'),import('../src/vertical-ground-query.js')
]);
const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url)));
const [catalog,matches,railways]=await Promise.all(['data/catalog.json','data/osm/catalog-matches.json','data/osm/railways.geojson'].map(read));
const sourceBefore=JSON.stringify(railways),geography=createMuseumGeography({catalog,matches});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const graph=buildOsmGraph(railways.features,{geography,point,rail:true}),plan=createMik112RailSourcePlan(graph);
const root=new THREE.Group(),site=geography.sites.find(row=>row.id==='pad-112');
root.position.copy(point(site.x,site.y));root.scale.setScalar(MIK112.scale);root.rotation.y=MIK112.yaw;
const exhibit=buildMik112(root);adaptTuaRails(exhibit);root.updateWorldMatrix(true,true);
const tracks=createMik112RailApproaches(root,plan,{headY:RAIL_PROFILE.headY});
const snapshot=JSON.stringify(tracks.map(track=>({start:track.start,end:track.end,points:track.curveSamples})));
const forward=new THREE.Vector3(0,0,-1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
const field=createMik112RailGroundProfile(tracks,forward,{headY:RAIL_PROFILE.headY,halfWidth:RAIL_PROFILE.ballastWidth/2});
const height=(x,z)=>transportGroundSupportHeightAt({heightField:field},x,z);
assert(Math.abs(field.startY-.5257)<1e-10);assert.equal(field.endY,-2.755);
assert(Math.abs(field.length-6.055828947238564)<1e-8);
const profiles=tracks.map(track=>{
 const controls=track.points.map(p=>p.clone().setY(height(p.x,p.z))),curve=roundRailCorners(controls,{radius:15}),points=[curve[0].clone()];
 for(let i=1;i<curve.length;i++){
  const a=curve[i-1],b=curve[i],steps=Math.max(1,Math.ceil(a.distanceTo(b)/.12));
  for(let j=1;j<=steps;j++){const p=a.clone().lerp(b,j/steps);p.y=height(p.x,p.z);points.push(p);}
 }
 const normals=points.map((p,i)=>{
  let d=points[Math.min(points.length-1,i+1)].clone().sub(points[Math.max(0,i-1)]).setY(0).normalize();
  if(i===0)d=forward.clone();if(i===points.length-1)d=new THREE.Vector3(...track.sourceTangent);
  return[-d.z,d.x];
 });
 // Every full cross-section, including both running heads, meets the original
 // model/source plane. This catches an off-centre seam hidden by centre tests.
 for(const index of [0,points.length-1])for(const side of [-1,0,1]){
  const p=points[index],n=normals[index],expected=(index===0?track.start:track.end)[1];
  assert(Math.abs(height(p.x+side*n[0]*RAIL_PROFILE.ballastWidth/2,p.z+side*n[1]*RAIL_PROFILE.ballastWidth/2)+RAIL_PROFILE.headY-expected)<1e-9);
 }
 return{id:'mik-'+track.trackIndex,width:RAIL_PROFILE.ballastWidth,points:points.map(p=>p.toArray()),normals,heightField:field};
});
const support=buildTransportGroundSupport({profiles});assert(support.mesh.userData.transportGroundSupport);
const sampler=createTransportGroundSupportSampler({profiles});assert.equal(sampler.heightAt(10000,10000),null);
assert.deepEqual(sampler.trianglesInBounds({minX:10000,maxX:10001,minZ:10000,maxZ:10001}),[]);
const allRoofs=sampler.trianglesInBounds({minX:-10000,maxX:10000,minZ:-10000,maxZ:10000});
assert.equal(allRoofs.length,sampler.stats.triangles,'A bounds query returns each physical roof triangle once');
assert(allRoofs.every(row=>Object.isFrozen(row)&&Object.isFrozen(row.a)),'Query consumers cannot mutate the physical height index');
support.mesh.updateMatrixWorld(true);
const query=createVerticalGroundQuery([support.mesh]),ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
let checks=0,minGap=Infinity,maxGap=-Infinity;
// Query the union of all four actual closed support meshes. A separate check
// of each support would miss the old higher-bed/lower-track overlap.
for(const profile of profiles)for(let i=1;i<profile.points.length;i++)for(const t of [.2,.5,.8])for(const side of [-.8,0,.8]){
 const a=new THREE.Vector3(...profile.points[i-1]),b=new THREE.Vector3(...profile.points[i]);
 const na=profile.normals[i-1],nb=profile.normals[i];
 a.x+=na[0]*side*profile.width/2;a.z+=na[1]*side*profile.width/2;
 b.x+=nb[0]*side*profile.width/2;b.z+=nb[1]*side*profile.width/2;
 const p=a.lerp(b,t),base=height(p.x,p.z);if(base<-2.75)continue;
 ray.ray.origin.set(p.x,20,p.z);
 const hit=query.intersections(ray).find(row=>row.face?.normal.y>0);assert(hit,'Raised rail must have actual physical soil below it');
 assert(Math.abs(sampler.heightAt(p.x,p.z)-hit.point.y)<1e-7,'Support sampler must match the actual Float32 roof ray, including overlapping profiles');
 const gap=base+RAIL_PROFILE.ballastY-hit.point.y;
 assert(gap>.01&&gap<.023,'An overlapping foundation must not bury or detach the adjacent ballast');
 minGap=Math.min(minGap,gap);maxGap=Math.max(maxGap,gap);checks++;
}
assert(checks>3000);assert.equal(JSON.stringify(railways),sourceBefore);
assert.equal(JSON.stringify(tracks.map(track=>({start:track.start,end:track.end,points:track.curveSamples}))),snapshot,'The common ground planner must not mutate approved X/Z paths or port metadata');
const mismatched=structuredClone(tracks);mismatched[1].start[1]+=.01;
assert.throws(()=>createMik112RailGroundProfile(mismatched,forward,{headY:RAIL_PROFILE.headY,halfWidth:RAIL_PROFILE.ballastWidth/2}),/approved start\/source planes/);
console.log('MIK112_GROUND_CONTACT_PASS',JSON.stringify({tracks:tracks.length,checks,minGap,maxGap,length:field.length,supportTriangles:support.stats.triangles,sourceUnchanged:true,portsUnchanged:true}));
