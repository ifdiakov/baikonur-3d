import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeRoadSurfaceCutIndex,physicallyCutRoadGeometry,ROAD_GEOMETRY_CUT_VERSION}
 from '../src/road-geometry-cut.js';

const pavement=new THREE.BufferGeometry();
pavement.setAttribute('position',new THREE.Float32BufferAttribute([
 -12,0,-8,12,0,-8,12,0,8,-12,0,-8,12,0,8,-12,0,8
],3));
pavement.setAttribute('uv',new THREE.Float32BufferAttribute([
 0,0,1,0,1,1,0,0,1,1,0,1
],2));
function rays(geometry,point,y=0){
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 const ray=new THREE.Raycaster(new THREE.Vector3(point[0],15,point[1]),new THREE.Vector3(0,-1,0),0,35);
 return ray.intersectObject(mesh,false).filter(h=>Math.abs(h.point.y-y)<.1);
}
const cutIndex=makeRoadSurfaceCutIndex([{sourceId:'osm-road-45',width:3.6,points:[[0,0,-6],[0,0,6]]}],[]);
assert(cutIndex.clips>0);
const r=physicallyCutRoadGeometry(pavement,cutIndex);
assert.equal(r.stats.withUV,true);
assert(r.stats.clipped>=2);
assert.equal(r.geometry.getAttribute('uv').count,r.geometry.getAttribute('position').count);
assert.equal(rays(r.geometry,[0,0]).length,0,'Deleted centerline must have no road geometry');
assert.equal(rays(r.geometry,[0,3.0]).length,0,'Deleted road edge must also be gone');
assert(rays(r.geometry,[5,0]).length>0,'The live shoulder beyond the deleted road must remain');
assert(rays(r.geometry,[0,7]).length>0,'A butt end must not bite into the continuing OSM road');
const ramp=makeRoadSurfaceCutIndex([],[{id:'new',width:3.6,widths:[3.6,2],points:[[0,0,-6],[0,0,6]]}]);
const rr=physicallyCutRoadGeometry(pavement,ramp);
assert.equal(rays(rr.geometry,[0,0]).length,0,'Original asphalt must be replaced by new ownership');
const elevated=new THREE.BufferGeometry();
elevated.copy(pavement);
const elevatedPos=elevated.getAttribute('position');for(let i=0;i<elevatedPos.count;i++)elevatedPos.setY(i,5);
const elevatedResult=physicallyCutRoadGeometry(elevated,cutIndex);
assert(rays(elevatedResult.geometry,[0,0],5).length>0,'Cutting the road must not remove a flyover');
const reversion=physicallyCutRoadGeometry(pavement,makeRoadSurfaceCutIndex([],[]));
assert.equal(reversion.stats.clipped,0);
assert.equal(reversion.geometry.getAttribute('position').count,6,'An Undo must restore original geometry');
console.log('ROAD_PHYSICAL_GEOMETRY_PASS',JSON.stringify({
 version:ROAD_GEOMETRY_CUT_VERSION,clips:r.stats.clipped,triangles:r.stats.outputTriangles,
 remainder:rr.stats.outputTriangles,gradePreserved:true,uvPreserved:true
}));
