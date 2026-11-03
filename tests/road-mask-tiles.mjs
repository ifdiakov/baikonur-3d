import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 ROAD_MASK_TILE_COUNT,roadMaskTileIndex,
 partitionRoadMaskStrokes,roadMaskTileBounds
} from '../src/road-mask-tiles.js';

const owner=JSON.parse(readFileSync(new URL('../data/road-edits-authoritative-20261103.json',import.meta.url),'utf8'));
assert.equal(owner.added.length,19);
assert.equal(owner.hidden.length,302);
assert(owner.added.some(r=>r.id==='road-31'&&r.points.some(p=>p[1]>20)));
const joined=partitionRoadMaskStrokes(owner.hidden,owner.added);
assert.equal(joined.tiles.length,ROAD_MASK_TILE_COUNT);
assert(joined.stats.duplicateCuts>=10,'Canonical exact duplicates are not repainted');
assert(joined.stats.partCount>1500,'Slopes and curves are undersampled');
assert(joined.tiles.every(parts=>parts.length>0),'One sector did not receive its road cuts');
const maxPixel=Math.max(...joined.tiles.map(parts=>roadMaskTileBounds(parts).metersPerPixel));
assert(maxPixel<.5,'Narrow service roads rasterize at fewer than three pixels');
for(const [i,parts]of joined.tiles.entries()){
 const bounds=roadMaskTileBounds(parts);
 for(const s of parts){
  assert.equal(roadMaskTileIndex(s.center),i,'Segment was assigned to wrong atlas');
  assert(s.grade>=0&&s.grade<=255);
  assert(Math.hypot(s.a[0]-s.b[0],s.a[2]-s.b[2])<8.001,'Mask has a very long unresolvable stroke');
  assert(Math.abs(s.a[1]-s.b[1])<.201,'Altitude mask jumps too far within one segment');
  for(const p of [s.a,s.b]){
   assert(p[0]>=bounds.left&&p[0]<=bounds.left+bounds.side);
   assert(p[2]>=bounds.bottom&&p[2]<=bounds.bottom+bounds.side);
  }
 }
}
const north=joined.tiles[4].filter(r=>r.kind==='added'&&r.sourceId==='road-31');
assert(north.length>75,'The elevated new road is undersampled');
assert(north.some(s=>s.center[1]>19));
assert(!north[0].capStart,'The first cap must not erase original pavement beyond the junction');
assert(!north.at(-1).capEnd,'The final cap must not erase pavement beyond the road end');
const fake=partitionRoadMaskStrokes([
 {sourceId:'test',width:2,points:[[0,0,-451],[0,3,-449]]},
 {sourceId:'test',width:2,points:[[0,0,-451],[0,3,-449]]}
]);
assert.equal(fake.stats.duplicateCuts,1);
assert(fake.tiles[0].length>0&&fake.tiles[1].length>0,
 'Tile transitions leave gaps when a sloping removal crosses the sector boundary');
console.log('ROAD_MASK_ATLAS_PASS',JSON.stringify({
 revision:owner.revision,roads:owner.added.length,removed:owner.hidden.length,
 atlasCount:joined.tiles.length,maximumMetresPerPixel:+maxPixel.toFixed(3),
 collapsedDuplicates:joined.stats.duplicateCuts,strokes:joined.stats.partCount
}));
