import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildRailRoadIndex,findRailRoadCrossings,separateRailGraphFromRoads,buildRailCrossingSignals} from '../src/rail-road-clearance.js';
import {planRailStations,createRailStations} from '../src/rail-stations.js';
import {RAIL_PROFILE} from '../src/rail-profile.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z),GROUND=-2.755;
function rail(a,b,intermediate=[]){
 const x={id:'a',position:a},y={id:'b',position:b};
 const edge={a:x,b:y,width:RAIL_PROFILE.ballastWidth,length:a.distanceTo(b),tags:{railway:'rail'},abandoned:false,wayId:'r1'};
 edge.surfacePoints=[a,...intermediate,b];
 return {nodes:new Map([['a',x],['b',y]]),edges:[edge],edge};
}
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

// A real right-angle crossing retains its centre and puts the rail head above
// the road surface. Two signs (one on either approach) are instanced.
const crossRail=rail(V(0,GROUND,-100),V(0,GROUND,100),
 Array.from({length:99},(_,i)=>V(0,GROUND,-98+2*i)));
const crossed=separateRailGraphFromRoads({railGraph:crossRail,roads:pavement,headY:RAIL_PROFILE.headY,
 railHalfWidth:RAIL_PROFILE.ballastWidth/2});
assert.equal(crossed.crossingCount,1);
const centre=crossRail.edge.surfacePoints.find(p=>Math.abs(p.z)<1e-6);
assert(centre);assert(Math.abs(centre.x)<1e-6&&Math.abs(centre.z)<1e-6);
assert(centre.y+RAIL_PROFILE.headY>.72+.1,'Rail head must remain above asphalt at a level crossing');
const index=buildRailRoadIndex(pavement,{railHalfWidth:RAIL_PROFILE.ballastWidth/2});
const hits=findRailRoadCrossings([{points:crossRail.edge.surfacePoints}],index);
assert.equal(hits.length,1);const parent=new THREE.Group();
const signs=buildRailCrossingSignals({crossings:hits,parent});
assert.equal(signs.count,2);assert.equal(signs.root.children.length,7);
for(const mesh of signs.root.children)assert.equal(mesh.count,2);

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
