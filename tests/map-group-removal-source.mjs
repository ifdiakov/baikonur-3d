import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {visibleMapSites,REMOVED_MAP_GROUPS,SITE91_EDITORIAL,HIDDEN_MAP_SITE_IDS,isMapSiteHidden} from '../src/map-visible-sites.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {SILO_SITE_IDS,SILO_ROAD_SITE_IDS} from '../src/silo-sites.js';
const catalog=JSON.parse(readFileSync('data/catalog.json')),matches=JSON.parse(readFileSync('data/osm/catalog-matches.json'));
const original=createMuseumGeography({catalog,matches}).sites.filter(r=>!r.aliasOf&&r.render!==false);
const snapshot=JSON.stringify(original),display=visibleMapSites(original),removed=new Set(REMOVED_MAP_GROUPS.map(([id])=>id));
const expectedHidden=['pad-130','pad-96','pad-98','pad-97','pad-3а','pad-3б','pad-111','pad-2b','pad-110a','pad-182','pad-204','pad-89','pad-174','pad-91','pad-92а','pad-93','pad-57','pad-22a','pad-84'];
assert.deepEqual([...HIDDEN_MAP_SITE_IDS],expectedHidden);assert.equal(new Set(HIDDEN_MAP_SITE_IDS).size,19);assert(Object.isFrozen(HIDDEN_MAP_SITE_IDS));
assert.equal(removed.size,9);assert.equal(original.length-display.length,28);
for(const [id,name]of REMOVED_MAP_GROUPS){assert(original.some(r=>r.id===id&&r.name===name));assert(!display.some(r=>r.id===id));}
const notPresent=[];
for(const id of HIDDEN_MAP_SITE_IDS){
 const count=original.filter(r=>r.id===id).length;
 if(id==='pad-22a'){assert.equal(count,0,'22A now has a real record: update the explicit catalogue contract');notPresent.push(id);}
 else assert.equal(count,1,'Hidden ID missing or ambiguous '+id);
 assert(isMapSiteHidden(id));assert(!display.some(r=>r.id===id));
}
assert.deepEqual(notPresent,['pad-22a']);
for(const id of ['pad-3A','pad-3А','pad-3a','pad-3B','pad-3Б','pad-2Б','pad-2б','pad-110А','pad-92A','pad-92А','pad-22А','pad-22а','pad-22A'])assert(isMapSiteHidden(id),'Suffix alias '+id);
// A subsequently imported22A record must be hidden too, including all suffix spellings.
for(const id of ['pad-22a','pad-22A','pad-22а','pad-22А']){
 const future=[...original,{id,name:'Площадка №22А',x:0,y:0}];
 assert.deepEqual(visibleMapSites(future),display,'Reserved22A hiding failed for '+id);
}
const retained=['pad-1','pad-2','pad-2a','pad-3','pad-31','pad-81','pad-82','pad-83','pad-92','pad-94','pad-95','pad-110','pad-112','pad-112a','pad-113','pad-175','pad-200','pad-202','pad-250','airfield','city'];
for(const id of retained){assert(!isMapSiteHidden(id));assert(display.some(r=>r.id===id),'Neighbour must remain '+id);}
assert.deepEqual(display.filter(r=>r.id!=='pad-94'),original.filter(r=>!removed.has(r.id)&&!isMapSiteHidden(r.id)&&!['pad-94','pad-94а'].includes(r.id)));
for(const r of display.filter(r=>r.id!=='pad-94'))assert.equal(original.find(x=>x.id===r.id),r,'Retained record identity changed');
assert.equal(JSON.stringify(original),snapshot,'Transport or registration inputs were mutated');
assert.deepEqual(visibleMapSites(original),display,'Projection must be deterministic');
assert(SILO_SITE_IDS.includes('pad-174')&&SILO_ROAD_SITE_IDS.includes('pad-174'));assert.equal(SILO_SITE_IDS.length,32);assert.equal(SILO_ROAD_SITE_IDS.length,31);
const manifest=readFileSync('src/archive-manifest.js','utf8');assert(manifest.includes("import {isMapSiteHidden} from './map-visible-sites.js"));assert(manifest.includes('].filter(spec=>!isMapSiteHidden(spec.id));'));
assert(!isMapSiteHidden('pad-175'),'175 must remain in the silo roster');
assert(SITE91_EDITORIAL.note.includes('11Г141')&&SITE91_EDITORIAL.note.includes('8–9 ноября 2011 года'));assert.equal(SITE91_EDITORIAL.publicReferences.length,4);assert(catalog.sites.some(r=>r.id==='pad-91'));
for(const path of ['index.html','museum.html','workshop.html']){
 const s=readFileSync(path,'utf8');
 for(const anchor of ['const sites=displayedSiteRecords.map(','record:displayedSiteRecords[i]','const seed=(originalSiteIndices.get(displayedSiteRecords[i].id)*17)%11;','transportSourceFingerprint({roads:osmRoads,railways:osmRails,ownerRoadEdits,siteRecords})','legacyData:transportData,catalog,matches:osmMatches,siteRecords,checkpointAnchor'])assert(s.includes(anchor),path+': '+anchor);
}
mkdirSync('qa-delivery',{recursive:true});
const report={passed:true,removed:[...REMOVED_MAP_GROUPS],hiddenSites:[...HIDDEN_MAP_SITE_IDS],absentReservedIds:notPresent,hiddenExistingCount:HIDDEN_MAP_SITE_IDS.length-notPresent.length,before:original.length,after:display.length,retained,transportInputsPreserved:true,unmodifiedRecordIdentityPreserved:true,proceduralSeedsPreserved:true,site91ArticlePreserved:true,hiddenSilo174Skipped:true,scope:'57 and84 newly hidden;22A is absent but reserved hidden, never confused with2A. Prior16 sites,9 groups and94/94A merge retained. Raw catalogue, models and road anchors preserved.'};
writeFileSync('qa-delivery/group-removal-source.json',JSON.stringify(report,null,2));console.log('MAP_GROUP_REMOVAL_SOURCE_PASS',JSON.stringify(report));
