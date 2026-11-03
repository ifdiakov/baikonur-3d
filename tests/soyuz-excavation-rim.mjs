import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildGagarinPad} from '../src/gagarin-pad.js';
import {buildSite31Pad} from '../src/site31-pad.js';
import {GAGARIN_RIM_METRES} from '../src/soyuz-excavation-profile.js';
import {SITE31_RIM,SITE31_PIT} from '../src/site31-trench-profile.js';
import {gagarinVoid} from '../src/terrain-voids.js';
const reports=[];
for(const [id,build,rim,cutout]of[['gagarin',buildGagarinPad,GAGARIN_RIM_METRES,gagarinVoid()],['site31',buildSite31Pad,SITE31_RIM,SITE31_PIT]]){
 const root=new THREE.Group();build(root,{autoLoad:false});root.updateMatrixWorld(true);
 const collars=[];root.traverse(o=>{if(o.userData.museumComponent==='soyuz-excavation-rim')collars.push(o);assert.notEqual(o.userData.museumComponent,'flame-duct-embankment','No coplanar soil wings above the shared terrain');});
 assert.equal(collars.length,1);const collar=collars[0];let probes=0;
 for(let i=0;i<rim.length;i++)for(const t of [.2,.5,.8]){
  const j=(i+1)%rim.length;
  const at=(polygon)=>new THREE.Vector3(THREE.MathUtils.lerp(polygon[i][0],polygon[j][0],t),1,THREE.MathUtils.lerp(polygon[i][1],polygon[j][1],t));
  const cut=at(cutout.polygon),bank=at(rim),distance=cut.distanceTo(bank);
  assert.ok(distance>=.64,'The terrain cut is outside the concrete bank');
  const hit=new THREE.Raycaster(cut,new THREE.Vector3(0,-1,0)).intersectObject(collar,false)[0];
  assert.ok(hit,`${id}: collar covers the terrain cut at segment ${i}`);
  assert.ok(hit.point.y>.05&&hit.point.y<.08,'Concrete is physically separated from the ground at the hidden seam');
  assert.ok(hit.face.normal.y>.97,'The visible collar faces upwards');probes++;
 }
 const bounds=new THREE.Box3().setFromObject(collar);
 assert.ok(bounds.min.y<-.39&&bounds.max.y>.119,'Outer fascia closes the edge down below both terrain datums');
 reports.push({id,probes,minimumY:bounds.min.y,maximumY:bounds.max.y});
}
console.log('SOYUZ_EXCAVATION_RIM_PASS',JSON.stringify(reports));
