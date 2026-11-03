import assert from 'node:assert/strict';
import {planGagarinSite2Road,GAGARIN_APPROACH_WAY_ID,GAGARIN_ROAD_VERSION} from '../src/gagarin-site2-road.js';

// One OSM-derived approach from the main-road fork, around the angular
// bend beside Site 2, and on to the existing Site 1 forecourt. It must
// not add a parallel trunk or mutate the real OSM polyline.
const source=[[0,.72,0],[25,.72,0],[35,.72,2],[45,.72,12],[65,.72,12],[100,.72,12]];
const make=points=>planGagarinSite2Road({
 sourcePoints:points,
 gagarin:[108,.72,12],
 site2:[50,.72,40],
 site2Gate:[44,.72,30],
 metre:.14
});
const frozen=JSON.stringify(source);
const forward=make(source),reverse=make([...source].reverse());
assert.equal(JSON.stringify(source),frozen,'The source OSM vertices cannot be edited');
for(const plan of [forward,reverse]){
 assert.equal(plan.sourceWayId,GAGARIN_APPROACH_WAY_ID);
 assert.equal(plan.metrics.version,GAGARIN_ROAD_VERSION);
 assert.equal(plan.metrics.approachFromMainRoad,true);
 assert.equal(plan.metrics.parallelRoadsAdded,0);
 assert.deepEqual(plan.main[0],[0,.72,0],'The road starts at the true OSM main-road fork');
 assert.ok(Math.abs(plan.main.at(-1)[0]-88.68)<1e-9,'The same road reaches the Site 1 forecourt');
 assert.equal(plan.metrics.sourceJoinGap,0);
 assert.equal(plan.metrics.forecourtGap,0);
 assert.ok(plan.metrics.maxSampleStep<=1.2,'The approach is sampled continuously');
 assert.ok(plan.metrics.angularTurn,'The actual corner beside Site 2 must be retained');
 assert.equal(plan.metrics.angularTurn.sourceVertex,3);
 assert.ok(Math.abs(plan.metrics.angularTurn.point[0]-45)<1e-6);
 assert.ok(Math.abs(plan.metrics.angularTurn.point[2]-12)<1e-6);
 assert.deepEqual(plan.branchStart,plan.metrics.angularTurn.point,
  'The Site 2 driveway joins at the single angular bend, not an extra fork');
 assert.ok(plan.metrics.site2BranchGap<32);
}
assert.equal(forward.main.length,reverse.main.length);
forward.main.forEach((p,i)=>assert.deepEqual(p,reverse.main[i],'OSM way reversal cannot move the road'));
console.log('GAGARIN_SITE2_ROAD_PASS',JSON.stringify({
 version:forward.metrics.version,corner:forward.metrics.angularTurn,
 sampleCount:forward.main.length,site2Gap:forward.metrics.site2BranchGap
}));
