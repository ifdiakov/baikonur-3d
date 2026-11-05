import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
const file=async name=>JSON.parse(gunzipSync(await readFile(new URL('../data/osm/'+name,import.meta.url))));
const [source,lod]=await Promise.all([file('transport-geometry-bake-v1.json.gz'),file('road-lod-authoritative-v1.json.gz')]);
assert.equal(source.cacheKind,'routes-only');
assert.equal(lod.version,'road-lod-prebuilt-v1');
assert.equal(lod.projection,'world-xz');
assert.equal(lod.sourceFingerprint,source.sourceFingerprint,'LOD must match owner-filtered network');
assert.equal(lod.source,'final-owner-filtered-rendered-paths');
const visible=new Set(source.editable.map(x=>x.id));
for(const level of ['far','medium']){
 const info=lod.levels[level];
 assert(info.roads.length>0);
 for(const r of info.roads){
  assert(visible.has(r.id),'No unapproved raw OSM roads may appear: '+r.id);
  assert(r.points.length>=2&&r.points.every(p=>p.length===3&&p.every(Number.isFinite)));
 }
 for(const r of info.rails)assert(r.points.length>=2&&r.points.every(p=>p.length===3&&p.every(Number.isFinite)));
}
assert(lod.levels.far.roads.length<=lod.levels.medium.roads.length);
console.log('AUTHORITATIVE_ROAD_LOD_PASS',JSON.stringify({source:source.sourceFingerprint,
 farRoads:lod.levels.far.roads.length,mediumRoads:lod.levels.medium.roads.length,rails:lod.levels.medium.rails.length}));
