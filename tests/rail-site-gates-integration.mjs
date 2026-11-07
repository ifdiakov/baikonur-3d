import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmTransportNetwork} from '../src/osm-transport.js';
import {RAIL_PROFILE} from '../src/rail-profile.js';
import {SITE110_REFERENCE} from '../src/site110.js';

const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url)));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const siteRecords=geography.sites.filter(s=>!s.aliasOf&&s.render!==false);
const site110=siteRecords.find(s=>s.id==='pad-110');
[site110.x,site110.y]=geography.project(...SITE110_REFERENCE.originLonLat);
const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),
 railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson'),
 airports:read('data/osm/airports.geojson')};
const sourceSnapshot=JSON.stringify(data),layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),
 geography,point,layers,siteRecords});
assert.equal(JSON.stringify(data),sourceSnapshot,'Never edit the real OSM rail geometry');
const stats=transport.stats(),ports=stats.facilityRailPorts;
const expected={'pad-254':1,'pad-90':2,'pad-110':4,'pad-112a':4,'pad-31':1,'pad-45':1,'pad-250':2};
assert.equal(ports.length,15,'All 15 physical rail sockets must be present in the cleaned scene');
for(const [site,count] of Object.entries(expected)){
 const actual=ports.filter(p=>p.id===site);
 assert.equal(actual.length,count,site+': a physical rail entrance disappeared');
 for(const p of actual){
  assert(p.points.length>4,'The port needs a real continuous rendered approach: '+p.portId);
  assert(p.headCenterGap<1e-7&&p.networkDatumGap<1e-7,'Rail alignment gap: '+p.portId);
  assert.equal(p.portGauge,RAIL_PROFILE.gauge);
  assert.equal(p.networkGauge,RAIL_PROFILE.gauge);
  const a=new THREE.Vector3(...p.points[0]),b=new THREE.Vector3(...p.sourcePoint);
  assert(a.distanceTo(b)<1e-7,'Rail-to-source seam gap: '+p.portId);
 }
}
const ukss=ports.filter(p=>p.id==='pad-250');
assert.equal(new Set(ukss.map(p=>p.portId)).size,2,'UKSS has two distinct railway gates');
assert(!transport.roadPaths().some(r=>r.id==='osm-access-pad-250'),
 'The UKSS railway repair must not add a second overlapping car road');
assert.equal(stats.railScheme.protectedRemovedEdges,0,'A protected station line was removed');
assert.equal(stats.railScheme.connectionCount,20,'The 20 station relationships must remain');
assert.equal(stats.branchSimplification.rail.matchingVersion,'site-matched-rail-ends-v1');
assert(stats.branchSimplification.rail.removedTerminalEnds>0,'Unassigned rail dead ends were not cut');
// Owner's 07.11.2026 corrections: a smoothly connected Saturn driveway
// and a single unbroken visible main railway opposite Site 5.
assert.equal(stats.saturnAccess?.status,'connected','Saturn must have a real AD driveway to its northwest gate');
const saturnDrive=transport.roadPaths().find(r=>r.id==='r-site23-saturn-access');
assert(saturnDrive?.points.length>5,'Saturn access must be a sampled, continuous curved surface');
assert(stats.saturnAccess.roadGap<.001&&stats.saturnAccess.gateGap<.001,'Saturn access has a disconnected endpoint');
for(const hiddenId of ['172458462','172458465'])
 assert(!transport.routes.rail.some(r=>r.osmWayIds?.includes(hiddenId)),
  'Redundant railway branch opposite Site 5 is still visible: '+hiddenId);
assert(transport.routes.rail.some(r=>r.osmWayIds?.includes('37543646')),
 'The main Site 5 railway must remain visible');
// 07 Nov corrections: one intentional AD to each twin silo and a viewing
// platform anchored at a retained dead-end road by Donskaya station.
for(const id of ['pad-106','pad-109']){
 const entry=stats.twinSiloConnections?.find(x=>x.id===id);
 assert.equal(entry?.status,'connected',id+': dedicated AD driveway not connected');
 assert(entry.sourceGap<1e-6&&entry.gateGap<1e-6,id+': AD has a seam gap');
 assert(transport.roadPaths().some(r=>r.id==='silo-single-driveway-'+id),
  id+': dedicated AD is not rendered');
}
assert.equal(stats.donskayaObservation?.status,'placed','Donskaya NP must sit at a retained AD dead end');
assert(stats.donskayaObservation.stationDistance<470,'Donskaya NP is not near the station');
assert(['not-needed','connected'].includes(stats.twinThroughRepair.status),
 'Through AD 106/109 repair has an invalid state');
const train=transport.trainPath();
assert(train.path.points.length>10&&train.osmWayIds.length>0,'The train route is no longer connected');
console.log('RAIL_SITE_GATES_INTEGRATION_PASS',JSON.stringify({
 railPortCount:ports.length,bySite:expected,prunedTips:stats.branchSimplification.rail.removedTerminalEnds,
 removedSegments:stats.branchSimplification.rail.removedSegments,
 retainedStationLinks:stats.railScheme.connectionCount,trainWayIds:train.osmWayIds}));
