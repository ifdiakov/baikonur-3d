import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const BURAN_LOSS_VERSION='20261110-mik112-loss-v1';
export const BURAN_LOSS_DURATION=28;
export const BURAN_LOSS_HISTORY=Object.freeze({date:'2002-05-12',photoDate:'2002-05-13',site:'pad-112',bays:[3,4,5],source:'https://www.buran.ru/htm/foto7.htm',interpretive:true});
const clamp=(v)=>Math.min(1,Math.max(0,v));
const smooth=(a,b,t)=>{const x=clamp((t-a)/(b-a));return x*x*(3-2*x);};
const rand=(i,s=1)=>{const n=Math.sin(i*127.1+s*311.7)*43758.5453;return n-Math.floor(n);};
export function lossPhase(t){return t<6?'До обрушения':t<14?'Обрушение кровли':t<24?'Оседание пыли':'Утрата «Бурана»';}

function trussGeometry(){
 const parts=[],a=new THREE.Vector3(),b=new THREE.Vector3(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
 const bar=(p1,p2,w)=>{a.fromArray(p1);b.fromArray(p2).sub(a);const g=new THREE.BoxGeometry(w,b.length(),w);q.setFromUnitVectors(up,b.clone().normalize());g.applyQuaternion(q);g.translate(...a.addScaledVector(b,.5).toArray());parts.push(g);};
 bar([-19,0,0],[19,0,0],.48);bar([-19,-3.2,0],[19,-3.2,0],.48);
 for(let k=0;k<8;k++){const x=-19+k*38/8;bar([x,k%2?-3.2:0,0],[x+38/8,k%2?0:-3.2,0],.26);bar([x,0,0],[x,-3.2,0],.2);}
 const result=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());return result;
}

// Own, deterministic museum animation. The timing and fragment paths do not
// claim to reproduce the unrecorded structural failure second by second.
export function createLossStructure({dustTexture=null}={}){
 const root=new THREE.Group();root.name='МИК-112 · историческая реконструкция 12.05.2002';root.userData.buranLoss=true;
 const materials={roof:new THREE.MeshStandardMaterial({color:0x75868a,roughness:.96,side:THREE.DoubleSide}),steel:new THREE.MeshStandardMaterial({color:0x8a9692,roughness:.85,metalness:.24}),dust:new THREE.PointsMaterial({color:0xafa58f,map:dustTexture,size:1.7,transparent:true,opacity:0,depthWrite:false,depthTest:true,sizeAttenuation:true})};
 const panels=new THREE.InstancedMesh(new THREE.BoxGeometry(19.6,.8,19.95),materials.roof,72);
 const trusses=new THREE.InstancedMesh(trussGeometry(),materials.steel,39);
 const columns=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),materials.steel,26);
 for(const [mesh,name]of [[panels,'Плиты трёх высоких пролётов'],[trusses,'Стропильные фермы'],[columns,'Внутренние опоры']]){mesh.name=name;mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);}
 const slabSpecs=[],trussSpecs=[];
 for(let bay=0;bay<3;bay++){
  for(let row=0;row<12;row++)for(let side=0;side<2;side++){
   const i=slabSpecs.length,x=-95+bay*40+10+side*20,z=-110+row*20;
   slabSpecs.push({x,z,start:58.2,delay:6+bay*.72+row*.09+rand(i,2)*.26,finalY:4.8+rand(i,4)*2.8,dx:(rand(i,6)-.5)*5,dz:(rand(i,7)-.5)*6,rx:(rand(i,8)-.5)*.32,ry:(rand(i,9)-.5)*.5,rz:(rand(i,10)-.5)*.24});
  }
  for(let row=0;row<13;row++){
   const i=trussSpecs.length;trussSpecs.push({x:-75+bay*40,z:-114+row*19,start:57.8,delay:6+bay*.72+row*.09,finalY:6.2+rand(i,11)*3.8,dx:(rand(i,12)-.5)*8,dz:(rand(i,13)-.5)*5,rx:(rand(i,14)-.5)*1.7,ry:(rand(i,15)-.5)*.6,rz:(rand(i,16)-.5)*.35});
  }
 }
 const particleCount=260,positions=new Float32Array(particleCount*3),dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const dust=new THREE.Points(dustGeo,materials.dust);dust.name='Пыль обрушения · без огня';dust.frustumCulled=false;root.add(dust);
 const dummy=new THREE.Object3D(),base=new THREE.Vector3(),tip=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);let current=0,cutaway=false;
 function updateMesh(mesh,specs,t){for(let i=0;i<specs.length;i++){const s=specs[i],p=clamp((t-s.delay)/3.2),drop=p*p,settle=smooth(0,.7,p);dummy.position.set(s.x+s.dx*drop,THREE.MathUtils.lerp(s.start,s.finalY,drop),s.z+s.dz*drop);dummy.rotation.set(s.rx*settle,s.ry*settle,s.rz*settle);dummy.scale.set(1,1,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;}
 function seek(value){
  if(!Number.isFinite(value))throw new Error('Некорректное время реконструкции');current=THREE.MathUtils.clamp(value,0,BURAN_LOSS_DURATION);
  updateMesh(panels,slabSpecs,current);updateMesh(trusses,trussSpecs,current);
  for(let i=0;i<26;i++){const row=i%13,col=Math.floor(i/13),p=smooth(6.7+col*.7+row*.09,10.7+col*.7+row*.09,current);base.set(-55+col*40,3.5,-114+row*19);tip.set(base.x+(col?8:-8)*p,55*(1-p)+7*p,base.z+(rand(i,18)-.5)*10*p);const d=tip.clone().sub(base);dummy.position.copy(base).addScaledVector(d,.5);dummy.quaternion.setFromUnitVectors(up,d.clone().normalize());dummy.scale.set(1,d.length(),1);dummy.updateMatrix();columns.setMatrixAt(i,dummy.matrix);}columns.instanceMatrix.needsUpdate=true;
  const envelope=smooth(7.7,11,current)*(1-smooth(15,25,current));dust.visible=envelope>.001;materials.dust.opacity=envelope*.36;
  for(let i=0;i<particleCount;i++){const age=Math.max(0,current-(7.7+rand(i,19)*2.5)),spread=Math.min(1,age/6);positions[i*3]=-94+rand(i,20)*118+(rand(i,21)-.5)*38*spread;positions[i*3+1]=5+Math.min(age*2.7,27)*(.4+rand(i,22)*.6);positions[i*3+2]=-117+rand(i,23)*234+(rand(i,24)-.5)*42*spread;}dustGeo.attributes.position.needsUpdate=true;
  return stats();
 }
 function setCutaway(value){cutaway=Boolean(value);materials.roof.transparent=cutaway;materials.roof.opacity=cutaway?.14:1;materials.roof.depthWrite=!cutaway;materials.roof.needsUpdate=true;return cutaway;}
 function stats(){return {version:BURAN_LOSS_VERSION,time:current,duration:BURAN_LOSS_DURATION,phase:lossPhase(current),highBays:[3,4,5],roofPanels:panels.count,trusses:trusses.count,columns:columns.count,dustParticles:particleCount,dustVisible:dust.visible,cutaway,flames:0,interpretive:true};}
 function dispose(){root.removeFromParent();for(const mesh of [panels,trusses,columns]){mesh.geometry.dispose();mesh.dispose();}dustGeo.dispose();Object.values(materials).forEach(m=>m.dispose());}
 seek(0);return {root,seek,stats,setCutaway,dispose,panels,trusses,columns};
}

// Fragment a disposable visual clone, never the shared rocket source. UVs,
// normals and source materials stay intact; the wreck settles below the roof.
export function createHistoricalPayload(source,mount){
 const root=new THREE.Group();root.name='«Буран» 1.01 и демонстрационный макет · только реконструкция';
 const intact=source.clone(true);intact.position.fromArray(mount.position);intact.rotation.set(...mount.rotation);intact.updateMatrixWorld(true);root.add(intact);
 const bins=new Map(),segments=7,mountY=mount.position[1];
 intact.traverse(mesh=>{
  if(!mesh.isMesh)return;const original=mesh.geometry,geometry=original.index?original.toNonIndexed():original.clone();
  // GLB positions may use normalized integer quantization. Expand before
  // applying metre-space transforms, otherwise writes overflow/clamp.
  for(const name of ['position','normal','uv']){const a=geometry.getAttribute(name);if(!a)continue;const data=new Float32Array(a.count*a.itemSize);for(let k=0;k<a.count;k++){data[k*a.itemSize]=a.getX(k);data[k*a.itemSize+1]=a.getY(k);if(a.itemSize>2)data[k*a.itemSize+2]=a.getZ(k);}geometry.setAttribute(name,new THREE.BufferAttribute(data,a.itemSize));}
  geometry.applyMatrix4(mesh.matrixWorld);
  const position=geometry.getAttribute('position'),norm=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv'),attrs={position,norm,uv};
  const srcHeight=58.815,originZ=mount.position[2];
  for(let t=0;t<position.count;t+=3){const z=(position.getZ(t)+position.getZ(t+1)+position.getZ(t+2))/3,segment=Math.min(segments-1,Math.max(0,Math.floor((z-originZ)/srcHeight*segments))),materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   const group=geometry.groups.find(g=>t>=g.start&&t<g.start+g.count);const material=materials[group?.materialIndex||0];if(!material)continue;const key=segment+':'+material.uuid;
   if(!bins.has(key))bins.set(key,{segment,material,position:[],normal:[],uv:[]});const bin=bins.get(key);
   for(let j=0;j<3;j++){const k=t+j;bin.position.push(position.getX(k),position.getY(k),position.getZ(k));if(norm)bin.normal.push(norm.getX(k),norm.getY(k),norm.getZ(k));if(uv)bin.uv.push(uv.getX(k),uv.getY(k));}
  }
  geometry.dispose();
 });
 const broken=new THREE.Group();broken.name='Повреждённые фрагменты корабля и макета';root.add(broken);const pieces=[],geometries=[];
 for(const bin of bins.values()){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(bin.position,3));if(bin.normal.length)g.setAttribute('normal',new THREE.Float32BufferAttribute(bin.normal,3));else g.computeVertexNormals();if(bin.uv.length)g.setAttribute('uv',new THREE.Float32BufferAttribute(bin.uv,2));
  const pivot=new THREE.Vector3(-35,mountY,mount.position[2]+(bin.segment+.5)*58.815/segments);g.translate(-pivot.x,-pivot.y,-pivot.z);g.computeBoundingBox();g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,bin.material);mesh.position.copy(pivot);mesh.receiveShadow=true;broken.add(mesh);pieces.push({mesh,pivot,segment:bin.segment});geometries.push(g);
 }
 function seek(t){intact.visible=t<8.2;broken.visible=t>=8.2;for(const {mesh,pivot,segment}of pieces){const p=smooth(8.2+segment*.08,11.7+segment*.08,t);mesh.position.copy(pivot).add(new THREE.Vector3((rand(segment,31)-.5)*4*p,-7*p,(rand(segment,32)-.5)*5*p));mesh.rotation.set((rand(segment,33)-.5)*.3*p,(rand(segment,34)-.5)*.1*p,(rand(segment,35)-.5)*.18*p);}return {intactVisible:intact.visible,fragmentsVisible:broken.visible,fragments:pieces.length};}
 function dispose(){root.removeFromParent();geometries.forEach(g=>g.dispose());}
 seek(0);return {root,seek,dispose,stats:()=>({intactVisible:intact.visible,fragmentsVisible:broken.visible,fragments:pieces.length,sharedSourcePreserved:true})};
}
