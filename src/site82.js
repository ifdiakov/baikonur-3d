import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';
export const SITE82_VERSION='20261111-site82-buried-v1';
export const SITE82_PROFILE=Object.freeze({floor:-6.6,roof:1.05,cover:3.2,width:42,depth:66,entranceWidth:12,interpretation:'Owner identifies a buried structure. Shape and dimensions are a museum interpretation, not an engineering survey.'});
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function buildSite82(root){
 const k=archiveKit(root),p=SITE82_PROFILE;
 root.userData.skipGenericSiteLights=true;
 // Structural volume is below the terrain datum; no above-ground hangar.
 k.box(44,.7,68,0,p.floor-.35,0,'concrete','site82-foundation');
 for(const x of [-21.6,21.6])k.box(1.2,7.7,68,x,-2.75,0,'concrete','site82-buried-sidewall');
 k.box(44,7.7,1.2,0,-2.75,-33.6,'concrete','site82-buried-backwall');
 k.box(45,.8,70,0,p.roof-.4,0,'concrete','site82-roof-slab');
 for(const x of [-14,14])k.box(16,7.7,1.3,x,-2.75,33.6,'concrete','site82-entry-front');
 k.box(12,1.8,1.4,0,.1,33.6,'concrete','site82-portal-lintel');
 for(const side of [-1,1]){
  k.box(5.9,5.6,.42,side*3,p.floor+2.8,33.35,'dark','site82-protective-door');
  for(let x=.5;x<5.9;x+=.9)k.box(.09,5.4,.10,side*x,p.floor+2.8,33.60,'steel','site82-door-rib');
  k.box(.11,1.1,.16,side*.45,p.floor+2.7,33.78,'steel','site82-door-handle');
 }
 // Genuine lower approach with retaining walls, cut from the map surface.
 const rampZ=[34,41,49,57,65,73],rampY=z=>p.floor+(z-34)/39*(-p.floor);
 for(let i=1;i<rampZ.length;i++){
  const a=rampZ[i-1],b=rampZ[i],wa=6+(a-34)*.055,wb=6+(b-34)*.055;
  k.quad([-wa,rampY(a),a],[-wb,rampY(b),b],[wb,rampY(b),b],[wa,rampY(a),a],'concrete','site82-sunken-ramp');
  for(const s of [-1,1]){
   const top=z=>z<54?2.1*(1-smooth((z-40)/14))+.25:.25;
   k.quad([s*wa,rampY(a)-.12,a],[s*wb,rampY(b)-.12,b],[s*wb,top(b),b],[s*wa,top(a),a],'concrete','site82-retaining-wall');
   k.rod([s*wa,top(a)+.06,a],[s*wb,top(b)+.06,b],.10,'light','site82-wall-cap');
  }
 }
 k.box(11.6,.08,.55,0,p.floor+.045,35.2,'dark','site82-drain');
 for(let x=-5.5;x<5.6;x+=.5)k.box(.09,.09,.55,x,p.floor+.10,35.2,'steel','site82-drain-grate');
 k.path([[-8.5,75],[8.5,75]],3.5,.02,'concrete','site82-entry-apron');
 for(const x of [-12,12]){
  k.cyl(.65,2.7,x,3.6,-16,'concrete','site82-ventilation');
  k.cyl(.85,.22,x,5.05,-16,'steel','site82-ventilation-cap');
 }
 // The soil cover is not registered as terrain-to-cut: it cannot erase itself.
 k.cutouts.push({shape:'polygon',polygon:[[-21.9,-34.9],[21.9,-34.9],[21.9,34.9],[6.1,34.9],[8.3,73],[-8.3,73],[-6.1,34.9],[-21.9,34.9]],source:'site82-buried-chamber-and-access'});
 const built=k.finish(),pos=[],uv=[],idx=[],nx=44,nz=56;
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
  const x=-44+i*2,z=-56+j*2,fx=1-smooth((Math.abs(x)-23)/21),fz=1-smooth((Math.abs(z)-36)/20);
  pos.push(x,-.035+p.cover*fx*fz,z);uv.push(i/nx,j/nz);
 }
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  const x=-44+(i+.5)*2,z=-56+(j+.5)*2;if(z>32&&Math.abs(x)<9)continue;
  const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;idx.push(a,c,b,b,c,d);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(idx);geometry.computeVertexNormals();
 const earth=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x9c927f,side:THREE.DoubleSide}));earth.name='Площадка 82 · земляная обваловка';earth.userData.site82Earth=true;earth.userData.pickable=false;root.add(earth);
 root.userData.site82Model={version:SITE82_VERSION,...p,buried:true,earthMesh:true,terrainCutout:true,ramp:{from:[0,0,73],to:[0,p.floor,34]},features:built.features};
 return {...built,model:root.userData.site82Model};
}
export function applySite82Ground(root,{referenceMaterial,steppeSurface,width,height,flankDistricts}){
 const earth=root?.children.find(c=>c.userData.site82Earth);if(!earth)return false;
 root.updateWorldMatrix(true,true);const a=earth.geometry.attributes.position,uv=earth.geometry.attributes.uv,v=new THREE.Vector3();
 for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(earth.matrixWorld);uv.setXY(i,v.x/width+.5,.5-v.z/height);}uv.needsUpdate=true;
 earth.material.map=referenceMaterial.map;earth.material.color.copy(referenceMaterial.color);steppeSurface.apply(earth.material);earth.material.needsUpdate=true;
 flankDistricts?.addTerrainSurface?.(earth,'left');root.userData.site82Model.sharedGroundTexture=true;return true;
}
