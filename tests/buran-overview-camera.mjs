import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {FLANK_OUTLINE} from '../src/flank-boundaries.js';
import {AIRPORT_SCALE,airportDisplaySpec} from '../src/airport-models.js';
import {createBuranLandingPath} from '../src/buran-landing-path.js';
import {fitBuranOverviewCamera} from '../src/buran-landing.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const runway=read('data/osm/airports.geojson').features.find(f=>f.properties.osmId===24949215&&f.geometry.type==='LineString');
const V=(...p)=>new THREE.Vector3(...p),project=coord=>{const p=geography.project(coord);return V((p[0]-650)*3.4,0,(p[1]-522.5)*3.4);};
const a=project(runway.geometry.coordinates[0]),b=project(runway.geometry.coordinates.at(-1)),sign=b.x>=a.x?1:-1;
const airport=new THREE.Group();airport.position.copy(a.clone().lerp(b,.5)).setY(-2.72);
airport.rotation.y=Math.atan2((b.x-a.x)*sign,(b.z-a.z)*sign);airport.scale.setScalar(AIRPORT_SCALE);
airport.userData.airport=airportDisplaySpec('yubileiny');airport.updateWorldMatrix(true,true);
const bounds={minX:(Math.min(geography.bounds.minX,...FLANK_OUTLINE.map(p=>p[0]))-650)*3.4,
 maxX:(Math.max(geography.bounds.maxX,...FLANK_OUTLINE.map(p=>p[0]))-650)*3.4,
 minZ:(Math.min(geography.bounds.minY,...FLANK_OUTLINE.map(p=>p[1]))-522.5)*3.4,
 maxZ:(Math.max(geography.bounds.maxY,...FLANK_OUTLINE.map(p=>p[1]))-522.5)*3.4};
const path=createBuranLandingPath({airfield:airport,bounds}),spec=airport.userData.airport;
const corners=[-1,1].flatMap(end=>[-1,1].map(side=>airport.localToWorld(V(side*spec.width/2,spec.runwayY,end*spec.length/2))));
const points=[...path.points,...corners],before=JSON.stringify(points),fov=52,padding=6;
const cases=[
 {width:1600,height:1000,rect:{left:385,right:1550,top:42,bottom:712}},
 {width:375,height:812,rect:{left:50,right:325,top:167,bottom:495}},
 {width:320,height:812,rect:{left:50,right:270,top:167,bottom:477}},
 {width:1024,height:768,rect:{left:385,right:974,top:42,bottom:468}}
];
let checks=0;const results=[];
for(const viewport of cases){
 const fit=fitBuranOverviewCamera({points,...viewport,fov,padding});
 assert.equal(fit.pointCount,564);assert.equal(fit.version,'buran-overview-fit-v1');
 assert([...fit.position,...fit.target,fit.distance].every(Number.isFinite));
 assert(fit.target[0]>=bounds.minX&&fit.target[0]<=bounds.maxX&&fit.target[2]>=bounds.minZ&&fit.target[2]<=bounds.maxZ,'The normal museum target clamp must not alter this fitted pose');
 const camera=new THREE.PerspectiveCamera(fov,viewport.width/viewport.height,.1,80000);
 camera.position.fromArray(fit.position);camera.lookAt(V(...fit.target));camera.updateMatrixWorld(true);
 const offset=camera.position.clone().sub(V(...fit.target));
 assert(Math.atan2(offset.y,Math.hypot(offset.x,offset.z))>=Math.PI/6,'Overview retains the museum minimum elevation');
 const actual={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
 for(const point of points)for(const dx of [-padding,padding])for(const dy of [-padding,padding])for(const dz of [-padding,padding]){
  const p=point.clone().add(V(dx,dy,dz)).project(camera),x=(p.x+1)*viewport.width/2,y=(1-p.y)*viewport.height/2;
  assert(p.z>-1&&p.z<1,'A route/aircraft-envelope point leaves the real perspective depth range');
  assert(x>=viewport.rect.left-1e-7&&x<=viewport.rect.right+1e-7&&y>=viewport.rect.top-1e-7&&y<=viewport.rect.bottom+1e-7,
   'The physical 3D route or runway extends behind the sidebar/header/event panel: '+JSON.stringify({viewport,point:point.toArray(),x,y}));
  actual.minX=Math.min(actual.minX,x);actual.maxX=Math.max(actual.maxX,x);actual.minY=Math.min(actual.minY,y);actual.maxY=Math.max(actual.maxY,y);checks++;
 }
 assert(Math.max((actual.maxX-actual.minX)/(viewport.rect.right-viewport.rect.left),(actual.maxY-actual.minY)/(viewport.rect.bottom-viewport.rect.top))>.9,'Overview makes useful use of the unobscured area');
 results.push({width:viewport.width,height:viewport.height,distance:fit.distance,eyeY:fit.position[1],actual});
}
// A resize cycle always recomputes from immutable physical samples. It cannot
// accumulate an offset or inherit the previous phone's larger camera radius.
const initial=fitBuranOverviewCamera({points,...cases[0],fov,padding});
fitBuranOverviewCamera({points,...cases[1],fov,padding});
assert.deepEqual(fitBuranOverviewCamera({points,...cases[0],fov,padding}),initial);
assert.equal(JSON.stringify(points),before,'Camera fitting mutated the historical path or native runway geometry');
console.log('BURAN_OVERVIEW_CAMERA_PASS',JSON.stringify({sourceRunway:24949215,points:points.length,projectionChecks:checks,viewports:results,sourceUnchanged:true}));
