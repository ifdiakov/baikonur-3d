import * as THREE from 'three';
import {archiveKit} from './archive-kit.js';
import {CHECKPOINT7_VERSION,CHECKPOINT7_REFERENCE} from './checkpoint7-layout.js?v=20261103-checkpoint7-road-v1';

/** Photo interpretation in metres. +Z faces the city, +X is the east shoulder. */
export function buildCheckpoint7(root){
 const k=archiveKit(root),placement=root.userData.checkpoint7Placement,roadWidth=(placement?.roadWidth??3.6)/.14,edge=roadWidth/2;
 const blue=0x2e7da6;
 for(const [key,color]of Object.entries({light:0xe0dfd3,wall:0xc4c8c6,blue,white:0xf0eee3,glass:0x547984,steel:0x707d7d,red:0xc8463b,roof:0x819292,soil:0xaa9e85}))k.mat[key].color.setHex(color);
 k.mat.glass.roughness=.25;k.mat.glass.metalness=.3;
 k.mat.lamp=new THREE.MeshStandardMaterial({color:0xffefcf,emissive:0xffd58d,emissiveIntensity:0});
 const buildingX=edge+13,front=4.5,lamps=[],signMaterials=[];
 const box=(w,h,d,x,y,z,mat,tag)=>k.box(w,h,d,x,y,z,mat,tag);
 // Raised shoulders meet the existing road. They never cover its asphalt or markings.
 for(const side of [-1,1]){
  const inner=side*(edge+.3),outer=side*(edge+(side===1?40:9)),a=Math.min(inner,outer),b=Math.max(inner,outer);
  box(b-a,.22,26,(a+b)/2,-.11,0,'concrete','checkpoint-walk');
  const depth=placement?Math.max(0,(placement.position[1]+2.755)/.14):.6;
  box(b-a,depth,26,(a+b)/2,-depth/2-.12,0,'soil','checkpoint-foundation');
  // The apron has a sloping outer bank instead of an unsupported floating slab.
  const run=placement?Math.max(5,depth*.6):2;
  k.quad([outer,0,-13],[outer,0,13],[outer+side*run,-depth,18],[outer+side*run,-depth,-18],'soil','checkpoint-bank');
  for(const z of [-13,13])k.quad([a,0,z],[b,0,z],[b+side*run,-depth,z+Math.sign(z)*run],[a,-depth,z+Math.sign(z)*run],'soil','checkpoint-bank');
  for(let z=-12.5;z<13;z+=1)box(.35,.22,.98,inner,.11,z,Math.round(z+.5)%2?'white':'blue','blue-white-curb');
 }
 box(22,6.9,9,buildingX,3.45,0,'light','main-gatehouse');
 box(22.4,.25,9.4,buildingX,7.03,0,'blue','blue-roof-fascia');
 box(22.4,.16,9.4,buildingX,7.24,0,'light','flat-roof-cap');
 box(22.1,.5,.16,buildingX,.25,front+.09,'blue','blue-base-fascia');
 box(22.1,.3,.16,buildingX,4.55,front+.09,'blue','blue-sign-fascia');
 // Pale square cladding with the stepped grey band visible in all five references.
 for(let row=0;row<6;row++)for(let column=0;column<29;column++){
  const x=buildingX-10.62+column*.76,y=.84+row*.59;
  box(.735,.565,.055,x,y,front+.055,(row===1&&column>8||row===2&&column<9)?'wall':'light','facade-tile');
 }
 box(1.5,2.05,.12,buildingX-9.7,2.15,front+.12,'blue','window-frame');
 box(1.22,1.78,.13,buildingX-9.7,2.15,front+.19,'glass','entry-window');
 box(1.65,2.5,.12,buildingX+7.9,1.25,-4.58,'blue','rear-door');
 for(const z of [-2,1.2]){box(.14,1.7,1.75,buildingX-11.08,2.2,z,'blue','road-side-window-frame');box(.15,1.43,1.48,buildingX-11.16,2.2,z,'glass','road-side-window');}
 const text=(lines,x,y,z,w,h,{size=90,color='#237aa5',background=null}={})=>{
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=384;const c=canvas.getContext('2d');
  if(background){c.fillStyle=background;c.fillRect(0,0,canvas.width,canvas.height);}
  c.fillStyle=color;c.font=`700 ${size}px Arial, sans-serif`;c.textAlign='center';c.textBaseline='middle';
  lines.forEach((line,i)=>c.fillText(line,768,384*(i+.5)/lines.length,1460));
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshStandardMaterial({map:texture,transparent:true,roughness:.8,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:0,depthWrite:false});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);mesh.position.set(x,y,z);mesh.name=lines.join(' ');root.add(mesh);signMaterials.push(mat);
 };
 text(['КОСМОДРОМ','БАЙКОНУР'],buildingX,5.83,front+.19,15.3,2.05,{size:150});
 // The same approved organisation marks already used by the museum.
 if(typeof document!=='undefined')for(const [side,file]of [[-1,'roscosmos'],[1,'tsenki']]){
  const logo=new THREE.Mesh(new THREE.PlaneGeometry(1.9,1.9),new THREE.MeshBasicMaterial({map:new THREE.TextureLoader().load(new URL(`../assets/org-logos/${file}.png`,import.meta.url).href,t=>{t.colorSpace=THREE.SRGBColorSpace;}),transparent:true,depthWrite:false}));
  logo.position.set(buildingX+side*9.8,5.8,front+.21);logo.name=file+' · фасад КПП';root.add(logo);
 }
 // Glazed pedestrian pavilion to the right, detached from the main block.
 const pavilionX=buildingX+17.2;
 box(6,.28,6.6,pavilionX,.14,.8,'blue','pavilion-base');
 box(5.8,2.8,6.4,pavilionX,1.68,.8,'glass','glazed-pavilion');
 for(const x of [-2.9,-1.45,0,1.45,2.9])for(const z of [-2.4,4])box(.1,2.95,.13,pavilionX+x,1.75,z,'blue','pavilion-mullion');
 for(const x of [-2.9,2.9])for(const z of [-.8,.8,2.4])box(.13,2.95,.1,pavilionX+x,1.75,z,'blue','pavilion-mullion');
 const roof=[[pavilionX-3.3,3.2,-2.8],[pavilionX+3.3,3.2,-2.8],[pavilionX+3.3,3.2,4.4],[pavilionX-3.3,3.2,4.4]],peak=[pavilionX,4.7,.8];
 for(let i=0;i<4;i++)k.quad(roof[i],roof[(i+1)%4],peak,peak,'roof','pavilion-hip-roof');
 // West-side guard booth; the two through lanes retain their original width.
 const boothX=-edge-2.1;
 box(3,2.8,3.6,boothX,1.4,1,'light','guard-booth');box(3.5,.22,4,boothX,2.92,1,'blue','guard-roof');
 box(2.6,1.25,.15,boothX,1.95,2.86,'glass','guard-front-window');box(.15,1.25,2.9,boothX+1.57,1.95,1,'glass','guard-road-window');
 box(3.4,5.4,3.4,boothX-2,2.7,-6,'light','guard-tower');box(3.8,.22,3.8,boothX-2,5.51,-6,'blue','guard-tower-roof');
 box(1.15,2.1,.14,boothX-2,1.65,-4.23,'blue','guard-tower-door');box(.9,1.65,.16,boothX-2,1.8,-4.16,'glass','guard-tower-glass');
 for(const side of [-1,1]){
  // Open blue gates lie along the centre island, outside both vehicle lanes.
  const x=side*.4,z=side*-1.2;
  for(const end of [-2.4,2.4])k.rod([x,.3,z+end],[x,4.3,z+end],.065,'blue','open-gate-frame');
  for(const y of [.4,2.4,4.3])k.rod([x,y,z-2.4],[x,y,z+2.4],.055,'blue','open-gate-frame');
  for(let dz=-2.2;dz<=2.2;dz+=.4)k.rod([x,.4,z+dz],[x,4.3,z+dz],.025,'blue','open-gate-bars');
 }
 box(.8,.24,19,0,.12,0,'concrete','central-island');
 for(let z=-9;z<=9;z++)for(const s of [-1,1])box(.12,.28,.96,s*.43,.14,z,z%2?'white':'blue','island-curb');
 // Open arms preserve circulating traffic; each arm is tied to a physical pedestal.
 for(const [side,z]of [[1,4],[-1,-4]]){
  box(.6,1.15,.7,side*.12,.7,z,'blue','barrier-pedestal');
  const angle=THREE.MathUtils.degToRad(84),length=Math.min(7,edge-1),start=new THREE.Vector3(side*.12,1.3,z),end=start.clone().add(new THREE.Vector3(side*Math.cos(angle)*length,Math.sin(angle)*length,0));
  for(let i=0;i<12;i++)k.rod(start.clone().lerp(end,i/12).toArray(),start.clone().lerp(end,(i+1)/12).toArray(),.075,i%2?'red':'white','raised-barrier-arm');
 }
 for(const z of [-7,8]){
  k.rod([0,.25,z],[0,8.7,z],.095,'steel','double-arm-lamp');
  for(const side of [-1,1]){k.rod([0,8.1,z],[side*1.4,8.7,z],.065,'steel','lamp-arm');box(.65,.12,.28,side*1.4,8.72,z,'steel','lamp-head');box(.55,.06,.23,side*1.4,8.64,z,'lamp','lamp-diffuser');lamps.push([side*1.4,8.6,z]);}
 }
 // Fence runs outside the traffic envelope, including the pavilion's pedestrian gate.
 const fence=(a,b)=>{const length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(length/1.5);for(let i=0;i<=n;i++){const t=i/n;k.rod([a[0]+(b[0]-a[0])*t,0,a[1]+(b[1]-a[1])*t],[a[0]+(b[0]-a[0])*t,2.2,a[1]+(b[1]-a[1])*t],.035,'blue','fence-picket');}for(const y of [.35,1.8])k.rod([a[0],y,a[1]],[b[0],y,b[1]],.045,'blue','fence-rail');};
 fence([buildingX+11,4.8],[pavilionX-3.1,4.8]);fence([pavilionX+3.1,4.8],[edge+39,4.8]);fence([-edge-1,-5],[-edge-8,-5]);
 text(['КПП №7'],boothX,3.35,3.03,3.4,.7,{size:180,background:'#e8e9e3'});
 if(!placement)k.path([[0,-35],[0,35]],roadWidth,.005,'asphalt','gallery-road');
 root.userData.setCheckpointEvening=value=>{k.mat.lamp.emissiveIntensity=value?1.8:0;signMaterials.forEach(m=>m.emissiveIntensity=value?1.9:0);};
 root.userData.courtyardLightRecords=()=>lamps.map(([x,y,z])=>{const base=root.localToWorld(new THREE.Vector3(x,.1,z)),bulb=root.localToWorld(new THREE.Vector3(x,y,z));return {x:base.x,y:base.y,z:base.z,lightX:bulb.x,lightY:bulb.y,lightZ:bulb.z,height:bulb.y-base.y,radius:2.2,size:.16,brightness:.62,owner:root,color:0xffe3b4};});
 const checkpoint7={version:CHECKPOINT7_VERSION,references:CHECKPOINT7_REFERENCE,placement:placement??null,roadWidth,buildingSide:'right-when-arriving-from-city',facadeFaces:'city',barrierAngle:84,throughLanes:2,views:{all:{target:[14,2,0],eye:[-24,43,69]},front:{target:[buildingX,3,1],eye:[buildingX-2,23,44]},lanes:{target:[3,1,0],eye:[-31,31,49]},top:{target:[14,0,0],eye:[14,95,1]}},building:{x:buildingX,width:22,depth:9,height:6.9},pavilion:{x:pavilionX},lamps:lamps.length};
 root.userData.checkpoint7Model=checkpoint7;
 return {...k.finish(),checkpoint7};
}
