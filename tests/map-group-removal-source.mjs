import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {visibleMapSites,REMOVED_MAP_GROUPS,SITE91_EDITORIAL} from '../src/map-visible-sites.js';
import {createMuseumGeography} from '../src/osm-geography.js';
const catalog=JSON.parse(readFileSync('data/catalog.json')),matches=JSON.parse(readFileSync('data/osm/catalog-matches.json'));
const geography=createMuseumGeography({catalog,matches});
const original=geography.sites.filter(r=>!r.aliasOf&&r.render!==false),snapshot=JSON.stringify(original),display=visibleMapSites(original),removed=new Set(REMOVED_MAP_GROUPS.map(([id])=>id));
assert.equal(removed.size,9);assert.equal(original.length-display.length,10);
for(const [id,name]of REMOVED_MAP_GROUPS){assert(original.some(r=>r.id===id&&r.name===name));assert(!display.some(r=>r.id===id));}
assert.equal(JSON.stringify(original),snapshot,'Transport/registration inputs were mutated');
const authored=new Set(['pad-94','pad-91']);
assert.deepEqual(display.filter(r=>!authored.has(r.id)),original.filter(r=>!removed.has(r.id)&&!['pad-94','pad-94а','pad-91'].includes(r.id)));
for(const r of display.filter(r=>!authored.has(r.id)))assert.equal(original.find(x=>x.id===r.id),r,'Retained record identity changed');
for(const id of ['pad-1','pad-31','pad-81','pad-82','pad-83','pad-91','pad-92','pad-95','pad-112','pad-113','pad-175','pad-200','city'])assert(display.some(r=>r.id===id),id+' must remain');
const source91=original.find(r=>r.id==='pad-91'),site91=display.find(r=>r.id==='pad-91');
const editorialKeys=new Set(Object.keys(SITE91_EDITORIAL)),physical=r=>Object.fromEntries(Object.entries(r).filter(([key])=>!editorialKeys.has(key)));
assert.deepEqual(physical(site91),physical(source91),'Site91 geometry, dates or registration changed');
for(const [key,value]of Object.entries(SITE91_EDITORIAL))assert.deepEqual(site91[key],value);
assert.notEqual(site91,source91,'Editorial copy must not mutate the registered record');
assert.equal(display.filter(r=>/^pad-91[aа]?$/iu.test(r.id)).length,original.filter(r=>/^pad-91[aа]?$/iu.test(r.id)).length,'Do not invent or merge a91A model');
assert.equal(site91.firstYear,source91.firstYear,'Commissioning after reconstruction is not foundation year');
assert(site91.note.includes('8–9 ноября 2011 года')&&site91.note.includes('площадке 91А')&&site91.note.includes('11Г141'));
assert(!site91.note.includes('здесь обозначена станция 11Г141'));
assert.deepEqual(visibleMapSites(original),display,'Repeated projection must be deterministic');
for(const path of ['index.html','museum.html','workshop.html']){
 const s=readFileSync(path,'utf8');
 assert(s.includes('const sites=displayedSiteRecords.map('));
 assert(s.includes('record:displayedSiteRecords[i]'));
 assert(s.includes('const seed=(originalSiteIndices.get(displayedSiteRecords[i].id)*17)%11;'));
 assert(s.includes('transportSourceFingerprint({roads:osmRoads,railways:osmRails,ownerRoadEdits,siteRecords})'));
 assert(s.includes('legacyData:transportData,catalog,matches:osmMatches,siteRecords,checkpointAnchor'));
 assert(!s.includes("if(siteRecords[i]?.id==='sector-nw2')"));
}
mkdirSync('qa-delivery',{recursive:true});
const report={passed:true,removed:[...REMOVED_MAP_GROUPS],before:original.length,after:display.length,transportInputsPreserved:true,unmodifiedRecordIdentityPreserved:true,proceduralSeedsPreserved:true,site91:{editorialOnly:true,registrationAndGeometryPreserved:true,noInvented91AModel:true,foundationYearUnchanged:true,reviewedOn:SITE91_EDITORIAL.contentReviewedOn},scope:'Nine removed render groups; unified94/94A; verified91 text only. Raw catalogue and road inputs retained.'};
writeFileSync('qa-delivery/group-removal-source.json',JSON.stringify(report,null,2));console.log('MAP_GROUP_REMOVAL_SOURCE_PASS',JSON.stringify(report));
