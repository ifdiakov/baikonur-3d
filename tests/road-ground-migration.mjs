import assert from 'node:assert/strict';
import {groundRoadEdits} from '../src/road-ground-contact.js';
import {validateRoadEdits,reconcileRoadEdits} from '../src/road-editor-core.js';
import {validateWorkshopState} from '../src/workshop-state-network.js';
import {deleteBranch} from '../src/workshop-network-core.js';
import {TRANSPORT_GROUND_VERSION,TRANSPORT_GROUND_Y,ROAD_SURFACE_Y} from '../src/transport-ground-profile.js';

const deckY=ROAD_SURFACE_Y+5.8,oldDeckY=.72+5.8;
const sources=[
 {id:'bridge',width:4,tags:{bridge:'yes'},points:[[0,deckY,0],[20,deckY,0]]},
 {id:'underpass',width:3,tags:{},points:[[10,ROAD_SURFACE_Y,-10],[10,ROAD_SURFACE_Y,10]]}
];
const legacy={version:1,added:[{id:'bridge-overlay',surface:'asphalt',width:3,points:[[2,oldDeckY,0],[10,oldDeckY,0],[18,oldDeckY,0]]}],
 hidden:[{sourceId:'bridge',width:4,points:[[9,oldDeckY,0],[11,oldDeckY,0]]}]};
const original=structuredClone(legacy),ground=()=>TRANSPORT_GROUND_Y;
const migrated=groundRoadEdits(validateRoadEdits(legacy),sources,ground);
assert.deepEqual(legacy,original,'Migration must not mutate its input');
assert.equal(migrated.groundVersion,TRANSPORT_GROUND_VERSION);
for(const type of ['added','hidden'])for(let i=0;i<migrated[type].length;i++){
 assert.equal(migrated[type][i].width,original[type][i].width);
 assert.deepEqual(migrated[type][i].points.map(p=>[p[0],p[2]]),original[type][i].points.map(p=>[p[0],p[2]]),'Owner X/Z and cuts remain exact');
 for(const p of migrated[type][i].points)assert(Math.abs(p[1]-deckY)<1e-10,'The bridge and its deletion stay on the upper deck, above the underpass');
}
assert.deepEqual(groundRoadEdits(migrated,sources,ground),migrated,'Reapplying migration must not drop a grounded bridge');
const unresolved={version:1,added:[],hidden:[{sourceId:'missing-bridge',width:4,points:[[10,oldDeckY,0],[11,oldDeckY,0]]}]};
assert.deepEqual(groundRoadEdits(unresolved,sources,ground).hidden,unresolved.hidden,'An unresolved upper-deck cut must not move to a different nearby road');

// These are the actual validation paths used before workshop replaceSnapshot:
// network add/delete, project restore/import, and reconciliation with baseline.
assert.deepEqual(validateRoadEdits(migrated),migrated);
assert.deepEqual(validateWorkshopState({version:1,objects:{},roadEdits:migrated}).roadEdits,migrated);
assert.deepEqual(reconcileRoadEdits(migrated,migrated),migrated);
const afterDelete=deleteBranch(migrated,{sections:[{road:{originId:'underpass',width:3},points:[[10,ROAD_SURFACE_Y,-3],[10,ROAD_SURFACE_Y,3]]}]},()=> 'unused');
assert.equal(validateRoadEdits(afterDelete).groundVersion,TRANSPORT_GROUND_VERSION);
assert.deepEqual(validateRoadEdits(afterDelete).added,migrated.added,'Deleting another branch leaves the bridge profile untouched');

const legacyAddition={version:1,added:[{id:'legacy-flat',surface:'asphalt',width:2,points:[[30,.76,0],[40,.76,0]]}],hidden:[]};
assert.equal(reconcileRoadEdits(migrated,legacyAddition).groundVersion,undefined,'Merging unconverted coordinates cannot inherit a current marker');
for(const marker of [true,1,'unknown-ground-policy']){
 const valid=validateRoadEdits({...legacy,groundVersion:marker});
 assert.equal(valid.groundVersion,undefined,'Unknown metadata must not suppress migration');
 assert(Math.abs(groundRoadEdits(valid,sources,ground).added[0].points[0][1]-deckY)<1e-10);
}
assert.throws(()=>validateRoadEdits({...legacy,groundVersion:TRANSPORT_GROUND_VERSION,added:[{...legacy.added[0],points:[[NaN,0,0],[1,0,0]]}]}),'A current marker must not bypass geometry validation');
console.log('ROAD_GROUND_MIGRATION_PASS');
