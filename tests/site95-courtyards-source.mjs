import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import * as THREE from 'three';
import {buildSite95} from '../src/site95.js';
import {SITE95_BUILDINGS as homes,SITE95_YAW} from '../src/site95-layout.js';
import {SITE95_COURTYARDS as plan} from '../src/site95-courtyard-plan.js';
const c=Math.cos(SITE95_YAW),s=Math.sin(SITE95_YAW),uv=([x,z])=>[c*x-s*z,s*x+c*z];
const root=new THREE.Group(),built=buildSite95(root);root.updateMatrixWorld(true);
let minimumWallGap=Infinity,triangles=0,draws=0,lights=0;
for(const [i,a]of homes.entries())for(const b of homes.slice(i+1)){
 const aa=uv(a.position),bb=uv(b.position),gap=Math.hypot(Math.max(0,Math.abs(aa[0]-bb[0])-(a.length+b.length)/2),Math.max(0,Math.abs(aa[1]-bb[1])-(a.depth+b.depth)/2));minimumWallGap=Math.min(minimumWallGap,gap);assert(gap>=5.98,a.id+' touches '+b.id);
}
let pathSamples=0;
for(const path of plan.paths)for(let i=1;i<path.points.length;i++){
 const a=path.points[i-1],b=path.points[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.5));
 for(let j=0;j<=n;j++){const p=uv([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);pathSamples++;
  for(const h of homes){const q=uv(h.position),distance=Math.hypot(Math.max(0,Math.abs(p[0]-q[0])-h.length/2),Math.max(0,Math.abs(p[1]-q[1])-h.depth/2));assert(distance>=path.width/2+.1,'Walkway enters '+h.id);}
 }
}
for(const p of [...plan.lamps,...plan.benches.map(b=>b.position),...plan.trees])for(const h of homes){const a=uv(p),b=uv(h.position);assert(!(Math.abs(a[0]-b[0])<h.length/2+.3&&Math.abs(a[1]-b[1])<h.depth/2+.3),'Furniture inside a house');}
root.traverse(o=>{if(o.isLight)lights++;if(!o.isMesh)return;draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});
assert.equal(homes.length,51);assert.equal(plan.lamps.length,60);assert.equal(plan.paths.filter(p=>p.kind==='frontage').length,51);assert.equal(lights,0);assert(triangles<100000);assert(draws<=22);assert(built.features['site95-lamp-lens']===60);assert(root.userData.site95Model.windowLights);
const result={passed:true,buildings:homes.length,minimumWallGap,walkways:plan.paths.length,pathSamples,lamps:plan.lamps.length,benches:plan.benches.length+4,trees:plan.trees.length,triangles,draws,newRealtimeLights:lights};mkdirSync('qa-site95',{recursive:true});writeFileSync('qa-site95/courtyards-source.json',JSON.stringify(result,null,2));console.log('SITE95_COURTYARDS_SOURCE_PASS',JSON.stringify(result));
