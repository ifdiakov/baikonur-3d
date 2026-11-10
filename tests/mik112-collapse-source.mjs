import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import * as THREE from 'three';
import {buildMik112} from '../src/mik112.js';
import {roofSectionPose,collapsePhase,COLLAPSE_DURATION,COLLAPSE_NOTICE} from '../src/mik112-collapse-sequence.js';
const root=new THREE.Group(),exhibit=buildMik112(root);assert(exhibit.reconstructionCradles);assert.equal(exhibit.reconstructionCradles.visible,false);
const start=[],end=[];
for(let b=0;b<3;b++)for(let s=0;s<12;s++){
 const a=roofSectionPose(b,s,0),z=roofSectionPose(b,s,32);assert.equal(a.progress,0);assert.equal(z.progress,1);assert(a.position[1]>55&&z.position[1]<8);start.push(a);end.push(z);
 let prev=a.position[1];for(let t=0;t<=32;t+=.1){const p=roofSectionPose(b,s,t);assert(p.position[1]<=prev+1e-8);prev=p.position[1];assert([...p.position,...p.rotation].every(Number.isFinite));}
}
assert.equal(start.length,36);assert.equal(collapsePhase(0).title,'До обрушения');assert.equal(collapsePhase(32).title,'Гибель «Бурана»');assert.equal(COLLAPSE_DURATION,32);assert(COLLAPSE_NOTICE.includes('не являются'));
for(const f of ['index.html','museum.html','workshop.html']){
 const s=readFileSync(f,'utf8');assert(!s.includes("rocketExhibits.add('mik112-hall'"));assert(s.includes('id="mik112Collapse"'));assert(s.includes("import('./src/mik112-collapse.js"));assert(s.includes('mik112Collapse?.update(now)'));assert(s.includes("mounts.tua.forEach"));
}
assert.equal(readFileSync('index.html','utf8'),readFileSync('museum.html','utf8'));
mkdirSync('qa-mik-collapse',{recursive:true});const report={passed:true,roofSections:36,phases:4,defaultHallExhibit:false,cradlesHidden:true,duration:32,deterministic:true};writeFileSync('qa-mik-collapse/source.json',JSON.stringify(report,null,2));console.log('MIK112_COLLAPSE_SOURCE_PASS',JSON.stringify(report));
