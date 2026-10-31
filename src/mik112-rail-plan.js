import * as THREE from 'three';

// The two owner-confirmed Energia doors follow the already calibrated TUA
// placements. Their four approach ports stay fixed in MIK-local metres.
export const MIK112_RAIL_LAYOUT=Object.freeze({
 version:'mik112-two-gates-osm-rails-v1',faceZ:-120,clearWidth:40,clearHeight:50,
 railHeadY:4.305,entryZ:-258.5,
 gates:Object.freeze([
  Object.freeze({id:'mik112-energia-1',centerX:-71,trackIndices:Object.freeze([0,1]),entryTrackXs:Object.freeze([-82.4,-59.6]),sourceNodeId:'1834612063',sourceWayId:'172571288'}),
  Object.freeze({id:'mik112-energia-2',centerX:-19,trackIndices:Object.freeze([2,3]),entryTrackXs:Object.freeze([-30.4,-7.6]),sourceNodeId:'1834612065',sourceWayId:'172571295'})
 ])
});

// These are connected OSM node chains, not straight lines between exhibits.
// Snapshot: 2026-10-28T17:10:51Z, data/osm/railways.geojson.
// Site 112 way172571670; SDI way172704656; MZK way172704643;
// Site 110 launch structures way169401566 (L) and way169401625 (R).
const ROUTES=Object.freeze([
 {id:'sdi-west',destination:'sdi',gateIndex:0,runs:[['172571288','1834612063','2529010033'],['245771019','2529010033','2529010043']]},
 {id:'sdi-east',destination:'sdi',gateIndex:1,runs:[['172571295','1834612065','2529010032'],['245771018','2529010032','2529010042']]},
 {id:'mzk-through',destination:'mzk',gateIndex:0,runs:[['172571288','1834612063','1834612448'],['172441874','1834612448','1833468966'],['172571055','1833468966','6336523428']]},
 {id:'mzk-side',destination:'mzk',gateIndex:1,runs:[['172571295','1834612065','1834612405'],['172441874','1834612405','1833468966'],['172571055','1833468966','1834612275'],['172571305','1834612275','1834612260']]},
 {id:'site110-left-west',destination:'site110-left',gateIndex:0,runs:[['172571288','1834612063','1834612476'],['37546649','1834612476','1834612628'],['172571285','1834612628','1834613559']]},
 {id:'site110-left-east',destination:'site110-left',gateIndex:1,runs:[['172571295','1834612065','1834612452'],['172571347','1834612452','1834612638'],['172571238','1834612638','1834613553']]},
 {id:'site110-right-west',destination:'site110-right',gateIndex:0,runs:[['172571288','1834612063','1834612466'],['172571232','1834612466','1834613467']]},
 {id:'site110-right-east',destination:'site110-right',gateIndex:1,runs:[['172571295','1834612065','1834612452'],['172571347','1834612452','1834612469'],['172571233','1834612469','1834613464']]}
]);
export const MIK112_OSM_WAY_IDS=Object.freeze([...new Set(['172571066','172571084',...ROUTES.flatMap(route=>route.runs.map(row=>row[0]))])].sort((a,b)=>Number(a)-Number(b)));
const V=(...p)=>new THREE.Vector3(...p);

/** Select original edge identities without inserting or moving graph nodes. */
export function createMik112RailSourcePlan(railGraph){
 const ways=new Map(railGraph.ways.map(way=>[String(way.osmId),way]));
 function run(wayId,from,to){
  const way=ways.get(wayId);if(!way)throw new Error('Missing MIK railway source way '+wayId);
  const nodes=[way.segments[0].a,...way.segments.map(edge=>edge.b)];
  const a=nodes.findIndex(node=>String(node.id)===from),b=nodes.findIndex(node=>String(node.id)===to);
  if(a<0||b<0||a===b)throw new Error('Missing MIK railway source interval '+[wayId,from,to].join('/'));
  const edges=way.segments.slice(Math.min(a,b),Math.max(a,b));
  return {edges:a<b?edges:[...edges].reverse(),nodes:a<b?nodes.slice(a,b+1):nodes.slice(b,a+1).reverse()};
 }
 const replacedEdges=new Set(),protectedEdges=new Set();
 for(const [wayId,to]of [['172571288','1834612063'],['172571295','1834612065']]){
  const way=ways.get(wayId);if(!way)throw new Error('Missing MIK railway approach '+wayId);
  for(const edge of run(wayId,String(way.segments[0].a.id),to).edges)replacedEdges.add(edge);
 }
 // The enlarged museum apron covers the original short crossover. Its two
 // tracks are rebuilt from the fixed model ports to those same source switches.
 for(const wayId of ['172571066','172571084']){
  const way=ways.get(wayId);if(!way)throw new Error('Missing MIK crossover '+wayId);
  for(const edge of way.segments)replacedEdges.add(edge);
 }
 const gates=MIK112_RAIL_LAYOUT.gates.map(gate=>{
  const way=ways.get(gate.sourceWayId),node=railGraph.nodes.get(gate.sourceNodeId);
  const outgoing=way.segments.find(edge=>String(edge.a.id)===gate.sourceNodeId);
  if(!node||!outgoing)throw new Error('Missing outward MIK source switch '+gate.sourceNodeId);
  return {...gate,position:node.position.clone(),outwardTangent:outgoing.b.position.clone().sub(node.position).setY(0).normalize()};
 });
 const destinationRoutes=ROUTES.map(route=>{
  const nodes=[],edges=[];
  for(const [wayId,from,to]of route.runs){
   if(nodes.length&&String(nodes.at(-1).id)!==from)throw new Error('Disconnected MIK source route '+route.id);
   const section=run(wayId,from,to);nodes.push(...(nodes.length?section.nodes.slice(1):section.nodes));edges.push(...section.edges);
  }
  for(const edge of edges)protectedEdges.add(edge);
  return {id:route.id,destination:route.destination,gateIndex:route.gateIndex,
   sourceWayIds:route.runs.map(row=>row[0]),nodeIds:nodes.map(node=>String(node.id)),edges,points:nodes.map(node=>node.position.clone())};
 });
 return {version:MIK112_RAIL_LAYOUT.version,gates,replacedEdges,protectedEdges,destinationRoutes,
  sourceTimestamp:'2026-10-28T17:10:51Z',confidence:'OSM-shared-source-node-chains',
  sourceWayIds:[...new Set(destinationRoutes.flatMap(route=>route.sourceWayIds))]};
}

/** Four head-level approaches, two per door, ending at the two real switches. */
export function createMik112RailApproaches(root,sourcePlan,{headY,sampleStep=.4}={}){
 if(!Number.isFinite(headY))throw new Error('MIK railway requires the shared rail-head datum');
 root.updateWorldMatrix(true,true);
 const entries=root.userData.mik112Model?.railHeadEntries;
 if(!Array.isArray(entries)||entries.length!==4)throw new Error('MIK railway requires four model rail-head ports');
 const forward=V(0,0,-1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
 const tracks=[];
 for(const gate of sourcePlan.gates)for(const trackIndex of gate.trackIndices){
  const localEntry=[...entries[trackIndex]],start=root.localToWorld(V(...localEntry)),end=gate.position.clone().add(V(0,headY,0));
  const distance=Math.hypot(end.x-start.x,end.z-start.z),reach=Math.min(8,Math.max(.35,distance*.38));
  const curve=new THREE.CubicBezierCurve3(start,start.clone().addScaledVector(forward,reach),end.clone().addScaledVector(gate.outwardTangent,-reach),end);
  const count=Math.max(24,Math.ceil(curve.getLength()/Math.max(.1,sampleStep))),points=Array.from({length:count+1},(_,i)=>curve.getPoint(i/count));
  tracks.push({gateId:gate.id,trackIndex,sourceNodeId:gate.sourceNodeId,sourceWayId:gate.sourceWayId,
   localEntry,localStart:root.worldToLocal(start.clone()).toArray(),start:start.toArray(),end:end.toArray(),
   points,curveSamples:points.map(point=>point.toArray()),junctionGap:points.at(-1).distanceTo(end),
   sourceTangent:gate.outwardTangent.toArray(),modelHeadGap:points[0].distanceTo(start)});
 }
 return tracks;
}
