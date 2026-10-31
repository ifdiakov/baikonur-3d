import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {buildSite110,SITE110_REFERENCE,SITE110_ROCKET_MOUNT} from '../src/site110.js';

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

const ray=new THREE.Raycaster();
for(const pad of SITE110_REFERENCE.pads){
 const angles=model.pads.find(p=>p.id===pad.id).ducts.map(d=>d.angle);
 for(let i=0;i<angles.length;i++){
  const step=(angles[(i+1)%3]-angles[i]+2*Math.PI)%(2*Math.PI);
  assert.ok(Math.abs(step-2*Math.PI/3)<1e-9,'duct axes remain 120 degrees apart');
 }
 for(const angle of angles)for(const radius of [35,75,115]){
  const origin=root.localToWorld(new THREE.Vector3(pad.centre[0]+Math.cos(angle)*radius,300,pad.centre[1]+Math.sin(angle)*radius));
  ray.set(origin,new THREE.Vector3(0,-1,0));
  const hits=ray.intersectObject(root,true);
  assert.ok(hits.length,`${pad.id}: gas channel has a rendered floor`);
  // This catches incorrect apron triangulation, a building, rail bed or a
  // service support accidentally sealing any of the exhaust centre lines.
  assert.ok(hits[0].point.y<-.1,`${pad.id}: exhaust centre line at ${radius}m is unobstructed above ground`);
  const t=(radius-8)/126,expected=-23*(1-t*t*t);
  assert.ok(Math.abs(hits[0].point.y/.14-expected)<.18,'duct floor follows its curved depth profile');
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

// Inspect the actual instance transforms of the approach rails. They must
// agree with a 1.52m gauge and a 20m transporter track-centre separation.
const running=root.children.find(o=>o.isInstancedMesh&&o.name==='Архив · rail');
assert.ok(running,'rail batch exists');
const m=new THREE.Matrix4(),v=new THREE.Vector3(),local=new THREE.Vector3(),inverse=new THREE.Matrix4();
for(const pad of model.pads){
 const frame=new THREE.Matrix4().compose(new THREE.Vector3(...pad.centre),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pad.yaw),new THREE.Vector3(1,1,1));
 inverse.copy(frame).invert();const candidates=[];
 for(let i=0;i<running.count;i++){
  running.getMatrixAt(i,m);v.setFromMatrixPosition(m);local.copy(v).applyMatrix4(inverse);
  if(Math.abs(local.z-62.5)<.01&&Math.abs(local.y-.46)<.01)candidates.push(local.x);
 }
 candidates.sort((a,b)=>a-b);
 assert.equal(candidates.length,4,`${pad.id}: four running rails in the first straight segment`);
 for(const [i,expected]of[-10.76,-9.24,9.24,10.76].entries())assert.ok(Math.abs(candidates[i]-expected)<.001);
}

let drawCalls=0,triangles=0;
root.traverse(o=>{if(o.isMesh){drawCalls++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}});
assert.ok(drawCalls<=45,`draw budget exceeded: ${drawCalls}`);
assert.ok(triangles<=250000,`triangle budget exceeded: ${triangles}`);
const bounds=new THREE.Box3().setFromObject(root);
assert.ok(Math.abs(bounds.max.y/.14-225)<.01,'lightning diverters end at 225m, not a cumulative tower-section error');
assert.ok(Math.abs(bounds.min.y/.14+23)<.01,'duct floor is 23m below the apron');
assert.ok(SITE110_REFERENCE.dimensionConfidence.lightningDiverter.includes('drawing not available'),'published narrative dimension is qualified');
console.log(JSON.stringify({ok:true,drawCalls,triangles,cutouts:built.cutouts.length,physicalPadSeparation:model.physicalPadSeparation,vehicleHeightWorld:.14*58.765}));
