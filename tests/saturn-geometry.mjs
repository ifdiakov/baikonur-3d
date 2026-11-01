import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildSaturnIP5} from '../src/saturn-ip5.js';
const root=new THREE.Group(),model=buildSaturnIP5(root),antennas=[],radomes=[],geometries=new Set();
let drawables=0,instances=0;
root.traverse(o=>{
 if(o.userData.antenna?.main)antennas.push(o);
 if(o.userData.museumComponent==='white-radome')radomes.push(o);
 if(!o.geometry)return;drawables++;geometries.add(o.geometry);
 if(o.isInstancedMesh){instances+=o.count;for(const n of o.instanceMatrix.array)assert(Number.isFinite(n),'Invalid instance transform');}
 o.geometry.computeBoundingBox();assert(!o.geometry.boundingBox.isEmpty());
});
for(const geo of geometries){for(const a of Object.values(geo.attributes))for(const n of a.array)assert(Number.isFinite(n),'Non-finite geometry attribute');if(geo.index)for(const i of geo.index.array)assert(i<geo.attributes.position.count);}
assert.equal(antennas.length,2);
const dimensions=antennas.map(a=>{
 const reflector=a.children.find(c=>c.userData.museumComponent==='25m-parabolic-reflector');assert(reflector);
 const size=reflector.geometry.boundingBox.getSize(new THREE.Vector3());assert(Math.abs(size.x-25)<1e-6);assert(Math.abs(size.z-25)<1e-6);assert(size.y>2.6&&size.y<2.8,'Reflecting surface must be shallow above its deep open backing');
 const frame=a.children.filter(c=>c.isInstancedMesh&&c.userData.components.includes('dish-radial-rib'));
 assert(frame.length>0);assert(frame.reduce((n,c)=>n+c.count,0)>900,'The backing needs real radial and concentric trusses');
 const bounds=new THREE.Box3().setFromObject(a);return bounds.getSize(new THREE.Vector3()).toArray();
});
assert.deepEqual(dimensions[0],dimensions[1],'Both P-200 installations must have identical dimensions');assert(antennas[0].position.distanceTo(antennas[1].position)>100);
assert.equal(radomes.length,1);const dome=radomes[0],size=dome.geometry.boundingBox.getSize(new THREE.Vector3());assert(Math.abs(size.x-size.y)<1e-5&&Math.abs(size.y-size.z)<1e-5,'Radome is a full sphere');assert.equal(dome.geometry.parameters.thetaLength,Math.PI);
const pedestals=[];root.traverse(m=>{if(m.isInstancedMesh&&m.userData.components.includes('antenna-pedestal'))pedestals.push(m);});assert.equal(pedestals.length,1);assert.equal(pedestals[0].count,2);
const transform=new THREE.Matrix4(),scale=new THREE.Vector3();for(let i=0;i<2;i++){pedestals[0].getMatrixAt(i,transform);scale.setFromMatrixScale(transform);assert(Math.abs(scale.y-17.75)<.001);assert(Math.abs(scale.x-scale.z)<.001);}
assert.equal(model.featureCounts['tower-horizontal-cornice'],12);assert.equal(model.featureCounts['elevation-gear-sector'],4);assert.equal(model.featureCounts['small-offset-dish'],2);assert.equal(model.featureCounts['auxiliary-reflector'],5);
assert.equal(root.userData.facilityLighting.boards.length,4);assert.equal(root.userData.facilityLighting.beacons.length,0);
const ray=new THREE.Raycaster(new THREE.Vector3(-92,20,-29),new THREE.Vector3(0,-1,0));const access=ray.intersectObject(root,true).filter(h=>h.object.userData.museumComponent==='internal-access-road');assert(access.length);assert(Math.abs(access[0].point.y-7.59)<1e-5,'Internal road must meet the preserved northwest gate at the same height');
assert(drawables<150,'Excessive separate draw calls for repeated trusses');assert(instances>10000);assert.equal(model.photosUsed.length,10);assert.equal(model.version,'saturn-photo-20261101-v2');assert.equal(model.access.preservedVerticalRaise,20);
console.log('SATURN_GEOMETRY_PASS',JSON.stringify({drawables,instances,uniqueGeometries:geometries.size,primaryDimensions:dimensions,radome:size.toArray(),version:model.version}));
