import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const revision='20261112-krayniy-labels-v1';
for(const file of ['index.html','museum.html','workshop.html']){
 let s=readFileSync(file,'utf8');
 if(s.includes('// KRAYNIY_CAMERA_LABELS_V1'))continue;
 const replace=(a,b)=>{assert(s.includes(a),file+': missing '+a.slice(0,100));assert.equal(s.split(a).length,2,file+': ambiguous anchor');s=s.replace(a,b);};
 replace("import * as THREE from 'three';","// KRAYNIY_CAMERA_LABELS_V1\nimport {siteLabelVisibility,includeKrayniyCameraArea} from './src/map-view-policy.js?v="+revision+"';\nimport * as THREE from 'three';");
 replace(' const siteAlpha=smooth(225,365)*(1-smooth(470,560));\n const detailAlpha=1-smooth(225,370);',' const {siteAlpha,detailAlpha}=siteLabelVisibility(y);');
 replace('el.classList.toggle("compact",near>600);','el.classList.add("compact");');
 const start=s.indexOf('const museumCameraBounds='),end=s.indexOf('\n',start);assert(start>=0&&end>start);
 const old=s.slice(start,end);assert(old.includes('FLANK_OUTLINE'));
 replace(old,old.replace('const museumCameraBounds=','const flankCameraBounds=')+"\nconst krayniyCameraBox=new THREE.Box3().setFromObject(objects.find(o=>o.record.id==='airfield').g);\nconst museumCameraBounds=includeKrayniyCameraArea(flankCameraBounds,krayniyCameraBox);");
 writeFileSync(file,s);
}
assert.equal(readFileSync('index.html','utf8'),readFileSync('museum.html','utf8'));
console.log('KRAYNIY_CAMERA_LABELS_APPLIED');
