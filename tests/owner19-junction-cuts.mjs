import assert from 'node:assert/strict';import * as THREE from 'three';
import {makeRoadSurfaceCutIndex,physicallyCutRoadGeometry} from '../src/road-geometry-cut.js';
import {partitionRoadMaskStrokes,roadMaskCoverageWidth} from '../src/road-mask-tiles.js';
const road={id:'road-8',width:3.1,style:'asphalt',points:[[0,0,8],[0,0,2],[0,0,1],[0,0,.25],[0,0,0]]};
const p=new THREE.BufferGeometry();p.setAttribute('position',new THREE.Float32BufferAttribute([-10,0,-2,10,0,-2,10,0,2,-10,0,-2,10,0,2,-10,0,2],3));
const {geometry}=physicallyCutRoadGeometry(p,makeRoadSurfaceCutIndex([],[road]));
const m=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
let samples=0;for(const x of [-1,-.4,0,.4,1])for(const z of [-.03,-.1,-.3,-.6,-1]){const r=new THREE.Raycaster(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0));assert(r.intersectObject(m).length,'Junction cut leaked past the butt end '+[x,z]);samples++;}
for(const part of partitionRoadMaskStrokes([],[road]).tiles.flat())for(const [enabled,point]of [[part.capStart,part.a],[part.capEnd,part.b]])if(enabled)assert(point[2]>=roadMaskCoverageWidth(part.width,'added')/2,'Shader mask cap leaks past terminal plane');
console.log('OWNER19_JUNCTION_CUT_PASS',JSON.stringify({sourceSamples:samples,shaderCapsWithinEnds:true}));
