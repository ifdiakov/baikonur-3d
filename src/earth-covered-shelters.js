import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';
export const PANTSIR_VERSION='20261112-earth-covered-v1';
// Owner-confirmed type. Geometry is a museum interpretation, not surveyed plans.
export const PANTSIR_PROFILES=Object.freeze({
 'pad-82':Object.freeze({width:32,depth:44,floor:-5.2,crown:1.45,ramp:34,steps:24}),
 'pad-83':Object.freeze({width:36,depth:52,floor:-5.6,crown:1.65,ramp:38,steps:26})
});
export function buildEarthCoveredShelter(root,siteId){
 const p=PANTSIR_PROFILES[siteId];if(!p)throw Error('Unknown earth-covered shelter '+siteId);
 const k=archiveKit(root),w=p.width/2,front=p.depth/2,back=-front,landing=front+7,end=front+p.ramp;
 k.mat.concrete.side=THREE.DoubleSide;k.mat.soil.side=THREE.DoubleSide;
 k.box(p.width,.45,p.depth,0,p.floor-.225,0,'concrete','pantsir-buried-floor');
 for(const x of [-w+.5,w-.5])k.box(1,2.6,p.depth,x,p.floor+1.3,0,'concrete','pantsir-buried-wall');
 k.box(p.width,5,1,0,p.floor+2.5,back+.5,'concrete','pantsir-rear-wall');
 const spring=-3.1,arch=(a,r=w,h=p.crown-spring)=>[Math.cos(a)*r,spring+Math.sin(a)*h];
 // Concrete barrel vault. The only exposed frontal mass is its portal, not a tall hall.
 for(let i=0;i<32;i++){
  const a=i*Math.PI/32,b=(i+1)*Math.PI/32,A=arch(a),B=arch(b),C=arch(b,w-.65,p.crown-spring-.55),D=arch(a,w-.65,p.crown-spring-.55);
  k.quad([A[0],A[1],back],[A[0],A[1],front],[B[0],B[1],front],[B[0],B[1],back],'concrete','pantsir-vault');
  k.quad([A[0],A[1],front],[D[0],D[1],front],[C[0],C[1],front],[B[0],B[1],front],'concrete','pantsir-arched-portal');
 }
 for(const x of [-10,10])k.box(12,5.2,1.0,x,p.floor+2.6,front-.5,'concrete','pantsir-portal-wing');
 k.box(8,1.2,1,0,-.65,front-.5,'concrete','pantsir-portal-lintel');
 k.box(7.2,3.65,.18,0,p.floor+1.825,front-.85,'dark','pantsir-recessed-gate');
 for(const x of [-1.8,0,1.8])k.box(.065,3.65,.08,x,p.floor+1.825,front-.70,'steel','pantsir-gate-joint');
 k.poly([[-5,front],[8.4,front],[8.4,landing],[-5,landing]],p.floor+.02,'concrete','pantsir-sunken-landing');
 k.quad([-5,p.floor,landing],[-5,0,end],[4.8,0,end],[4.8,p.floor,landing],'concrete','pantsir-access-ramp');
 for(const x of [-5.1,4.9,8.5]){
  k.quad([x,p.floor,front],[x,p.floor,landing],[x,0,end],[x,.45,front],'concrete','pantsir-retaining-wall');
  k.rod([x,.45,front],[x,.45,end],.13,'concrete','pantsir-retaining-cap');
 }
 for(let i=0;i<p.steps;i++){
  const rise=(i+1)*(-p.floor)/p.steps;
  k.box(3.25,rise,(end-landing)/p.steps,6.7,p.floor+rise/2,landing+(i+.5)*(end-landing)/p.steps,'concrete','pantsir-stair');
 }
 for(const x of [5.15,8.15]){
  k.rod([x,p.floor+1.0,landing],[x,1.0,end],.045,'steel','pantsir-handrail');
  for(let i=0;i<=6;i++){const t=i/6,y=p.floor*(1-t),z=landing+(end-landing)*t;k.rod([x,y,z],[x,y+1.0,z],.035,'steel','pantsir-handrail-post');}
 }
 // Retaining fascia seals the gap between the gate and the soil-covered vault.
 const frontHeight=x=>-.08+(p.crown+.85)*Math.pow(Math.max(0,1-(Math.abs(x)/(w+8))**2),1.3);
 for(let x=-w;x<w;x++){
  const bottom=Math.abs(x+.5)<4?p.floor+3.65:p.floor;
  k.quad([x,bottom,front+.06],[x,frontHeight(x),front+.06],[x+1,frontHeight(x+1),front+.06],[x+1,bottom,front+.06],'concrete','pantsir-sealed-fascia');
 }
 for(const x of [-3.8,3.8])k.box(.4,3.65,.75,x,p.floor+1.825,front-.25,'concrete','pantsir-gate-jamb');
 // One continuous smooth earth cap, feathered into ground at its perimeter.
 // No earth quad spans the entrance or ramp. End shoulders stop beside the portal.
 const nx=36,nz=32,positions=[],indices=[],uv=[];
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
  const x=-(w+8)+(2*w+16)*i/nx,z=back-8+(p.depth+8)*j/nz;
  const u=Math.min(1,Math.abs(x)/(w+8)),side=Math.pow(Math.max(0,1-u*u),1.3),tail=THREE.MathUtils.smoothstep(z,back-8,back+4);
  positions.push(x,-.08+(p.crown+.85)*side*tail,z);uv.push(x*.06,z*.06);
 }
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1;indices.push(a,c,b,b,c,c+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();k.direct(g,'soil','pantsir-earth-cap');
 // Portal cheeks join the cap down to the existing grade without covering the sunken court.
 for(const [a,b]of [[-w-8,-5.15],[8.6,w+8]])for(let i=0;i<16;i++){
  const x0=a+(b-a)*i/16,x1=a+(b-a)*(i+1)/16;
  const h=x=>-.08+(p.crown+.85)*Math.pow(Math.max(0,1-(Math.abs(x)/(w+8))**2),1.3);
  k.quad([x0,h(x0),front],[x0,-.08,front+7],[x1,-.08,front+7],[x1,h(x1),front],'soil','pantsir-earth-cheek');
 }
 for(const [x,z]of [[-8,back+10],[8,back+14]]){k.cyl(.48,2.0,x,2.0,z,'concrete','pantsir-vent');k.box(1.6,.22,1.6,x,3.1,z,'steel','pantsir-vent-cap');}
 k.poly([[-5,end],[8.4,end],[8.4,end+8],[-5,end+8]],.025,'concrete','pantsir-approach');
 const excavation=[[-w-0.1,back-.1],[w+.1,back-.1],[w+.1,front],[8.6,front],[8.6,end],[-5.15,end],[-5.15,front],[-w-.1,front]];
 k.cutouts.push({polygon:excavation,source:'Owner-confirmed pantsir '+siteId+'; interpretive recessed access'});
 root.userData.pantsirModel={version:PANTSIR_VERSION,siteId,...p,front,landing,end,buried:true,dimensionsSurveyed:false,excavation};
 const result=k.finish();root.traverse(m=>{if(m.isMesh&&m.material===k.mat.soil)m.userData.pantsirEarth=true;});
 return {...result,pantsir:root.userData.pantsirModel};
}

// Use the surrounding registered ground colour, not an unlit grey roof.
// Do not register these meshes for excavation masking: that would cut their own cover.
export function applyShelterGround(root,{referenceMaterial,steppeSurface,width,height}){
 if(!referenceMaterial?.map||!steppeSurface?.apply)throw Error('Shelter ground reference unavailable');
 const material=new THREE.MeshBasicMaterial({map:referenceMaterial.map,color:referenceMaterial.color.clone(),side:THREE.DoubleSide,vertexColors:true});
 material.name='Панцирь · общая текстура степи';material.forceSinglePass=true;steppeSurface.apply(material);
 root.updateWorldMatrix(true,true);const old=new Set();
 root.traverse(m=>{if(!m.isMesh||!m.userData.pantsirEarth)return;old.add(m.material);const pa=m.geometry.attributes.position,na=m.geometry.attributes.normal,uv=[],colors=[],v=new THREE.Vector3();
  for(let i=0;i<pa.count;i++){v.fromBufferAttribute(pa,i).applyMatrix4(m.matrixWorld);uv.push(v.x/width+.5,.5-v.z/height);const tone=.92+.08*Math.max(0,na.getY(i));colors.push(tone,tone,tone);}
  m.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));m.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));m.material=material;
 });for(const m of old)m.dispose();root.userData.pantsirModel.sharedSoil=true;
}
