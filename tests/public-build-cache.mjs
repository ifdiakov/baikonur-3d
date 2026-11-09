import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {verifyCache,recordCache} from '../scripts/public-build-cache.mjs';
const original=process.cwd(),dir=await mkdtemp(join(tmpdir(),'museum-cache-'));
try{
 process.chdir(dir);const git=(...args)=>execFileSync('git',args,{stdio:'ignore'});
 git('init');git('config','user.name','Cache test');git('config','user.email','cache@example.invalid');
 await mkdir('data');await mkdir('src');await mkdir('assets');
 await writeFile('src/scene.js','original');await writeFile('assets/terrain.webp','original');await writeFile('data/public-scene.json','{"ready":true}');await writeFile('data/workshop-published.json','{}');
 git('add','.');git('commit','-m','Source with verified generated assets');
 assert.equal((await verifyCache()).valid,false);await recordCache();assert.equal((await verifyCache()).valid,true);
 await writeFile('src/scene.js','new scene');assert.equal((await verifyCache()).valid,false);await writeFile('src/scene.js','original');
 await writeFile('data/workshop-published.json','{"objects":{"moved":true}}');assert.equal((await verifyCache()).valid,false);await writeFile('data/workshop-published.json','{}');
 await writeFile('assets/terrain.webp','damaged');assert.equal((await verifyCache()).valid,false);await writeFile('assets/terrain.webp','original');
 await writeFile('data/public-scene.json','{"ready":false}');assert.equal((await verifyCache()).valid,false);await writeFile('data/public-scene.json','{"ready":true}');assert.equal((await verifyCache()).valid,true);
 console.log('PUBLIC_BUILD_CACHE_PASS');
}finally{process.chdir(original);await rm(dir,{recursive:true,force:true});}
