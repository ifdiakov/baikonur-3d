import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildSite31Pad,SITE31_VERSION,SITE31_PIT,SITE31_PORTS} from '../src/site31-pad.js';
import {FACILITY_PORTS} from '../src/facility-ports.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {buildArchiveModel} from '../src/archive-models.js';

const root=new THREE.Group();root.scale.setScalar(.28);root.position.y=-2.72;
const result=buildSite31Pad(root);root.updateMatrixWorld(true);
assert.equal(result.site31.version,SITE31_VERSION);
assert.equal(result.site31.siteId,'pad-31');
assert.equal(result.site31.orientationVerified,false,'No unverified azimuth becomes a surveyed assertion');
assert.equal(result.cutouts.length,1);assert.deepEqual(result.cutouts[0],SITE31_PIT);
assert.equal(result.site31.supportingArms,4);assert.equal(result.features['support-arm-gripper'],4);
assert.equal(result.site31.serviceMasts,2);assert.equal(result.site31.serviceDecks,16);
assert.equal(result.features['soyuz-booster-body'],4);assert.equal(result.features['soyuz-core-stage'],1);
assert.ok(result.features['service-mast-cross-lattice']>100);
assert.ok(result.features['excavation-stair-tread']>50);
assert.ok(result.primitiveCount>1800,'Site31 should retain detailed open structures');
assert.ok(result.meshCount<100,'Fine lattice work must be instanced');
assert.deepEqual(SITE31_PORTS.road,FACILITY_PORTS['pad-31'].road);
assert.deepEqual(SITE31_PORTS.rail,FACILITY_PORTS['pad-31'].rail[0]);
assert.equal(ARCHIVE_MAP.find(s=>s.id==='pad-31').yaw,0);
assert.equal(ARCHIVE_MAP.find(s=>s.id==='pad-31').scale,.28);

// A ray down the exhaust axis must reach the actual below-grade chamber;
// a solid deck disguised as a dark circle would fail this test.
const meshes=[];root.traverse(o=>{
 if(!o.isMesh)return;
 let p=o,rocket=false;while(p&&p!==root){if(p.name==='«Союз» · музейная предстаровая композиция')rocket=true;p=p.parent;}
 if(!rocket)meshes.push(o);
 const positions=o.geometry.attributes.position;
 assert.ok([...positions.array].every(Number.isFinite),o.name+' has finite vertices');
 if(o.isInstancedMesh)assert.ok([...o.instanceMatrix.array].every(Number.isFinite),o.name+' has finite transforms');
});
const start=root.localToWorld(new THREE.Vector3(0,10,0));
const hit=new THREE.Raycaster(start,new THREE.Vector3(0,-1,0)).intersectObjects(meshes,false)[0];
assert.ok(hit,'Open chamber floor is present');
const localHit=root.worldToLocal(hit.point.clone());
assert.ok(localHit.y<-20,'The launch axis is open through the table and the bridge');
assert.ok(Math.abs(localHit.y-result.site31.pitFloorY)<1e-5,'The visible floor meets its stated datum');
const road=root.children.find(m=>m.userData.museumComponent==='continuous-site31-access-road');
assert.ok(road,'Internal road is a continuous ribbon');
const roadStart=root.localToWorld(new THREE.Vector3(60,10,132.9));
const roadHit=new THREE.Raycaster(roadStart,new THREE.Vector3(0,-1,0)).intersectObject(road,false)[0];
assert.ok(roadHit,'Network road port meets the model surface');
assert.ok(Math.abs(root.worldToLocal(roadHit.point.clone()).y-.1)<1e-5);
const bounds=new THREE.Box3().setFromObject(root);assert.ok(bounds.min.y<-9,'Excavation extends below the actual scene surface');
assert.ok(JSON.stringify(root.userData).includes('site31-detailed-v2'),'QA metadata contains no circular scene objects');
// Integration must dispatch the new builder, not the older soyuz31 sketch.
const dispatchRoot=new THREE.Group();dispatchRoot.scale.setScalar(.28);
const dispatched=buildArchiveModel(dispatchRoot,ARCHIVE_MAP.find(s=>s.id==='pad-31'));
assert.equal(dispatched.site31.version,SITE31_VERSION);
console.log('SITE31_GEOMETRY_PASS',JSON.stringify({primitives:result.primitiveCount,drawCalls:result.meshCount,excavationFloor:localHit.y,serviceDecks:result.site31.serviceDecks,ports:SITE31_PORTS,bounds:bounds.getSize(new THREE.Vector3()).toArray()}));
