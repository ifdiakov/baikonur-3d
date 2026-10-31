import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildSite41} from '../src/site41.js';
import {SITE41_ACCESS,SITE41_VERSION,SITE41_VIEWS} from '../src/site41-profile.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createEastLightingZone} from '../src/east-lighting-zone.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const catalog=read('data/catalog.json'),matches=read('data/osm/catalog-matches.json'),roads=read('data/osm/roads.geojson');
const snapshot=JSON.stringify({catalog,matches,roads}),g=createMuseumGeography({catalog,matches}),site=g.sites.find(s=>s.id==='pad-41'),s42=g.sites.find(s=>s.id==='pad-42');
const source=g.project(site.geoSource.sourceLonLat),offset=[site.x-source[0],site.y-source[1]];
assert(Math.abs(Math.hypot(...offset)-30)<1e-9,'Requested displacement is exactly30 map units');
assert(Math.hypot(site.x-s42.x,site.y-s42.y)>Math.hypot(source[0]-s42.x,source[1]-s42.y),'The new point is farther from42');
const way=roads.features.find(f=>String(f.properties.osmId)==='172837000'),ids=way.properties.sourceNodeIds;
const a=g.project(way.geometry.coordinates[ids.indexOf(1836853647)]),b=g.project(way.geometry.coordinates[ids.indexOf(1836853974)]),axis=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...axis);
assert((offset[0]*axis[0]+offset[1]*axis[1])/(30*length)>1-1e-10,'The displacement follows the actual source access-road direction');
assert.equal(site.geoSource.refs[0].id,169401013);assert.equal(site.firstYear,1960);
const without=createMuseumGeography({catalog:{...catalog,sites:catalog.sites.filter(s=>s.id!=='pad-41')},matches});
for(const old of without.sites){const now=g.sites.find(s=>s.id===old.id);assert.deepEqual([now.x,now.y],[old.x,old.y],'No other exhibit moves: '+old.id);}
const root=new THREE.Group();root.position.set((site.x-650)*3.4,SITE41_ACCESS.elevation,(site.y-522.5)*3.4);root.scale.setScalar(SITE41_ACCESS.scale);
const built=buildSite41(root),m=root.userData.site41;root.updateWorldMatrix(true,true);
assert.equal(built.version,SITE41_VERSION);assert.equal(m.reference.photographs.length,7);assert.equal(m.reference.satellite,'1zGG6SWGEht9G7_PzKEl1qqRxX2cwdNY8');
const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
assert(size.x>55&&size.x<75&&size.z>60&&size.z<80,'The full compound replaces the former small ruin fragment');
assert(m.components.some(p=>p.name==='memorial')&&m.components.some(p=>p.name==='command-post')&&m.components.some(p=>p.name==='ruined-service-building'));
const ray=new THREE.Raycaster(),port=new THREE.Vector3(...SITE41_ACCESS.road),path=m.roads[0],next=new THREE.Vector3(path.points[1][0],.12,path.points[1][1]);
const tangent=next.clone().sub(port).setY(0).normalize(),normal=new THREE.Vector3(-tangent.z,0,tangent.x);let portProbes=0;
for(const offset of[-2.9,-1.5,0,1.5,2.9]){
 const p=port.clone().addScaledVector(tangent,.3).addScaledVector(normal,offset),world=root.localToWorld(p.clone());
 ray.set(world.clone().add(new THREE.Vector3(0,5,0)),new THREE.Vector3(0,-1,0));
 const hits=ray.intersectObject(root,true).filter(h=>Math.abs(h.point.y-world.y)<.002);
 assert(hits.length,'The actual gate road supports its full declared width');portProbes++;
}
const well=built.cutouts[0];assert.equal(well.shape,'rectangle');
const memorial=m.components.find(c=>c.name==='memorial');assert(memorial.bounds.min[1]<0&&memorial.bounds.max[1]>5,'The launch-base well is recessed and the red stela rises above it');
// The own-model apron and weathered tiles must leave the real depression
// open; cutting only the surrounding terrain would still hide its floor.
let wellProbes=0;
for(const [dx,dz,top]of [[1.1,.85,-.79],[-1.1,.85,-.79],[.55,2.0,-.79],[-.55,2.0,-.79],[3.5,3.5,-1.25],[-3.5,3.5,-1.25]]){
 const origin=root.localToWorld(new THREE.Vector3(well.x+dx,8,well.z+dz));ray.set(origin,new THREE.Vector3(0,-1,0));
 const hit=ray.intersectObject(root,true)[0];assert(hit,'The memorial depression has a physical base');
 const actual=root.worldToLocal(hit.point.clone()).y;assert(Math.abs(actual-top)<.015,'A surface seals the memorial well: '+JSON.stringify({dx,dz,actual,expected:top}));wellProbes++;
}
let meshCount=0,vertices=0;
root.traverse(o=>{if(!o.isMesh)return;meshCount++;assert(o.geometry.boundingSphere?.radius>=0||o.geometry.attributes.position);const p=o.geometry.attributes.position;for(const n of p?.array||[]){assert(Number.isFinite(n));vertices++;}});
assert(meshCount<45,'Detailed reconstruction remains batched');
for(const view of Object.values(SITE41_VIEWS)){assert(view.eye[1]>view.target[1]);assert(view.eye.concat(view.target).every(Number.isFinite));}
const zone=createEastLightingZone({facilities:read('data/osm/facilities.geojson'),project:(lon,lat)=>{const p=g.project(lon,lat);return[(p[0]-650)*3.4,(p[1]-522.5)*3.4];}});
assert(!zone.isPowered(root.position.x,root.position.z),'Moved historical site remains in its existing unpowered region');
assert.equal(JSON.stringify({catalog,matches,roads}),snapshot,'Source documents and geography are immutable');
console.log('SITE41_GEOMETRY_PASS',JSON.stringify({mapOffset:offset,worldDisplacement:Math.hypot(...offset)*3.4,roadAxisDot:(offset[0]*axis[0]+offset[1]*axis[1])/(30*length),worldBounds:size.toArray(),meshCount,vertices,portProbes,wellProbes,photographs:7}));
