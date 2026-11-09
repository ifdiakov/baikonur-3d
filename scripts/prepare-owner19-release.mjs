import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const names=['osm-transport.js','owner-ad-refinements.js','owner-rail-curves.js','site113-road-grade.js','transport-bake.js','road-lod.js','road-editor.js','workshop-road-editor.js','road-editor-mesh.js','archive-models.js','site113.js','site110.js','ukss-connections.js','transport-detail-job.js','transport-detail-worker.bundle.js'];
const revision='20261109-owner19-v2';
for(const file of ['index.html','museum.html','workshop.html',...readdirSync('src').filter(f=>f.endsWith('.js')&&!f.includes('.bundle.')).map(f=>'src/'+f)]){
 let s=readFileSync(file,'utf8'),old=s;
 for(const n of names)s=s.replaceAll(new RegExp(n.replaceAll('.','\\.')+'\\?v=[\\w.-]+','g'),n+'?v='+revision);
 for(const n of ['transport-geometry-bake-v1.json.gz','road-lod-authoritative-v1.json.gz','road-edits-authoritative-20261103.json'])s=s.replaceAll(new RegExp(n.replaceAll('.','\\.')+'(?:\\?v=[\\w.-]+)?','g'),n+'?v='+revision);
 if(file.endsWith('.html')&&s.includes('// Targeted correction: an illustrative building')){const a=s.indexOf('// Targeted correction: an illustrative building'),b=s.indexOf('animate();startup.ready();',a);if(b<0)throw Error('Building clearance boundary missing');s=s.slice(0,a)+'// Owner19: one overlapping house is omitted at source in site110.js.\n'+s.slice(b);}
 if(s!==old)writeFileSync(file,s);
}
console.log('OWNER19_REVISION_LINKS_READY');
