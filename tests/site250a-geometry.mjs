import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildSite250a} from '../src/site250a.js';
import {SITE250A_ACCESS as access} from '../src/site250a-layout.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmTransportNetwork} from '../src/osm-transport.js';
import {FACILITY_PORTS,portWorld} from '../src/facility-ports.js';
const V=(...p)=>new THREE.Vector3(...p),near=(a,b,t=.001)=>assert(Math.abs(a-b)<t,`${a} differs from ${b}`);
const root=new THREE.Group(),built=buildSite250a(root);root.updateMatrixWorld(true);
const down=(x,z)=>new THREE.Raycaster(V(x,100,z),V(0,-1,0)).intersectObject(root,true);
near(down(49,10)[0].point.y,9.5);
const slope=down(32,10)[0].point.y;assert(slope>3&&slope<6,'Concrete mound slope is visible and sloping, not a vertical box');
near(down(164,-16)[0].point.y,access.road[1]);
near(down(22,16)[0].point.y,7.5,.02);
let triangles=0;root.traverse(m=>{if(!m.isMesh)return;const p=m.geometry.attributes.position;assert([...p.array].every(Number.isFinite));triangles+=(m.geometry.index?.count??p.count)/3*(m.count??1);});
assert(built.meshCount<30&&triangles<40000,'Compact static geometry budget');
const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const catalog=read('data/catalog.json'),matches=read('data/osm/catalog-matches.json');
const live=catalog.sites.filter(s=>!s.aliasOf&&s.render!==false);
assert.equal(live.filter(s=>s.number==='250А').length,1,'Only one live 250A complex');
assert.equal(catalog.sites.find(s=>s.id==='pad-250а').aliasOf,'pad-250a');
assert(live.some(s=>s.id==='pad-250'),'UKSS remains a separate site');
assert.deepEqual(catalog.sites.find(s=>s.id==='pad-250a')&&[catalog.sites.find(s=>s.id==='pad-250a').x,catalog.sites.find(s=>s.id==='pad-250a').y],[608,239]);
const geography=createMuseumGeography({catalog,matches}),site=geography.sites.find(s=>s.id==='pad-250a'),spec=ARCHIVE_MAP.find(s=>s.id==='pad-250a');
assert.equal(spec.scale,access.scale);assert.equal(spec.yaw,access.yaw);
const pad1=geography.sites.find(s=>s.id==='pad-1'),pad2=geography.sites.find(s=>s.id==='pad-2');pad2.x=pad1.x-19;pad2.y=pad1.y+7;
const point=(x,y,h=0)=>V((x-650)*3.4,h,(y-522.5)*3.4),layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data:{roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson')},legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false)});
const stats=transport.stats(),road=stats.facilityPorts.find(p=>p.id==='pad-250a'),through=stats.facilityPorts.find(p=>p.id==='pad-250a-to-pad-250');
assert(road&&through,'Both external access and owner-requested UKSS connection survive');near(road.roadGap,0);
assert.equal(road.profile,'perimeter-bypass-with-gate-spur','250A requires a proper passing road with its own short entrance');
assert(!transport.roadPaths().some(r=>r.id==='osm-access-pad-250a'),'Duplicate 250A external road remains');
const cryoCleanup=stats.exhibitRoadSimplification.regions.find(r=>r.id==='pad-250a');
assert(cryoCleanup&&cryoCleanup.hiddenEdgeCount>0,'250A OSM service-road web was not cleaned');
const owner=read('data/road-edits-authoritative-20261103.json');
assert(!owner.added.some(r=>r.id==='road-7'),'Obsolete 250A asphalt strip is still published');
assert(!owner.hidden.some(h=>['museum-yubileiny-250a-ukss','osm-access-pad-250a','osm-road-54568055','osm-road-54568055-1'].includes(h.sourceId)),
 'Old 250A surface cutouts must not split the preserved through access');
const gate=portWorld(access,access.road,site,point).toArray();
const route=transport.roadPaths().find(r=>r.id==='museum-yubileiny-250a-ukss');
const gateSpur=transport.roadPaths().find(r=>r.id==='museum-pad-250a-gate-spur');
assert(route&&gateSpur,'The single through road and Site 250A gate spur must both exist');
assert(!transport.roadPaths().some(r=>r.id==='osm-access-pad-250'),
 'Do not draw a second UKSS driveway over the passing road');
assert(!transport.editableRoadPaths().some(r=>/^osm-road-54568055(?:-|$)/.test(r.id)),
 'The obsolete OSM source ribbon must not remain under its reconstructed bypass');
assert(route.points.length>110&&gateSpur.points.length>10,
 'Real through-road and gate approach must have densely sampled meshes');
const gateV=V(...gate);
assert(gateSpur.points.at(-1).distanceTo(gateV)<1e-7,'The gate spur stops exactly at the photographed 250A gate');
const centre=point(site.x,site.y,0),c=Math.cos(access.yaw),s=Math.sin(access.yaw);
let clearance=Infinity,nearestGate=Infinity,maxStep=0,maxSlope=0;
for(let i=0;i<route.points.length;i++){
 const p=route.points[i],dx=p.x-centre.x,dz=p.z-centre.z,
  lx=c*dx-s*dz,lz=s*dx+c*dz;
 nearestGate=Math.min(nearestGate,Math.hypot(p.x-gateV.x,p.z-gateV.z));
 if(lz>=-138*access.scale-route.width/2&&lz<=160*access.scale+route.width/2)
  clearance=Math.min(clearance,lx-160*access.scale-route.width/2);
 if(i){
  const prev=route.points[i-1],d=Math.hypot(p.x-prev.x,p.z-prev.z);
  maxStep=Math.max(maxStep,d);if(d>0)maxSlope=Math.max(maxSlope,Math.abs(p.y-prev.y)/d);
 }
}
assert(clearance>3,'The through carriageway cuts across the 250A compound perimeter');
assert(nearestGate>5,'The main road must pass by 250A instead of turning through the gate');
assert(maxStep<1.5,'Discontinuous road sampling leaves holes in the asphalt');
assert(maxSlope<.085,'The 250A bypass must have a gentle road grade rather than a steep switchback');
const ukss=geography.sites.find(s=>s.id==='pad-250'),ukssSpec=FACILITY_PORTS['pad-250'];
const ukssGate=portWorld(ukssSpec,ukssSpec.road,ukss,point);
assert(route.points.at(-1).distanceTo(ukssGate)<1e-7,
 'The new road does not join the real UKSS gate');
assert.equal(through.profile,'osm-centreline-perimeter-bypass');
assert(through.minimumSiteClearance>3);
assert(through.maxGrade<.085,'The main and gate approach have an excessive slope');
assert.equal(through.throughVersion,'osm-54568055-smooth-ukss-road-v2');
assert.doesNotThrow(()=>JSON.stringify(built));
console.log('SITE250A_GEOMETRY_PASS',JSON.stringify({drawCalls:built.meshCount,triangles,roadGap:road.roadGap,through,gate}));
