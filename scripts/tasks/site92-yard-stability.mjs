import assert from 'node:assert/strict';
import {readFileSync,writeFileSync}from'node:fs';
const edit=(p,fn)=>writeFileSync(p,fn(readFileSync(p,'utf8')));
edit('src/osm-transport.js',s=>{
 if(s.includes('const displayedSiteRecords=siteRecords;'))return s;
 const marker='export function buildOsmTransportNetwork({data,legacyData,geography,point,layers,siteRecords,checkpoint7RoadGrade=null}){';assert(s.includes(marker));
 return s.replace(marker,marker+"\n // Move physical halls, not established roads or remote railway junctions.\n const displayedSiteRecords=siteRecords;\n siteRecords=siteRecords.map(s=>s.id==='pad-92'&&s.geoSource?.displayOffset?{...s,x:s.x-s.geoSource.displayOffset[0],y:s.y-s.geoSource.displayOffset[1]}:s);").replace('createRailSiteClearancePlan({siteRecords,point})','createRailSiteClearancePlan({siteRecords:displayedSiteRecords,point})');
});
edit('src/archive-buildings.js',s=>{
 if(s.includes('k.path(site92RailApproach'))return s;
 for(const a of ['[[132,90],[273,180],[417,302],[374,397],[736,685],[987,758]].map(P)','[[418,302],[550,177],[704,97],[975,202],[1077,431],[901,638]].map(P)']){assert(s.includes(a));s=s.replace(a,'site92RailApproach('+a+',2)');}return s;
});
for(const p of ['index.html','museum.html','workshop.html'])edit(p,s=>{
 for(const name of ['transport-detail-job.js','transport-geometry-bake-v1.json.gz','road-lod-authoritative-v1.json.gz','catalog.json'])s=s.replaceAll(new RegExp(name.replaceAll('.','\\.')+'\\?v=[\\w.-]+','g'),name+'?v=20261111-site92-82-v1');return s;
});
edit('src/transport-detail-job.js',s=>s.replace('transport-detail-worker.bundle.js?v=20261109-owner19-v3','transport-detail-worker.bundle.js?v=20261111-site92-82-v1'));
edit('src/osm-geography.js',s=>s.includes("record.id==='pad-92'?'owner-request-20261111'")?s:s.replace("record.id==='pad-254'?'owner-request-20261103'","record.id==='pad-92'?'owner-request-20261111':record.id==='pad-254'?'owner-request-20261103'").replace("(record.id==='pad-254'?'3 единицы","(record.id==='pad-92'?'5 единиц на запад и 2.5 на север':record.id==='pad-254'?'3 единицы"));
console.log('SITE92_YARD_AND_CACHE_LINKS_PRESERVED');
