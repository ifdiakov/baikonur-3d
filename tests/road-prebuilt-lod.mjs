import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoadLOD,ROAD_LOD_VERSION} from '../src/road-lod.js';
const json={version:ROAD_LOD_VERSION,sourceHash:'test',levels:{
 far:{roads:[{id:'a',w:6,points:[[63.1,45.9],[63.2,45.9]]}],rails:[{id:'r',w:2,points:[[63.2,45.91],[63.3,45.91]]}]},
 medium:{roads:[{id:'a',w:6,points:[[63.1,45.9],[63.2,45.9],[63.3,45.9]]}],rails:[]}
}};
const scene=new THREE.Scene(),geography={project:(lon,lat)=>[(lon-63)*1000,(lat-45)*1000]};
const point=(x,z,y)=>new THREE.Vector3(x,y,z);
const preview=createRoadLOD({data:json,geography,point,scene});
const road=new THREE.Group(),rail=new THREE.Group();
assert.equal(preview.update(1500,[road,rail]),'far');
assert(!road.visible&&!rail.visible);
assert.equal(preview.stats().levels.far.roads.triangles,2);
assert.equal(preview.update(600,[road,rail]),'medium');
assert.equal(preview.update(80,[road,rail]),'full');
assert(road.visible&&rail.visible);
assert.equal(preview.stats().mode,'full');
assert(scene.children.includes(preview.root));
preview.destroy();assert(!scene.children.includes(preview.root));
console.log('ROAD_PREBUILT_LOD_UNIT_PASS');
