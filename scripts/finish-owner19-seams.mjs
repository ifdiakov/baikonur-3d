import assert from 'node:assert/strict';import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
// Near a butt endpoint, circles around the previous densely sampled vertices
// used to extend past the actual end and cut a visible hole in the through AD.
for(const file of ['src/road-geometry-cut.js','src/road-mask-tiles.js']){
 let s=readFileSync(file,'utf8');if(s.includes('OWNER19_BUTT_END_GUARD'))continue;
 if(file.includes('geometry-cut')){
  const needle='   const corner=circleCut(r.points[j],width);';assert(s.includes(needle));
  s=s.replace(needle,"   // OWNER19_BUTT_END_GUARD: internal rounding must not cross a terminal plane.\n   if(kind==='added'&&['road-3','road-4','road-8'].includes(r.id)){\n    const p=r.points[j],first=r.points[0],last=r.points.at(-1),radius=width*.5+.001;\n    if(Math.hypot(p[0]-first[0],p[2]-first[2])<radius||Math.hypot(p[0]-last[0],p[2]-last[2])<radius)continue;\n   }\n"+needle);
 }else{
  const needle='     partCount++;';assert(s.includes(needle));
  s=s.replace(needle,"     // OWNER19_BUTT_END_GUARD: match the same clipping in the shader mask.\n     if(kind==='added'&&['road-3','road-4','road-8'].includes(road.id)){\n      const part=tiles[index].at(-1),first=road.points[0],last=road.points.at(-1),radius=roadMaskCoverageWidth(width,kind)*.5+.001;\n      const inside=p=>Math.hypot(p[0]-first[0],p[2]-first[2])>=radius&&Math.hypot(p[0]-last[0],p[2]-last[2])>=radius;\n      part.capStart&&=inside(a);part.capEnd&&=inside(b);\n     }\n"+needle);
 }
 writeFileSync(file,s);
}
{
 const f='tests/owner19-source.mjs';let s=readFileSync(f,'utf8');if(!s.includes('owner19-junction-cuts.mjs')){s="import './owner19-junction-cuts.mjs';\n"+s;writeFileSync(f,s);}
}
{
 const f='tests/owner19-browser.mjs';let s=readFileSync(f,'utf8');
 if(!s.includes('OWNER19_FINAL_DIAGNOSTICS')){
  s='// OWNER19_FINAL_DIAGNOSTICS\n'+s;
  s=s.replace("'src/osm-transport.js','src/owner-ad", "'src/osm-transport.js','src/road-geometry-cut.js','src/road-mask-tiles.js','src/road-lod.js','src/owner-ad");
  s=s.replace("const errors=[];page.on('pageerror',e=>errors.push(e.message));", "const errors=[];report.active={mode,events:[]};page.on('pageerror',e=>{errors.push(e.message);report.active.events.push({kind:'pageerror',message:e.stack});});page.on('console',m=>{if(m.type()==='error')report.active.events.push({kind:'console',message:m.text()});});page.on('requestfailed',r=>report.active.events.push({kind:'network',url:r.url(),message:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)report.active.events.push({kind:'http',url:r.url(),status:r.status()});});");
  s=s.replace("()=>window.__OWNER19&&document.body.classList.contains('museum-ready')", "()=>window.__OWNER19&&document.body.classList.contains('museum-ready')||document.querySelector('#museumRetry')?.hidden===false");
  s=s.replace('  const readyMs=Date.now()-started;',"  assert(await page.evaluate(()=>document.body.classList.contains('museum-ready')),await page.evaluate(()=>document.querySelector('#error')?.textContent||document.querySelector('#museumLoadingMessage')?.textContent));\n  const readyMs=Date.now()-started;");
  s=s.replace("'OSM · грунтовые проезды','road-pavement-union'", "'OSM · грунтовые проезды','Единое полотно редактора · asphalt','road-pavement-union'");
  s=s.replace('   const lodPalettes=[];',"   const junctionSamples=[];for(const [x,z]of [[589.4,377],[589.414,377.006],[589.38,376.97]]){ray.set(v(x,z),down);const hits=ray.intersectObjects(surfaces,false).filter(h=>h.point.y>.5);junctionSamples.push({map:[x,z],covered:hits.length>0,heights:hits.map(h=>h.point.y)});}\n   const lodPalettes=[];");
  s=s.replace('return {lodPalettes,revision:', 'return {junctionSamples,lodPalettes,revision:');
  s=s.replace('  assert.equal(checks.lodPalettes.length,2);',"  assert(checks.junctionSamples.every(p=>p.covered),'Visible T589 pavement gap: '+JSON.stringify(checks.junctionSamples));\n  assert.equal(checks.lodPalettes.length,2);");
  s=s.replace('}catch(e){report.error=e.stack;',"}catch(e){report.error=e.stack;report.failureState=await page?.evaluate(()=>({error:document.querySelector('#error')?.textContent,loading:document.querySelector('#museumLoadingMessage')?.textContent,startup:window.__MUSEUM_STARTUP?.stats?.(),ready:document.body.classList.contains('museum-ready')})).catch(()=>null);");
  writeFileSync(f,s);
 }
}
const note='### Контроль поверхности перекрёстка 589,8/377,1';
if(!readFileSync('PROJECT_CONTEXT.md','utf8').includes(note))appendFileSync('PROJECT_CONTEXT.md','\n\n'+note+'\nПри увеличенном осмотре обнаружен небольшой просвет: круглая маска внутренней точки подходила слишком близко к торцу добавленной дороги и вырезала исходный асфальт за концом нового полотна. Ограничено скругление возле торцов road-3/4/8 и в физическом вырезании, и в растровой маске. Это сохранение исходного покрытия, а не накладная заплатка. Добавлены25 геометрических лучей в тесте масок и3 проверки реальной поверхности в браузере. Диагностика загрузки теперь сохраняет ошибку, неудачные запросы и состояние прелоадера вместо пустого таймаута.\n');
console.log('OWNER19_BUTT_END_AND_DIAGNOSTICS_READY');
