import assert from 'node:assert/strict';
import * as THREE from 'three';
import {validateWorkshopState,applyWorkshopObjects} from '../src/workshop-state.js';
const state=validateWorkshopState({version:1,objects:{'pad-113':{position:[-20,4,100],yaw:.5,scale:1.2}},roadEdits:null});
const g=new THREE.Group();g.scale.setScalar(.14);const o={g,record:{id:'pad-113'}};
assert.equal(applyWorkshopObjects([o],state),1);assert.equal(g.position.y,4);assert(Math.abs(g.scale.x-.168)<1e-6);applyWorkshopObjects([o],state);assert(Math.abs(g.scale.x-.168)<1e-6,'Scale applies idempotently');
for(const bad of [null,{version:2,objects:{}},{version:1,objects:{x:{position:[0,Infinity,0],yaw:0,scale:1}}},{version:1,objects:{x:{position:[0,0,0],yaw:0,scale:0}}},JSON.parse('{"version":1,"objects":{"__proto__":{"position":[0,0,0],"yaw":0,"scale":1}}}')])assert.throws(()=>validateWorkshopState(bad));
assert.throws(()=>validateWorkshopState({version:1,objects:{},roadEdits:{version:1,added:[{id:'x',width:NaN,points:[]}],hidden:[]}}));
console.log('WORKSHOP_STATE_PASS');
