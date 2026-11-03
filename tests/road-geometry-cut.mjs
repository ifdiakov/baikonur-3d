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

// A removed cross-road must not chop a hole across the *still active*
// perpendicular mainline. Directional ownership is inferred from the
// batched source mesh, which no longer contains per-way metadata.
const sourceRoads=[
 {id:'osm-road-spur',width:2.2,points:[[0,0,-3],[0,0,3]]},
 {id:'osm-road-main',width:3.6,points:[[-10,0,0],[10,0,0]]}
];
const sourceCut=makeRoadSurfaceCutIndex([{sourceId:'osm-road-spur',width:2.2,
 points:[[0,0,-3],[0,0,3]]}],[],{sourceRoads});
const strip=(loX,hiX,loZ,hiZ)=>{
 const a=[loX,0,loZ],b=[hiX,0,loZ],c=[hiX,0,hiZ],d=[loX,0,hiZ];
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([...a,...c,...b,...a,...d,...c],3));
 return g;
};
const through=physicallyCutRoadGeometry(strip(-.6,.6,-1.8,1.8),sourceCut,
 {surfaceName:'OSM · единое дорожное полотно'});
assert(rays(through.geometry,[0,0]).length>0,
 'A deleted spur must not leave a hole through the perpendicular through-road');
const spur=physicallyCutRoadGeometry(strip(-1.3,1.3,-.6,.6),sourceCut,
 {surfaceName:'OSM · единое дорожное полотно'});
assert(rays(spur.geometry,[0,0]).length===0,'The requested source road must still be removed');
const withoutCrossing=makeRoadSurfaceCutIndex([{sourceId:'osm-road-spur',width:2.2,
 points:[[0,0,-3],[0,0,3]]}],[],{sourceRoads:[sourceRoads[0]]});
const fullyRemoved=physicallyCutRoadGeometry(strip(-.6,.6,-1.8,1.8),withoutCrossing,
 {surfaceName:'OSM · единое дорожное полотно'});
assert(!rays(fullyRemoved.geometry,[0,0]).length,
 'Do not leave old road fragments in the steppe when no live crossing exists');

// Restore the ACTUAL adjoining through-road, while still removing an old
// spur on both sides of its junction. The owner edit can cross in the
// middle of a long segment: its midpoint need not be at the intersection.
const mainRoad={id:'osm-road-521',width:3.6,points:[[-12,0,8],[12,0,8]]};
const obsoleteRoad={id:'osm-road-520',width:2.2,points:[[0,0,-15],[0,0,15]]};
const removeSpur=[{sourceId:obsoleteRoad.id,width:obsoleteRoad.width,points:obsoleteRoad.points}];
const indexRestored=makeRoadSurfaceCutIndex(removeSpur,[],{sourceRoads:[mainRoad,obsoleteRoad]});
assert(indexRestored.restoredCrossings>=1,'Source cross-road protection was not built');
const crossingPavement=strip(-12,12,6.2,9.8);
const crossingGeometry=physicallyCutRoadGeometry(crossingPavement,indexRestored,
 {surfaceName:'OSM · единое дорожное полотно'});
for(const x of [-1.0,-.5,0,.5,1.0])
 assert(rays(crossingGeometry.geometry,[x,8]).length>0,
  'Adjoining through road must be continuous at the deleted side-road junction, x='+x);
const erasedSpurMesh=strip(-1.1,1.1,-15,15);
const erasedSpur=physicallyCutRoadGeometry(erasedSpurMesh,indexRestored,
 {surfaceName:'OSM · единое дорожное полотно'});
for(const z of [-9,-5,-2,12])
 assert(rays(erasedSpur.geometry,[0,z]).length===0,
  'The obsolete spur must remain removed away from the active junction, z='+z);
assert(rays(erasedSpur.geometry,[0,8]).length>0,
 'The original junction may remain filled inside the protected through road');

// If BOTH source ways were removed by the owner, do not reconstruct either
// road at their crossing.
const bothHidden=makeRoadSurfaceCutIndex([...removeSpur,
 {sourceId:mainRoad.id,width:mainRoad.width,points:mainRoad.points}],[],
 {sourceRoads:[mainRoad,obsoleteRoad]});
const bothPavements=physicallyCutRoadGeometry(crossingPavement,bothHidden,
 {surfaceName:'OSM · единое дорожное полотно'});
assert(!rays(bothPavements.geometry,[0,8]).length,
 'Do not reintroduce a crossing when its main road was also explicitly removed');

// An elevated road does not protect a missing lower road just because their
// X/Z centerlines intersect.
const highRoad={...mainRoad,id:'osm-road-bridge',points:mainRoad.points.map(p=>[p[0],p[1]+5,p[2]])};
const underpassCuts=makeRoadSurfaceCutIndex(removeSpur,[],{sourceRoads:[obsoleteRoad,highRoad]});
assert.equal(underpassCuts.restoredCrossings,0,'A five-unit bridge is not a ground-level junction');
const exposedDeleted=physicallyCutRoadGeometry(erasedSpurMesh,underpassCuts,
 {surfaceName:'OSM · единое дорожное полотно'});
assert(!rays(exposedDeleted.geometry,[0,8]).length,'The cut must remain beneath an elevated bridge');
console.log('ROAD_PHYSICAL_GEOMETRY_PASS',JSON.stringify({
 version:ROAD_GEOMETRY_CUT_VERSION,clips:r.stats.clipped,triangles:r.stats.outputTriangles,
 remainder:rr.stats.outputTriangles,gradePreserved:true,uvPreserved:true
}));
