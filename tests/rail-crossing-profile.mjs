import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createRailCrossingProfile,RAIL_CROSSING_PROFILE_VERSION} from '../src/rail-crossing-profile.js';
import {smoothRailGraph,graphRailRoutePoints} from '../src/rail-surface.js';
import {buildOsmGraph,RAIL_NETWORK_GROUND_Y} from '../src/osm-transport.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {HIGHWAY_ASPHALT_LIFT} from '../src/highway-surface.js';
import {RAIL_PROFILE} from '../src/rail-profile.js';
import {ROAD_SURFACE_Y,ROAD_SURFACE_CLEARANCE} from '../src/transport-ground-profile.js';

const GROUND=RAIL_NETWORK_GROUND_Y,HEAD=RAIL_PROFILE.headY,V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const close=(a,b,tolerance=1e-8,message='')=>assert(Math.abs(a-b)<=tolerance,message+': '+a+' versus '+b);
function fixture(){
 const graph={nodes:new Map(),edges:[],ways:[]};
 graph.add=(id,x,z=0,y=GROUND)=>{const node={id:String(id),position:V(x,y,z),coord:[x,z],edges:[],raise:Math.max(0,y-GROUND)};graph.nodes.set(node.id,node);return node;};
 graph.link=(a,b,tags={railway:'rail'},way='way-'+graph.edges.length,width=RAIL_PROFILE.ballastWidth)=>{
  const edge={a,b,wayId:way,width,tags,abandoned:false,length:Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)};
  graph.edges.push(edge);a.edges.push(edge);b.edges.push(edge);graph.ways.push({osmId:way,segments:[edge],tags});return edge;
 };return graph;
}
const levelPoint=(id,tag='level_crossing')=>({type:'Feature',properties:{osmId:id,tags:{railway:tag}},geometry:{type:'Point',coordinates:[0,0]}});
function roadAt(graph,id,x,{z=0,y=.72,width=3.6,angle=Math.PI/2,tags={highway:'primary'}}={}){
 const node=graph.add(id,x,z,y),a=graph.add(id+'-road-a',x-Math.cos(angle)*12,z-Math.sin(angle)*12,y),b=graph.add(id+'-road-b',x+Math.cos(angle)*12,z+Math.sin(angle)*12,y);
 for(const entry of [node,a,b])entry.raise=0;
 graph.link(a,node,tags,'road-'+id,width);graph.link(node,b,tags,'road-'+id,width);return node;
}
function line(xs,{id='r',heights=[]}={}){
 const graph=fixture(),nodes=xs.map((x,i)=>graph.add(id+i,x,0,heights[i]??GROUND));
 for(let i=1;i<nodes.length;i++)graph.link(nodes[i-1],nodes[i]);return graph;
}
function immutable(graph){return JSON.stringify({nodes:[...graph.nodes.values()].map(n=>[n.id,n.position.x,n.position.z,n.coord,n.raise,n.edges.map(e=>graph.edges.indexOf(e))]),edges:graph.edges.map(e=>[e.wayId,e.a.id,e.b.id,e.length,e.tags])});}
const profile=(rail,road,points)=>createRailCrossingProfile({railGraph:rail,roadGraph:road,railPoints:{features:points},groundY:GROUND,headY:HEAD});
function heightAt(graph,x){
 for(const edge of graph.edges){const ps=edge.surfacePoints??[edge.a.position,edge.b.position];for(let i=1;i<ps.length;i++)if(x>=Math.min(ps[i-1].x,ps[i].x)-1e-9&&x<=Math.max(ps[i-1].x,ps[i].x)+1e-9){
  const u=(x-ps[i-1].x)/(ps[i].x-ps[i-1].x);return THREE.MathUtils.lerp(ps[i-1].y,ps[i].y,u);
 }}throw new Error('No displayed rail at '+x);
}
function checkBounds(graph,{lower=GROUND,upper=.72+.01-HEAD,maxGrade=.09}={}){
 let grade=0,points=0;
 for(const edge of graph.edges){const ps=edge.surfacePoints;for(let i=0;i<ps.length;i++){
  assert(ps[i].y>=lower-1e-8&&ps[i].y<=upper+1e-8,'A crossing profile exceeds its physical height bounds');points++;
  if(i)grade=Math.max(grade,Math.abs(ps[i].y-ps[i-1].y)/Math.hypot(ps[i].x-ps[i-1].x,ps[i].z-ps[i-1].z));
 }}assert(grade<=maxGrade,'Unbounded crossing grade '+grade);return {grade,points};
}

// A real road-width plateau, a long bounded approach and exact shared seam
// tangents. The road graph and the source railway topology stay untouched.
const rail=line([-200,-95,-20,0,20,95,200]),road=fixture();roadAt(road,'r3',0);
const before=immutable(rail),roadBefore=JSON.stringify(road.nodes),roadPositions=[...road.nodes.values()].map(n=>n.position.toArray());
const basic=profile(rail,road,[levelPoint('r3')]);smoothRailGraph(rail);
assert.equal(basic.stats.explicitCrossings,1);assert.equal(immutable(rail),before);
assert.deepEqual([...road.nodes.values()].map(n=>n.position.toArray()),roadPositions);assert.equal(JSON.stringify(road.nodes),roadBefore);
for(let x=-1.8;x<=1.8;x+=.1)close(heightAt(rail,x)+HEAD,.73,1e-8,'Steel remains above the full road width');
close(heightAt(rail,-150),GROUND);close(heightAt(rail,150),GROUND);
const basicMetrics=checkBounds(rail);
for(let i=1;i<rail.edges.length;i++)close(rail.edges[i-1].surfaceTangents[1].dot(rail.edges[i].surfaceTangents[0]),1,1e-8,'C1 through source nodes');

// Grounded pavement and the physical railway cross-section have different
// top surfaces. Keep the ballast datum on soil; do not bury rail geometry to
// satisfy the legacy rounded 0.05 head/asphalt bound used for raised roads.
const groundRail=line([-120,0,120]),groundRoad=fixture();roadAt(groundRoad,'r1',0,{y:ROAD_SURFACE_Y});
const groundPlan=profile(groundRail,groundRoad,[levelPoint('r1')]);smoothRailGraph(groundRail);
const groundedHeadGap=HEAD-ROAD_SURFACE_CLEARANCE;
close(groundPlan.stats.crossings[0].roadTopY,GROUND+ROAD_SURFACE_CLEARANCE);
close(groundPlan.stats.crossings[0].actualHeadY-groundPlan.stats.crossings[0].roadTopY,groundedHeadGap);
for(let x=-120;x<=120;x+=.5)close(heightAt(groundRail,x),GROUND,1e-8,'Grounded crossing keeps its ballast on soil');
const actualHeadGapLimit=Math.max(.05,groundedHeadGap)+1e-8;

// The actual archive contains a 537.8-world source edge between two level
// crossings. Display-only vertical knots must restore ground in its middle.
const sparse=line([-120,0,537.802404790243,657.802404790243]),sparseRoad=fixture();
roadAt(sparseRoad,'r1',0);roadAt(sparseRoad,'r2',537.802404790243);
const sparseBefore=immutable(sparse),sparseProfile=profile(sparse,sparseRoad,[levelPoint('r1'),levelPoint('r2')]);smoothRailGraph(sparse);
assert.equal(immutable(sparse),sparseBefore);close(heightAt(sparse,268.9012023951215),GROUND,1e-9,'The long interstation section stays on ground');
const sparseGround=sparse.edges[1].surfacePoints.filter(p=>Math.abs(p.y-GROUND)<1e-10);
assert(sparseGround.length>=2&&sparseGround.at(-1).x-sparseGround[0].x>200,'The compact straight between approach boundaries stays level');
assert(sparse.edges[1].surfacePoints.length<180,'A straight sparse source edge needs compact vertical samples');
checkBounds(sparse);
const sparseHook=sparse.railCrossingProfile.makeEdgeProfile(sparse.edges[1],{run:sparse.edges[1].length,baseSample:()=>({height:GROUND,grade:0})});
for(const u of sparseHook.knots.filter(u=>u>0&&u<1)){
 const d=1e-7,lo=sparseHook.sample(u-d),hi=sparseHook.sample(u+d),at=sparseHook.sample(u);
 assert(Math.abs(lo.grade-hi.grade)<1e-5,'Vertical profile has no tangent jump at a plateau/approach/ground knot');
 close((hi.height-lo.height)/(2*d*sparse.edges[1].length),at.grade,1e-5,'Height derivative matches the reported grade');
}

// Oblique asphalt needs width/sin(angle), not a constant short plateau.
const oblique=line([-120,0,120]),obliqueRoad=fixture();roadAt(obliqueRoad,'r1',0,{angle:Math.asin(.340134)});
const obliquePlan=profile(oblique,obliqueRoad,[levelPoint('r1')]);smoothRailGraph(oblique);
assert(obliquePlan.stats.crossings[0].plateauHalfLength>6);
for(let x=-5.25;x<=5.25;x+=.15)close(heightAt(oblique,x)+HEAD,.73,1e-8);

// Unconnected crossing lines and nearby parallel tracks cannot share height
// or acquire a graph junction. Only an unambiguous identical source ID can
// supply a fallback when the point extract omits its railway tag.
const separated=line([-100,0,100]),separateRoad=fixture();roadAt(separateRoad,'different-id',0);
const parallelA=separated.add('parallel-a',-100,.3),parallelB=separated.add('parallel-b',100,.3);separated.link(parallelA,parallelB);
const separationBefore=immutable(separated),separation=profile(separated,separateRoad,[levelPoint('different-id')]);
assert.equal(separation.stats.crossingCount,0);assert.equal(immutable(separated),separationBefore);
assert(separation.stats.corridorClearance.intervalCount>0,'An asphalt overlap is recorded separately from source connectivity');
const inferred=line([-100,0,100]),inferredRoad=fixture();roadAt(inferredRoad,'r1',0);
assert.equal(profile(inferred,inferredRoad,[]).stats.inferredCrossings,1);
for(const tags of [{highway:'primary',layer:'1'},{highway:'primary',bridge:'yes'}]){
 const r=line([-100,0,100]),d=fixture();roadAt(d,'r1',0,{tags});
 assert.equal(profile(r,d,[levelPoint('r1')]).stats.crossingCount,0);assert([...r.nodes.values()].every(n=>n.position.y===GROUND));
}

// The museum's enlarged primary-road pavement can overlap a separate,
// parallel source railway for hundreds of world units. This is a display
// clearance interval, not a new level crossing or source junction.
function parallelRoad({tags={highway:'primary'},raise=0}={}){
 const graph=fixture(),a=graph.add('parallel-road-a',0,1.6,.72+raise),b=graph.add('parallel-road-b',537.802404790243,1.6,.72+raise);
 a.raise=b.raise=raise;graph.link(a,b,tags,'parallel-main-road',3.6);return graph;
}
const parallelRail=line([-220,0,537.802404790243,757.802404790243]),parallelRoadGraph=parallelRoad();
const parallelBefore=immutable(parallelRail),parallelRoadBefore=immutable(parallelRoadGraph),parallelRoadYs=[...parallelRoadGraph.nodes.values()].map(n=>n.position.y);
const parallelPlan=profile(parallelRail,parallelRoadGraph,[]);smoothRailGraph(parallelRail);
assert.equal(parallelPlan.stats.crossingCount,0,'A parallel overlap cannot invent a level crossing');
assert(parallelPlan.stats.corridorClearance.intervalCount>0);assert.equal(parallelPlan.stats.corridorClearance.profileCount,1,'Equal-height intervals share one indexed distance field');
assert(parallelPlan.stats.corridorClearance.roadWayIds.includes('parallel-main-road'));
for(let x=0;x<=537.802404790243;x+=.5)close(heightAt(parallelRail,x)+HEAD,.73,1e-8,'Parallel-road pavement cannot cover steel');
close(heightAt(parallelRail,268.9012023951215)+HEAD,.73,1e-8,'The sparse midpoint clears the actual parallel road');
close(heightAt(parallelRail,-150),GROUND);close(heightAt(parallelRail,687.802404790243),GROUND);
assert.equal(immutable(parallelRail),parallelBefore);assert.equal(immutable(parallelRoadGraph),parallelRoadBefore);
assert.deepEqual([...parallelRoadGraph.nodes.values()].map(n=>n.position.y),parallelRoadYs);
checkBounds(parallelRail);
for(const options of [{tags:{highway:'primary',bridge:'yes'}},{tags:{highway:'primary',tunnel:'yes'}},
 {tags:{highway:'primary',layer:'1'}},{raise:2},{tags:{highway:'service'}}]){
 const r=line([-220,0,537.802404790243,757.802404790243]),d=parallelRoad(options),before=immutable(r),plan=profile(r,d,[]);smoothRailGraph(r);
 assert.equal(plan.stats.corridorClearance.intervalCount,0,'Bridge/tunnel/layer/raised approach/hidden service web cannot create a clearance plateau');
 assert([...r.nodes.values()].every(n=>n.position.y===GROUND));close(heightAt(r,268.9012023951215),GROUND);assert.equal(immutable(r),before);
}

// A sampler-adjusted highway uses actual shared surface height and its lift.
const highway=line([-120,0,120]),highwayRoad=fixture();roadAt(highwayRoad,'r1',0,{tags:{highway:'trunk'}});
highwayRoad.highwaySurfaceHeight=p=>p.y+.2;
const highwayPlan=profile(highway,highwayRoad,[levelPoint('r1')]);
close(highwayPlan.stats.crossings[0].roadTopY,.92+HIGHWAY_ASPHALT_LIFT);
close(highway.nodes.get('r1').position.y+HEAD,.93+HIGHWAY_ASPHALT_LIFT);

// Snapshot the original bridge profile, then prove the crossing cannot lower
// it, change its 5.8 rise field or put a new vertex above the bridge plateau.
const bridgeXs=[-120,0,30,60,80,120,240],bridgeHeights=[GROUND,GROUND,GROUND+2,GROUND+5.8,GROUND+5.8,GROUND,GROUND];
const baselineBridge=line(bridgeXs,{heights:bridgeHeights});smoothRailGraph(baselineBridge);
const bridge=line(bridgeXs,{heights:bridgeHeights}),bridgeRoad=fixture();roadAt(bridgeRoad,'r2',30);
const bridgeBefore=immutable(bridge);profile(bridge,bridgeRoad,[levelPoint('r2')]);smoothRailGraph(bridge);
assert.equal(immutable(bridge),bridgeBefore);
for(let x=-120;x<=240;x+=.2)assert(heightAt(bridge,x)>=heightAt(baselineBridge,x)-.0061,'A crossing lowered the original bridge profile at '+x);
for(let x=60;x<=80;x+=.2)close(heightAt(bridge,x),GROUND+5.8,1e-8);
checkBounds(bridge,{upper:GROUND+5.8,maxGrade:.3});

// Authored MIK/110 approach frames require a truly flat endpoint even while
// an adjacent network crossing lifts this physical seam onto its approach.
const pinned=line([-120,-20,0,24,48,120]),pinnedRoad=fixture();roadAt(pinnedRoad,'r2',0);
profile(pinned,pinnedRoad,[levelPoint('r2')]);const pinnedY=pinned.nodes.get('r3').position.y;
smoothRailGraph(pinned,{endpointTangents:(edge,index,node)=>node.id==='r3'?V(1,0,0):null});
assert(pinnedY>GROUND+.1);close(pinned.nodes.get('r3').position.y,pinnedY);
close(pinned.edges[2].surfaceTangents[1].y,0);close(pinned.edges[3].surfaceTangents[0].y,0);
checkBounds(pinned,{maxGrade:.13});

// A source turnout keeps one elevation and a common compatible transverse
// frame; the display profile cannot split the branch into duplicate nodes.
const branch=line([-120,-20,0,20,120]),branchRoad=fixture();const branchNode=branch.add('branch',35,5);branch.link(branch.nodes.get('r3'),branchNode);roadAt(branchRoad,'r2',0);
const branchBefore=immutable(branch);profile(branch,branchRoad,[levelPoint('r2')]);smoothRailGraph(branch);
assert.equal(immutable(branch),branchBefore);
for(const edge of branch.nodes.get('r3').edges){const end=edge.a.id==='r3'?edge.surfacePoints[0]:edge.surfacePoints.at(-1);assert(end.distanceTo(branch.nodes.get('r3').position)<1e-10);}

// Archive integration uses only light source graphs and curve sampling. It
// intentionally never invokes the road renderer or the full scene builder.
const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url))),rawRail=read('data/osm/railways.geojson'),rawRoad=read('data/osm/roads.geojson'),rawPoints=read('data/osm/rail-points.geojson');
const rawBefore=JSON.stringify({rawRail,rawRoad,rawPoints}),geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>V((x-650)*3.4,h,(y-522.5)*3.4);
const real=buildOsmGraph(rawRail.features,{geography,point,rail:true}),roads=buildOsmGraph(rawRoad.features,{geography,point});
const realBefore=immutable(real),baseY=new Map([...real.nodes.values()].map(n=>[n,n.position.y]));
const started=performance.now(),realPlan=profile(real,roads,rawPoints.features),realSurface=smoothRailGraph(real);
assert.equal(immutable(real),realBefore);assert.equal(JSON.stringify({rawRail,rawRoad,rawPoints}),rawBefore);
const required=['1833467958','1833467552','1833284716','1833467226'];
for(const id of required){const record=realPlan.stats.crossings.find(row=>row.nodeId===id);assert(record,'Missing real train crossing '+id);assert.equal(record.source,'osm-level-crossing');
 assert(record.actualHeadY>=record.roadTopY+.009999&&record.actualHeadY<=record.roadTopY+actualHeadGapLimit,'Train crossing must retain its physical head/asphalt separation: '+id);
}
let protectedBridgeNodes=0;
for(const node of real.nodes.values()){assert(node.position.y>=baseY.get(node)-1e-10);if(node.raise){protectedBridgeNodes++;if(node.raise===5.8)close(node.position.y,baseY.get(node),1e-8);}}
for(const row of realPlan.stats.crossings)if(!row.baselineAlreadyAboveRoad){
 assert(row.actualHeadY>=row.roadTopY+.009999,'Head below actual asphalt at '+row.nodeId);
 assert(row.actualHeadY<=row.roadTopY+.05,'Crossing unexpectedly floats above asphalt at '+row.nodeId);
}
const sparseEdge=real.edges.find(e=>[e.a.id,e.b.id].includes('1833284716')&&[e.a.id,e.b.id].includes('1833467226'));
assert(sparseEdge,'The real sparse source edge exists');
const corridorRow=realPlan.stats.corridorClearance.intervals.find(row=>row.railWayId===sparseEdge.wayId&&row.fromNodeId===sparseEdge.a.id&&row.toNodeId===sparseEdge.b.id&&row.fromFraction<=.5&&row.toFraction>=.5);
assert(corridorRow?.roadWayIds.includes('173082916'),'The real midpoint is covered by the adjacent primary road');
const midpoint=sparseEdge.a.position.clone().lerp(sparseEdge.b.position,.5),ps=sparseEdge.surfacePoints;
let nearest=Infinity,midpointHead=null;
for(let i=1;i<ps.length;i++){const near=new THREE.Line3(ps[i-1],ps[i]).closestPointToPoint(midpoint,true,V()),distance=Math.hypot(near.x-midpoint.x,near.z-midpoint.z);if(distance<nearest){nearest=distance;midpointHead=near.y+HEAD;}}
assert(nearest<.36);assert(midpointHead>=corridorRow.roadTopY+.009999&&midpointHead<=corridorRow.roadTopY+actualHeadGapLimit,'Real sparse midpoint clears the adjacent pavement');
const route={nodes:[sparseEdge.a,sparseEdge.b],edges:[sparseEdge]},forward=graphRailRoutePoints(route),reverse=graphRailRoutePoints({nodes:[...route.nodes].reverse(),edges:route.edges}).reverse();
assert.deepEqual(forward.map(p=>p.toArray()),reverse.map(p=>p.toArray()));
console.log('RAIL_CROSSING_PROFILE_PASS',JSON.stringify({version:RAIL_CROSSING_PROFILE_VERSION,basic:basicMetrics,sparseSamples:sparse.edges[1].surfacePoints.length,
 real:{crossings:realPlan.stats.crossingCount,explicit:realPlan.stats.explicitCrossings,inferred:realPlan.stats.inferredCrossings,raisedNodes:realPlan.stats.raisedNodes,
 affectedEdges:realPlan.stats.affectedEdges,protectedBridgeNodes,baselineAlreadyAboveRoad:realPlan.stats.baselineAlreadyAboveRoad,sourceNodes:real.nodes.size,sourceEdges:real.edges.length,
 corridorIntervals:realPlan.stats.corridorClearance.intervalCount,corridorProfiles:realPlan.stats.corridorClearance.profileCount,corridorCandidatePairs:realPlan.stats.corridorClearance.candidatePairs,
 corridorIndexMilliseconds:realPlan.stats.corridorClearance.milliseconds,preparationMilliseconds:realPlan.stats.preparationMilliseconds,
 maximumGrade:realSurface.stats.maxGrade,samples:realSurface.stats.sampleCount,milliseconds:performance.now()-started}}));
