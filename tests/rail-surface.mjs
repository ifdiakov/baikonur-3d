import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {smoothRailGraph,graphRailRoutePoints,RAIL_SURFACE_VERSION} from '../src/rail-surface.js';
import {buildOsmGraph} from '../src/osm-transport.js';
import {projectOsm} from '../src/osm-geography.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const near=(a,b,tolerance=1e-9,label='value')=>assert(Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
const flat=p=>p.clone().setY(0).normalize();
const horizontal=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
function graph(points,connections){
 const nodes=new Map(points.map((p,i)=>[String(i),{id:String(i),position:V(...p),coord:[p[0],p[2]],edges:[]}]));
 const edges=connections.map(([from,to,wayId],i)=>{
  const a=nodes.get(String(from)),b=nodes.get(String(to)),edge={a,b,wayId:String(wayId??i),width:.448,tags:{railway:'rail',gauge:'1520'},length:a.position.distanceTo(b.position)};
  a.edges.push(edge);b.edges.push(edge);return edge;
 });
 return {nodes,edges};
}
const snapshot=g=>JSON.stringify({nodes:[...g.nodes.values()].map(n=>[n.id,n.coord,n.position.toArray(),n.edges.map(e=>g.edges.indexOf(e))]),edges:g.edges.map(e=>[e.a.id,e.b.id,e.wayId,e.length])});
function inspectBounds(g,limit){
 let samples=0;
 for(const edge of g.edges){
  if(!edge.surfacePoints)continue;
  const a=edge.a.position,b=edge.b.position,chord=flat(b.clone().sub(a)),length=horizontal(a,b);
  near(edge.surfacePoints[0].distanceTo(a),0,1e-12,'Exact source start');near(edge.surfacePoints.at(-1).distanceTo(b),0,1e-12,'Exact source end');
  let previous=-1e-8;
  for(const p of edge.surfacePoints){
   assert(p.toArray().every(Number.isFinite));
   const station=p.clone().sub(a).dot(chord),lateral=Math.abs((p.x-a.x)*chord.z-(p.z-a.z)*chord.x);
   assert(station>=previous-1e-9&&station>=-1e-8&&station<=length+1e-8,'A display curve loops or reverses along its source edge');
   assert(lateral<=limit+1e-8,'A display curve escapes its source corridor');
   assert(p.y>=Math.min(a.y,b.y)-1e-10&&p.y<=Math.max(a.y,b.y)+1e-10,'A vertical transition creates a dip or a new crest');
   previous=station;samples++;
  }
 }
 return samples;
}

// Different OSM ways, one reversed in source order: their physical rail
// sections must agree, including after Float32 storage far from the origin.
const split=graph([[1200,-2.755,700],[1215,-2.755,700],[1232,-2.755,709]],[[0,1,'west'],[2,1,'east']]);
const saved=snapshot(split),plan=smoothRailGraph(split,{maxLateralShift:.3});
assert.equal(snapshot(split),saved,'Display construction must not rewrite source topology, coordinates or costs');
near(Math.abs(split.edges[0].surfaceTangents[1].dot(split.edges[1].surfaceTangents[1])),1,1e-12,'Shared split-way tangent');
assert(split.edges.every(e=>e.surfacePoints.length>2));inspectBounds(split,.3);
function railSections(edge){
 const directionAt=plan.directionAt(edge.wayId),points=edge.surfacePoints;
 return points.map((p,i)=>{
  const fallback=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(i-1,0)]).normalize(),d=flat(directionAt(p,fallback)),n=V(-d.z,0,d.x);
  return [-1,1].map(side=>[-1,1].map(rim=>p.clone().addScaledVector(n,side*.2128/2+rim*.028/2).add(V(0,.077,0))));
 });
}
const sections=split.edges.map(railSections);
const stored=section=>section.flat().map(p=>Array.from(new Float32Array(p.toArray()))).sort((a,b)=>a[0]-b[0]||a[2]-b[2]);
assert.deepEqual(stored(sections[0].at(-1)),stored(sections[1].at(-1)),'Both actual rail-head sections meet at a way split');
let faceCount=0;
for(const track of sections){
 const positions=[];
 for(let i=1;i<track.length;i++)for(let side=0;side<2;side++){
  const [a,b]=track[i-1][side],[c,d]=track[i][side];
  // Independently form top faces, as required by any ribbon consumer.
  for(const p of [a,b,c,b,d,c])positions.push(...p.toArray());
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
 const normals=geometry.attributes.normal;
 for(let i=0;i<normals.count;i++){const n=V().fromBufferAttribute(normals,i);assert(n.y>.999&&n.length()>.999,'A sampled rail-head face is inverted/folded/degenerate in world coordinates');faceCount++;}
 geometry.dispose();
}
const route={nodes:[split.nodes.get('0'),split.nodes.get('1'),split.nodes.get('2')],edges:split.edges};
const routePoints=graphRailRoutePoints(route),expected=[...split.edges[0].surfacePoints,...[...split.edges[1].surfacePoints].reverse().slice(1)];
assert.deepEqual(routePoints.map(p=>p.toArray()),expected.map(p=>p.toArray()),'The train consumes exactly the displayed chords in travel order');
routePoints[0].x+=99;assert.notEqual(routePoints[0].x,split.edges[0].surfacePoints[0].x,'Route consumers cannot mutate shared display geometry');
assert.throws(()=>graphRailRoutePoints({nodes:[split.nodes.get('2'),split.nodes.get('0')],edges:[split.edges[0]]}),/disconnected/);

// The straight running route through a turnout fixes the direction of the
// diverging route at its toe; the branch remains a separate source edge.
const turnout=graph([[-12,0,0],[0,0,0],[16,0,0],[14,0,3]],[[0,1,'main'],[1,2,'main'],[1,3,'siding']]);
const turnoutSource=snapshot(turnout),turnoutPlan=smoothRailGraph(turnout);
assert.equal(turnoutPlan.stats.switchNodes,1);assert.equal(snapshot(turnout),turnoutSource);
for(const edge of turnout.edges)near(Math.abs(edge.surfaceTangents[edge.a.id==='1'?0:1].dot(V(1,0,0))),1,1e-12,'Turnout shared tangent');
assert(turnout.edges[2].surfacePoints.slice(1).every(p=>p.z>0),'The diverging track crosses its straight host');
inspectBounds(turnout,.35);

// Translated tracks retain their separation and individual identities. No
// nearest-point snapping or coordinate deduplication may merge a station yard.
const parallel=graph([[0,0,0],[15,0,0],[30,0,9],[0,0,.7],[15,0,.7],[30,0,9.7]],[[0,1,'a'],[1,2,'a'],[3,4,'b'],[4,5,'b']]);
const parallelSource=snapshot(parallel);smoothRailGraph(parallel,{maxLateralShift:.2});assert.equal(snapshot(parallel),parallelSource);
for(let i=0;i<2;i++){
 const a=parallel.edges[i].surfacePoints,b=parallel.edges[i+2].surfacePoints;
 assert.equal(a.length,b.length);
 for(let j=0;j<a.length;j++){near(a[j].x,b[j].x,1e-10);near(b[j].z-a[j].z,.7,1e-10,'Parallel source corridors remain distinct');}
}
inspectBounds(parallel,.2);

// Coincident coordinates are not shared source IDs. Per-way frames at the
// crossing remain perpendicular, and the global lookup refuses ambiguity.
const crossing=graph([[-10,0,0],[0,0,0],[10,0,0],[0,0,-10],[0,0,0],[0,0,10]],[[0,1,'horizontal'],[1,2,'horizontal'],[3,4,'vertical'],[4,5,'vertical']]);
const crossingSource=snapshot(crossing),crossingPlan=smoothRailGraph(crossing),at=V();
assert.equal(snapshot(crossing),crossingSource);assert.equal(crossing.nodes.size,6);
near(crossingPlan.directionAt('horizontal')(at,V(1,0,0)).dot(V(1,0,0)),1);
near(crossingPlan.directionAt('vertical')(at,V(0,0,1)).dot(V(0,0,1)),1);
const fallback=V(1,0,1).normalize();assert.equal(crossingPlan.directionAt()(at,fallback),fallback,'An ambiguous geometric crossing must not supply a shared frame');
const diamond=graph([[-15,0,-2],[0,0,0],[15,0,3],[-3,0,-15],[2,0,15]],[[0,1,'x'],[1,2,'x'],[3,1,'z'],[1,4,'z']]);
const diamondPlan=smoothRailGraph(diamond);assert.equal(diamondPlan.stats.crossingNodes,1);
near(diamond.edges[0].surfaceTangents[1].dot(diamond.edges[1].surfaceTangents[0]),1,1e-12);
near(diamond.edges[2].surfaceTangents[1].dot(diamond.edges[3].surfaceTangents[0]),1,1e-12);
assert(Math.abs(diamond.edges[0].surfaceTangents[1].dot(diamond.edges[2].surfaceTangents[1]))<.5,'A source diamond keeps two independent running directions');

// Vertical shaping works even on perfectly straight X/Z: the bridge has a
// level summit and monotone approach grades, with no dip below ground datum.
const bridge=graph([[-70,-2.755,0],[-35,.8,0],[-12,3.045,0],[12,3.045,0],[40,.1,0],[80,-2.755,0]],[[0,1],[1,2],[2,3],[3,4],[4,5]]);
const bridgeSource=snapshot(bridge),bridgePlan=smoothRailGraph(bridge);assert.equal(snapshot(bridge),bridgeSource);
for(let i=1;i<bridge.edges.length;i++)near(bridge.edges[i-1].surfaceTangents[1].dot(bridge.edges[i].surfaceTangents[0]),1,1e-12,'Continuous bridge grade');
for(const p of bridge.edges[2].surfacePoints)near(p.y,3.045,1e-12,'Unchanged bridge plateau');
near(bridge.edges[1].surfaceTangents[1].y,0,1e-12,'Approach reaches a level plateau');near(bridge.edges[3].surfaceTangents[0].y,0,1e-12);
assert(bridge.edges[1].surfacePoints.length>2,'A vertical curve cannot collapse to its source chord');inspectBounds(bridge,.35);
for(const edge of bridge.edges){
 const sign=Math.sign(edge.b.position.y-edge.a.position.y);
 for(let i=1;i<edge.surfacePoints.length;i++)assert((edge.surfacePoints[i].y-edge.surfacePoints[i-1].y)*sign>=-1e-10,'A bridge ramp overshoots then returns');
}

// Explicit frames and exclusions belong to the model integration contract.
const pins=graph([[-12,0,0],[0,0,0],[12,0,4]],[[0,1],[1,2]]),pinnedPlan=smoothRailGraph(pins,{pinnedNodeIds:new Set(['1'])});
assert.equal(pinnedPlan.stats.pinnedNodes,1);
for(const edge of pins.edges)near(edge.surfaceTangents[0].dot(flat(edge.b.position.clone().sub(edge.a.position))),1,1e-12,'Pinned source heading');
const explicitAxis=V(1,0,.12).normalize(),explicit=smoothRailGraph(pins,{pinnedNodeIds:['1'],endpointTangents:(edge,index,node)=>node.id==='1'?explicitAxis:null});
near(explicit.endpointDirection(pins.edges[0],pins.nodes.get('1')).dot(explicitAxis),1,1e-12,'Explicit frame wins over pin');
near(pins.edges[1].surfaceTangents[0].dot(explicitAxis),1,1e-12);
const exclusion=pins.edges[1],excludedPoints=exclusion.surfacePoints,excludedTangents=exclusion.surfaceTangents;
smoothRailGraph(pins,{excludedEdges:new Set([exclusion])});assert.equal(exclusion.surfacePoints,excludedPoints);assert.equal(exclusion.surfaceTangents,excludedTangents);
const mapped=graph([[0,0,0],[15,1,0]],[[0,1]]),mappedPlan=smoothRailGraph(mapped,{endpointTangents:new Map([[mapped.edges[0],[V(1,99,0),V(1,99,0)]]])});
assert(mappedPlan.stats.limitedGrades===2);inspectBounds(mapped,.35);
assert.throws(()=>smoothRailGraph(mapped,{endpointTangents:new Map([[mapped.edges[0],[V(-1,0,0),null]]])}),/reverses/);
const hairpin=graph([[0,0,0],[10,0,0],[.2,0,.1]],[[0,1],[1,2]]);smoothRailGraph(hairpin);inspectBounds(hairpin,.35);

const straight=graph([[0,0,0],[1000,0,0],[5000,0,0]],[[0,1],[1,2]]),straightPlan=smoothRailGraph(straight);
assert.equal(straightPlan.stats.sampleCount,4,'Long straight routes do not pay for metre-by-metre sampling');
assert.equal(graphRailRoutePoints({nodeIds:['0','1','2'],edges:straight.edges}).length,3);

// The real archived railway graph is cheap to build on its own. This test
// intentionally never constructs roads, scene meshes, textures or a browser.
const source=JSON.parse(fs.readFileSync(new URL('../data/osm/railways.geojson',import.meta.url))),sourceBytes=JSON.stringify(source);
const geography={project:projectOsm},point=(x,y,h=0)=>V((x-650)*3.4,h,(y-522.5)*3.4);
const real=buildOsmGraph(source.features,{geography,point,rail:true}),realSource=snapshot(real),started=performance.now();
const realPlan=smoothRailGraph(real,{pinnedNodeIds:['1834612063','1834612065','1834612466','1834612469','1834612445']});
const milliseconds=performance.now()-started,realSamples=inspectBounds(real,.35);
assert.equal(snapshot(real),realSource);assert.equal(JSON.stringify(source),sourceBytes);
assert(realPlan.stats.edges>5500&&realPlan.stats.degreeTwoNodes>4000,'The regression covers the real source network');
assert(realSamples<100000,'Adaptive rail geometry unexpectedly expands the startup workload');
assert.equal(realPlan.stats.straightEdges,real.edges.filter(edge=>edge.surfacePoints?.length===2).length,'Straightness reports the rendered geometry');
assert(realPlan.stats.straightEdges>1000&&realPlan.stats.nearStraightEdges>2000,'Nearly straight source intervals remain visually straight and compact');

// Independently inspect intersections of every displayed source-edge pair.
// A geographic crossing already present in the archive remains permissible;
// an invented crossing caused by smoothing would change the visible network.
function properCross(a,b,c,d){
 const x=b.x-a.x,z=b.z-a.z,u=d.x-c.x,v=d.z-c.z,den=x*v-z*u;
 if(Math.abs(den)<1e-12)return false;
 const dx=c.x-a.x,dz=c.z-a.z,t=(dx*v-dz*u)/den,s=(dx*z-dz*x)/den;
 return t>1e-7&&t<1-1e-7&&s>1e-7&&s<1-1e-7;
}
const cells=new Map(),cellSize=4;let segmentCount=0;
for(const edge of real.edges){
 if(!edge.surfacePoints)continue;
 for(let i=1;i<edge.surfacePoints.length;i++){
  const a=edge.surfacePoints[i-1],b=edge.surfacePoints[i],segment={a,b,edge,id:segmentCount++};
  for(let x=Math.floor(Math.min(a.x,b.x)/cellSize);x<=Math.floor(Math.max(a.x,b.x)/cellSize);x++)
   for(let z=Math.floor(Math.min(a.z,b.z)/cellSize);z<=Math.floor(Math.max(a.z,b.z)/cellSize);z++){
    const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);
   }
 }
}
const compared=new Set();let newCrossings=0;
for(const entries of cells.values())for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
 const a=entries[i],b=entries[j];if(a.edge===b.edge)continue;
 const pair=a.id<b.id?a.id+':'+b.id:b.id+':'+a.id;if(compared.has(pair))continue;compared.add(pair);
 if(!properCross(a.a,a.b,b.a,b.b)||properCross(a.edge.a.position,a.edge.b.position,b.edge.a.position,b.edge.b.position))continue;
 newCrossings++;
 assert.fail('Rail smoothing invented a crossing between source edges '+[a.edge.wayId,a.edge.a.id,a.edge.b.id].join('/')+' and '+[b.edge.wayId,b.edge.a.id,b.edge.b.id].join('/'));
}
const way=real.ways.find(way=>String(way.osmId)==='37547653'),wayRoute={nodes:[way.segments[0].a,...way.segments.map(edge=>edge.b)],edges:way.segments};
const displayed=graphRailRoutePoints(wayRoute),reversed=graphRailRoutePoints({nodes:[...wayRoute.nodes].reverse(),edges:[...wayRoute.edges].reverse()});
assert.deepEqual(displayed.map(p=>p.toArray()),reversed.reverse().map(p=>p.toArray()),'Both train directions use identical source railway geometry');
console.log('RAIL_SURFACE_PASS',JSON.stringify({version:RAIL_SURFACE_VERSION,real:realPlan.stats,milliseconds,railFaceNormals:faceCount,bridgeSamples:bridgePlan.stats.sampleCount,parallelTracks:2,intersectionChecks:compared.size,newCrossings}));
