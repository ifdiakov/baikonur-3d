import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildRailRoadIndex,findRailRoadCrossings,separateRailGraphFromRoads,straightenPad5Rail,roundRailCorners,buildRailCrossingSignals} from '../src/rail-road-clearance.js';
import {planRailStations,createRailStations} from '../src/rail-stations.js';
import {RAIL_PROFILE} from '../src/rail-profile.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z),GROUND=-2.755;
function rail(a,b,intermediate=[]){
 const x={id:'a',position:a},y={id:'b',position:b};
 const edge={a:x,b:y,width:RAIL_PROFILE.ballastWidth,length:a.distanceTo(b),tags:{railway:'rail'},abandoned:false,wayId:'r1'};
 edge.surfacePoints=[a,...intermediate,b];
 return {nodes:new Map([['a',x],['b',y]]),edges:[edge],edge};
}
// Ordinary railway corner becomes a tangent continuous circular-style arc,
// while switch/crossing anchors remain exactly at their source locations.
const squareRail=[V(-30,GROUND,0),V(0,GROUND,0),V(0,GROUND,30)];
const bend=roundRailCorners(squareRail,{roads:[],radius:8});
assert(bend.length>squareRail.length,'Rail bend must be sampled as a smooth arc');
assert(bend.some(p=>p.x<0&&p.z>0),'Arc replaces the sharp 90 degree corner');
assert.equal(bend[0],squareRail[0]);assert.equal(bend.at(-1),squareRail.at(-1));
const pinnedBend=roundRailCorners(squareRail,{roads:[],protectedPoints:[squareRail[1]],radius:8});
assert.equal(pinnedBend.length,3,'A source switch stays fixed');
// Parallel rail must end at least a complete road width past the road edge.
const parallel=rail(V(-100,GROUND,1),V(100,GROUND,1),[V(0,GROUND,1)]);
const pavement=[{id:'road-1',width:4,points:[V(-200,.72,0),V(200,.72,0)]}];
const result=separateRailGraphFromRoads({railGraph:parallel,roads:pavement,headY:RAIL_PROFILE.headY,
 railHalfWidth:RAIL_PROFILE.ballastWidth/2});
assert.equal(result.crossingCount,0);
for(const p of parallel.edge.surfacePoints)assert(Math.abs(p.z)>=4*1.5+RAIL_PROFILE.ballastWidth/2,
 'Full-width side clearance required between ballast and asphalt: '+p.z);
assert.equal(parallel.edge.surfacePoints[0].distanceTo(parallel.edge.a.position),0);
assert.equal(parallel.edge.surfacePoints.at(-1).distanceTo(parallel.edge.b.position),0);

// Repeated clearance must not leave an angular sawtooth in a long
// parallel railway near Site 5 / Seven Winds. Straight-through samples
// are faired without letting the track touch the asphalt.
const jagged=rail(V(-100,GROUND,2),V(100,GROUND,2),[
 V(-60,GROUND,3.5),V(-20,GROUND,2),V(20,GROUND,3.5),V(60,GROUND,2)
]);
const clean=separateRailGraphFromRoads({railGraph:jagged,roads:pavement,
 headY:RAIL_PROFILE.headY,railHalfWidth:RAIL_PROFILE.ballastWidth/2});
assert(clean.iterations>=1,'Rail separation must run before the final curvature guard');
for(const p of jagged.edge.surfacePoints)assert(Math.abs(p.z)>=6+RAIL_PROFILE.ballastWidth/2,
 'Straightened railway must remain separated from the full asphalt width');

// Two asphalt pieces meeting at a join are ONE continuous carriageway.
// A railway running along the join must not be pushed into either segment,
// nor acquire the sharp alternating bends seen near Seven Winds.
const roadJoin=[
 {id:'road-west',width:4,points:[V(-120,.72,0),V(0,.72,0)]},
 {id:'road-east',width:4,points:[V(0,.72,0),V(120,.72,12)]}
];
const besideJoin=rail(V(-105,GROUND,1.5),V(105,GROUND,11.5),[
 V(-50,GROUND,1.5),V(-8,GROUND,1.5),V(0,GROUND,1.5),
 V(8,GROUND,2.0),V(50,GROUND,6.2)
]);
const joined=separateRailGraphFromRoads({railGraph:besideJoin,roads:roadJoin,
 headY:RAIL_PROFILE.headY,railHalfWidth:RAIL_PROFILE.ballastWidth/2});
assert.equal(joined.crossingCount,0,'Ordinary asphalt joints are not railway crossings');
const joinedIndex=buildRailRoadIndex(roadJoin,{railHalfWidth:RAIL_PROFILE.ballastWidth/2});
for(const p of besideJoin.edge.surfacePoints){
 const distances=joinedIndex.queryPoint(p).map(road=>{
  const t=Math.max(0,Math.min(1,((p.x-road.a.x)*road.dx+(p.z-road.a.z)*road.dz)/road.len2));
  return Math.hypot(p.x-road.a.x-t*road.dx,p.z-road.a.z-t*road.dz)-1.5*road.width-RAIL_PROFILE.ballastWidth/2;
 });
 assert(Math.min(...distances)>=-.15,'Rail joins must stay away from both asphalt pieces');
}

// Opposite Site 5: the southbound mainline must become a straight chord
// rather than following small zigzags inherited from road-joint clearance.
const map=(x,y)=>V((x-650)*3.4,GROUND,(y-522.5)*3.4);
const line5=rail(map(621,547),map(620,560),[map(622.5,551),map(619,555)]);
line5.edge.wayId='37543646';
const offsetRoad=[{id:'pad5-road',width:3.6,points:[map(635,545),map(635,565)]}];
const pad5Plan=straightenPad5Rail({railGraph:line5,roads:offsetRoad,railHalfWidth:RAIL_PROFILE.ballastWidth/2});
assert.equal(pad5Plan.straightened,1,'Site 5 line must be straightened');
const chordA=line5.edge.a.position,chordB=line5.edge.b.position;
for(const p of line5.edge.surfacePoints.slice(1,-1)){
 const dx=chordB.x-chordA.x,dz=chordB.z-chordA.z;
 assert(Math.abs(dx*(p.z-chordA.z)-dz*(p.x-chordA.x))<1e-6,'Straight track points must lie on one chord');
}

// A real right-angle crossing retains its centre and puts the rail head above
// the road surface. Two signs (one on either approach) are instanced.
// The source railway intentionally contains NO sample at the crossing.
const crossRail=rail(V(0,GROUND,-100),V(0,GROUND,100));
const crossed=separateRailGraphFromRoads({railGraph:crossRail,roads:pavement,headY:RAIL_PROFILE.headY,
 railHalfWidth:RAIL_PROFILE.ballastWidth/2});
assert.equal(crossed.crossingCount,1);
assert(crossed.addedSamples>0,'Sparse source rail must gain road-corridor knots');
const centre=crossRail.edge.surfacePoints.find(p=>Math.abs(p.z)<1e-6);
assert(centre);assert(Math.abs(centre.x)<1e-6&&Math.abs(centre.z)<1e-6);
assert(centre.y+RAIL_PROFILE.headY>.72+.008,'Rail head must remain above asphalt at a level crossing');
const index=buildRailRoadIndex(pavement,{railHalfWidth:RAIL_PROFILE.ballastWidth/2});
const hits=findRailRoadCrossings([{points:crossRail.edge.surfacePoints}],index);
assert.equal(hits.length,1);const parent=new THREE.Group();
const signs=buildRailCrossingSignals({crossings:hits,parent});
assert.equal(signs.count,2);assert.equal(signs.root.children.length,7);
for(const mesh of signs.root.children)assert.equal(mesh.count,2);

// A crossing of one track must not exempt a neighbouring parallel track from
// the required full road-width clearance (regression near the 7 Winds area).
const through=rail(V(0,GROUND,-30),V(0,GROUND,30));
const adjacent=rail(V(-100,GROUND,1),V(100,GROUND,1),[V(0,GROUND,1)]);
const sharedGraph={nodes:new Map([...through.nodes,...adjacent.nodes].map(([id,n],i)=>[id+'-'+i,n])),edges:[through.edge,adjacent.edge]};
const independent=separateRailGraphFromRoads({railGraph:sharedGraph,roads:pavement,
 headY:RAIL_PROFILE.headY,railHalfWidth:RAIL_PROFILE.ballastWidth/2});
assert.equal(independent.crossingCount,1);
assert(independent.iterations>=1);
for(const p of adjacent.edge.surfacePoints)assert(Math.abs(p.z)>=4*1.5+RAIL_PROFILE.ballastWidth/2,
 'An unrelated crossing must not pull a parallel rail into the road: '+p.z);
assert.equal(independent.residualIntrusions,0,'Iterative clearance must converge on unobstructed rails');

// Fixed railway model-port seams must not drift horizontally.
const fixed=rail(V(-30,GROUND,1),V(30,GROUND,1),[V(0,GROUND,1)]);
separateRailGraphFromRoads({railGraph:fixed,roads:pavement,pinnedNodes:[fixed.edge.a.position],
 headY:RAIL_PROFILE.headY,railHalfWidth:RAIL_PROFILE.ballastWidth/2});
assert(Math.abs(fixed.edge.a.position.z-1)<1e-6);

// The full station platform (two sides) must clear the crossing road. The
// station is moved along the same rail, rather than into the asphalt.
const stationTrack=[{width:RAIL_PROFILE.ballastWidth,points:[V(-100,GROUND,0),V(100,GROUND,0)]}];
const stationRoad=[{id:'road-crossing-station',width:3.6,points:[V(0,.72,-20),V(0,.72,20)]}];
const stations=[{id:'st1',name:'Station',position:[0,GROUND,0]}];
const plan=planRailStations(stations,stationTrack,stationRoad)[0];
assert(!plan.skipped,'Station must find an empty span further along the rail');
assert(Math.abs(plan.shiftAlongRail)>=16,'Station footprint cannot overlap the road');
const clickable=[],root=new THREE.Group(),view=createRailStations({stations,paths:stationTrack,roads:stationRoad,
 parent:root,clickable,firstIndex:50});
assert.equal(view.plans()[0].position[0],plan.position[0]);
const oldX=view.labels()[0].group.position.x;
const replanned=view.replan(stationTrack,[]);
assert(replanned.count===1);
assert.notEqual(view.labels()[0].group.position.x,oldX,'Replan must follow the detailed rail/road data');
assert.equal(clickable.length,2);
console.log('RAIL_ROAD_CLEARANCE_PASS',JSON.stringify({railLateralShift:result.maxLateralShift,
 crossingHeadY:centre.y+RAIL_PROFILE.headY,signCount:signs.count,stationRoadShift:plan.shiftAlongRail}));
