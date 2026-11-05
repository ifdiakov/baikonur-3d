import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOIL_ANTI_TILING_VERSION,SOIL_ANTI_TILING_GLSL,sampleSoilDetailDomains} from '../src/soil-anti-tiling.js';
import {GLOBAL_SOIL_DETAIL_VERSION,installGlobalSoilDetail} from '../src/global-steppe-detail.js';

assert.match(SOIL_ANTI_TILING_VERSION,/anti-tiling/);
assert.match(GLOBAL_SOIL_DETAIL_VERSION,/anti-tiling/);
assert(SOIL_ANTI_TILING_GLSL.includes('soilDetailDomains'));
assert(SOIL_ANTI_TILING_GLSL.includes('soilDetailAtlasUV'));
assert(SOIL_ANTI_TILING_GLSL.includes('soilDetailNoise'));
assert(!SOIL_ANTI_TILING_GLSL.includes('sin('),'Noise must avoid costly per-pixel transcendental hash');
assert(!SOIL_ANTI_TILING_GLSL.includes('fract(world/3.2)'),'Old repeating atlas UVs have been removed');

const fract=x=>x-Math.floor(x);
const phaseGap=(a,b)=>{
 const delta=Math.abs(fract(a)-fract(b));
 return Math.min(delta,1-delta);
};
let comparisons=0,different=0,maxDiscontinuity=0;
for(let x=-950;x<950;x+=39.5)for(let z=-740;z<750;z+=59.3){
 const a=sampleSoilDetailDomains(x,z),b=sampleSoilDetailDomains(x+3.2,z);
 const first=phaseGap(a.a[0],b.a[0])+phaseGap(a.a[1],b.a[1]);
 const second=phaseGap(a.b[0],b.b[0])+phaseGap(a.b[1],b.b[1]);
 if(first+second>.13)different++;
 comparisons++;
 assert(a.mix>=.32-1e-10&&a.mix<=.54+1e-10);
 for(const domain of ['a','b']){
  const later=sampleSoilDetailDomains(x+.001,z+.001);
  const drift=Math.hypot(...a[domain].map((v,i)=>v-later[domain][i]));
  maxDiscontinuity=Math.max(maxDiscontinuity,drift);
 }
}
assert(different/comparisons>.92,'A 3.2-unit shift must no longer reproduce the same grain tile');
assert(maxDiscontinuity<.02,'Domain warp should be continuous at neighbouring points');
assert.deepEqual(sampleSoilDetailDomains(151.3,-201.9),sampleSoilDetailDomains(151.3,-201.9));
assert.throws(()=>sampleSoilDetailDomains(Infinity,0),/finite/);

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
assert(game.includes('soilDetailDomains(vSteppeWorld.xz'));
assert(game.includes('material.userData.skipGlobalSoilDetail=true'));
assert(!game.includes('vec2 gameAtlasUV('),'Do not reinstate periodic close-up sampling');
assert(!game.includes('normalMap:maps.normal'),'Do not stack old repeating bump textures');
assert(steppe.includes('!material.userData.skipGlobalSoilDetail'));
assert(index.includes('steppe-surface.js?v=20261105-anti-tiling-v14'));
assert(index.includes('terrain-game-detail.js?v=20261105-anti-tiling-v7'));
console.log('SOIL_ANTI_TILING_PASS',JSON.stringify({version:SOIL_ANTI_TILING_VERSION,comparisons,
 diverse: different,percent:Math.round(100*different/comparisons),maxDiscontinuity}));
