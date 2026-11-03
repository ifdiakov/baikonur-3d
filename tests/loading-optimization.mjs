import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const file=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [html,menu,history,ukss,tua,startup]=await Promise.all([
 file('index.html'),file('src/museum-menu.js'),file('src/complex-history-content.js'),
 file('src/ukss-exhibit.js'),file('src/tua-exhibit.js'),file('src/museum-startup.js')
]);
const gallery=['energia-buran-20261103.webp','tracking-station-20261103.webp','proton-rollout-20261103.webp'];
for(const image of gallery){
 assert(html.includes('data-src="./assets/preloader/'+image+'"'));
 assert(!html.includes(' src="./assets/preloader/'+image+'"'));
}
assert(html.includes('src="./assets/preloader/soyuz-launch-20261103.webp"'));
assert(!html.includes("import {createGameTerrainPilot}"));
assert(!html.includes("import {createComplexHistoryPanel}"));
assert(html.includes("await import('./src/terrain-game-detail.js"));
assert(html.includes("import('./src/complex-history.js"));
assert(!menu.includes('complex-history-content.js'));
assert(menu.includes('complex-history-menu.js'));
assert(history.length>10000);
for(const file of ['roads.geojson?v=8681815663cf','railways.geojson?v=6652ccc2127c'])
 assert(html.includes(file)&&startup.includes(file),'Large OSM data must be reusable from the browser HTTP cache: '+file);
for(const file of ['rail-points.geojson?v=b1676d9b3ec7','river-water.geojson?v=65f8a2f3f082'])
 assert(html.includes(file),'Immutable OSM snapshot has a content-keyed URL: '+file);
assert(html.includes("key:'tua-detailed-model'"));
assert(html.includes('const ukssExhibit=await loadUkssExhibit(ukssGroup);'));
assert(!html.includes('await Promise.all([\n loadUkssExhibit(ukssGroup)'));
assert(html.includes('adaptTuaRails(mik112Exhibit);'));
assert(ukss.includes("redirect:'error',cache:'default'"));
assert(tua.includes("redirect:'error',cache:'default'"));
console.log('MUSEUM_LOADING_OPTIMIZATION_PASS',JSON.stringify({galleryDeferred:gallery.length,historyInitiallyDeferred:true,soilInitiallyDeferred:true,versionedGlbCaching:true}));
