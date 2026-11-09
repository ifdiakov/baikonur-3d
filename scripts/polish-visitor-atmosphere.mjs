import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
// Idempotent visual finishing of the already verified terrain-aligned layer.
let s=await readFile('src/public-atmosphere.js','utf8');
assert(/VISITOR_ATMOSPHERE_VISUAL_QA_V[23]/.test(s),'Apply terrain/framing revision before sky finishing');
if(!s.includes('VISITOR_ATMOSPHERE_VISUAL_QA_V3')){
 s=s.replace('VISITOR_ATMOSPHERE_VISUAL_QA_V2','VISITOR_ATMOSPHERE_VISUAL_QA_V3');
 s=s.replace('new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,vertexShader:', 'new THREE.ShaderMaterial({uniforms:{horizonColor:{value:scene.fog.color}},side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,vertexShader:');
 s=s.replace('fragmentShader:`varying vec3 direction;', 'fragmentShader:`uniform vec3 horizonColor;varying vec3 direction;');
 s=s.replace('vec3 c=mix(low,vec3(.025,.047,.115)', 'low=mix(horizonColor,low,smoothstep(0.,.18,h));vec3 c=mix(low,vec3(.025,.047,.115)');
 s=s.replace('c+=exp(-pow((d.y-.025)*13.,2.))*west*vec3(.14,.045,.012);', 'c+=smoothstep(0.,.04,h)*exp(-pow((d.y-.025)*13.,2.))*west*vec3(.14,.045,.012);');
 s=s.replace('  sky.position.copy(camera.position);', '  for(const f of fields)for(const child of f.root.children)if(child.material?.uniforms?.pixelRatio)child.material.uniforms.pixelRatio.value=renderer.getPixelRatio();\n  sky.position.copy(camera.position);');
 s=s.replace('skyVisible:sky.visible,flankAlpha', 'skyVisible:sky.visible,horizonMatched:sky.material.uniforms.horizonColor.value.equals(scene.fog.color),lightPixelRatio:renderer.getPixelRatio(),flankAlpha');
 assert(s.includes('uniforms:{horizonColor:')&&s.includes('low=mix(horizonColor,low,'),'Sky integration anchors');
 await writeFile('src/public-atmosphere.js',s);
}
let m=await readFile('src/public-museum.js','utf8');m=m.replace(/(?:atmosphere\?\.hidePlan\(\);){2,}/g,'atmosphere?.hidePlan();');await writeFile('src/public-museum.js',m);
let test=await readFile('tests/public-atmosphere-browser.mjs','utf8');
if(!test.includes('first.atmosphere.horizonMatched'))test=test.replace('assert(first.atmosphere.skyVisible);','assert(first.atmosphere.skyVisible);assert(first.atmosphere.horizonMatched);assert.equal(first.atmosphere.lightPixelRatio,first.pixelRatio);');
await writeFile('tests/public-atmosphere-browser.mjs',test);
let context=await readFile('PROJECT_CONTEXT.md','utf8');
if(!context.includes('Визуальная приёмка атмосферы v3')){context+='\nВизуальная приёмка атмосферы v3: заливка флангов поднята на 0,16 мировой единицы относительно той же поверхности для устранения Z-мерцания; полный правый контур не обрезается рамкой спутниковой текстуры. План автоматически вписывает три фланга и город в свободное от панелей поле desktop/mobile. Небо и край земли сходятся в одном цвете тумана без горизонтального шва; размер световых точек учитывает фактическое разрешение рендера, не сырой DPR телефона. Исходная дорожная геометрия, модели и мастерская не менялись.\n';await writeFile('PROJECT_CONTEXT.md',context);}
console.log('VISITOR_VISUAL_QA_V3_APPLIED');
