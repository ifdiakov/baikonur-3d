import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import * as THREE from 'three';
import {createLossStructure,createHistoricalPayload,BURAN_LOSS_HISTORY,lossPhase} from '../src/buran-loss-scene.js';
const checks=[];const check=(name,fn)=>{fn();checks.push({name,passed:true});};
for(const path of ['index.html','museum.html','workshop.html']){const html=readFileSync(path,'utf8');check(path+' only hall exhibit removed',()=>{assert(!html.includes("rocketExhibits.add('mik112-hall'"));assert(html.includes("rocketExhibits.add('tua-'+index"));assert(html.includes("buranLossStart.textContent='Гибель Бурана'"));assert(html.includes("import('./src/buran-loss.js?v=20261110-photo-v2')"));assert(html.includes('buranLoss?.update(now)'));});}
check('Date and high bays explicitly sourced',()=>{assert.equal(BURAN_LOSS_HISTORY.date,'2002-05-12');assert.equal(BURAN_LOSS_HISTORY.photoDate,'2002-05-13');assert.deepEqual(BURAN_LOSS_HISTORY.bays,[3,4,5]);});
const structure=createLossStructure();const snapshot=()=>[...structure.panels.instanceMatrix.array,...structure.trusses.instanceMatrix.array];
structure.seek(0);const before=snapshot();structure.seek(28);const after=snapshot();
check('Roof genuinely falls and ends with no dust',()=>{assert.notDeepEqual(before,after);assert(!structure.stats().dustVisible);assert.equal(structure.stats().flames,0);});
check('Every frame is finite and reverse scrubbing is deterministic',()=>{for(let t=0;t<=28;t+=.25){structure.seek(t);assert(snapshot().every(Number.isFinite));}structure.seek(0);assert.deepEqual(snapshot(),before);structure.seek(28);assert.deepEqual(snapshot(),after);});
check('Cutaway does not remove structural trusses',()=>{structure.setCutaway(true);assert(structure.stats().cutaway);assert.equal(structure.trusses.count,39);structure.setCutaway(false);assert.equal(structure.panels.material.opacity,1);});
const source=new THREE.Group();source.add(new THREE.Mesh(new THREE.BoxGeometry(8,58,5),new THREE.MeshStandardMaterial()));const original=source.children[0].geometry.attributes.position.array.slice(),payload=createHistoricalPayload(source,{position:[-35,15.36,-35],rotation:[Math.PI/2,0,0]});payload.seek(0);check('Payload only temporarily shows before loss',()=>{assert(payload.stats().intactVisible);payload.seek(28);assert(!payload.stats().intactVisible);assert(payload.stats().fragmentsVisible);});payload.seek(0);
check('Shared source never damaged by reconstruction',()=>assert.deepEqual(source.children[0].geometry.attributes.position.array,original));
check('Quantized GLB positions retain full metre-space geometry',()=>{
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Uint16BufferAttribute([0,0,0,65535,0,0,0,65535,65535],3,true));
 const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial());mesh.scale.set(20,58,12);const src=new THREE.Group();src.add(mesh);
 const p=createHistoricalPayload(src,{position:[-35,15.36,-35],rotation:[Math.PI/2,0,0]});
 const whole=p.root.children[0],broken=p.root.children[1];p.root.updateMatrixWorld(true);
 const a=new THREE.Box3().setFromObject(whole),b=new THREE.Box3().setFromObject(broken);
 assert(a.min.distanceTo(b.min)<.001&&a.max.distanceTo(b.max)<.001,'Fragmentation must not shrink or teleport quantized geometry');
 assert.equal(g.attributes.position.array[3],65535);p.dispose();g.dispose();mesh.material.dispose();
});
structure.dispose();payload.dispose();mkdirSync('qa-buran-loss',{recursive:true});writeFileSync('qa-buran-loss/source-report.json',JSON.stringify({passed:true,checks},null,2));console.log('BURAN_LOSS_SOURCE_PASS',checks.length);
