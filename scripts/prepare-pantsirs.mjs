import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
const version='20261112-pantsirs-v1';
function edit(path,fn){const s=read(path,'utf8'),next=fn(s);if(next!==s)write(path,next);}
function once(s,a,b){if(s.includes(b))return s;assert(s.includes(a),'Missing integration anchor: '+a.slice(0,100));return s.replace(a,b);}
edit('src/archive-buildings.js',s=>{if(s.includes('buildSite92 as protonHalls'))return s;const a=s.indexOf('export function protonHalls(root){'),b=s.indexOf('\nexport ',a+10);assert(a>0&&b>a);return s.slice(0,a)+"export {buildSite92 as protonHalls} from './site92.js?v="+version+"';"+s.slice(b);});
edit('src/archive-models.js',s=>{
 s=once(s,"export function buildArchiveModel(root,entry){","export function buildArchiveModel(root,entry){\n if(entry.kind==='pantsir')return buildEarthCoveredShelter(root,entry.id);");
 if(!s.includes("import {buildEarthCoveredShelter}"))s="import {buildEarthCoveredShelter} from './earth-covered-shelters.js?v="+version+"';\n"+s;
 return s.replace(/(archive-(?:manifest|buildings)\.js\?v=)[\w.-]+/g,'$1'+version);
});
edit('src/archive-manifest.js',s=>{
 if(s.includes("kind:'pantsir'"))return s;
 return once(s,'export const ARCHIVE_MAP=[',`export const ARCHIVE_MAP=[\n ...[82,83].map(n=>({id:'pad-'+n,kind:'pantsir',title:'Панцирь · пл.'+n,scale:MUSEUM_METRE,yaw:0,orientation:'owner-confirmed-below-grade-type; illustrative-geometry',modelVersion:'20261112-earth-covered-v1'})),`);
});
edit('src/rail-site-clearance.js',s=>{
 if(s.includes('rail-building-footprints-site92-v2'))return s;
 s="import {SITE92_HALLS,SITE92_YAW,site92Point,site92HallPosition} from './site92-layout.js?v="+version+"';\n"+s;
 s=s.replace("rail-building-footprints-v1","rail-building-footprints-site92-v2");
 const a=s.indexOf('const HALL92_YAW='),b=s.indexOf('const rectangle=',a);assert(a>0&&b>a);
 s=s.slice(0,a)+'const HALL92_YAW=SITE92_YAW;\nconst HALL92_IMAGE_ROWS=SITE92_HALLS;\nconst image92=site92Point;\n'+s.slice(b);
 s=once(s,'const [x,z]=image92([ix,iz]);','const [x,z]=site92HallPosition(i);');
 return s.replace('src/archive-buildings.js:protonHalls','src/site92.js:buildSite92');
});
edit('src/osm-transport.js',s=>s.replace(/(rail-site-clearance\.js\?v=)[\w.-]+/g,'$1'+version));
edit('src/transport-detail-job.js',s=>s.replace(/(transport-detail-worker\.bundle\.js\?v=)[\w.-]+/g,'$1'+version));
for(const file of ['index.html','museum.html','workshop.html'])edit(file,s=>s.replace(/((?:archive-models\.js|archive-manifest\.js|osm-transport\.js|transport-detail-job\.js|catalog\.json|transport-geometry-bake-v1\.json\.gz|road-lod-authoritative-v1\.json\.gz)\?v=)[\w.-]+/g,'$1'+version));
edit('data/catalog.json',s=>{const c=JSON.parse(s);for(const n of [82,83]){const o=c.sites.find(r=>r.id==='pad-'+n);assert(o);Object.assign(o,{titleShort:'Панцирь',titleFull:'пл. №'+n+' · Панцирь',purposeShort:'Заглублённое сооружение — панцирь',modelStatus:'Тип уточнён владельцем: заглублённый панцирь. Геометрия и размеры — музейная интерпретация, не обмерная реконструкция.',modelTypeOwnerConfirmed:'earth-covered-shelter'});}return JSON.stringify(c,null,2)+'\n';});
assert.equal(read('index.html','utf8'),read('museum.html','utf8'));
mkdirSync('qa-pantsirs',{recursive:true});
console.log('PANTSIRS_PREPARED: rebuild worker/routes before candidate browser acceptance');
