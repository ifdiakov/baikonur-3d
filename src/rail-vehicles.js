import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createLightField} from './light-field.js?v=20261028-site41-v1';
import {RAIL_PROFILE} from './rail-profile.js?v=20261031-facilities-rails-lighting-v1';

// Photo-based Baikonur service train, sized to the museum's shared rail gauge.
// Principal reference: the teal shunter and pale coaches in the owner's Мотовоз folder.
// The geometry is interpretive; no fleet number or exact surveyed dimensions are claimed.
export const COACH_COUNT=4;
const AUTHORED_GAUGE=.5859466666666666;
export const TRAIN_METRIC_SCALE=RAIL_PROFILE.gauge/AUTHORED_GAUGE;
export const COACH_OFFSETS=Object.freeze([7.90,16.90,25.90,34.90].map(n=>n*TRAIN_METRIC_SCALE));
export const TRAIN_START_DISTANCE=COACH_OFFSETS.at(-1)+5.4*TRAIN_METRIC_SCALE;
export const TRAIN_CONSIST_LENGTH=COACH_OFFSETS.at(-1)+(4.51+3.41)*TRAIN_METRIC_SCALE;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
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
   const g=new THREE.CylinderGeometry(r1,r2,h,10);
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
  const alpha=Math.exp(-Math.pow(u/spread,2)*4)*Math.pow(1-v,1.6)*Math.min(1,v*15)*.29;
  const at=(y*width+x)*4;data.set([255,220,157,Math.round(alpha*255)],at);
 }
 const texture=new THREE.DataTexture(data,width,height);texture.needsUpdate=true;return texture;
}

function roundedRoof(b,width,base,rise,length,z,material,name='rounded-roof'){
 const shape=new THREE.Shape();shape.moveTo(-width/2,base);shape.lineTo(-width*.44,base+rise*.55);shape.quadraticCurveTo(0,base+rise*1.4,width*.44,base+rise*.55);shape.lineTo(width/2,base);shape.closePath();
 const g=new THREE.ExtrudeGeometry(shape,{depth:length,bevelEnabled:false,curveSegments:12});g.translate(0,0,z-length/2);b.custom(g,material,name);
}
function stripe(b,x1,y1,x2,y2,z,width,material,name){
 const dx=x2-x1,dy=y2-y1,g=new THREE.BoxGeometry(Math.hypot(dx,dy),width,.012);g.rotateZ(Math.atan2(dy,dx));g.translate((x1+x2)/2,(y1+y2)/2,z);b.custom(g,material,name);
}
function lettering(){
 const material=standard(0xffffff,{roughness:.8,metalness:.05});material.name='reference-lettering';
 // No network image or font dependency. The non-browser geometry tests use a
 // plain material; the live scene draws the reference wording into one atlas.
 if(globalThis.document?.createElement){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const c=canvas.getContext('2d');
  if(c){c.fillStyle='#196b76';c.fillRect(0,0,1024,256);c.fillStyle='#e5d89d';c.textAlign='center';c.font='bold 70px sans-serif';c.fillText('КОСМИЧЕСКИЙ ЦЕНТР',512,100);c.font='bold 82px sans-serif';c.fillText('«ЮЖНЫЙ»',512,211);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;material.map=map;}
 }
 return material;
}

export function buildRailVehicle(parent,{wagon=false,gauge,index=0,last=false}){
 const metricScale=(gauge??RAIL_PROFILE.gauge)/AUTHORED_GAUGE;gauge=AUTHORED_GAUGE;
 const root=new THREE.Group();root.name=wagon?'Пассажирский вагон '+(index+1):'Мотовоз · маневровый тепловоз';
 root.userData.pickable=false;root.userData.railVehicle=wagon?'coach':'locomotive';parent.add(root);
 const paint=standard(wagon?0xc3c9c4:0x176b78),cream=standard(wagon?0x7fa792:0xe4bf48),dark=standard(0x202a2e),red=standard(0x9b4937),steel=standard(0x7e898a,{metalness:.72,roughness:.42});
 const roofPaint=standard(wagon?0xb5b9b4:0xc6c3a6,{roughness:.83,metalness:.22});
 const glass=standard(0x193943,{emissive:0xffc67b,emissiveIntensity:.68,roughness:.19,metalness:.14});
 const lens=standard(0xffe6b2,{emissive:0xffd68b,emissiveIntensity:2.4,roughness:.2});
 const tail=standard(0xc83e32,{emissive:0xff3326,emissiveIntensity:1.8}),hub=standard(0x8f9898,{metalness:.6});
 for(const [name,material] of Object.entries({paint,cream,dark,red,steel,roofPaint,glass,lens,tail,hub}))material.name=name;
 const b=batches(root),half=wagon?4.15:3.05,wheelRadius=wagon?.18:.20;
 b.box(1.17,.19,half*2,0,.48,0,dark,'frame');
 b.box(1.23,.065,half*2,0,.61,0,roofPaint,'walkway');
 b.box(.72,.24,wagon?2.2:1.65,0,.29,wagon?0:-.1,dark,'underfloor-equipment');
 for(const side of [-1,1])b.cylinder(.11,.11,wagon?1.3:1.5,side*.34,.33,.15,steel,'reservoir','z');
 if(wagon){
  b.box(1.14,.95,8.3,0,1.13,0,paint,'coach-body');
  for(const side of [-1,1]){
   b.box(.02,.085,8.20,side*.58,.89,0,cream,'waist-stripe');
   b.box(.024,.048,8.22,side*.583,.70,0,red,'lower-red-stripe');
   b.box(.018,.028,8.20,side*.58,1.62,0,steel,'cantrail');
   for(let n=0;n<11;n++){
    const z=-2.75+n*.55;
    b.box(.026,.48,.39,side*.582,1.30,z,dark,'window-seal');
    b.box(.03,.405,.325,side*.597,1.305,z,glass,'lit-window');
    b.box(.034,.022,.326,side*.603,1.39,z,steel,'window-divider');
   }
   for(const end of [-1,1]){
    const z=end*3.65;
    b.box(.023,.87,.50,side*.582,1.09,z,steel,'vestibule-door');
    b.box(.029,.79,.44,side*.595,1.10,z,paint,'vestibule-door-panel');
    b.box(.034,.34,.28,side*.611,1.32,z,glass,'door-window');
    b.box(.039,.024,.08,side*.619,1.03,z-.14,dark,'door-handle');
    for(const y of [.28,.42,.56])b.box(.22,.042,.47,side*.63,y,z,steel,'entry-step');
    for(const zz of [z-.29,z+.29])b.cylinder(.011,.011,.70,side*.641,1.0,zz,steel,'entry-handrail');
   }
   for(const y of [.76,.80,.98])b.box(.016,.015,7.0,side*.581,y,0,steel,'body-corrugation');
  }
  roundedRoof(b,1.22,1.61,.23,8.4,0,roofPaint);
  for(const z of [-2.9,-1.45,0,1.45,2.9]){b.box(.22,.06,.31,0,1.84,z,steel,'roof-vent');b.box(.28,.025,.38,0,1.885,z,roofPaint,'vent-cap');}
  for(const end of [-1,1]){
   b.box(.63,.88,.06,0,1.12,end*4.18,dark,'gangway-frame');
   for(const x of [-.30,.30])for(let n=0;n<4;n++)b.box(.06,.84,.022,x,1.13,end*(4.20+n*.04),dark,'gangway-bellows');
   b.box(.42,.75,.09,0,1.13,end*4.24,steel,'end-door');
   b.box(.26,.28,.10,0,1.32,end*4.25,glass,'end-window');
   for(const side of [-1,1])b.cylinder(.012,.012,.62,side*.41,1.01,end*4.21,steel,'end-handrail');
  }
 }else{
  // Long high hood, offset cab and short rear hood: the reference shunter silhouette.
  b.box(.91,1.08,3.78,0,1.18,.55,paint,'engine-hood');
  b.box(.934,.095,3.80,0,1.68,.55,cream,'hood-top-stripe');
  roundedRoof(b,.93,1.72,.08,3.79,.55,paint,'hood-roof');
  b.box(1.15,1.12,1.30,0,1.22,-1.92,paint,'driver-cab');
  roundedRoof(b,1.25,1.80,.20,1.43,-1.92,roofPaint,'cab-roof');
  b.box(.92,.77,.39,0,1.02,-2.72,paint,'short-hood');
  b.box(.94,.06,.43,0,1.43,-2.72,cream,'short-hood-stripe');
  for(const z of [-1.253,-2.587]){
   b.box(1.03,.42,.033,0,1.52,z,dark,'cab-window-gasket');
   for(const x of [-.255,.255])b.box(.435,.34,.04,x,1.53,z,glass,'cab-window');
   b.box(.035,.40,.046,0,1.52,z,roofPaint,'windshield-pillar');
   b.box(1.20,.055,.14,0,1.80,z,roofPaint,'sun-visor');
   for(const x of [-.22,.22]){const w=new THREE.BoxGeometry(.014,.23,.016);w.rotateZ(-.22);w.translate(x,1.51,z+(z>-2?1:-1)*.026);b.custom(w,dark,'windshield-wiper');}
  }
  for(const side of [-1,1]){
   b.box(.025,.43,.90,side*.584,1.52,-1.91,dark,'cab-side-gasket');
   b.box(.031,.35,.80,side*.60,1.53,-1.91,glass,'cab-side-window');
   b.box(.04,.40,.025,side*.619,1.53,-1.92,roofPaint,'sliding-window-pillar');
   b.box(.022,.65,.54,side*.586,.99,-2.18,dark,'cab-door-seam');
   b.box(.028,.60,.49,side*.599,1.0,-2.18,paint,'cab-door');
   b.box(.037,.025,.10,side*.618,1.16,-2.34,steel,'cab-handle');
   b.box(.018,.065,5.30,side*.47,.72,-.21,cream,'lower-yellow-stripe');
   for(let n=0;n<11;n++){
    const z=-1.25+n*.32;b.box(.017,.80,.016,side*.463,1.17,z,dark,'hood-panel-seam');
    b.box(.035,.045,.10,side*.476,1.31,z+.08,steel,'hood-handle');
   }
   for(let n=0;n<18;n++)b.box(.025,.58,.033,side*.468,1.24,1.66+n*.04,dark,'radiator-side-louvre');
   for(let n=0;n<7;n++)b.box(.025,.22,.026,side*.468,1.53,-1.18+n*.09,dark,'engine-louvre');
   for(const z of [-2.89,-2.56,-1.30,-.43,.55,1.57,2.88])b.cylinder(.011,.011,.55,side*.61,.93,z,roofPaint,'handrail-post');
   b.cylinder(.011,.011,5.79,side*.61,1.205,0,roofPaint,'side-handrail','z');
   b.cylinder(.009,.009,3.92,side*.61,.95,.91,roofPaint,'lower-handrail','z');
   for(const z of [-2.83,2.88])for(const y of [.26,.39,.52])b.box(.25,.04,.32,side*.60,y,z,steel,'cab-step');
   b.box(.017,.70,.015,side*.645,1.03,-2.56,roofPaint,'cab-door-rail');
  }
  const textMaterial=lettering();
  for(const side of [-1,1]){const g=new THREE.PlaneGeometry(1.65,.41);g.rotateY(side*Math.PI/2);g.translate(side*.476,1.16,.18);b.custom(g,textMaterial,'kosmicheskiy-centr-yuzhnyy');}
  b.box(.73,.69,.033,0,1.15,2.456,dark,'radiator');
  for(let n=0;n<15;n++)b.box(.68,.018,.038,0,.83+n*.043,2.477,paint,'radiator-slat');
  stripe(b,-.455,1.53,0,1.29,2.504,.12,cream,'nose-yellow-chevron');stripe(b,0,1.29,.455,1.53,2.504,.12,cream,'nose-yellow-chevron');
  b.cylinder(.10,.10,.11,0,1.62,2.50,roofPaint,'headlight-rim','z');b.cylinder(.075,.075,.014,0,1.62,2.562,lens,'headlight-lens','z');
  b.cylinder(.067,.08,.25,.16,1.92,.36,dark,'exhaust');b.cylinder(.09,.09,.035,.16,2.058,.36,steel,'exhaust-cap');
  for(const x of [-.17,.17])b.cylinder(.031,.048,.27,x,1.99,-1.61,steel,'horn','z');
  b.cylinder(.008,.008,.35,-.24,2.15,-2.16,steel,'radio-antenna');
  b.cylinder(.26,.26,.045,0,1.82,1.67,dark,'roof-fan','y');
  for(let i=0;i<8;i++){const a=i*Math.PI/4,g=new THREE.BoxGeometry(.40,.018,.016);g.rotateY(a);g.translate(0,1.85,1.67);b.custom(g,steel,'fan-grille');}
  for(const side of [-1,1]){b.box(.23,.13,.035,side*.42,.74,3.08,roofPaint,'buffer-lamp-housing');b.cylinder(.049,.049,.025,side*.42,.74,3.11,lens,'buffer-lamp','z');}
 }
 for(const end of [-1,1]){
  const z=end*(half+.06);b.box(1.16,.19,.12,0,.48,z,red,'buffer-beam');
  // Central automatic coupling; the reference has no European round side buffers.
  b.box(.17,.105,.27,0,.45,z+end*.13,dark,'coupler');b.box(.24,.15,.085,0,.45,z+end*.245,steel,'coupler-head');
  b.cylinder(.018,.018,.21,.15,.31,z+end*.05,dark,'brake-hose');
  if(!wagon){
   b.box(1.13,.28,.055,0,.28,z+end*.04,red,'pilot');
   for(const side of [-1,1])stripe(b,side*.09,.40,side*.43,.18,z+end*.074,.09,cream,'pilot-chevron');
   b.cylinder(.012,.012,1.16,0,1.20,z,roofPaint,'end-handrail','x');
  }
 }
 if(last)for(const side of [-1,1]){b.box(.14,.15,.045,side*.43,1.22,-4.21,dark,'tail-lamp-housing');b.cylinder(.048,.048,.025,side*.43,1.22,-4.245,tail,'tail-lamp','z');}
 const detailCounts=b.finish();
 const markers=wagon?(last?[-1,1].map(s=>({x:s*.43,y:1.22,z:-4.27,height:0,color:0xff4537,size:1.6})):[]):[
  {x:0,y:1.62,z:2.58,height:0,color:0xffe9ba,size:3.4},...[-1,1].map(s=>({x:s*.42,y:.74,z:3.13,height:0,color:0xffedc9,size:1.9}))];
 const lights=createLightField(root,markers,{name:wagon?'Хвостовые огни · вагон 4':'Мотовоз · прожектор и буферные фонари',minPixels:wagon?3.2:4.8});
 const windows=createLightField(root,(wagon?[-2.2,0,2.2]:[-1.92]).flatMap(z=>[-1,1].map(side=>({x:side*(wagon?.62:.63),y:wagon?1.30:1.53,z,height:0,color:0xffd896,size:wagon?.37:.46}))),{name:'Тёплый свет окон',minPixels:2});
 let spill=null;
 if(!wagon){const mat=new THREE.MeshBasicMaterial({map:beamTexture(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false});spill=new THREE.Mesh(new THREE.PlaneGeometry(4.0,13),mat);spill.rotation.x=-Math.PI/2;spill.position.set(0,.025,9.4);spill.renderOrder=5;spill.name='Мотовоз · свет на пути';root.add(spill);}
 const materials={dark,steel,hub},axles=[],bogies=[],bogieOffsets=wagon?[-2.95,2.95]:[-1.86,1.86];
 const axleOffsets=bogieOffsets.flatMap(center=>(wagon?[-.38,.38]:[-.58,0,.58]).map(offset=>center+offset));
 for(const offset of axleOffsets){
  const axle=new THREE.Group();axle.name='Колёсная пара';parent.add(axle);
  const wheels=[-1,1].map(side=>wheel(axle,side*gauge/2,wheelRadius,materials,side));
  const ab=batches(axle);ab.cylinder(.045,.045,gauge,0,wheelRadius,0,steel,'axle-shaft','x');
  for(const side of [-1,1]){ab.box(.15,.14,.17,side*(gauge/2+.09),wheelRadius,0,dark,'axlebox');ab.box(.19,.03,.24,side*(gauge/2+.09),.32,0,steel,'suspension-leaf');}
  ab.finish();axles.push({root:axle,offset,wheels});
 }
 for(const offset of bogieOffsets){
  const bogie=new THREE.Group();bogie.name=wagon?'Двухосная тележка вагона':'Трёхосная тележка тепловоза';parent.add(bogie);const bb=batches(bogie),length=wagon?1.1:1.6;
  for(const side of [-1,1]){
   bb.box(.14,.15,length,side*(gauge/2+.10),.35,0,dark,'bogie-frame');
   for(const z of wagon?[-.17,.17]:[-.37,.37]){bb.cylinder(.055,.055,.17,side*(gauge/2+.17),.33,z,steel,'suspension-spring');for(let j=0;j<4;j++)bb.cylinder(.057,.057,.012,side*(gauge/2+.17),.265+j*.042,z,dark,'spring-coil');}
  }
  bb.box(gauge+.25,.11,.23,0,.40,0,steel,'bogie-bolster');bb.finish();bogies.push({root:bogie,offset});
 }
 // Scale the complete authored train coherently. Separate wheel/bogie roots
 // follow the same scale and arc-distance offsets as the body and couplers.
 root.scale.setScalar(metricScale);
 for(const axle of axles){axle.root.scale.setScalar(metricScale);axle.offset*=metricScale;}
 for(const bogie of bogies){bogie.root.scale.setScalar(metricScale);bogie.offset*=metricScale;}
 return {root,axles,bogies,glass,lights,windows,wheelRadius:wheelRadius*metricScale,wheelbase:Math.abs(bogieOffsets[1]-bogieOffsets[0])*metricScale,
  kind:wagon?'coach':'locomotive',last,detailCounts,bodyLength:half*2*metricScale,metricScale,gauge:AUTHORED_GAUGE*metricScale,lightCount:markers.length+(wagon?6:2),
  setEvening(night){glass.emissiveIntensity=night?.68:.025;lens.emissiveIntensity=night?2.4:.06;tail.emissiveIntensity=night?1.8:.06;lights.setStrength(night?1:.06);windows.setStrength(night?.46:0);if(spill)spill.visible=night;}
 };
}
