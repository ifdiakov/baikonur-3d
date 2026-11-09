import assert from 'node:assert/strict';
import {arrivalFollowAvailable as allowed} from '../src/arrival-follow-availability.js';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from 'three';
const bounds={minX:-100,maxX:100,minZ:-200,maxZ:200},pose=(x,z,visible=true)=>({visible,position:{x,z}});
for(const [x,z]of [[0,0],[-100,0],[100,0],[0,200],[0,-200]])assert(allowed(pose(x,z),bounds));
for(const [x,z]of [[-100.01,0],[100.01,0],[0,-200.01],[0,200.01],[NaN,0],[Infinity,0]])assert(!allowed(pose(x,z),bounds));
assert(!allowed(pose(0,0,false),bounds));assert(!allowed(pose(0,0),bounds,true));assert(!allowed(pose(0,0),null));assert(!allowed(null,bounds));
const source=await readFile('src/evening-scene.js','utf8'),start=source.indexOf(' function setEvening(){'),end=source.indexOf(' button?.remove();',start);assert(start>0&&end>start);
const mat={color:new THREE.Color()},original=new THREE.Color(.4,.6,.8),calls=[];
const ctx={THREE,evening:false,sky:{visible:false},scene:{background:new THREE.Color(),fog:{}},hemisphere:{color:new THREE.Color(),groundColor:new THREE.Color()},sun:{color:new THREE.Color(),position:new THREE.Vector3()},originals:new Map([[mat,original]]),fields:[{setEvening:v=>calls.push(v)}],floods:[],onModeChange:v=>calls.push(v)};ctx.scene.fog.color=new THREE.Color();
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
for(const value of [true,false,undefined]){ctx.setEvening(value);assert(ctx.evening);assert(ctx.sky.visible);assert.equal(ctx.scene.background.getHex(),0x172844);assert.equal(ctx.scene.fog.density,.000115);assert.equal(ctx.sun.intensity,.5);assert.equal(ctx.hemisphere.intensity,.82);assert(mat.color.equals(original.clone().multiply(new THREE.Color(0x53647f))));}
assert(calls.every(v=>v===true));
for(const file of ['index.html','museum.html','workshop.html']){const text=await readFile(file,'utf8');assert(!text.includes('id="museumLightSwitch"'));assert(!text.includes('setEvening(false)'));assert(!text.includes('scene.background.set(0xa6afb4)'));assert(text.indexOf('const museumCameraBounds=')<text.indexOf('arrivalFlight=createArrivalFlight('));}
console.log('EVENING_NAVIGATION_UNIT_PASS');
