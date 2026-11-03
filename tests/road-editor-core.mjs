import assert from 'node:assert/strict';
import {ROAD_EDITOR_VERSION,validateRoadEdits,nearestRoadSegment,roadSection} from '../src/road-editor-core.js';

const trunk={id:'osm-road-123',width:3.6,points:[[0,.72,0],[10,.72,0],[10,.72,10],[30,.72,10]]};
const nearby={id:'road-12',width:4.5,points:[[80,1,10],[100,1,10]]};
const source=JSON.stringify(trunk);
const n=nearestRoadSegment([trunk,nearby],[10,.72,4],{maxDistance:5});
assert.equal(n.road.id,trunk.id);assert.equal(n.segment,2);assert.equal(n.distance,0);assert.equal(n.at,14);
const cut=roadSection(trunk,n.at,12);
assert.equal(cut.sourceId,trunk.id);
assert.equal(cut.width,3.6);
assert.deepEqual(cut.points,[[8,.72,0],[10,.72,0],[10,.72,10]]);
assert.deepEqual(roadSection(trunk,2,12).points,[[0,.72,0],[10,.72,0]]);
assert.equal(JSON.stringify(trunk),source,'The source OSM centreline must be immutable');
assert.equal(nearestRoadSegment([trunk],[80,0,0],{maxDistance:8}),null);
const valid=validateRoadEdits({version:ROAD_EDITOR_VERSION,added:[{id:'road-1',width:4.5,surface:'asphalt',
  points:[[0,.72,0],[100,.72,20]]}],hidden:[cut]});
valid.added[0].points[0][0]=999;assert.notEqual(valid.added[0].points[0][0],0);
assert.throws(()=>validateRoadEdits({version:ROAD_EDITOR_VERSION,added:[],hidden:[{sourceId:'bad',width:3,points:[[NaN,0,0],[2,0,0]]}]}));
assert.throws(()=>validateRoadEdits({version:1,added:[{id:'road-1',width:4.5,surface:'asphalt',points:[[0,0,0],[5,0,0]]},
 {id:'road-1',width:4.5,surface:'asphalt',points:[[0,0,0],[5,0,0]]}],hidden:[]}));
assert.throws(()=>validateRoadEdits({version:2,added:[],hidden:[]}));
console.log('ROAD_EDITOR_CORE_PASS',{nearest:n.at,cutPoints:cut.points.length});
