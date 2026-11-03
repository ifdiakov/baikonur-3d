import * as THREE from 'three';

/**
 * The two slender R-7 umbilical / pneumatic service columns rotate in the
 * VERTICAL plane at separate countdown times. Not a Y-axis pirouette.
 * Site source models are fused by material, so the centre mast silhouettes
 * are suppressed during the reconstruction and represented by actual hinged
 * 3-D trusses. Outside the reconstruction the original source stays intact.
 */
export const SOYUZ_COLUMN_VERSION='soyuz-retracting-pneumatic-columns-v2';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function beam(group,a,b,r,material,segments=7){
 const start=V(...a),end=V(...b),axis=end.clone().sub(start),length=axis.length();
 if(length<.01)return;
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,length,segments),material);
 mesh.position.copy(start).add(end).multiplyScalar(.5);
 mesh.quaternion.setFromUnitVectors(V(0,1,0),axis.normalize());
 mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.pickable=false;group.add(mesh);
 return mesh;
}
function hatch(group,w,d,y,x,z,material){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,.16,d),material);
 mesh.position.set(x,y,z);mesh.userData.pickable=false;mesh.castShadow=true;group.add(mesh);
}
function buildColumn(root,side,which,siteId){
 const height=which===0?39.4:37.0;
 const hinge=V(side*(siteId==='pad-1'?18.0:19.6),1.8,which===0?-2.8:4.8);
 const pivot=new THREE.Group();pivot.name='Пневмоколонна '+(which+1)+' · поворотная в вертикальной плоскости';
 pivot.position.copy(hinge);root.add(pivot);
 const paint=new THREE.MeshStandardMaterial({color:which===0?0x2e553e:0x335c48,metalness:.52,roughness:.65,side:THREE.DoubleSide});
 const steel=new THREE.MeshStandardMaterial({color:0x70867d,metalness:.68,roughness:.46});
 const platform=new THREE.MeshStandardMaterial({color:0x344d43,metalness:.48,roughness:.68});
 const brass=new THREE.MeshStandardMaterial({color:0xb49a52,metalness:.53,roughness:.52});
 const baseX=0,topX=-side*(which===0?13.1:14.7),width=3.0,depth=3.1;
 const near=x=>baseX+(topX-baseX)*x;
 for(const sx of [-1,1])for(const sz of [-1,1]){
  beam(pivot,[sx*width*.5,0,sz*depth*.5],[topX+sx*width*.31,height,sz*depth*.33],.15,paint);
 }
 const levels=16;
 for(let j=0;j<levels;j++){
  const a=j/levels,b=(j+1)/levels;
  const y0=height*a,y1=height*b,x0=near(a),x1=near(b);
  const hw0=width*(.5-.19*a),hw1=width*(.5-.19*b),hd0=depth*(.5-.17*a),hd1=depth*(.5-.17*b);
  for(const zside of [-1,1]){
   beam(pivot,[x0-hw0,y0,zside*hd0],[x1+hw1,y1,zside*hd1],.08,paint,6);
   beam(pivot,[x0+hw0,y0,zside*hd0],[x1-hw1,y1,zside*hd1],.075,steel,6);
   beam(pivot,[x0-hw0,y0,zside*hd0],[x0+hw0,y0,zside*hd0],.10,steel,6);
  }
  for(const xside of [-1,1]){
   beam(pivot,[x0+xside*hw0,y0,-hd0],[x1+xside*hw1,y1,hd1],.072,paint,6);
   beam(pivot,[x0+xside*hw0,y0,hd0],[x1+xside*hw1,y1,-hd1],.075,steel,6);
  }
 }
 for(const level of [8.0,15.5,23.0,30.5,height-2.5]){
  const factor=level/height,x=near(factor);
  hatch(pivot,4.3,4.8,level,x-side*1.1,0,platform);
  beam(pivot,[x-side*3,level+.85,-2.4],[x-side*3,level+.85,2.4],.07,steel);
  for(const z of [-2.4,2.4])beam(pivot,[x-side*3,level,z],[x-side*3,level+1.3,z],.06,steel);
 }
 // Distinct feed pipes, flexible connection to the vehicle, joint housing.
 for(let i=0;i<2;i++){
  beam(pivot,[side*(.85+i*.35),1.0,1.1],[topX+side*(.30+i*.35),height-1,1.0],.105,steel);
 }
 const head=new THREE.Mesh(new THREE.BoxGeometry(4.5,2.5,4.1),paint);
 head.position.set(topX-side*1.0,height-1.5,0);head.castShadow=true;pivot.add(head);
 const tip=beam(pivot,[topX-side*1.3,height-1.8,0],[topX-side*5.6,height-1.3,0],.22,steel);
 tip.userData.museumComponent='pneumatic-umbilical-head';
 // Pneumatic cylinder / hydraulic linkage extends towards the hinge.
 beam(pivot,[side*2.1,1.7,-2.5],[topX*.41,height*.43,-2.5],.33,steel);
 const counter=new THREE.Mesh(new THREE.CylinderGeometry(.95,.95,3.6,20),brass);
 counter.rotation.x=Math.PI/2;counter.position.set(side*3.5,1.4,0);pivot.add(counter);
 for(const child of pivot.children)child.userData.pickable=false;
 return {pivot,side,which,height,materials:[paint,steel,platform,brass],hinge:hinge.toArray()};
}
const SOURCE_COMPONENTS=new Set(['site31-source-structure','gagarin-site31-table']);
function maskSourceStaticColumns(siteRoot){
 siteRoot.updateWorldMatrix(true,true);
 const toSite=siteRoot.matrixWorld.clone().invert(),replacements=[];
 const visited=new Map();
 siteRoot.traverse(mesh=>{
  if(!mesh.isMesh||!SOURCE_COMPONENTS.has(mesh.userData?.museumComponent))return;
  const originals=mesh.material,src=Array.isArray(originals)?originals:[originals],masked=[];
  for(const old of src){
   if(visited.has(old)){masked.push(visited.get(old));continue;}
   const material=old.clone(),originalCompile=old.onBeforeCompile,originalKey=old.customProgramCacheKey?.bind(old);
   material.onBeforeCompile=(shader,renderer)=>{
    originalCompile?.call(material,shader,renderer);
    shader.uniforms.uSoyuzWorldToSite={value:toSite};
    shader.vertexShader=shader.vertexShader
     .replace('#include <common>','#include <common>\nuniform mat4 uSoyuzWorldToSite;\nvarying vec3 vSoyuzSitePos;')
     .replace('#include <begin_vertex>','#include <begin_vertex>\nvSoyuzSitePos=(uSoyuzWorldToSite*modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader
     .replace('#include <common>','#include <common>\nvarying vec3 vSoyuzSitePos;')
     .replace('#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>\nif(vSoyuzSitePos.y>11.5 && vSoyuzSitePos.y<46. && abs(vSoyuzSitePos.x)<25. && abs(vSoyuzSitePos.z)<20.) discard;');
   };
   material.customProgramCacheKey=()=>(originalKey?.()||'')+'|soyuz-column-hide-v2';
   material.needsUpdate=true;visited.set(old,material);masked.push(material);
  }
  mesh.material=Array.isArray(originals)?masked:masked[0];
  replacements.push({mesh,originals});
 });
 return {count:replacements.length,restore(){
  for(const {mesh,originals}of replacements)mesh.material=originals;
  for(const material of visited.values())material.dispose();
 }};
}
export function createSoyuzPneumaticColumns({siteRoot,siteId}){
 const root=new THREE.Group();root.name='Союз · действующие пневмоколонны';root.userData.pickable=false;siteRoot.add(root);
 const columns=[buildColumn(root,-1,0,siteId),buildColumn(root,1,1,siteId)];
 // Source full-table mesh has welded columns, so temporarily remove the fixed
 // silhouettes and use our hinged assemblies. The original mesh is untouched.
 const mask=maskSourceStaticColumns(siteRoot);
 function render(sample){
  const values=[sample.firstColumnOpen??0,sample.secondColumnOpen??0];
  for(let i=0;i<columns.length;i++){
   const column=columns[i],value=clamp(values[i]);
   column.pivot.rotation.z=-column.side*1.10*value;
   column.pivot.position.y=1.8-.20*Math.sin(Math.PI*value);
  }
 }
 function stop(){
  mask.restore();root.parent?.remove(root);
  root.traverse(m=>{m.geometry?.dispose?.();});
  for(const column of columns)for(const material of column.materials)material.dispose();
 }
 return {root,columns,sourceMasks:mask.count,render,stop};
}
