import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {visibleMapSites,REMOVED_MAP_GROUPS} from '../src/map-visible-sites.js';
import {createMuseumGeography} from '../src/osm-geography.js';
const catalog=JSON.parse(readFileSync('data/catalog.json')),matches=JSON.parse(readFileSync('data/osm/catalog-matches.json'));
const geography=createMuseumGeography({catalog,matches});
const original=geography.sites.filter(r=>!r.aliasOf&&r.render!==false),snapshot=JSON.stringify(original),display=visibleMapSites(original),removed=new Set(REMOVED_MAP_GROUPS.map(([id])=>id));
assert.equal(removed.size,9);assert.equal(original.length-display.length,9);
for(const [id,name]of REMOVED_MAP_GROUPS){assert(original.some(r=>r.id===id&&r.name===name));assert(!display.some(r=>r.id===id));}
assert.equal(JSON.stringify(original),snapshot,'Transport/registration inputs were mutated');
assert.deepEqual(display,original.filter(r=>!removed.has(r.id)));
for(const r of display)assert.equal(original.find(x=>x.id===r.id),r,'Retained record identity changed');
for(const id of ['pad-1','pad-31','pad-81','pad-82','pad-83','pad-92','pad-95','pad-112','pad-113','pad-175','pad-200','city'])assert(display.some(r=>r.id===id),id+' must remain');
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
const report={passed:true,removed:[...REMOVED_MAP_GROUPS],before:original.length,after:display.length,transportInputsPreserved:true,retainedRecordIdentityPreserved:true,proceduralSeedsPreserved:true,scope:'Exact nine render records; raw archival catalogue and road anchors retained.'};
writeFileSync('qa-delivery/group-removal-source.json',JSON.stringify(report,null,2));console.log('MAP_GROUP_REMOVAL_SOURCE_PASS',JSON.stringify(report));
