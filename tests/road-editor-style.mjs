import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveEditedRoadStyle,nearestSourceRoad,widthAtEditedRoad,applyEditedRoadEndpointGrades,
 ROAD_EDIT_STYLE_VERSION,ROAD_EDIT_SHOULDER_EXTRA,ROAD_EDIT_SHOULDER_LIFT,
 ROAD_EDIT_SURFACE_LIFT,ROAD_EDIT_WHITE_EDGE_INSET} from '../src/road-editor-style.js';

const oldPrimary={id:'osm-road-primary',source:'OpenStreetMap',width:3.6,
 tags:{highway:'primary',surface:'asphalt'},marked:true,points:[[0,.72,0],[80,.72,0]]};
const oldService={id:'osm-road-service',source:'OpenStreetMap',width:1.6,
 tags:{highway:'service'},marked:false,points:[[70,.72,20],[100,.72,20]]};
const oldTrack={id:'osm-road-track',source:'OpenStreetMap',width:1.2,
 tags:{highway:'track',surface:'ground'},surface:'ground',marked:false,points:[[0,.72,80],[60,.72,80]]};
const highway={id:'osm-road-highway',source:'OpenStreetMap',width:3.6,
 tags:{highway:'trunk',lanes:'2'},highway:true,marked:true,points:[[140,.72,0],[200,.72,0]]};
const startPaved={id:'road-3',surface:'asphalt',width:4.5,points:[[15,.76,0],[15,.76,30]]};
const source=[oldPrimary,oldService,oldTrack,highway];
const p=deriveEditedRoadStyle(startPaved,source);
assert.equal(p.classId,'asphalt');
assert.equal(p.marking,'double-yellow');
assert.equal(p.sourceId,'osm-road-primary');
assert.equal(p.widthStart,3.6);assert.equal(p.widthEnd,3.6);
assert(Math.abs(p.startY-.72)<.001);
assert.equal(ROAD_EDIT_SHOULDER_EXTRA,.6);assert.equal(ROAD_EDIT_SHOULDER_LIFT,-.055);
assert(ROAD_EDIT_SURFACE_LIFT<=.012);
const ramp=deriveEditedRoadStyle({id:'ramp',surface:'asphalt',width:4.5,points:[[15,.72,0],[90,.72,20]]},source);
assert.equal(ramp.widthStart,3.6);assert.equal(ramp.widthEnd,1.6);
assert.equal(widthAtEditedRoad(ramp,0),3.6);
assert(Math.abs(widthAtEditedRoad(ramp,ramp.length/2)-2.6)<.01);
assert.equal(widthAtEditedRoad(ramp,ramp.length),1.6);
const res=applyEditedRoadEndpointGrades([[15,.8,0],[15,1.2,8],[15,1.3,16],[15,1.4,30]],p);
assert(Math.abs(res[0][1]-.72)<.001,'The asphalt at the OSM join must share its source height');
assert.equal(res.at(-1)[1],1.4,'An unanchored end must retain its original height');
const dirt=deriveEditedRoadStyle({id:'road-dirt',width:1.5,surface:'ground',points:[[12,.76,80],[12,-2,110]]},source);
assert.equal(dirt.classId,'ground');assert.equal(dirt.marking,null);assert.equal(dirt.widthStart,1.2);
const matchingDirt=deriveEditedRoadStyle({id:'originally-paved',width:1.5,surface:'asphalt',points:[[16,.72,80],[16,-2,110]]},source);
assert.equal(matchingDirt.classId,'ground','Editor surface matches adjacent OSM unpaved road, not a mismatched default');
const h=deriveEditedRoadStyle({id:'r-hwy',width:4.5,surface:'asphalt',points:[[160,.72,0],[160,-1,25]]},source);
assert.equal(h.classId,'highway');assert.equal(h.marking,'double-yellow');
const cut=deriveEditedRoadStyle({id:'r-service',width:1.8,surface:'asphalt',points:[[88,.72,20],[88,-2,37]]},source);
assert.equal(cut.classId,'asphalt');assert.equal(cut.marking,null);assert.equal(cut.widthStart,1.6);
assert(nearestSourceRoad([15,2.8,0],source,{maxDistance:4})===null,'High overpass must not use ground-road style/height');
assert.equal(ROAD_EDIT_WHITE_EDGE_INSET,.22);
const owner=JSON.parse(readFileSync(new URL('../data/road-edits-authoritative-20261103.json',import.meta.url),'utf8'));
assert.equal(owner.added.length,19);assert.equal(owner.hidden.length,302);
assert(owner.added.some(r=>r.id==='road-31'&&r.points.at(-1)[1]>20));
console.log('ROAD_EDITOR_STYLE_PASS',JSON.stringify({version:ROAD_EDIT_STYLE_VERSION,source:p.sourceId,
 primaryWidth:p.widthStart,secondaryWidth:ramp.widthEnd,paint:p.marking,roads:owner.added.length}));
