import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {terrainHeight} from '../src/public-atmosphere-geometry.js';
const scene=JSON.parse(await readFile('data/public-scene.json','utf8')),bytes=await readFile('data/public-atmosphere.json.gz'),data=JSON.parse(gunzipSync(bytes));
assert.equal(data.terrainFingerprint,scene.fingerprint,'Atmosphere matches the published terrain revision');
assert.deepEqual(data.zones.map(z=>z.key),['left','center','right','city']);
assert.equal(data.zones[3].color,0x9e78df);
let triangles=0,maxError=0;
for(const z of data.zones){assert(z.fill.length>90);assert(z.border.length>18);for(let i=0;i<z.fill.length;i+=3){const p=z.fill.slice(i,i+3);assert(p.every(Number.isFinite));maxError=Math.max(maxError,Math.abs(p[1]-terrainHeight(scene,p[0],p[2])));}triangles+=z.fill.length/9+z.border.length/9+z.borderWide.length/9;}
assert(maxError<.003,'District overlays follow the SAME terrain triangles');
assert(triangles<100000,'Thematic geometry budget');
assert(bytes.length<1200000,'Compressed lighting and territory budget');
assert(data.fields.every(f=>/^(Дороги ·|Вечер ·|Аэродромы ·|Мачты ·|Башни ·)/.test(f.name)),'No frozen vehicle or aircraft lights');
const lamps=data.fields.flatMap(f=>f.records);assert(lamps.length>100);
for(const p of lamps){assert([p.x,p.y,p.z].every(Number.isFinite));assert.notEqual(p.powered,false);assert.notEqual(p.visible,false);}
assert(lamps.some(p=>p.style==='highway'));assert(lamps.some(p=>p.style==='cosmodrome'));
assert(data.fields.some(f=>f.name.includes('ВПП')&&f.records.length));
assert(data.fields.some(f=>f.name.startsWith('Мачты')&&f.records.length));
console.log('PUBLIC_ATMOSPHERE_GEOMETRY_PASS',JSON.stringify({triangles,maxError,lamps:lamps.length,bytes:bytes.length}));
