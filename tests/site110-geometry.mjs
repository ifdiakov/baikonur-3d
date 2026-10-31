import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {buildSite110,SITE110_REFERENCE,SITE110_ROCKET_MOUNT,SITE110_PORTS} from '../src/site110.js';

// Compare the physical model to the saved geographic evidence independently
// of its rendering metadata. OSM describes the circular concrete perimeters.
const raw=JSON.parse(gunzipSync(readFileSync(new URL('../data/osm/source-overpass.json.gz',import.meta.url))));
const origin=SITE110_REFERENCE.originLonLat;
const metres=ll=>[(ll.lon-origin[0])*111320*Math.cos(origin[1]*Math.PI/180),(origin[1]-ll.lat)*111320];
for(const pad of SITE110_REFERENCE.pads){
 const perimeter=raw.elements.find(e=>e.type==='way'&&e.id===pad.osmWay);
 assert.ok(perimeter?.geometry?.length>20,'perimeter is grounded in the saved OSM way');
 const residuals=perimeter.geometry.map(ll=>{const p=metres(ll);return Math.abs(Math.hypot(p[0]-pad.centre[0],p[1]-pad.centre[1])-pad.radius)});
 assert.ok(Math.max(...residuals)<1.8,`${pad.id}: source perimeter is within 1.8m of calibrated circle`);
}

const root=new THREE.Group();root.scale.setScalar(.14);
const built=buildSite110(root);root.updateMatrixWorld(true);
const model=root.userData.site110Model;
assert.equal(model.units,'metres');
assert.equal(root.userData.archiveCutouts.length,8,'two central shafts and six duct voids');
assert.ok(model.pads[0].serviceConfiguration!==model.pads[1].serviceConfiguration,'the two historical configurations differ');
assert.equal(model.projectorCountLeft,67);
assert.ok(built.features['emergency-escape-slide']>0,'inclined escape passage is present');
assert.ok(built.features['inclined-crew-lift']>0,'separate normal inclined lift is present');
assert.equal(built.features['vehicle-hold-down'],16);

const ray=new THREE.Raycaster();let rectangularDuctProbes=0;
for(const pad of SITE110_REFERENCE.pads){
 const angles=model.pads.find(p=>p.id===pad.id).ducts.map(d=>d.angle);
 for(let i=0;i<angles.length;i++){
  const step=(angles[(i+1)%3]-angles[i]+2*Math.PI)%(2*Math.PI);
  assert.ok(Math.abs(step-2*Math.PI/3)<1e-9,'duct axes remain 120 degrees apart');
 }
 for(const duct of model.pads.find(p=>p.id===pad.id).ducts){
  assert.equal(duct.shape,'rectangular');assert.equal(duct.polygon.length,4);
  const sides=duct.polygon.map((p,i)=>new THREE.Vector2(...duct.polygon[(i+1)%4]).sub(new THREE.Vector2(...p)));
  for(let i=0;i<4;i++)assert.ok(Math.abs(sides[i].dot(sides[(i+1)%4]))<1e-8,'Each actual terrain aperture has four right angles');
  assert.ok(Math.abs(sides[0].length()-126)<1e-8);assert.ok(Math.abs(sides[1].length()-12)<1e-8);
 }
 for(const angle of angles)for(const radius of [35,75,115])for(const across of [-5.5,0,5.5]){
  const nx=-Math.sin(angle),nz=Math.cos(angle);
  const origin=root.localToWorld(new THREE.Vector3(pad.centre[0]+Math.cos(angle)*radius+nx*across,300,pad.centre[1]+Math.sin(angle)*radius+nz*across));
  ray.set(origin,new THREE.Vector3(0,-1,0));
  const hits=ray.intersectObject(root,true);
  assert.ok(hits.length,`${pad.id}: gas channel has a rendered floor`);
  // This catches incorrect apron triangulation, a building, rail bed or a
  // service support accidentally sealing any of the exhaust centre lines.
  if(across===0)assert.ok(hits[0].point.y<-.1,`${pad.id}: exhaust centre line at ${radius}m is unobstructed above ground`);
  assert.ok(!hits.some(hit=>Math.abs(hit.point.y/.14)<.1),'No apron triangle seals the channel width');
  const t=(radius-8)/126,expected=-23*(1-t);
  // The documented emergency bridge crosses one outer edge at +9m. The
  // floor beneath it must remain physically open and planar as well.
  assert.ok(hits.some(hit=>Math.abs(hit.point.y/.14-expected)<2e-5),'The full-width duct floor lies on its single inclined plane');
  rectangularDuctProbes++;
  if(across!==0)continue;
  for(const sign of [-1,1]){
   const p=root.localToWorld(new THREE.Vector3(pad.centre[0]+Math.cos(angle)*radius,expected*.5,pad.centre[1]+Math.sin(angle)*radius));
   ray.set(p,new THREE.Vector3(nx*sign,0,nz*sign));
   const wall=ray.intersectObject(root,true)[0];
   assert.ok(wall&&Math.abs(wall.distance/.14-6)<2e-5,'Straight walls stay at the same 12m width for the complete duct');
   assert.ok(Math.abs(wall.face.normal.y)<1e-6,'The actual wall surface is vertical, not a sloping bank');
   rectangularDuctProbes++;
  }
 }
}

// A physical 58.765m rocket uses exactly the same root transform as the tower,
// apron and rails. Its engine/base plane is above the launch support table.
const base=new THREE.Vector3(...SITE110_ROCKET_MOUNT.position);
const tip=base.clone().add(new THREE.Vector3(0,58.765,0));
assert.ok(Math.abs(root.localToWorld(tip).distanceTo(root.localToWorld(base))-.14*58.765)<1e-9);
assert.equal(SITE110_ROCKET_MOUNT.axis,'y');
assert.equal(SITE110_ROCKET_MOUNT.baseY,5.4);
assert.ok(root.children.every(child=>!child.name.includes('QA')),'production model has no dummy rocket');

// Probe the actual rendered rail-head triangles, including both edges of
// each 20cm head. Their physical gauge and the two-track 20m spacing are
// independent of whether those triangles are merged or instanced.
const running=[];root.traverse(mesh=>{if(mesh.isMesh&&mesh.material?.name==='museum / rail')running.push(mesh);});
assert.ok(running.length,'The physical running-rail surfaces exist');
let railHeadProbes=0;
for(const pad of model.pads){
 const frame=new THREE.Matrix4().compose(new THREE.Vector3(...pad.centre),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pad.yaw),new THREE.Vector3(1,1,1));
 for(const z of [62.5,135,225])for(const trackCenter of [-10,10])for(const side of [-1,1]){
  const railX=trackCenter+side*1.52/2;
  for(const across of [-.099,0,.099]){
   const expected=root.localToWorld(new THREE.Vector3(railX+across,.63,z).applyMatrix4(frame));
   ray.set(expected.clone().add(new THREE.Vector3(0,.2,0)),new THREE.Vector3(0,-1,0));
   const hits=ray.intersectObjects(running,false),hit=hits.find(hit=>hit.point.distanceTo(expected)<2e-5);
   assert.ok(hit,`${pad.id}: physical rail head is continuous at ${z}, ${railX+across}`);
   assert.ok(hit.face.normal.y>.99,'The running surface faces upward');railHeadProbes++;
  }
  for(const across of [-.105,.105]){
   const expected=root.localToWorld(new THREE.Vector3(railX+across,.63,z).applyMatrix4(frame));
   ray.set(expected.clone().add(new THREE.Vector3(0,.2,0)),new THREE.Vector3(0,-1,0));
   assert.ok(!ray.intersectObjects(running,false).some(hit=>Math.abs(hit.point.y-expected.y)<2e-5),'The head width stays 20cm');
  }
 }
}
assert.equal(railHeadProbes,72);

// The public approach close-up exposed a real 26-degree corner: the external
// port metadata faced north while the model began with an inclined chord.
// Check the installed head triangles on both sides of each now-C1 model seam,
// including the transition into the rotated launch-pad running rails.
const incoming=root.userData.site110IncomingRails;
assert.equal(incoming.version,'site110-c1-model-rails-v1');assert.equal(incoming.tracks.length,4);
let incomingHeadProbes=0,maximumIncomingTurn=0;
const v=(p,y=.63)=>new THREE.Vector3(p[0],y,p[1]);
function actualHead(local,direction,label){
 const normal=new THREE.Vector3(-direction.z,0,direction.x).normalize();
 for(const side of [-1,1])for(const across of [-.099,0,.099]){
  const expected=root.localToWorld(local.clone().addScaledVector(normal,side*1.52/2+across));
  ray.set(expected.clone().add(new THREE.Vector3(0,.2,0)),new THREE.Vector3(0,-1,0));
  assert(running.some(mesh=>ray.intersectObject(mesh,false).some(hit=>hit.point.distanceTo(expected)<2e-5)),label+' actual 20cm rail head is absent');incomingHeadProbes++;
 }
 for(const side of [-1,1])for(const across of [-.105,.105]){
  const expected=root.localToWorld(local.clone().addScaledVector(normal,side*1.52/2+across));
  ray.set(expected.clone().add(new THREE.Vector3(0,.2,0)),new THREE.Vector3(0,-1,0));
  assert(!running.some(mesh=>ray.intersectObject(mesh,false).some(hit=>Math.abs(hit.point.y-expected.y)<2e-5)),label+' rail profile widens outside20cm');
 }
}
for(const track of incoming.tracks){
 const points=track.points.map(p=>v(p)),port=SITE110_PORTS.rail[track.portIndex],pad=model.pads.find(p=>p.id===track.padId),side=track.portIndex%2?1:-1;
 const frame=new THREE.Matrix4().compose(new THREE.Vector3(...pad.centre),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pad.yaw),new THREE.Vector3(1,1,1));
 const entry=new THREE.Vector3(side*10,.63,260).applyMatrix4(frame),portInward=new THREE.Vector3(0,0,-1),runningInward=new THREE.Vector3(0,0,-1).transformDirection(frame);
 assert(points[0].distanceTo(new THREE.Vector3(...port))<1e-10,'Fixed exterior head port remains exact');
 assert(points.at(-1).distanceTo(entry)<1e-10,'Existing launch-pad running-rail entry remains exact');
 assert(points[1].clone().sub(points[0]).normalize().dot(portInward)>1-1e-12,'Actual model rail begins in the external port frame');
 assert(points.at(-1).clone().sub(points.at(-2)).normalize().dot(runningInward)>1-1e-12,'Actual model rail ends in the rotated pad frame');
 for(let i=1;i<points.length-1;i++){
  const a=points[i].clone().sub(points[i-1]).normalize(),b=points[i+1].clone().sub(points[i]).normalize(),turn=Math.acos(THREE.MathUtils.clamp(a.dot(b),-1,1));
  maximumIncomingTurn=Math.max(maximumIncomingTurn,turn);assert(turn<3*Math.PI/180,'A model rail curve retains an abrupt visible corner');
 }
 for(const d of [.05,1,4])actualHead(points[0].clone().addScaledVector(portInward,d),portInward,track.id+' port '+d);
 for(const d of [-1.5,-.05,.05,1.5])actualHead(entry.clone().addScaledVector(runningInward,d),runningInward,track.id+' pad seam '+d);
 for(const i of [Math.floor(points.length/3),Math.floor(points.length*2/3)]){
  const direction=points[i+1].clone().sub(points[i-1]).normalize();actualHead(points[i],direction,track.id+' curved head '+i);
 }
}
for(let pair=0;pair<2;pair++){
 const [a,b]=incoming.tracks.slice(pair*2,pair*2+2);assert.equal(a.points.length,b.points.length);
 for(let i=0;i<a.points.length;i++)assert(Math.abs(v(a.points[i]).distanceTo(v(b.points[i]))-20)<1e-8,'Shared model pair retains its20m centre spacing throughout');
}
assert.equal(incomingHeadProbes,216);

let drawCalls=0,triangles=0;
root.traverse(o=>{if(o.isMesh){drawCalls++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}});
assert.ok(drawCalls<=45,`draw budget exceeded: ${drawCalls}`);
assert.ok(triangles<=250000,`triangle budget exceeded: ${triangles}`);
const bounds=new THREE.Box3().setFromObject(root);
assert.ok(Math.abs(bounds.max.y/.14-225)<.01,'lightning diverters end at 225m, not a cumulative tower-section error');
assert.ok(Math.abs(bounds.min.y/.14+23)<.01,'duct floor is 23m below the apron');
assert.ok(SITE110_REFERENCE.dimensionConfidence.lightningDiverter.includes('drawing not available'),'published narrative dimension is qualified');
console.log(JSON.stringify({ok:true,drawCalls,triangles,cutouts:built.cutouts.length,physicalPadSeparation:model.physicalPadSeparation,railHeadProbes,incomingHeadProbes,maximumIncomingTurnDegrees:maximumIncomingTurn*180/Math.PI,rectangularDuctProbes,vehicleHeightWorld:.14*58.765}));
