import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SOIL_MATERIALS,periodicSoilNoise,SOIL_ATLAS_COLUMNS,SOIL_ATLAS_ROWS,createDetailedSoilAtlases} from '../src/terrain-material-atlas.js';
import {GAME_TERRAIN_VERSION} from '../src/terrain-game-detail.js';
const source=await readFile(new URL('../src/terrain-game-detail.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
assert.equal(SOIL_MATERIALS.length,5);
assert.equal(new Set(SOIL_MATERIALS.map(s=>s.id)).size,5);
assert.equal(SOIL_ATLAS_COLUMNS,4);assert.equal(SOIL_ATLAS_ROWS,2);
for(let k=0;k<5;k++)for(const p of [0,.125,.37,.75,1]){
 assert(Math.abs(periodicSoilNoise(p,0,13,k)-periodicSoilNoise(p,1,13,k))<1e-10);
 assert(Math.abs(periodicSoilNoise(0,p,13,k)-periodicSoilNoise(1,p,13,k))<1e-10);
}
const atlas=await createDetailedSoilAtlases({tileSize:64});
assert.equal(atlas.materialCount,5);
assert.deepEqual([atlas.width,atlas.height],[256,128]);
assert.equal(atlas.gpuBytes,256*128*4*3);
for(const map of [atlas.albedo,atlas.normal,atlas.roughness]){
 assert.equal(map.image.width,256);assert.equal(map.image.height,128);
 assert.equal(map.image.data.length,256*128*4);
 assert(map.generateMipmaps);
 map.dispose();
}
assert(GAME_TERRAIN_VERSION.includes('five-materials'));
assert(source.includes('gameMaterialAlbedo')&&source.includes('gameMaterialNormal')&&source.includes('gameMaterialRoughness'));
assert(source.includes('gameTopMaterials')&&source.includes('soilDetailAtlasUV'));
assert(source.includes('SOIL_ANTI_TILING_GLSL')&&!source.includes('vec2 gameAtlasUV('),
 'The original periodic local soil UVs must not return');
assert(source.includes('const FIELD_RESOLUTION=512'));
assert(html.includes('gameTerrain=await createGameTerrainPilot('));
const globalSource=await readFile(new URL('../src/global-steppe-detail.js',import.meta.url),'utf8');
const steppeSource=await readFile(new URL('../src/steppe-surface.js',import.meta.url),'utf8');
assert(globalSource.includes('globalSoilPair'));
assert(steppeSource.includes('enableDetailedMaterials(atlases)'));
assert(steppeSource.includes('updateDetail(height)'));
assert(html.includes('steppeSurface.updateDetail(camera.position.y/SCENE_SCALE)'));
console.log('FIVE_SOIL_MATERIALS_PASS');
