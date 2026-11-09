import {readFileSync,writeFileSync,readdirSync,appendFileSync} from 'node:fs';
const names=['osm-transport.js','owner-ad-refinements.js','owner-rail-curves.js','site113-road-grade.js','transport-bake.js','road-lod.js','road-editor.js','workshop-road-editor.js','road-editor-mesh.js','archive-models.js','site113.js','site110.js','ukss-connections.js','transport-detail-job.js','transport-detail-worker.bundle.js'];
const revision='20261109-owner19-v2';
// The same asphalt must not turn blue/unlit when the overview layer appears.
{
 const f='src/road-lod.js';let s=readFileSync(f,'utf8');
 s=s.replace('const colors={road:0xadb2b3,rail:0x8b8170};','const colors={road:0x555751,rail:0x8b8170};');
 s=s.replace("const mat=new THREE.MeshBasicMaterial({color:colors[kind==='roads'?'road':'rail'],side:THREE.DoubleSide,depthWrite:true});","const mat=kind==='roads'?new THREE.MeshStandardMaterial({color:colors.road,roughness:1,side:THREE.DoubleSide,depthWrite:true}):new THREE.MeshBasicMaterial({color:colors.rail,side:THREE.DoubleSide,depthWrite:true});");
 writeFileSync(f,s);
}
for(const file of ['index.html','museum.html','workshop.html',...readdirSync('src').filter(f=>f.endsWith('.js')&&!f.includes('.bundle.')).map(f=>'src/'+f)]){
 let s=readFileSync(file,'utf8'),old=s;
 for(const n of names)s=s.replaceAll(new RegExp(n.replaceAll('.','\\.')+'\\?v=[\\w.-]+','g'),n+'?v='+revision);
 for(const n of ['transport-geometry-bake-v1.json.gz','road-lod-authoritative-v1.json.gz','road-edits-authoritative-20261103.json'])s=s.replaceAll(new RegExp(n.replaceAll('.','\\.')+'(?:\\?v=[\\w.-]+)?','g'),n+'?v='+revision);
 if(file.endsWith('.html')&&s.includes('// Targeted correction: an illustrative building')){const a=s.indexOf('// Targeted correction: an illustrative building'),b=s.indexOf('animate();startup.ready();',a);if(b<0)throw Error('Building clearance boundary missing');s=s.slice(0,a)+'// Owner19: one overlapping house is omitted at source in site110.js.\n'+s.slice(b);}
 if(s!==old)writeFileSync(file,s);
}
{
 const f='tests/owner19-browser.mjs';let s=readFileSync(f,'utf8');
 if(!s.includes('lodPalettes')){
  s=s.replace('   const removed=d.objects.find',"   const lodPalettes=[];d.roadLOD.root.traverse(o=>{if(o.isMesh&&o.userData.roadKind==='roads')lodPalettes.push({type:o.material.type,color:o.material.color.getHexString()});});\n   const removed=d.objects.find");
  s=s.replace('return {revision:stats.roadEditor.baselineRevision,colors:', 'return {lodPalettes,revision:stats.roadEditor.baselineRevision,colors:');
  s=s.replace("  assert.equal(checks.colors.asphalt,'#555751');","  assert.equal(checks.lodPalettes.length,2);assert(checks.lodPalettes.every(m=>m.type==='MeshStandardMaterial'&&m.color==='555751'));\n  assert.equal(checks.colors.asphalt,'#555751');");
  const needle="    if(name.startsWith('ramp'))";
  s=s.replace(needle,`    if(name==='t605')for(const height of [500,1000]){
     await page.evaluate(height=>{const d=__OWNER19;d.roadLOD.update(height,d.layers.roads.children.filter(c=>c.name.startsWith('OpenStreetMap ·')).concat(d.layers.rails.children.filter(c=>c.name.startsWith('OpenStreetMap ·'))));d.renderer.render(d.scene,d.camera);},height);
     await page.screenshot({path:out+'/'+name+'-lod-'+height+'.png',timeout:120000});
    }
`+needle);
  writeFileSync(f,s);
 }
}
const note='### Цвет дорог при смене уровня детализации';
if(!readFileSync('PROJECT_CONTEXT.md','utf8').includes(note))appendFileSync('PROJECT_CONTEXT.md','\n\n'+note+'\nВ рамках пункта2 цвет асфальта согласован между дальним/средним и подробным слоями: MeshStandardMaterial 0x555751 вместо неосвещаемого светлого Basic. Геометрия, лампы, туман и железнодорожные материалы не изменены этим уточнением. Проверка обоих материалов LOD и контрольные снимки при500/1000 включены в owner19-browser. Это не замер FPS.\n');
console.log('OWNER19_REVISION_LINKS_READY');
