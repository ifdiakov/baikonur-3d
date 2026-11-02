import assert from 'node:assert/strict';
import * as THREE from 'three';
import {protonComplex,PROTON_METRIC_REFERENCE,buildProtonPosition,protonPositionController} from '../src/archive-launches.js';
const root=new THREE.Group();buildProtonPosition(root,{rocketVisible:false});root.updateMatrixWorld(true);
const ray=(a,d,far=100)=>new THREE.Raycaster(new THREE.Vector3(...a),new THREE.Vector3(...d),0,far).intersectObject(root,true).filter(h=>{for(let o=h.object;o;o=o.parent)if(!o.visible)return false;return true;});
const opening=ray([0,5,0],[0,-1,0],20)[0];assert(opening&&opening.point.y<-3.8,'The launch aperture is physically open down to the gas splitter');
for(const side of [-1,1]){
 for(const z of [-10,0,10])assert.equal(ray([side*30,-6.5,z],[-side,0,0],5).length,0,'Each outlet has three unobstructed openings');
 for(const z of [-5.25,5.25])assert(ray([side*30,-6.5,z],[-side,0,0],5).length>0,'The portal dividers are solid');
 let previous=-Infinity;for(const x of [28,35,44,54]){const floor=ray([side*x,-.5,0],[0,-1,0],10)[0];assert(floor&&floor.point.y<0);assert(floor.point.y>previous,'Both flame channels rise toward grade');previous=floor.point.y;}
 const support=ray([side*9,1,180],[0,-1,0],2)[0];assert(support&&Math.abs(support.point.y-.38)<.02,'Tower travel rails remain 18 metres apart');
}
const collector=ray([15,-1,0],[0,-1,0],10)[0];assert(collector&&Math.abs(collector.point.y+8.005)<.02,'Collector depth is 8 m, not the old 24 m');
for(const y of [16,20.5,25,36,41,46,50.5,54])assert.equal(ray([0,y+.6,300],[0,-1,0],1).length,0,'Every service platform has a real central opening');
let draws=0,triangles=0;const matrix=new THREE.Matrix4();root.traverse(o=>{if(!o.isMesh)return;draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);for(const attr of Object.values(o.geometry.attributes))assert([...attr.array].every(Number.isFinite));if(o.isInstancedMesh)for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);assert(matrix.elements.every(Number.isFinite));assert(Math.abs(matrix.determinant())>1e-10);}});
assert(draws<=50);assert(triangles<120000);assert.equal(root.userData.archiveCutouts.length,1);
const controller=protonPositionController(root);assert.equal(controller.rocket.visible,false);controller.setRocketVisible(true);assert.equal(controller.rocket.visible,true);
for(const id of ['pad-81','pad-200']){
 const g=new THREE.Group();g.scale.setScalar(.14);protonComplex(g,id);g.updateMatrixWorld(true);const pads=g.children.filter(c=>c.userData.protonLaunch);assert.equal(pads.length,2);
 const reference=PROTON_METRIC_REFERENCE[id];const parked=pads.map(p=>new THREE.Vector3(0,0,p.userData.protonLaunch.serviceZ).applyMatrix4(p.matrix));assert(Math.abs(parked[0].distanceTo(parked[1])-reference.gantrySeparationMetres)<1e-7,'Both calibrated parked gantry positions are preserved');
 for(const p of pads){assert.deepEqual(p.scale.toArray(),[1,1,1]);assert.equal(p.userData.protonLaunch.dimensions.outlets,2);assert.equal(p.userData.protonLaunch.features['rocket-support-seat'],6);assert.equal(p.userData.protonLaunch.features['cargo-passenger-lift'],2);assert.equal(p.userData.protonLaunch.features['service-ring-with-open-centre'],8);}
 const rockets=pads.map(p=>protonPositionController(p).rocket.children[0].children[0]);assert.equal(rockets[0].geometry,rockets[1].geometry,'Map positions reuse rocket geometry');assert.equal(rockets[0].material,rockets[1].material);
 assert.doesNotThrow(()=>JSON.stringify(g.userData),'Catalogue metadata has no scene graph cycles');
}
console.log('PROTON_LAUNCH_GEOMETRY_OK',{draws,triangles,positions:4,openOutlets:8,platforms:8,depth:8,calibratedPlan:true});
