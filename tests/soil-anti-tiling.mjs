import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOIL_ANTI_TILING_VERSION,SOIL_ANTI_TILING_GLSL,sampleSoilDetailDomains,sampleSoilDetailNeighbours} from '../src/soil-anti-tiling.js';
import {GLOBAL_SOIL_DETAIL_VERSION,installGlobalSoilDetail} from '../src/global-steppe-detail.js';

assert.match(SOIL_ANTI_TILING_VERSION,/anti-tiling/);
assert.match(GLOBAL_SOIL_DETAIL_VERSION,/continuous-blend/);
assert(SOIL_ANTI_TILING_GLSL.includes('soilDetailDomains'));
assert(SOIL_ANTI_TILING_GLSL.includes('soilDetailAtlasUV'));
assert(SOIL_ANTI_TILING_GLSL.includes('soilDetailNoise'));
assert(!SOIL_ANTI_TILING_GLSL.includes('sin('),'Noise must avoid costly per-pixel transcendental hash');
assert(!SOIL_ANTI_TILING_GLSL.includes('fract(world/3.2)'),'Old repeating atlas UVs have been removed');
assert(SOIL_ANTI_TILING_GLSL.includes('soilDetailNeighbours'));
assert(SOIL_ANTI_TILING_GLSL.includes('soilDetailMacro'));
assert(SOIL_ANTI_TILING_GLSL.includes('vec2(.0625)')&&SOIL_ANTI_TILING_GLSL.includes('vec2(.9375)'),
 'Atlas sampling needs a real 1/16 gutter between material families');

const fract=x=>x-Math.floor(x);
const phaseGap=(a,b)=>{
 const delta=Math.abs(fract(a)-fract(b));
 return Math.min(delta,1-delta);
};
let comparisons=0,different=0,maxDiscontinuity=0,nearRepeat=0,nearRepeatRemoved=0;
for(let x=-950;x<950;x+=39.5)for(let z=-740;z<750;z+=59.3){
 const a=sampleSoilDetailDomains(x,z),b=sampleSoilDetailDomains(x+3.2,z);
 const first=phaseGap(a.a[0],b.a[0])+phaseGap(a.a[1],b.a[1]);
 const second=phaseGap(a.b[0],b.b[0])+phaseGap(a.b[1],b.b[1]);
 if(first+second>.13)different++;
 const periodic=sampleSoilDetailDomains(x+3.76,z);
 const sameFamilyGap=phaseGap(a.a[0],periodic.a[0])+phaseGap(a.a[1],periodic.a[1]);
 if(sameFamilyGap>.035)nearRepeatRemoved++;
 nearRepeat++;
 comparisons++;
 assert(a.mix>=.39-1e-10&&a.mix<=.61+1e-10);
 for(const domain of ['a','b']){
  const later=sampleSoilDetailDomains(x+.001,z+.001);
  const drift=Math.hypot(...a[domain].map((v,i)=>v-later[domain][i]));
  maxDiscontinuity=Math.max(maxDiscontinuity,drift);
 }
}
assert(different/comparisons>.92,'A 3.2-unit shift must no longer reproduce the same grain tile');
assert(nearRepeatRemoved/nearRepeat>.90,
 'Sampling at the former 3.76-unit texture repeat must decorrelate within the same soil domain');
assert(maxDiscontinuity<.02,'Domain warp should be continuous at neighbouring points');
assert.deepEqual(sampleSoilDetailDomains(151.3,-201.9),sampleSoilDetailDomains(151.3,-201.9));
assert.throws(()=>sampleSoilDetailDomains(Infinity,0),/finite/);
const blendedColour=at=>{
 const {first,second,blend}=sampleSoilDetailNeighbours(at),tones=[.71,1.0,.81,.92,.63];
 return tones[first]*(1-blend)+tones[second]*blend;
};
let boundaryJump=0;
for(let kind=1;kind<4;kind++){
 const left=blendedColour(kind-1e-4),right=blendedColour(kind+1e-4);
 boundaryJump=Math.max(boundaryJump,Math.abs(left-right));
}
assert(boundaryJump<1e-6,'The new continuous material coordinate must have no visible palette seam');

const uniforms={value:1};
const atlas={albedo:{name:'albedo'},normal:{name:'normal'},roughness:{name:'roughness'}};
const material=()=>({isMeshStandardMaterial:true,userData:{steppeSurface:true},
 onBeforeCompile(shader){shader.fragmentShader=shader.fragmentShader.replace('PLACE_BASE','diffuseColor.rgb*=steppeTone;');},
 customProgramCacheKey(){return 'terrain-base';},needsUpdate:false});
const a=material();
assert.equal(installGlobalSoilDetail(a,atlas,uniforms),true);
const shader={uniforms:{},fragmentShader:[
 '#include <common>','void main(){',' PLACE_BASE',
 ' #include <normal_fragment_maps>',' #include <roughnessmap_fragment>','}'
].join('\n')};
a.onBeforeCompile(shader);
assert(shader.fragmentShader.includes('soilDetailDomains(vSteppeWorld.xz'));
assert(shader.fragmentShader.includes('vec3 familyA'));
for(const map of ['globalSoilAlbedo','globalSoilNormal','globalSoilRoughness'])
 assert(shader.fragmentShader.includes('texture2D('+map+',soilDetailAtlasUV'));
assert.equal(shader.uniforms.globalSoilStrength,uniforms);
assert(a.customProgramCacheKey().includes(SOIL_ANTI_TILING_VERSION));
assert.equal(installGlobalSoilDetail(a,atlas,uniforms),false,'Installing twice must be a no-op');
const clone=material();clone.userData.globalSoilDetailInstalled=true;
assert.equal(installGlobalSoilDetail(clone,atlas,uniforms),true,
 'Cloned terrain must receive its own shader; copying userData is insufficient');

const game=readFileSync(new URL('../src/terrain-game-detail.js',import.meta.url),'utf8');
const steppe=readFileSync(new URL('../src/steppe-surface.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert(game.includes('SOIL_ANTI_TILING_GLSL'));
assert(game.includes('soilDetailNeighbours(coordinate,bestId,nextId,blend)'));
assert(game.includes('soilDetailMacro(vSteppeWorld)'));
assert(game.includes("ctx.globalCompositeOperation='darken'"),'Road clearing needs soft multi-ring blending');
assert(game.includes('soilDetailDomains(vSteppeWorld.xz'));
assert(game.includes('material.userData.skipGlobalSoilDetail=true'));
assert(!game.includes('vec2 gameAtlasUV('),'Do not reinstate periodic close-up sampling');
assert(!game.includes('normalMap:maps.normal'),'Do not stack old repeating bump textures');
assert(steppe.includes('!material.userData.skipGlobalSoilDetail'));
assert(steppe.includes('vec3 steppeUntiledMicro(vec2 p)'), 'Baseline satellite micro grain still tiles');
assert(!steppe.includes('steppeMicro,p/2.0'), 'Direct repeating satellite grain is forbidden');
for(const name of ['steppe-surface','terrain-game-detail']){
 const imports=[...index.matchAll(/['"](.\/src\/[^'"]+\.js\?v=[^'"]+)['"]/g)].map(m=>new URL(m[1],'https://museum.invalid/'));
 assert(imports.some(url=>url.pathname==='/src/'+name+'.js'&&url.searchParams.get('v')),'Versioned soil module missing: '+name);
}
console.log('SOIL_ANTI_TILING_PASS',JSON.stringify({version:SOIL_ANTI_TILING_VERSION,comparisons,
 diverse: different,percent:Math.round(100*different/comparisons),
 nearRepeatRemoved,nearRepeatRate:Math.round(100*nearRepeatRemoved/nearRepeat),boundaryJump,maxDiscontinuity}));
