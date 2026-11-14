import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import * as THREE from 'three';
import {buildEveningScene} from '../src/evening-scene.js';
import {arrivalFollowAvailable} from '../src/arrival-follow-availability.js';
import {MUSEUM_SECTIONS} from '../src/museum-menu.js';
import {assertMenuMarkup} from './helpers/menu-markup.mjs';

// Check supported behavior, not the output of a one-time historical migration.
const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.FogExp2();
const sun=new THREE.DirectionalLight(),hemisphere=new THREE.HemisphereLight();scene.add(sun,hemisphere);
const layers={roads:new THREE.Group(),sites:new THREE.Group(),city:new THREE.Group()};scene.add(...Object.values(layers));
const evening=buildEveningScene({scene,camera:new THREE.PerspectiveCamera(),sun,layers,objects:[],roads:[],groundMeshes:[]});
for(const requested of [false,true,false]){
 evening.setEvening(requested);
 assert.equal(evening.evening,true);assert(evening.stats().permanentEvening);
 assert.equal(scene.background.getHex(),0x172844);assert.equal(scene.fog.color.getHex(),0x202c46);assert.equal(scene.fog.density,.000115);
 assert.equal(sun.intensity,.5);assert.equal(hemisphere.intensity,.82);
}
const bounds={minX:-10,maxX:10,minZ:-20,maxZ:20};
for(const [x,z,visible,expected]of [[0,0,true,true],[10,20,true,true],[11,0,true,false],[0,21,true,false],[0,0,false,false]]){
 assert.equal(arrivalFollowAvailable({position:{x,z},visible},bounds),expected);
 assert.equal(arrivalFollowAvailable({position:{x,z},visible},bounds,true),false);
}
assert.equal(MUSEUM_SECTIONS.find(s=>s.id==='traditionsAccordion').parent,'mythsAccordion');
for(const file of ['index.html','museum.html','workshop.html']){
 const html=await readFile(file,'utf8');assertMenuMarkup(html,MUSEUM_SECTIONS);
 assert(html.includes('getFollowBounds:()=>arrivalMapBounds'),'Aircraft follows only within the map: '+file);
 assert(!html.includes('eveningScene.setEvening(false)'),'Reconstructions must retain evening: '+file);
}
assert((await readFile('index.html')).equals(await readFile('museum.html')));
await mkdir('qa-original-museum',{recursive:true});
await writeFile('qa-original-museum/source-parity.json',JSON.stringify({passed:true,contract:'permanent evening, fog and lighting; bounded follow; retained navigation; public entry parity',historicalSnapshot:false},null,2));
console.log('EVENING_NAVIGATION_SOURCE_PASS');
