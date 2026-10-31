import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmGraph,buildOsmTransportNetwork} from '../src/osm-transport.js';
import {SATURN_ACCESS} from '../src/saturn-access.js';
import {buildMik112,MIK112} from '../src/mik112.js';
import {buildMzkSdi,MZK_SDI_REFERENCE} from '../src/mzk-sdi.js';
import {buildSite110,SITE110_REFERENCE} from '../src/site110.js';
import {MUSEUM_METRE} from '../src/museum-scale.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),
 railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson'),airports:read('data/osm/airports.geojson')};
const original=JSON.stringify(data),siteRecords=geography.sites.filter(s=>!s.aliasOf&&s.render!==false);
const site110=siteRecords.find(s=>s.id==='pad-110');
[site110.x,site110.y]=geography.project(...SITE110_REFERENCE.originLonLat);
// Use the same actual runway poses as the museum; the northern end of this
// source way joins the existing display bypass at Yubileiny.
for(const [id,wayId] of [['airfield',37591623],['pad-251',24949215]]){
 const site=siteRecords.find(s=>s.id===id),runway=data.airports.features.find(f=>f.properties.osmId===wayId&&f.geometry.type==='LineString');
 const a=geography.project(...runway.geometry.coordinates[0]),b=geography.project(...runway.geometry.coordinates.at(-1));
 site.x=(a[0]+b[0])/2;site.y=(a[1]+b[1])/2;
 const sign=b[0]>=a[0]?1:-1;site.runtimeYaw=Math.atan2((b[0]-a[0])*sign,(b[1]-a[1])*sign);
}
const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords});
assert.equal(JSON.stringify(data),original,'Display repairs must not rewrite source geography');
const stats=transport.stats(),paths=transport.roadPaths();
assert.equal(stats.saturnAccess,null,'The owner removed the external reconstructed Saturn approach');
assert(!paths.some(r=>r.id===SATURN_ACCESS.routeId),'The retired approach must not be supplied to road lighting');
assert(!transport.routes.road.some(r=>r.id===SATURN_ACCESS.routeId));
const retiredGeometry=[];
layers.roads.traverse(o=>{if(/saturn-northwest-road|Сатурн · северо-западный подъезд/.test(o.name))retiredGeometry.push(o.name);});
assert.deepEqual(retiredGeometry,[],'The retired approach must not leave its embankment or surface group');

const graph=buildOsmGraph(data.roads.features,{geography,point}),way=graph.ways.find(w=>w.osmId==='183464610');
assert.equal(way.tags.highway,'tertiary');assert.equal(way.width,3.1);
const visible=paths.filter(r=>r.source==='OpenStreetMap'&&r.osmWayIds?.includes(way.osmId));
assert.equal(visible.length,1,'One source through-road must render as one continuous run, without duplicate patches');
const sourceNodes=[way.segments[0].a,...way.segments.map(e=>e.b)];
const start=sourceNodes.findIndex(n=>n.id==='1834614013'),end=sourceNodes.findIndex(n=>n.id==='309351101');
assert(start>=0&&end>start,'The established corridor endpoints must remain on the same source way');
const corridor=sourceNodes.slice(start,end+1),bounds=new THREE.Box3().setFromPoints(corridor.map(n=>n.position)).expandByScalar(10);
for(let i=1;i<corridor.length;i++)assert(corridor[i-1].edges.some(e=>e.wayId===way.osmId&&[e.a,e.b].includes(corridor[i])),'The corridor must retain shared-node source topology');
const join=graph.nodes.get('309351101');assert(join.edges.some(e=>e.wayId==='173082916'),'The corridor must still meet the primary road');

// Query the rendered triangle buffers, not path endpoints or cached gap
// metadata. A half-unit longitudinal grid crosses all three former mask gaps.
function surfaceQuery(name){
 const mesh=layers.roads.getObjectByName(name);assert(mesh,name+' is missing');
 const pos=mesh.geometry.attributes.position,index=mesh.geometry.index,cells=new Map(),cell=8;
 for(let i=0;i<index.count;i+=3){
  const t=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(pos,index.getX(i+k)));
  const box=new THREE.Box3().setFromPoints(t);if(!box.intersectsBox(bounds))continue;
  for(let x=Math.floor(box.min.x/cell);x<=Math.floor(box.max.x/cell);x++)for(let z=Math.floor(box.min.z/cell);z<=Math.floor(box.max.z/cell);z++){
   const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(t);
  }
 }
 return p=>{
  for(const [a,b,c] of cells.get(Math.floor(p.x/cell)+':'+Math.floor(p.z/cell))||[]){
   const d=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(d)<1e-10)continue;
   const u=((b.z-c.z)*(p.x-c.x)+(c.x-b.x)*(p.z-c.z))/d;
   const v=((c.z-a.z)*(p.x-c.x)+(a.x-c.x)*(p.z-c.z))/d,w=1-u-v;
   if(Math.min(u,v,w)>=-1e-5&&Math.abs(u*a.y+v*b.y+w*c.y-p.y)<.08)return true;
  }
  return false;
 };
}
const asphalt=surfaceQuery('OSM · единое дорожное полотно'),shoulder=surfaceQuery('OSM · единые обочины');
const probes=[],oldMasks=[['pad-112',35],['pad-112a',40],['pad-110',72]].map(([id,radius])=>{
 const s=siteRecords.find(s=>s.id===id);return{id,radius,center:point(s.x,s.y),samples:0};
});
let centerSamples=0,pavementSamples=0,shoulderSamples=0;
for(let i=1;i<corridor.length;i++){
 const a=corridor[i-1].position,b=corridor[i].position,d=b.clone().sub(a),length=Math.hypot(d.x,d.z),normal=new THREE.Vector3(-d.z/length,0,d.x/length);
 const count=Math.max(1,Math.ceil(length/.5));
 for(let j=0;j<=count;j++){
  const p=a.clone().lerp(b,j/count);centerSamples++;
  for(const m of oldMasks)if(Math.hypot(p.x-m.center.x,p.z-m.center.z)<m.radius+way.width/2+.3)m.samples++;
  for(const offset of [-(way.width/2-.04),-.75,0,.75,way.width/2-.04]){
   const q=p.clone().addScaledVector(normal,offset);
   assert(asphalt(q),'Missing pavement on the through-road at '+q.toArray());pavementSamples++;probes.push(q);
  }
  for(const offset of [-1,1]){
   const q=p.clone().addScaledVector(normal,offset*(way.width/2+.3-.04));q.y-=.055;
   assert(shoulder(q),'Missing outer shoulder on the through-road at '+q.toArray());shoulderSamples++;probes.push(q);
  }
 }
}
assert(centerSamples>600);for(const m of oldMasks)assert(m.samples>10,'No samples crossed the former '+m.id+' mask gap');
assert(asphalt(join.position),'The southern join must have physical pavement');
for(const edge of join.edges.filter(e=>['183464610','173082916','172704701'].includes(e.wayId))){
 const other=edge.a===join?edge.b:edge.a;
 for(let d=.25;d<Math.min(4,edge.length);d+=.25)assert(asphalt(join.position.clone().lerp(other.position,d/edge.length)),'A source-road junction has a crack');
}

// Place the real detailed models, including instanced walls and towers.
// Reinstating a road through an approximate circular mask is acceptable only
// when the complete restored carriageway stays outside actual buildings.
const models=[];
for(const [id,build,scale,yaw,elevation] of [
 ['pad-112',buildMik112,MIK112.scale,MIK112.yaw,0],
 ['pad-112a',buildMzkSdi,MZK_SDI_REFERENCE.scale,MZK_SDI_REFERENCE.yaw,-2.72],
 ['pad-110',buildSite110,MUSEUM_METRE,0,-2.72]
]){
 const site=siteRecords.find(s=>s.id===id),root=new THREE.Group();
 root.position.copy(point(site.x,site.y,elevation));root.scale.setScalar(scale);root.rotation.y=yaw;
 build(root);root.updateWorldMatrix(true,true);models.push({id,root,bounds:new THREE.Box3().setFromObject(root)});
}
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);let modelProbes=0;
for(const p of probes)for(const m of models){
 if(p.x<m.bounds.min.x||p.x>m.bounds.max.x||p.z<m.bounds.min.z||p.z>m.bounds.max.z)continue;
 ray.set(new THREE.Vector3(p.x,100,p.z),down);modelProbes++;
 const obstruction=ray.intersectObject(m.root,true).find(hit=>hit.point.y>.72+.001);
 assert(!obstruction,'The road enters '+m.id+' geometry at '+p.toArray()+': '+obstruction?.object.name);
}
assert(modelProbes>0,'The actual nearby model geometry must be checked');
assert.equal(stats.facilityPorts.length,40);assert.equal(stats.facilityRailPorts.length,8);assert.equal(stats.stationCount,32);
console.log('INDUSTRIAL_ROAD_CONTINUITY_PASS',JSON.stringify({sourceWayId:way.osmId,renderedRuns:visible.length,
 centerSamples,pavementSamples,shoulderSamples,modelProbes,formerMaskSamples:oldMasks.map(m=>({id:m.id,samples:m.samples})),saturnExternalAccess:false}));
