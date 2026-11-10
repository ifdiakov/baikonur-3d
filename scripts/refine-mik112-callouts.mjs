import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
for(const f of ['index.html','museum.html','workshop.html']){
 let s=readFileSync(f,'utf8');
 const old="const offset=view==='top'?new THREE.Vector3(0,510,.1):mik112Exhibit.focusOffset.clone();",fit='if(innerWidth<=850)offset.multiplyScalar(Math.max(1,.85/Math.max(camera.aspect,.3)));';
 if(!s.includes(fit)){assert(s.includes(old));s=s.replace(old,old+'\n  '+fit);}
 const suppression='(innerWidth<=850&&d.i===currentObject)';
 if(s.includes(suppression))s=s.replace(suppression,'(innerWidth<=850&&d.i===currentObject&&!pairedCard(o))');
 assert(s.includes('(innerWidth<=850&&d.i===currentObject&&!pairedCard(o))'));
 writeFileSync(f,s);
}
console.log('MIK112_MOBILE_CALLOUTS_FIT');
