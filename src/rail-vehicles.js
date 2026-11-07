import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createLightField} from './light-field.js?v=20261028-site41-v1';
import {RAIL_PROFILE} from './rail-profile.js?v=20261031-facilities-rails-lighting-v1';

import {RAIL_VEHICLE_PROFILES} from './rail-vehicle-profiles.js?v=20261102-m62-v1';
export {RAIL_VEHICLE_PROFILES};
export const TRAIN_VERSION='m62-kosmotrans-v2-headlight-beam';
export const COACH_COUNT=4;
export const TRAIN_METRIC_SCALE=RAIL_PROFILE.gauge/1.52;
const loco=RAIL_VEHICLE_PROFILES.m62,coach=RAIL_VEHICLE_PROFILES.coach;
// Autocoupler envelopes, in source metres, plus clearance for the museum bends.
export const COUPLER_CLEARANCE=.24;
export const COACH_OFFSETS=Object.freeze(Array.from({length:COACH_COUNT},(_,i)=>(loco.couplerHalf+coach.couplerHalf+COUPLER_CLEARANCE+i*(2*coach.couplerHalf+COUPLER_CLEARANCE))*TRAIN_METRIC_SCALE));
export const TRAIN_START_DISTANCE=COACH_OFFSETS.at(-1)+(coach.couplerHalf+1)*TRAIN_METRIC_SCALE;
export const TRAIN_CONSIST_LENGTH=COACH_OFFSETS.at(-1)+(loco.couplerHalf+coach.couplerHalf)*TRAIN_METRIC_SCALE;
const standard=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.61,metalness:.34,...extra});

// Merge static details by material: grilles, ribs and handrails do not each
// add a draw call. Wheelsets remain separate so they follow the actual rails.
function batches(root){
 const buckets=new Map(),detailCounts={};
 function add(geometry,material,name){
  const source=geometry.index?geometry.toNonIndexed():geometry;if(source!==geometry)geometry.dispose();
  const list=buckets.get(material)||[];list.push(source);buckets.set(material,list);
  detailCounts[name]=(detailCounts[name]||0)+1;
 }
 return {
  box(w,h,d,x,y,z,material,name='detail'){
   const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);add(g,material,name);
  },
  cylinder(r1,r2,h,x,y,z,material,name='detail',axis='y'){
   const g=new THREE.CylinderGeometry(r1,r2,h,16);
   if(axis==='x')g.rotateZ(Math.PI/2);else if(axis==='z')g.rotateX(Math.PI/2);
   g.translate(x,y,z);add(g,material,name);
  },
  custom(g,m,name){add(g,m,name);},
  finish(){
   for(const [material,parts] of buckets){
    const mesh=new THREE.Mesh(mergeGeometries(parts,false),material);mesh.name='Детали · '+material.name;
    mesh.userData.pickable=false;root.add(mesh);for(const g of parts)g.dispose();
   }
   root.userData.detailCounts=detailCounts;return detailCounts;
  }
 };
}

function wheel(parent,x,radius,materials,side){
 const root=new THREE.Group();root.position.set(x,radius,0);parent.add(root);
 const b=batches(root);
 b.cylinder(radius,radius,.10,0,0,0,materials.steel,'wheel-tread','x');
 // A flange sits inside the rail, clear of its running surface.
 b.cylinder(radius+.019,radius+.019,.022,-side*.056,0,0,materials.dark,'wheel-flange','x');
 b.cylinder(radius*.63,radius*.63,.115,0,0,0,materials.hub,'wheel-hub','x');
 b.cylinder(radius*.23,radius*.23,.132,0,0,0,materials.steel,'axle-bearing','x');
 for(let i=0;i<6;i++){
  const a=i*Math.PI/3;b.box(.121,.025,.025,0,Math.cos(a)*radius*.42,Math.sin(a)*radius*.42,materials.dark,'wheel-bolt');
 }
 b.finish();return root;
}

function beamTexture(){
 const width=32,height=96,data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=(x/(width-1)-.5)*2,v=1-y/(height-1),spread=.12+.88*v;
  const alpha=Math.exp(-Math.pow(u/spread,2)*4)*Math.pow(1-v,1.6)*Math.min(1,v*15)*.52;
  const at=(y*width+x)*4;data.set([255,220,157,Math.round(alpha*255)],at);
 }
 const texture=new THREE.DataTexture(data,width,height);texture.needsUpdate=true;return texture;
}

function roundedRoof(b,width,base,rise,length,z,material,name='rounded-roof'){
 const shape=new THREE.Shape();shape.moveTo(-width/2,base);shape.lineTo(-width*.44,base+rise*.55);shape.quadraticCurveTo(0,base+rise*1.4,width*.44,base+rise*.55);shape.lineTo(width/2,base);shape.closePath();
 const g=new THREE.ExtrudeGeometry(shape,{depth:length,bevelEnabled:false,curveSegments:12});g.translate(0,0,z-length/2);b.custom(g,material,name);
}
function disposeFallback(root){const gs=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);});for(const g of gs)g.dispose();root.clear();}

export function buildRailVehicle(parent,{wagon=false,gauge=RAIL_PROFILE.gauge,index=0,last=false}={}){
 const profile=RAIL_VEHICLE_PROFILES[wagon?'coach':'m62'],metricScale=gauge/1.52,root=new THREE.Group(),body=new THREE.Group();
 root.name=wagon?'Пассажирский вагон '+(index+1):'М62 · Космотранс';root.userData.railVehicle=wagon?'coach':'locomotive';root.userData.profile=profile;root.userData.pickable=false;root.add(body);parent.add(root);
 const glass=standard(0x193943,{emissive:0xffc67b,emissiveIntensity:.16,roughness:.24}),paint=standard(wagon?0x21462f:0x146d69),cream=standard(0xe4c96e),roof=standard(0x939d93),dark=standard(0x242e2c),steel=standard(0x727b79,{metalness:.72}),hub=standard(0x57625c);
 glass.name='glass';const b=batches(body),L=profile.bodyLength;
 b.box(2.95,2.2,L,0,2.4,0,paint,'body');b.box(3.0,.16,L,0,2.02,0,cream,'waist-stripe');b.box(3.0,.12,L,0,3.55,0,cream,'top-stripe');roundedRoof(b,3.05,3.65,.5,L,0,roof);b.box(2.8,.35,L,0,1.1,0,dark,'frame');b.box(1.7,.5,4,0,.55,0,dark,'underfloor-equipment');
 for(const side of [-1,1])for(let i=0;i<(wagon?10:7);i++)b.box(.035,.70,.80,side*1.49,2.95,(i-((wagon?10:7)-1)/2)*(wagon?1.453:1.3),glass,'lit-window');
 if(!wagon)for(const end of [-1,1])b.box(2.55,.68,.035,0,3.05,end*(L/2+.01),glass,'cab-window');
 for(const end of [-1,1])b.box(.25,.25,profile.couplerHalf-L/2+.1,0,1.03,end*(L/2+(profile.couplerHalf-L/2)/2),dark,'coupler');
 b.finish();
 const axles=profile.axles.map((offset,i)=>{const axle=new THREE.Group();axle.name='Колёсная пара '+(i+1);parent.add(axle);const wheels=[-1,1].map(side=>wheel(axle,side*.76,profile.wheelRadius,{steel,dark,hub},side));return {root:axle,offset:offset*metricScale,wheels};});
 const bogies=profile.bogies.map(offset=>{const bg=new THREE.Group();bg.name=wagon?'Двухосная тележка':'Трёхосная тележка';parent.add(bg);const bb=batches(bg);for(const side of [-1,1])bb.box(.25,.35,wagon?3.2:5.6,side*1.03,.7,0,dark,'bogie-frame');bb.finish();return {root:bg,offset:offset*metricScale};});
 const headY=4.0274,bufferY=1.5084,windowY=wagon?2.63:3.18,markers=wagon?(last?[-1,1].map(s=>({x:s*1.15,y:3.35,z:-9.68,height:0,color:0xff4537,size:3})):[]):[{x:0,y:headY,z:7.97,height:0,color:0xffe9ba,size:6,brightness:2},...[-1,1].map(s=>({x:s*1.1,y:bufferY,z:8.065,height:0,color:0xffedc9,size:3.6}))];
 const lights=createLightField(root,markers,{name:wagon?'Хвостовые огни':'М62 · прожектор и буферные огни',minPixels:wagon?3.2:4.8});
 const windows=createLightField(root,(wagon?[-5,0,5]:[-7.3,7.3]).flatMap(z=>[-1,1].map(s=>({x:s*(wagon?1.6:1.44),y:windowY,z,height:0,color:0xffd896,size:.65}))),{name:'Тёплый свет окон',minPixels:2});
 let spill=null;if(!wagon){const mat=new THREE.MeshBasicMaterial({map:beamTexture(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false});spill=new THREE.Mesh(new THREE.PlaneGeometry(6,27),mat);spill.rotation.x=-Math.PI/2;spill.position.set(0,.025,21.5);spill.renderOrder=5;spill.name='М62 · свет на пути';root.add(spill);}
 const detailCounts={'source-body':1,'cab-window':wagon?0:8,'lit-window':wagon?20:0,'kosmotrans-lettering':wagon?0:2,'tail-lamp':last?2:0};
 const state={version:TRAIN_VERSION,status:'fallback',error:null,id:profile.id};let night=true,pending=null,detailMaterials=[];
 root.scale.setScalar(metricScale);for(const part of [...axles,...bogies])part.root.scale.setScalar(metricScale);
 function setEvening(value){night=!!value;for(const m of [glass,...detailMaterials]){if(m.name==='glass'){m.emissive.set(0xffcb83);m.emissiveIntensity=night?.13:0;}if(m.name==='lens'){m.emissive.set(0xffdf9c);m.emissiveIntensity=night?2.1:0;}}
  lights.setStrength(night?1:.04);windows.setStrength(night?.28:0);if(spill)spill.visible=night;
 }
 async function loadDetail({signal}={}){
  if(state.status==='ready')return true;if(pending)return pending;state.status='loading';state.error=null;
  pending=(async()=>{try{
   const {loadRailAsset}=await import('./rail-asset-loader.js?v=20261102-m62-v1'),source=await loadRailAsset(profile.id,{signal});
   // Source groups are unscaled rig roots. Quantized mesh transforms are kept.
   const replace=(target,name)=>{const part=source.getObjectByName(name);if(!part)throw Error('В модели отсутствует '+name);disposeFallback(target);for(const child of [...part.children])target.add(child);};
   replace(body,'body');bogies.forEach((b,i)=>replace(b.root,'bogie-'+i));axles.forEach((a,i)=>{
    const part=source.getObjectByName('axle-'+i);for(const [j,s]of [-1,1].entries())replace(a.wheels[j],`wheel-${i}-${s}`);
    for(const child of [...part.children])if(!child.name.startsWith('wheel-'))a.root.add(child);
   });
   for(const material of [glass,paint,cream,roof,dark,steel,hub])material.dispose();
   detailMaterials=[];root.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(!detailMaterials.includes(m))detailMaterials.push(m);});state.status='ready';setEvening(night);return true;
  }catch(error){state.status='error';state.error=String(error.message||error);return false;}finally{pending=null;}})();return pending;
 }
 setEvening(true);
 return {root,axles,bogies,glass,lights,windows,state,profile,loadDetail,setEvening,wheelRadius:profile.wheelRadius*metricScale,wheelbase:(profile.bogies[1]-profile.bogies[0])*metricScale,kind:wagon?'coach':'locomotive',last,detailCounts,bodyLength:profile.bodyLength*metricScale,metricScale,gauge,lightCount:markers.length+(wagon?6:4)};
}
