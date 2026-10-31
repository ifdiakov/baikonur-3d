import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildOsmGraph} from '../src/osm-transport.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createMik112RailSourcePlan,MIK112_OSM_WAY_IDS} from '../src/mik112-rail-plan.js';
import {createSite110RailFan} from '../src/site110-rail-fan.js';
import {FACILITY_PORTS,portWorld} from '../src/facility-ports.js';
import {SITE110_REFERENCE} from '../src/site110.js';
import {RAIL_PROFILE} from '../src/rail-profile.js';
import {distancePath} from '../src/traffic-paths.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url))),V=(...p)=>new THREE.Vector3(...p);
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')}),point=(x,z,y=0)=>V((x-650)*3.4,y,(z-522.5)*3.4);
const source=read('data/osm/railways.geojson'),sourceBytes=JSON.stringify(source),graph=buildOsmGraph(source.features,{geography,point,rail:true}),sourcePlan=createMik112RailSourcePlan(graph);
const sourcePositions=new Map([...graph.nodes].map(([id,node])=>[id,node.position.toArray()])),protectedEdges=new Set(sourcePlan.protectedEdges);
const site=geography.sites.find(site=>site.id==='pad-110');[site.x,site.y]=geography.project(...SITE110_REFERENCE.originLonLat);
const spec=FACILITY_PORTS['pad-110'],ports=spec.railConnections.map(port=>({id:port.id,end:portWorld(spec,port.position,site,point).add(V(0,-RAIL_PROFILE.headY,0)),inward:V(...port.outward).negate()}));
const fan=createSite110RailFan({railGraph:graph,sourcePlan,ports}),all=[...fan.tracks,...fan.joinedLinks],mapped=new Map(fan.mappedNodes.map(row=>[row.sourceNodeId,row]));
assert.equal(fan.tracks.length,4);assert.equal(fan.joinedLinks.length,3);assert.equal(fan.hiddenLinks.length,3);
assert.equal(fan.replacedEdges.size,119,'111 original route-tail edges and8 explicit source-link edges have display replacements');
assert.equal(JSON.stringify(source),sourceBytes);assert.equal(sourcePlan.destinationRoutes.length,8);assert.equal(protectedEdges.size,194);
assert.deepEqual(sourcePlan.protectedEdges,protectedEdges);
for(const [id,node]of graph.nodes)assert.deepEqual(node.position.toArray(),sourcePositions.get(id),'Raw node coordinate is immutable: '+id);
for(const row of fan.mappedNodes)assert.deepEqual(row.sourcePosition,sourcePositions.get(row.sourceNodeId));
assert(MIK112_OSM_WAY_IDS.includes('172571316'),'Live OSM verification covers the visible crossover');

function intersection(a,b,c,d){
 const rx=b.x-a.x,rz=b.z-a.z,sx=d.x-c.x,sz=d.z-c.z,den=rx*sz-rz*sx,dx=c.x-a.x,dz=c.z-a.z;
 if(Math.abs(den)<1e-12){
  if(Math.abs(dx*rz-dz*rx)>1e-10)return null;
  const q=rx*rx+rz*rz,t0=(dx*rx+dz*rz)/q,t1=t0+(sx*rx+sz*rz)/q,overlap=Math.min(1,Math.max(t0,t1))-Math.max(0,Math.min(t0,t1));
  assert(overlap*Math.sqrt(q)<1e-7,'Distinct source routes may not share an undeclared overlapping display stem');return null;
 }
 const t=(dx*sz-dz*sx)/den,u=(dx*rz-dz*rx)/den;
 if(t< -1e-8||t>1+1e-8||u< -1e-8||u>1+1e-8)return null;
 return {a:a.clone().lerp(b,t),b:c.clone().lerp(d,u)};
}
const nodesFor=row=>new Set(row.nodeStations?row.nodeStations.map(n=>n.sourceNodeId):[row.from,row.to]);
let pairChecks=0,contacts=0;
// The published v3 independent cubics crossed twice within each pair.
// Inspect every final segment of all four approaches and all three links:
// the only legal contacts have the same actual source node and exact XYZ.
for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
 const a=all[i],b=all[j],aNodes=nodesFor(a),shared=[...nodesFor(b)].filter(id=>aNodes.has(id)),seen=[];pairChecks++;
 for(let ai=1;ai<a.points.length;ai++)for(let bi=1;bi<b.points.length;bi++){
  const hit=intersection(a.points[ai-1],a.points[ai],b.points[bi-1],b.points[bi]);if(!hit||seen.some(p=>p.distanceTo(hit.a)<1e-7))continue;
  const allowed=shared.find(id=>mapped.has(id)&&V(...mapped.get(id).displayPosition).distanceTo(hit.a)<1e-7);
  assert(allowed,'Undeclared rail crossing '+a.id+' / '+b.id+' at '+hit.a.toArray());
  assert(hit.a.distanceTo(hit.b)<1e-8,'Shared source crossing has a vertical gap');seen.push(hit.a);contacts++;
 }
}
assert.equal(pairChecks,21);assert.equal(contacts,8,'Two source entries, one diamond, and five auxiliary endpoints');
for(const row of fan.tracks){
 const port=ports.find(port=>port.id===row.id),raw=graph.nodes.get(row.displaySourceNodeId).position;
 assert(row.points[0].distanceTo(raw)<1e-12);assert(row.points.at(-1).distanceTo(port.end)<1e-12);
 assert.equal(row.sourceNodeId,sourcePlan.destinationRoutes.find(route=>route.id===row.id).nodeIds.at(-1));
 for(const node of row.nodeStations)assert(row.points.some(p=>p.distanceTo(V(...mapped.get(node.sourceNodeId).displayPosition))<1e-9),'Every mapped source junction is a real vertex');
}
for(const link of fan.joinedLinks){
 const from=V(...(mapped.get(link.from)?.displayPosition??sourcePositions.get(link.from))),to=V(...mapped.get(link.to).displayPosition);
 assert(link.points[0].distanceTo(from)<1e-12);assert(link.points.at(-1).distanceTo(to)<1e-12);
}
const centre=point(site.x,site.y,0);
for(const link of fan.hiddenLinks)for(const p of link.sourcePoints)assert(Math.hypot(p[0]-centre.x,p[2]-centre.z)<72,'An originally visible side branch must not be labelled hidden');

const horizontal=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function pointToSegment(p,a,b){return new THREE.Line3(a.clone().setY(0),b.clone().setY(0)).closestPointToPoint(p.clone().setY(0),true,V()).distanceTo(p.clone().setY(0));}
const pairClearances=[];
for(const [i,j]of [[0,1],[2,3]]){
 let minimum=Infinity;
 for(const p of fan.tracks[i].points)for(let k=1;k<fan.tracks[j].points.length;k++)minimum=Math.min(minimum,pointToSegment(p,fan.tracks[j].points[k-1],fan.tracks[j].points[k]));
 assert(minimum>RAIL_PROFILE.ballastWidth+.2,'Paired tracks retain distinct ballast/rail corridors');pairClearances.push(minimum);
}
let minimumRadius=Infinity,maximumGrade=0;
for(const track of fan.tracks){
 const p=distancePath(track.points.map(p=>p.clone().setY(0)));
 for(let s=.3;s<p.length-.3;s+=.15){
  const a=p.sample(s-.3).position,b=p.sample(s).position,c=p.sample(s+.3).position,cross=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
  if(cross>1e-11)minimumRadius=Math.min(minimumRadius,horizontal(a,b)*horizontal(b,c)*horizontal(a,c)/(2*cross));
 }
 for(let i=1;i<track.points.length;i++)maximumGrade=Math.max(maximumGrade,Math.abs(track.points[i].y-track.points[i-1].y)/horizontal(track.points[i],track.points[i-1]));
}
assert(minimumRadius>3,'A compact museum approach must not regress to the rejected .604-unit inner turn');
assert(maximumGrade<.27,'The fixed source/model height difference is spread through the full available approach');

// Offset the actual sampled centre lines exactly as the rail renderer does.
// A shared centre alone is insufficient: all four physical rail crossings
// must meet at one running level inside the declared source diamond.
const crossing=V(...fan.stats.crossingPosition),offsets=fan.tracks.slice(1,3).map(track=>[-1,1].map(side=>track.points.map((p,i)=>{
 const d=track.points[Math.min(track.points.length-1,i+1)].clone().sub(track.points[Math.max(0,i-1)]).setY(0).normalize();
 return p.clone().add(V(0,RAIL_PROFILE.headY,0)).addScaledVector(V(-d.z,0,d.x),side*RAIL_PROFILE.gauge/2);
})));
let railCrossings=0,maxRailGap=0;
for(const left of offsets[0])for(const right of offsets[1]){
 const found=[];for(let i=1;i<left.length;i++)for(let j=1;j<right.length;j++){
  if(horizontal(left[i],crossing)>1||horizontal(right[j],crossing)>1)continue;
  const hit=intersection(left[i-1],left[i],right[j-1],right[j]);if(hit&&!found.some(p=>p.distanceTo(hit.a)<1e-7)){found.push(hit.a);maxRailGap=Math.max(maxRailGap,Math.abs(hit.a.y-hit.b.y));}
 }assert.equal(found.length,1);railCrossings++;
}
assert.equal(railCrossings,4);assert(maxRailGap<1e-12);
console.log('SITE110_RAIL_FAN_PASS',JSON.stringify({pairChecks,declaredContacts:contacts,physicalRailCrossings:railCrossings,maxRailGap,pairClearances,minimumRadius,maximumGrade,mappedSourceNodes:fan.mappedNodes.length,sourceEdgesReplaced:fan.replacedEdges.size}));
