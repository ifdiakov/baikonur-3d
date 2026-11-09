import * as THREE from 'three';
import {SITE95_COURTYARDS as plan} from './site95-courtyard-plan.js?v=20261109-courts-v2';
import {SITE95_YAW} from './site95-layout.js?v=20261109-courts-v2';

/** Shared fixtures and one pooled ground-light material, no per-lamp lights. */
export function buildSite95Landscape(root,k){
 const y=.09,c=Math.cos(SITE95_YAW),s=Math.sin(SITE95_YAW);
 const local=(p,u,v)=>[p[0]+c*u+s*v,p[1]-s*u+c*v];
 k.mat.lampLens=new THREE.MeshStandardMaterial({color:0xffdeb0,emissive:0xffbd75,emissiveIntensity:1.35,roughness:.55,toneMapped:false});
 k.mat.lampLens.userData.keepBrightness=true;
 const size=64,rgba=new Uint8Array(size*size*4);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  const r=Math.hypot((x+.5-size/2)/(size/2),(z+.5-size/2)/(size/2));
  const a=Math.max(0,1-r*r),i=(z*size+x)*4;
  rgba[i]=255;rgba[i+1]=182;rgba[i+2]=102;rgba[i+3]=Math.round(a*a*a*255);
 }
 const texture=new THREE.DataTexture(rgba,size,size,THREE.RGBAFormat);
 texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
 texture.minFilter=texture.magFilter=THREE.LinearFilter;
 k.mat.courtGlow=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.28,blending:THREE.AdditiveBlending,depthTest:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-.1,polygonOffsetUnits:-.1});
 k.mat.courtGlow.userData.keepBrightness=true;
 for(const path of plan.paths){
  const points=path.points.filter((p,i,a)=>!i||Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1])>.01);
  if(points.length>1)k.path(points,path.width,y,'concrete','site95-'+path.kind);
 }
 for(const p of plan.lamps){
  const height=4.4;
  k.box(.38,.2,.38,p[0],.1,p[1],'concrete','site95-lamp-base');
  k.rod([p[0],.15,p[1]],[p[0],height,p[1]],.065,'steel','site95-lamp-post');
  const end=local(p,.68,0);
  k.rod([p[0],height-.24,p[1]],[end[0],height+.08,end[1]],.043,'steel','site95-lamp-arm');
  k.box(.76,.15,.43,end[0],height+.08,end[1],'steel','site95-lamp-hood',SITE95_YAW);
  k.box(.55,.11,.31,end[0],height-.045,end[1],'lampLens','site95-lamp-lens',SITE95_YAW);
  const geometry=new THREE.PlaneGeometry(11,9);geometry.rotateX(-Math.PI/2);geometry.rotateY(SITE95_YAW);geometry.translate(p[0],y+.013,p[1]);
  const pool=k.direct(geometry,'courtGlow','site95-courtyard-light');pool.castShadow=false;
 }
 for(const b of plan.benches){const p=b.position;
  k.box(3.2,.16,.8,p[0],.64,p[1],'rust','site95-courtyard-bench',SITE95_YAW);
  const back=local(p,0,b.side*.42);k.box(3.2,.58,.11,back[0],.96,back[1],'rust','site95-bench-back',SITE95_YAW);
  for(const u of [-1.1,1.1]){const q=local(p,u,0);k.box(.14,.58,.65,q[0],.29,q[1],'steel','site95-bench-leg',SITE95_YAW);}
 }
 for(const p of plan.beds){
  k.box(4.3,.09,3.3,p[0],.045,p[1],'concrete','site95-planter-border',SITE95_YAW);
  k.box(4,.08,3,p[0],.105,p[1],'soil','site95-planter-soil',SITE95_YAW);
  for(const u of [-1.3,1.3]){const q=local(p,u,0);k.box(.9,.48,1.5,q[0],.34,q[1],'green','site95-low-shrub',SITE95_YAW);}
 }
 for(const [i,p]of plan.trees.entries()){
  const h=3.4+(i%3)*.4;
  k.rod([p[0],0,p[1]],[p[0],h,p[1]],.105,'rust','site95-courtyard-tree');
  const crown=new THREE.IcosahedronGeometry(1,0);crown.scale(1.45,1.7,1.4);crown.translate(p[0],h-.1,p[1]);
  k.direct(crown,'green','site95-tree-crown');
 }
 return {version:plan.version,walkways:plan.paths.length,litLamps:plan.lamps.length,benches:plan.benches.length+4,trees:plan.trees.length,plantingBeds:plan.beds.length,newRealtimeLights:0,sharedLightTexture:[size,size],minimumBuildingGap:6};
}
