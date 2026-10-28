import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildRoadSurfaces,ROAD_PROFILE,subtractRoadPolygon} from '../src/road-surface.js';
import {buildTransportNetwork} from '../src/transport-network.js';
import {FACILITY_PORTS,portWorld} from '../src/facility-ports.js';

const v=(x,z,y=.72)=>new THREE.Vector3(x,y,z);
const line=(a,b)=>new THREE.LineCurve3(a,b);
const triangleCoverage=(mesh,x,z,y)=>{
 const a=mesh.geometry.attributes.position;let count=0;
 for(let i=0;i<a.count;i+=3){
  const ax=a.getX(i),az=a.getZ(i),bx=a.getX(i+1),bz=a.getZ(i+1),cx=a.getX(i+2),cz=a.getZ(i+2),d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
  if(Math.abs(d)<1e-10)continue;
  const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,w=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d,t=1-u-w;
  if(Math.min(u,w,t)>1e-6&&Math.abs(u*a.getY(i)+w*a.getY(i+1)+t*a.getY(i+2)-y)<.1)count++;
 }return count;
};
// A T junction must be one contiguous paved surface, including both rounded
// returns. Its two ribbons cannot remain duplicated beneath each other.
const parent=new THREE.Group();
const report=buildRoadSurfaces({parent,roads:[{id:'trunk',curve:line(v(-60,0),v(60,0)),width:8,marked:true},{id:'branch',curve:line(v(0,0),v(0,60)),width:6,marked:true}]});
const pavement=parent.getObjectByName('road-pavement-union'),shoulder=parent.getObjectByName('road-shoulder-union');
assert.equal(report.junctionCount,1);assert.equal(report.fillets,2);assert.equal(pavement.material.transparent,false);
let checked=0;
for(let x=-12.23;x<12;x+=.571234)for(let z=-9.17;z<13;z+=.613432){
 const layers=triangleCoverage(pavement,x,z,.72);assert.ok(layers<=1,'A junction must not contain coplanar pavement faces');
 if(Math.abs(z)<3.9||Math.abs(x)<2.9&&z>0)assert.equal(layers,1,'The junction cannot have a visible crack at '+x+','+z);
 if(layers)assert.equal(triangleCoverage(shoulder,x,z,.72-ROAD_PROFILE.shoulderDrop),0,'Shoulders are cut away beneath pavement');checked++;
}
const paint=parent.getObjectByName('road-center-dashes');
for(let i=0;i<paint.geometry.attributes.position.count;i++){
 const p=paint.geometry.attributes.position;assert.ok(Math.hypot(p.getX(i),p.getZ(i))>report.junctions[0].radius-.3,'Center paint stops outside the junction');
 assert.ok(Math.abs(p.getY(i)-(.72+ROAD_PROFILE.paintLift))<1e-6);
}
assert.ok(paint.material.polygonOffset&&paint.material.polygonOffsetUnits<0);
// A true overpass keeps its two elevations; flattening a 3D intersection is
// not an acceptable shortcut for removing z-fighting.
const bridgeParent=new THREE.Group();
buildRoadSurfaces({parent:bridgeParent,roads:[{id:'lower',curve:line(v(-20,0),v(20,0)),width:8},{id:'upper',curve:line(v(0,-20,8.22),v(0,20,8.22)),width:8}]});
const bridge=bridgeParent.getObjectByName('road-pavement-union');
assert.equal(triangleCoverage(bridge,.71,.93,.72),1);assert.equal(triangleCoverage(bridge,.71,.93,8.22),1);

const data=JSON.parse(fs.readFileSync('data/transport-network.json')),siteRecords=JSON.parse(fs.readFileSync('data/catalog.json')).sites;
const original=JSON.stringify(data),point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4),layers={roads:new THREE.Group(),rails:new THREE.Group()};
const network=buildTransportNetwork({data,siteRecords,point,layers});
assert.equal(JSON.stringify(data),original);assert.equal(network.stats().roadRoutes,24);
for(const [id,routeId]of [['pad-110','r-complex-110'],['pad-42','r-site42-access']]){
 const site=siteRecords.find(s=>s.id===id),gate=portWorld(FACILITY_PORTS[id],FACILITY_PORTS[id].road,site,point),path=network.roadPaths().find(r=>r.id===routeId);
 assert.ok(path.points.at(-1).distanceTo(gate)<1e-6,routeId+' must meet the relocated model entrance');
 const endDirection=path.points.at(-1).clone().sub(path.points.at(-2)).setY(0).normalize(),outward=new THREE.Vector3(...(FACILITY_PORTS[id].roadOutward||[0,0,1]));
 assert.ok(endDirection.dot(outward)<-.99,routeId+' must align with the internal driveway');
}
const n=network.stats().roadSurface;
assert.ok(n.clippedPavementSections>100&&n.clippedShoulderSections>100);assert.ok(n.markingSegments>100);
assert.ok(n.junctions.some(j=>j.roadIds.includes('r-site23-saturn-access')),'Saturn joins the same pavement/marking layout');
assert.ok(n.junctions.some(j=>j.roadIds.includes('r-site42-access')),'The Site 42 entrance leaves an open marking gap');
assert.ok(n.pavementTriangles<50000&&n.shoulderTriangles<100000,'The network remains practical for the interactive scene');
for(const mesh of [layers.roads.getObjectByName('road-pavement-union'),layers.roads.getObjectByName('road-shoulder-union')])for(const number of mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(number));
console.log('ROAD_SURFACES_GEOMETRY_PASS',JSON.stringify({junctionSamples:checked,junctions:n.junctionCount,fillets:n.fillets,pavementTriangles:n.pavementTriangles,shoulderTriangles:n.shoulderTriangles,markings:n.markingSegments}));
