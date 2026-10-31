import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const ZENIT_VERSION='zenit-3sl-v1';
export const ZENIT_DIMENSIONS=Object.freeze({height:59.6,bodyDiameter:3.9,fairingDiameter:4.15,firstStageEnd:32.9,secondStageEnd:43.3,fairingBase:48.2});
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const radial=(a,r,y)=>V(Math.sin(a)*r,y,Math.cos(a)*r);

// Original geometry reconstructed from the owner's eight Sea Launch reference
// views. Metres, +Y up, nozzle exit at Y=0. It is not a recovered source mesh.
// Published overall dimensions: Yuzhmash Zenit-3SL product specification.
export function createZenitRocket({detail='near',textures=typeof document!=='undefined'}={}){
 const near=detail==='near',radialSegments=near?64:32;
 const root=new THREE.Group();root.name='Зенит-3SL · Sea Launch';root.userData={museumAsset:'zenit-3sl',unit:'metre',version:ZENIT_VERSION,referenceReconstruction:true};
 const stages=Array.from({length:4},(_,i)=>{const g=new THREE.Group();g.name=['Первая ступень · РД-171','Вторая ступень · РД-120 и РД-8','Блок ДМ-SL · внешний корпус','Головной обтекатель'][i];g.userData.stage=i+1;root.add(g);return g;});
 const make=(color,metalness=0,roughness=.5)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
 const materials={paint:make('#e7e9e6',.12,.43),red:make('#ab282e',.12,.4),steel:make('#818e98',.72,.34),dark:make('#1a2228',.48,.68),gold:make('#9d8862',.65,.39),seam:make('#adb4b4',.4,.53)};
 const maps=[];
 function paintMap(kind){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=kind==='body'?2048:1024;
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.fillStyle='#eef0ed';ctx.fillRect(0,0,w,h);
  let seed=76543;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<22000;i++){ctx.fillStyle=`rgba(68,80,84,${random()*.035})`;ctx.fillRect(random()*w,random()*h,1+random()*2,1+random()*2);}
  ctx.lineWidth=1;ctx.strokeStyle='rgba(55,69,76,.08)';
  for(let y=55;y<h;y+=kind==='body'?185:160){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();for(let x=7;x<w;x+=21){ctx.fillStyle='rgba(62,75,83,.17)';ctx.fillRect(x,y+4,1.4,1.4);}}
  ctx.fillStyle='#16365d';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const fraction of [1/12,7/12]){
   const x=w*fraction;
   if(kind==='body'||kind==='second'){
    ctx.save();ctx.translate(x,h*.5);ctx.rotate(-Math.PI/2);ctx.font=`italic 900 ${kind==='body'?150:125}px Arial, sans-serif`;
    const label=kind==='body'?'SEA LAUNCH':'ZENIT-3SL',size=ctx.measureText(label).width;ctx.scale((h*.80)/size,1);ctx.fillText(label,0,0);ctx.restore();
   }else if(kind==='upper'){
    ctx.save();ctx.translate(x,h*.48);ctx.rotate(-Math.PI/2);ctx.font='italic bold 52px Arial, sans-serif';ctx.fillText('BOEING',0,-70);ctx.font='bold 42px Arial, sans-serif';ctx.fillText('YUZHNOYE',0,0);ctx.font='bold 29px Arial, sans-serif';ctx.fillText('RSC ENERGIA',0,58);ctx.restore();
   }else{
    ctx.save();ctx.translate(x,h*.57);ctx.rotate(-Math.PI/2);ctx.scale(.9,.9);
    ctx.fillStyle='#c43637';ctx.beginPath();ctx.ellipse(0,-20,116,47,-.12,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#eff1ee';ctx.beginPath();ctx.ellipse(0,-23,99,36,-.12,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#236391';ctx.beginPath();ctx.moveTo(-90,-25);ctx.bezierCurveTo(-30,-85,3,38,86,-33);ctx.bezierCurveTo(48,26,-5,-2,-41,-12);ctx.bezierCurveTo(-68,-18,-79,8,-90,-25);ctx.fill();
    ctx.fillStyle='#16365d';ctx.font='italic bold 36px Arial, sans-serif';ctx.fillText('SEA LAUNCH',0,64);ctx.restore();
   }
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;map.name='Zenit painted markings · '+kind;maps.push(map);return map;
 }
 for(const kind of ['body','second','upper','fairing']){materials[kind]=materials.paint.clone();if(textures)materials[kind].map=paintMap(kind);}
 const batches=stages.map(()=>new Map());let components=0;
 function add(stage,geometry,material,position=V(),quaternion=null){
  if(geometry.index)geometry=geometry.toNonIndexed();geometry.translate(position.x,position.y,position.z);
  if(quaternion){geometry.translate(-position.x,-position.y,-position.z);geometry.applyQuaternion(quaternion);geometry.translate(position.x,position.y,position.z);}
  const batch=batches[stage];if(!batch.has(material))batch.set(material,[]);batch.get(material).push(geometry);components++;
 }
 function cylinder(stage,r,h,y,material='paint',rTop=r,at=V()){
  add(stage,new THREE.CylinderGeometry(rTop,r,h,radialSegments,1,false),material,V(at.x,y,at.z));
 }
 function ring(stage,r,y,t=.025,material='seam',at=V()){
  const g=new THREE.TorusGeometry(r,t,near?6:4,radialSegments);g.rotateX(Math.PI/2);add(stage,g,material,V(at.x,y,at.z));
 }
 function rod(stage,a,b,r=.028,material='paint',sides=near?8:5){
  const delta=b.clone().sub(a),g=new THREE.CylinderGeometry(r,r,delta.length(),sides,1,false);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),delta.normalize()));add(stage,g,material,a.clone().add(b).multiplyScalar(.5));
 }
 function tube(stage,points,r=.04,material='paint',steps=near?32:12){
  const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');add(stage,new THREE.TubeGeometry(curve,steps,r,near?7:4,false),material);
 }
 function lathe(stage,profile,material,at=V(),segments=radialSegments){add(stage,new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),segments),material,at);}
 function box(stage,size,at,material='paint',yaw=0){const g=new THREE.BoxGeometry(...size);g.rotateY(yaw);add(stage,g,material,at);}
 function dome(stage,r,y,h,material='paint'){
  const p=[];for(let i=0;i<=12;i++){const a=i*Math.PI/24;p.push([r*Math.cos(a),y+h*Math.sin(a)]);}lathe(stage,p,material);
 }
 const nozzleCenters=[];
 function nozzle(stage,x,z,base,r,height,tag){
  const profile=[[r,0],[r*.96,height*.16],[r*.76,height*.48],[r*.50,height*.74],[r*.32,height*.88],[r*.38,height]];
  lathe(stage,profile,'steel',V(x,base,z),near?40:20);
  lathe(stage,profile.map(([r,y])=>[Math.max(.025,r-.032),y]).reverse(),'dark',V(x,base,z),near?40:20);
  ring(stage,r-.015,base+.02,.018,'gold',V(x,0,z));
  for(let j=0;j<5;j++)ring(stage,r*(.95-j*.105),base+height*(.19+j*.12),.012,'steel',V(x,0,z));
  if(near)for(let j=0;j<8;j++){const a=j*Math.PI/4;rod(stage,radial(a,r*.94,base+height*.12).add(V(x,0,z)),radial(a,r*.36,base+height*.91).add(V(x,0,z)),.014,'steel',5);}
  if(tag==='rd171')nozzleCenters.push([x,base,z]);
 }
 // Four chambers of one RD-171-family engine, with genuinely open bells.
 for(const x of [-.84,.84])for(const z of [-.84,.84])nozzle(0,x,z,0,.73,2.35,'rd171');
 cylinder(0,1.92,.18,2.42,'steel');ring(0,1.94,2.5,.045,'gold');
 cylinder(0,1.95,2.15,3.585);cylinder(0,1.96,.34,4.5,'red');
 cylinder(0,1.95,25.75,17.535,'body');
 cylinder(0,1.96,.39,30.215,'red');dome(0,1.91,30.42,.88);
 for(const y of [2.55,4.71,30.43])ring(0,1.957,y,.024,'paint');
 // V-shaped open interstage. There is no opaque cylinder behind the truss.
 ring(0,1.92,30.58,.06,'steel');ring(1,1.92,32.84,.055,'steel');
 for(let i=0;i<24;i++){
  const a=i*Math.PI/12,b=(i+.5)*Math.PI/12;
  rod(0,radial(a,1.90,30.59),radial(b,1.90,32.82),.027,'steel');
  rod(0,radial(a+Math.PI/12,1.90,30.59),radial(b,1.90,32.82),.027,'steel');
 }
 // RD-120 central bell and four small steering chambers visible in the gap.
 nozzle(1,0,0,30.94,1.03,1.94,'rd120');
 for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2,p=radial(a,1.38,31.77);nozzle(1,p.x,p.z,p.y,.265,1.12,'rd8');}
 cylinder(1,1.93,.17,32.91,'steel');
 cylinder(1,1.95,10.31,38.145,'second');ring(1,1.952,33.02,.025,'paint');ring(1,1.952,43.30,.025,'seam');
 cylinder(2,1.95,4.9,45.75,'upper');
 for(const y of [43.38,46.45,48.1])ring(2,1.956,y,.024,'paint');
 // Fairing widened to 4.15 m, a soft shoulder and a rounded ogive.
 const fairingProfile=[[1.95,48.2],[2.01,48.28],[2.075,48.44],[2.075,54.15]];
 for(let i=1;i<=30;i++){const t=i/30,a=t*Math.PI/2;fairingProfile.push([2.075*Math.cos(a),54.15+5.45*Math.sin(a)]);}
 lathe(3,fairingProfile,'fairing');cylinder(3,1.95,.045,48.22,'paint');ring(3,2.08,48.49,.028,'seam');
 // Fairing split line, kept subtle and flush with the rounded shell.
 if(near)for(const a of [Math.PI*.61,Math.PI*1.61]){
  const line=fairingProfile.slice(1,-1).map(([r,y])=>radial(a,r+.007,y));tube(3,line,.009,'seam',44);
 }
 // Two long outside pipes, with curved stand-offs at the red collars.
 for(const a of [-.56,Math.PI-.56]){
  const pts=[[1.94,3.5],[2.1,3.8],[2.12,4.3],[2.08,5.2],[2.08,29.1],[2.08,30.2],[1.96,30.7]].map(([r,y])=>radial(a,r,y));tube(0,pts,.069,'paint',48);
  tube(1,[[1.93,33.2],[2.07,33.55],[2.07,40.4],[1.95,40.65]].map(([r,y])=>radial(a,r,y)),.064,'paint',24);
  for(const y of [5.5,10,14.5,19,23.5,28]){const p=radial(a,2.045,y);box(0,[.20,.055,.10],p,'paint',a);}
 }
 if(near){
  // Cable bundles and the characteristic repeated U-shaped expansion loops.
  for(const a of [1.57,1.57+Math.PI]){
   for(const shift of [-.047,0,.047]){
    const p=[];for(let y=5.1;y<29.5;y+=1.14){p.push(radial(a+shift,2.012,y));p.push(radial(a+shift,2.012,y+.58));p.push(radial(a+shift+.11,2.06,y+.74));p.push(radial(a+shift+.11,2.06,y+.90));p.push(radial(a+shift,2.012,y+1.02));}
    tube(0,p,.018,'steel',Math.ceil(p.length*2));
   }
   for(let y=5.2;y<29.6;y+=1.14){const p=radial(a,2.04,y);box(0,[.24,.045,.07],p,'paint',a);}
  }
  // Rivets are grouped with the skin, rather than one draw call per fastener.
  for(const [stage,y] of [[0,2.62],[0,4.81],[0,30.48],[1,33.08],[2,43.36],[3,48.55]])for(let j=0;j<56;j++){
   const a=j*Math.PI/28,r=stage===3?2.08:1.964;
   const g=new THREE.SphereGeometry(.018,5,3);add(stage,g,'steel',radial(a,r,y));
  }
  for(let i=0;i<12;i++){
   const a=i*Math.PI/6,p=radial(a,1.99,4.45);box(0,[.12,.20,.14],p,'steel',a);
   rod(0,radial(a,1.95,4.45),radial(a,2.12,4.45),.035,'paint');
  }
  // Service covers, connector plates and low aft equipment fairings.
  for(let i=0;i<4;i++){
   const a=.35+i*Math.PI/2;
   const p=radial(a,1.95,3.25);box(0,[.38,.85,.065],p,'paint',a);
   for(const y of [2.83,3.67])box(0,[.39,.017,.075],radial(a,1.965,y),'red',a);
   for(const da of [-.095,.095])box(0,[.018,.85,.075],radial(a+da,1.965,3.25),'red',a);
   const cap=new THREE.CapsuleGeometry(.10,.69,3,8);add(0,cap,'paint',radial(a+.40,1.97,3.25));
   for(const y of [3.8,4.0]){const p=radial(a+.21,1.97,y);add(0,new THREE.SphereGeometry(.062,8,5),'steel',p);}
  }
 }
 let triangles=0,drawCalls=0;
 for(let i=0;i<stages.length;i++)for(const [material,list] of batches[i]){
  const geometry=mergeGeometries(list,false);list.forEach(g=>g.dispose());geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,materials[material]);mesh.name=stages[i].name+' · '+material;mesh.castShadow=true;mesh.receiveShadow=true;
  stages[i].add(mesh);triangles+=geometry.attributes.position.count/3;drawCalls++;
 }
 root.userData.dimensions={...ZENIT_DIMENSIONS};root.userData.engineNozzles=nozzleCenters;root.userData.assetStats={triangles,drawCalls,components,detail};
 function setExploded(amount){const t=THREE.MathUtils.clamp(Number(amount)||0,0,1);stages.forEach((g,i)=>g.position.y=i*t*6);root.userData.exploded=t;root.updateMatrixWorld(true);}
 function dispose(){root.traverse(o=>{if(o.isMesh)o.geometry.dispose();});Object.values(materials).forEach(m=>m.dispose());maps.forEach(t=>t.dispose());}
 return {root,stages,setExploded,dispose,stats:()=>({...root.userData.assetStats,version:ZENIT_VERSION,dimensions:ZENIT_DIMENSIONS,nozzles:nozzleCenters.length,exploded:root.userData.exploded||0})};
}
