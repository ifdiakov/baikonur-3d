import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
let s=await readFile('src/public-atmosphere.js','utf8');
if(!s.includes('VISITOR_ATMOSPHERE_VISUAL_QA_V2')){
 s=s.replace("const SCALE=3.4/1.45;", "const SCALE=3.4/1.45;\n// VISITOR_ATMOSPHERE_VISUAL_QA_V2: screenshot acceptance, not presence-only tests.");
 s=s.replace("zoneRoot.name='План флангов и граница города';root.add(zoneRoot);", "zoneRoot.name='План флангов и граница города';zoneRoot.position.y=.16;root.add(zoneRoot);");
 s=s.replace("el.onclick=()=>{forcePlan=false;onDistrict(z);};", "el.onclick=()=>{forcePlan=false;camera.clearViewOffset();onDistrict(z);};");
 const begin=s.indexOf(' function showPlan(){'),end=s.indexOf('\n const stats=',begin);assert(begin>=0&&end>begin);
 s=s.slice(0,begin)+` function planFraming(){camera.updateMatrixWorld();const p=prepared.zones.flatMap(z=>z.polygon).map(v=>new THREE.Vector3(v[0],heightAt(...v),v[1]).project(camera));return {left:Math.min(...p.map(v=>(v.x*.5+.5)*innerWidth)),right:Math.max(...p.map(v=>(v.x*.5+.5)*innerWidth)),top:Math.min(...p.map(v=>(.5-v.y*.5)*innerHeight)),bottom:Math.max(...p.map(v=>(.5-v.y*.5)*innerHeight))};}
 function showPlan(){forcePlan=false;camera.clearViewOffset();const points=prepared.zones.flatMap(z=>z.polygon),minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minZ=Math.min(...points.map(p=>p[1])),maxZ=Math.max(...points.map(p=>p[1]));controls.target.set((minX+maxX)/2,0,(minZ+maxZ)/2);camera.position.copy(controls.target).add(new THREE.Vector3(0,760*SCALE,760*SCALE));camera.zoom=1;camera.updateProjectionMatrix();controls.update();
 const compact=innerWidth<=760,area={left:compact?18:320,right:innerWidth-22,top:compact?100:105,bottom:innerHeight-230},bounds=planFraming();camera.zoom=Math.min((area.right-area.left)/(bounds.right-bounds.left),(area.bottom-area.top)/(bounds.bottom-bounds.top))*.94;camera.updateProjectionMatrix();const fit=planFraming();camera.setViewOffset(innerWidth,innerHeight,(fit.left+fit.right-area.left-area.right)/2,(fit.top+fit.bottom-area.top-area.bottom)/2,innerWidth,innerHeight);controls.update();update();invalidate();}
 function decorateTerrain(material){if(material.userData.visitorEdgeHaze)return;material.userData.visitorEdgeHaze=true;const previous=material.onBeforeCompile,originalKey=material.customProgramCacheKey();material.onBeforeCompile=shader=>{previous.call(material,shader);shader.uniforms.visitorBounds={value:new THREE.Vector4(...data.bounds)};shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\\nvarying vec2 visitorWorldXZ;').replace('#include <begin_vertex>','#include <begin_vertex>\\nvisitorWorldXZ=(modelMatrix*vec4(transformed,1.)).xz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\\nvarying vec2 visitorWorldXZ;uniform vec4 visitorBounds;').replace('#include <fog_fragment>','float edgeDistance=min(min(visitorWorldXZ.x-visitorBounds.x,visitorBounds.z-visitorWorldXZ.x),min(visitorWorldXZ.y-visitorBounds.y,visitorBounds.w-visitorWorldXZ.y));float edgeHaze=1.-smoothstep(0.,220.,edgeDistance);gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,edgeHaze);\\n#include <fog_fragment>');};material.customProgramCacheKey=()=>originalKey+'|public-terrain-edge-haze-v2';material.needsUpdate=true;}
 for(const o of scene.children)if(o.name==='Поверхность · дороги вписаны в текстуру')decorateTerrain(o.material);
`+s.slice(end);
 s=s.replace("source:prepared.source,fields:","overlayLift:zoneRoot.position.y,planFraming:planFraming(),source:prepared.source,fields:");
 s=s.replace('return {update,setNight,showPlan,stats,root,hidePlan(){forcePlan=false;}', 'return {update,setNight,showPlan,stats,root,decorateTerrain,hidePlan(){forcePlan=false;camera.clearViewOffset();}');
 await writeFile('src/public-atmosphere.js',s);
}
let m=await readFile('src/public-museum.js','utf8');
m=m.replace('camera.zoom=1;camera.updateProjectionMatrix();const c=new THREE.Vector3(...s.center)', 'atmosphere?.hidePlan();camera.zoom=1;camera.updateProjectionMatrix();const c=new THREE.Vector3(...s.center)');
m=m.replace("scene.getObjectByName('Дальний горизонт')?.material.color.setHex(night?0x343d4b:0xa48d70)","scene.getObjectByName('Дальний горизонт')?.material.color.setHex(p.fog)");
await writeFile('src/public-museum.js',m);
let g=await readFile('src/public-atmosphere-geometry.js','utf8');
// Preserve the approved right district beyond the satellite tile rectangle.
g=g.replace('Math.max(0,Math.floor((Math.min(...tri.map(p=>p[0]))-l)/sx))','Math.floor((Math.min(...tri.map(p=>p[0]))-l)/sx)').replace('Math.min(n-1,Math.floor((Math.max(...tri.map(p=>p[0]))-l)/sx))','Math.floor((Math.max(...tri.map(p=>p[0]))-l)/sx)').replace('Math.max(0,Math.floor((Math.min(...tri.map(p=>p[1]))-t)/sz))','Math.floor((Math.min(...tri.map(p=>p[1]))-t)/sz)').replace('Math.min(n-1,Math.floor((Math.max(...tri.map(p=>p[1]))-t)/sz))','Math.floor((Math.max(...tri.map(p=>p[1]))-t)/sz)');
await writeFile('src/public-atmosphere-geometry.js',g);
let test=await readFile('tests/public-atmosphere-browser.mjs','utf8');
if(!test.includes('All four territories fit'))test=test.replace('assert(plan.atmosphere.flankAlpha>.95);',"assert(plan.atmosphere.flankAlpha>.95);const fit=plan.atmosphere.planFraming;assert(fit.left>=(mobile?0:300)&&fit.right<=(mobile?390:1365)&&fit.top>=85&&fit.bottom<=(mobile?640:690),'All four territories fit the useful screen without hiding behind the menu/cards');assert.equal(plan.atmosphere.overlayLift,.16);");
await writeFile('tests/public-atmosphere-browser.mjs',test);
console.log('VISITOR_VISUAL_QA_V2_APPLIED');
