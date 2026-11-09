import assert from 'node:assert/strict';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
const file='src/site31-observation-platform.js';let s=await readFile(file,'utf8');
if(!s.includes('NP_TENT_VERSION')){
 assert(s.includes("SITE31_NP_VERSION='rockettrip-np-photo-20261108-v2'"),'Unexpected NP version; reconcile before applying');
 s=s.replace("import {registerFacilityFloodlights}","import {appendRoyalTent,NP_TENT_VERSION} from './np-royaltent.js?v=20261109-rt100-v1';\nimport {registerFacilityFloodlights}");
 s=s.replace("'rockettrip-np-photo-20261108-v2'","'rockettrip-np-royaltent-20261109-v3'");
 s=s.replace('  trim:new THREE.MeshStandardMaterial',"  canopy:new THREE.MeshStandardMaterial({color:0xf7f6f0,roughness:.72,metalness:0,side:THREE.DoubleSide}),\n  tentSeam:new THREE.MeshStandardMaterial({color:0xdbdcd5,roughness:.8,side:THREE.DoubleSide}),\n  tentGlass:new THREE.MeshStandardMaterial({color:0xc4d3d8,transparent:true,opacity:.21,roughness:.18,metalness:.08,side:THREE.DoubleSide,depthWrite:false}),\n  trim:new THREE.MeshStandardMaterial");
 const a=s.indexOf('  const height=(x,z)=>'),b=s.indexOf('  }else{',a);assert(a>0&&b>a);
 s=s.slice(0,a)+"  tentSpecs.push(appendRoyalTent({cx,cz,door:cx>0,add}));\n  if(cx<0){"+s.slice(b+'  }else{'.length);
 s=s.replace(' const batches=new Map(),features=[];',' const batches=new Map(),features=[],tentSpecs=[];');
 s=s.replace('mesh.receiveShadow=true;mesh.castShadow=true;',"mesh.receiveShadow=true;mesh.castShadow=key!=='tentGlass';");
 s=s.replace('shelters:2,shelterAreaM2:100,','shelters:2,shelterAreaM2:100,tentVersion:NP_TENT_VERSION,tentSpecs,');
 await writeFile(file,s);
}
for(const path of ['index.html','museum.html','workshop.html']){
 const before=await readFile(path,'utf8'),after=before.replaceAll('site31-observation-platform.js?v=20261108-np-photo-v2','site31-observation-platform.js?v=20261109-np-royaltent-v3');
 assert(after.includes('site31-observation-platform.js?v=20261109-np-royaltent-v3'));await writeFile(path,after);
}
{
 const path='tests/site31-observation.mjs';let text=await readFile(path,'utf8');text=text.replace('meshes<=12&&data.geometry.triangles<40000','meshes<=14&&data.geometry.triangles<72000');
 if(!text.includes('data.tentSpecs.length'))text=text.replace("console.log('NP_PHOTO_GEOMETRY_PASS'","assert.equal(data.tentSpecs.length,2);\nassert.equal(data.tentSpecs[0].openEntrance,true);assert.equal(data.tentSpecs[1].doorLeaves,2);\nfor(const tent of data.tentSpecs){assert.equal(tent.height,5.549);assert.equal(tent.entranceHeight,4.413);assert.equal(tent.chords,12);assert.equal(tent.anchorBolts,16);assert.equal(tent.cornerClearPanels,4);}\nconsole.log('NP_ROYALTENT_GEOMETRY_PASS'");
 await writeFile(path,text);
}
{
 const path='tests/site31-observation-browser.mjs';let text=await readFile(path,'utf8');await writeFile(path,text.replaceAll('rockettrip-np-photo-20261108-v2','rockettrip-np-royaltent-20261109-v3'));
}
{
 const path='tests/fixtures/np-photo.html';let text=await readFile(path,'utf8');
 if(!text.includes('window.npInspect=')){
 text=text.replace('sun.shadow.bias=-.0002;','sun.shadow.bias=-.0002;sun.shadow.normalBias=.006;');
 text=text.replace('window.npRender();window.npReady=true;',`window.npInspect=(view='open')=>{
 const poses={open:[[-.55,1.0,-3.35],[-1.63,.30,-.77]],door:[[2.55,.85,-3.25],[1.63,.25,-.77]],corner:[[-.28,.52,-2.02],[-.94,.20,-1.44]],inside:[[-1.63,.35,-1.68],[-1.63,.6,-.7]],roof:[[-.3,1.85,-2.2],[-1.63,.45,-.77]]};
 const pose=poses[view]||poses.open;camera.position.set(...pose[0]);camera.lookAt(...pose[1]);camera.updateMatrixWorld();renderer.render(scene,camera);return root.userData.observationPlatform;
};window.npRender();window.npReady=true;`);await writeFile(path,text);
 }
}
// Reuse the existing before/after-publication browser sessions. A new NP
// cannot silently disappear during the worker/LOD transition.
{
 const path='tests/transport-transition-browser.mjs';let text=await readFile(path,'utf8');
 if(!text.includes('NP_ROYALTENT_ACCEPTANCE')){
 const needle="  if(mode==='workshop'){await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-113'))";assert(text.includes(needle));
 text=text.replace(needle,`  // NP_ROYALTENT_ACCEPTANCE
  if(mode!=='baseline'){
   await page.evaluate(()=>{__BAIKONUR_QA.focusSite('np-31-1');__STEP();});
   const np=await page.evaluate(()=>__BAIKONUR_QA.np31());assert.equal(np.instanceCount,1);assert(np.visible);assert.equal(np.model.version,'rockettrip-np-royaltent-20261109-v3');assert.equal(np.model.tentSpecs.length,2);assert(np.model.tentSpecs.every(t=>t.chords===12&&t.anchorBolts===16));assert.deepEqual(np.model.mapCoordinates,{x:912.9,y:304.9});assert(await page.evaluate(()=>__BAIKONUR_QA.evening.evening));
   await page.screenshot({path:out+'/'+mode+'-np-evening.png',timeout:180000});await writeFile(out+'/'+mode+'-np.json',JSON.stringify(np,null,2));
  }
`+needle);await writeFile(path,text);
 }
}
const heading='## 2026-11-09 · Детализация шатров НП RoyalTent';
if(!(await readFile('PROJECT_CONTEXT.md','utf8')).includes(heading))await appendFile('PROJECT_CONTEXT.md','\n\n'+heading+'\nДва белых шатра на единственной НП X=912.9/Y=304.9 детализированы по указанному владельцем ARCH DUNE RT100/10. Сохранены центры [-11.65,-5.5] и [11.65,-5.5], масштаб .14, площадка 50×35 м, настилы, столы, барьеры, восемь флагштоков, шесть WC, парковка и пять существующих фонарей. Один передний вход открыт, у второго две прозрачные дверные створки.\nНовый собственный процедурный модуль src/np-royaltent.js: четырёхопорная арочная мембрана, трёхпоясные фермы с раскосами и муфтами, кровельные рёбра и центральный узел, сварные швы и кант тента, прозрачные угловые вставки до лап, угловые распорки, шнуровка, натяжители, плиты, шайбы и анкерные болты; двери с рамой, петлями, порогом и ручками. Номинальные 10×10 м / 5.549 м / вход 4.413 м по производителю; мелкие детали — визуальная реконструкция, не рабочие чертежи.\nВся НП: 68 000 треугольников, 14 объединённых групп материалов, без новых текстур, GLB, внешних загрузок или источников света. Прозрачные поверхности не пишут глубину и не создают сплошную тень. Дороги, неблокирующий Worker, МЗК/СДИ, вечерняя атмосфера, меню и транспорт не меняются. Проверки: site31-observation.mjs; np-royaltent-browser.mjs; NP дополнительно проверяется после перехода LOD в transport-transition-browser.mjs, в том числе на опубликованном сайте. Результат публикации не считать подтверждённым до публичного прогона.\n');
console.log('NP_ROYALTENT_INTEGRATED');
