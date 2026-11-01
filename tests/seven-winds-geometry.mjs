import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildSevenWinds,SEVEN_WINDS_REFERENCE} from '../src/seven-winds.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {FACILITY_PORTS} from '../src/facility-ports.js';
const root=new THREE.Group(),result=buildSevenWinds(root),entry=ARCHIVE_MAP.find(s=>s.id==='pad-75');
assert.equal(entry.kind,'seven-winds');assert.equal(entry.scale,SEVEN_WINDS_REFERENCE.scale);assert.equal(entry.yaw,SEVEN_WINDS_REFERENCE.yaw);
assert.equal(root.userData.sevenWinds.floors,4);assert.equal(result.features['window-glazing'],128);assert.equal(result.features['gazebo-floor'],2);assert.equal(result.features['gazebo-post'],16);
assert.equal(result.features['slanted-canopy-column'],2);assert.equal(result.features['balcony-slab'],8);
assert.equal(FACILITY_PORTS['pad-75'].yaw,entry.yaw);assert.deepEqual(FACILITY_PORTS['pad-75'].road,[-37,.085,-12]);
let draws=0,triangles=0;root.traverse(o=>{if(!o.isMesh)return;draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.count||1);for(const v of o.geometry.attributes.position.array)assert(Number.isFinite(v));});
let roofFaces=0;root.traverse(o=>{if(!o.isMesh||o.material.color?.getHex()!==0x544044)return;const n=o.geometry.attributes.normal;for(let i=0;i<n.count;i++){if(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))<.1)continue;assert(n.getY(i)>.2,'Gazebo roof must face upward');roofFaces++;}});assert(roofFaces>=48);
assert(draws<40,'Photo details must remain batched');assert(triangles<150000);
root.userData.setHotelEvening(false);root.traverse(o=>{if(o.material?.emissive?.getHex())assert.equal(o.material.emissiveIntensity,0);});root.userData.setHotelEvening(true);
console.log('SEVEN_WINDS_GEOMETRY_PASS',JSON.stringify({draws,triangles,floors:4,gazebos:2}));
// Inspect real triangles, not only feature counters. Each sample belongs to
// exactly one horizontal surface; beds are genuine holes in the paving.
const offset=new THREE.Vector3(...root.userData.sevenWinds.layout.modelOffset);
const floorMeshes=[];root.traverse(o=>{if(o.isMesh&&[0x9e9390,0x686a63].includes(o.material?.color?.getHex()))floorMeshes.push(o);});
function floorHits(x,z){const ray=new THREE.Raycaster(new THREE.Vector3(x,.4,z).add(offset),new THREE.Vector3(0,-1,0));return ray.intersectObjects(floorMeshes,false);}
for(const [x,z,y] of [[-34.13,20.11,.085],[2.03,20.11,.085],[28.06,20.11,.085],[30.19,20.11,.085],[2.03,12.11,.13],[7.13,28.11,.13],[2.03,31.11,.22],[28.03,35.61,.22]]){
 const hits=floorHits(x,z);assert.equal(hits.length,1,`Overlapping paving at ${x},${z}`);assert(Math.abs(hits[0].point.y-y)<1e-6);
}
for(const [x,z]of [[-19.13,13.81],[18.03,13.83],[-18.03,31.13],[17.03,33.13]])assert.equal(floorHits(x,z).length,0,'Pavement must not run under garden beds');
assert.equal(result.features['corporate-blue-letter'],5);assert.equal(result.features['corporate-letter-outline'],5);
const letters=[];root.traverse(o=>{if(o.material?.color?.getHex()===0x2529b5)letters.push(o);});assert.equal(letters.length,1,'Five letters share one material draw');
const letterBox=new THREE.Box3().setFromObject(letters[0]);assert(letterBox.max.x< -26.4,'Letters must sit outside the end pier after the local pivot offset');
// The opposite entrance/gazebo axis survives the half-turn. The fixed fence
// rectangle maps exactly onto its previous footprint, keeping the road clear.
root.rotation.y=entry.yaw;root.updateMatrixWorld(true);
const toWorld=p=>root.localToWorld(new THREE.Vector3(...p).add(offset));
const entrance=toWorld([2,0,10.2]),gazebo=toWorld([2,0,31]);assert(Math.abs(entrance.x-gazebo.x)<1e-9);assert(gazebo.z<entrance.z);
const corners=[[-33,0,-10],[34,0,-10],[34,0,42],[-33,0,42]].map(toWorld),footprint=new THREE.Box3().setFromPoints(corners);
for(const [actual,expected]of [[footprint.min.x,-33],[footprint.max.x,34],[footprint.min.z,-10],[footprint.max.z,42]])assert(Math.abs(actual-expected)<1e-8,'The rotated plot moved from its existing footprint');
console.log('HOTEL_COURTYARD_PASS',JSON.stringify({surfaceProbes:12,blueLetters:5,rotation:180,footprint:[footprint.min.toArray(),footprint.max.toArray()]}));
// Glows follow actual rendered lamp globes after scale, pivot and translation.
root.scale.setScalar(entry.scale);root.position.set(73,-2.72,-84);root.updateMatrixWorld(true);
const globeCentres=[],instance=new THREE.Matrix4();
root.traverse(m=>{if(!m.isInstancedMesh||m.material.color?.getHex()!==0xece5cc||m.geometry.type!=='SphereGeometry')return;for(let i=0;i<m.count;i++){m.getMatrixAt(i,instance);globeCentres.push(new THREE.Vector3().setFromMatrixPosition(instance).applyMatrix4(m.matrixWorld));}});
const lamps=root.userData.courtyardLightRecords();assert.equal(lamps.length,7);
for(const lamp of lamps){const light=new THREE.Vector3(lamp.lightX,lamp.lightY,lamp.lightZ);assert(Math.min(...globeCentres.map(p=>p.distanceTo(light)))<1e-5,'Light halo must remain on its physical lamp globe');assert(lamp.height<1);}
console.log('HOTEL_LAMP_ANCHORS_PASS',JSON.stringify({lamps:lamps.length}));
