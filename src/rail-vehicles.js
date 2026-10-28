import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createLightField} from './light-field.js';

// An illustrative service train, sized to the museum's shared rail gauge.
// These details do not attribute the model to a particular real locomotive.
export const COACH_COUNT=4;
export const COACH_OFFSETS=Object.freeze([4.72,10.11,15.50,20.89]);
export const TRAIN_START_DISTANCE=COACH_OFFSETS.at(-1)+3.3;
export const TRAIN_CONSIST_LENGTH=COACH_OFFSETS.at(-1)+2.76+2.09;
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

export function buildRailVehicle(parent,{wagon=false,gauge,index=0,last=false}){
 const root=new THREE.Group();root.name=wagon?'Служебный вагон '+(index+1):'Мотовоз';
 root.userData.pickable=false;root.userData.railVehicle=wagon?'coach':'locomotive';parent.add(root);
 const paint=standard(wagon?[0x4e7175,0x547b7b,0x557176,0x5b7b78][index]:0x617348);
 const cream=standard(0xd9ccb1),dark=standard(0x252f32),red=standard(0x943f31),steel=standard(0x767f7e,{metalness:.72,roughness:.37});
 const glass=standard(0x314b55,{emissive:0xffd28c,emissiveIntensity:1.35,roughness:.23,metalness:.1});
 const lens=standard(0xffe6b2,{emissive:0xffd68b,emissiveIntensity:2.4,roughness:.2});
 const tail=standard(0xc83e32,{emissive:0xff3326,emissiveIntensity:1.8});
 const hub=standard(0x9a9f98,{metalness:.6});
 for(const [name,material] of Object.entries({paint,cream,dark,red,steel,glass,lens,tail,hub}))material.name=name;
 const b=batches(root),half=wagon?2.4:1.73;
 b.box(1.12,.20,half*2,0,.45,0,dark,'frame');
 b.box(1.15,.07,half*2,0,.57,0,steel,'walkway');
 b.box(.59,.27,wagon?1.5:.8,0,.28,0,dark,'underfloor-equipment');
 b.cylinder(.11,.11,wagon?1.5:.7,0,.3,wagon?.15:.7,steel,'reservoir','z');
 if(wagon){
  b.box(1.10,.99,4.8,0,1.08,0,paint,'coach-body');
  for(const side of [-1,1]){
   b.box(.018,.07,4.68,side*.559,.81,0,cream,'waist-stripe');
   b.box(.018,.034,4.68,side*.559,1.52,0,cream,'cantrail');
   for(let n=0;n<5;n++){
    const z=-1.38+n*.69;
    b.box(.029,.48,.51,side*.564,1.24,z,dark,'window-seal');
    b.box(.032,.39,.42,side*.582,1.25,z,glass,'lit-window');
    b.box(.037,.025,.42,side*.59,1.31,z,cream,'window-divider');
   }
   for(const end of [-1,1]){
    const z=end*2.06;
    b.box(.024,.84,.46,side*.564,1.03,z,cream,'vestibule-door');
    b.box(.035,.32,.28,side*.582,1.26,z,glass,'door-window');
    b.box(.045,.025,.07,side*.599,.98,z-.14,steel,'door-handle');
    for(const y of [.30,.43])b.box(.21,.045,.45,side*.6,y,z,steel,'entry-step');
    for(const zz of [z-.28,z+.28])b.cylinder(.012,.012,.62,side*.62,.94,zz,cream,'entry-handrail');
   }
   for(let n=0;n<12;n++)b.box(.018,.21,.025,side*.56,.67,-2.3+n*.418,paint,'body-rib');
  }
  const roofShape=new THREE.Shape();roofShape.moveTo(-.61,1.58);roofShape.lineTo(-.54,1.73);roofShape.quadraticCurveTo(0,1.91,.54,1.73);roofShape.lineTo(.61,1.58);roofShape.closePath();
  const roof=new THREE.ExtrudeGeometry(roofShape,{depth:4.9,bevelEnabled:false,curveSegments:10});roof.translate(0,0,-2.45);b.custom(roof,cream,'rounded-roof');
  for(const z of [-1.55,0,1.55]){b.box(.25,.08,.35,0,1.82,z,steel,'roof-vent');b.box(.32,.028,.43,0,1.87,z,cream,'vent-cap');}
  for(const end of [-1,1]){
   b.box(.54,.8,.038,0,1.01,end*2.422,dark,'gangway-frame');
   b.box(.4,.68,.05,0,1.02,end*2.445,cream,'end-door');
   b.box(.27,.27,.057,0,1.22,end*2.45,glass,'end-window');
   for(const side of [-1,1])b.cylinder(.014,.014,.59,side*.36,.95,end*2.46,steel,'end-handrail');
  }
 }else{
  b.box(.88,.66,1.78,0,.93,.62,paint,'engine-hood');
  b.box(.91,.08,1.80,0,1.30,.62,cream,'hood-top');
  b.box(1.09,1.04,1.10,0,1.10,-.78,cream,'driver-cab');
  b.box(1.20,.12,1.27,0,1.68,-.78,dark,'cab-roof');
  b.box(.95,.13,.12,0,1.59,-.14,cream,'sun-visor');
  for(const z of [-.214,-1.342]){
   b.box(.88,.42,.034,0,1.33,z,dark,'cab-window-gasket');
   for(const x of [-.21,.21])b.box(.36,.34,.041,x,1.34,z,glass,'cab-window');
   b.box(.034,.38,.05,0,1.33,z,cream,'windshield-pillar');
  }
  for(const side of [-1,1]){
   b.box(.03,.43,.73,side*.559,1.32,-.77,dark,'cab-side-gasket');
   b.box(.034,.35,.65,side*.578,1.33,-.77,glass,'cab-side-window');
   b.box(.04,.48,.65,side*.558,.88,-.77,paint,'cab-door');
   b.box(.043,.028,.11,side*.584,1.06,-.98,steel,'cab-handle');
   for(let n=0;n<9;n++)b.box(.028,.39,.047,side*.453,.97,-.05+n*.174,dark,'engine-louvre');
   for(const z of [-1.48,-.16,1.51])b.cylinder(.014,.014,.49,side*.58,.85,z,cream,'handrail-post');
   for(const z of [.63,-.81])b.cylinder(.014,.014,z>0?1.67:1.27,side*.58,1.095,z,cream,'side-handrail','z');
   for(const y of [.26,.40])b.box(.26,.055,.46,side*.56,y,-1.34,steel,'cab-step');
   b.box(.035,.46,.018,side*.585,1.2,-1.22,cream,'rear-door-rail');
  }
  // Radiator mesh and two buffer lamps face the direction of travel (+Z).
  b.box(.72,.48,.027,0,.97,1.525,dark,'radiator');
  for(let n=0;n<8;n++)b.box(.66,.022,.032,0,.77+n*.057,1.547,steel,'radiator-slat');
  b.cylinder(.055,.07,.55,.17,1.52,.45,dark,'exhaust');
  b.cylinder(.078,.078,.035,.17,1.81,.45,steel,'exhaust-cap');
  b.cylinder(.028,.045,.24,-.22,1.77,-.55,steel,'horn','z');
  b.cylinder(.105,.105,.12,0,1.53,-.07,dark,'headlight-housing','z');
  b.cylinder(.08,.08,.012,0,1.53,.0,lens,'headlight-lens','z');
  for(const side of [-1,1])b.cylinder(.05,.05,.035,side*.39,.77,1.74,lens,'buffer-lamp','z');
 }
 for(const end of [-1,1]){
  const z=end*(half+.07);
  b.box(1.10,.18,.12,0,.47,z,red,'buffer-beam');
  for(const side of [-1,1]){b.cylinder(.05,.05,.14,side*.34,.47,z+end*.10,dark,'buffer-stock','z');b.cylinder(.09,.09,.04,side*.34,.47,z+end*.18,steel,'buffer-face','z');}
  b.box(.15,.10,.23,0,.44,z+end*.115,dark,'coupler');
  b.box(.21,.13,.085,0,.44,z+end*.24,steel,'coupler-head');
 }
 if(last)for(const side of [-1,1]){b.box(.14,.15,.045,side*.42,1.16,-2.45,dark,'tail-lamp-housing');b.cylinder(.048,.048,.025,side*.42,1.16,-2.486,tail,'tail-lamp','z');}
 const detailCounts=b.finish();
 const markers=wagon?(last?[-1,1].map(s=>({x:s*.42,y:1.16,z:-2.51,height:0,color:0xff4537,size:2.4})):[]):[
  {x:0,y:1.53,z:.03,height:0,color:0xffe9ba,size:4.8},
  ...[-1,1].map(s=>({x:s*.39,y:.77,z:1.77,height:0,color:0xffedc9,size:2.8}))];
 const lights=createLightField(root,markers,{name:wagon?'Хвостовые огни · вагон 4':'Мотовоз · прожектор и буферные фонари',minPixels:wagon?4.2:6.2});
 const windows=createLightField(root,(wagon?[-1.03,1.03]:[-.78]).flatMap(z=>[-1,1].map(side=>({x:side*(wagon?.595:.59),y:wagon?1.25:1.34,z,height:0,color:0xffd896,size:wagon?.55:.7}))),{name:'Тёплый свет окон',minPixels:wagon?2.6:3.2});
 let spill=null;
 if(!wagon){
  const mat=new THREE.MeshBasicMaterial({map:beamTexture(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false});
  spill=new THREE.Mesh(new THREE.PlaneGeometry(4.4,12),mat);spill.rotation.x=-Math.PI/2;spill.position.set(0,.025,7.7);spill.renderOrder=5;spill.name='Мотовоз · свет на пути';root.add(spill);
 }
 const materials={dark,steel,hub},axles=[],bogies=[];
 const axleOffsets=wagon?[-2.00,-1.36,1.36,2.00]:[-1.15,1.15],wheelRadius=.155;
 for(const offset of axleOffsets){
  const axle=new THREE.Group();axle.name='Колёсная пара';parent.add(axle);
  const wheels=[-1,1].map(side=>wheel(axle,side*gauge/2,wheelRadius,materials,side));
  const ab=batches(axle);ab.cylinder(.045,.045,gauge,0,wheelRadius,0,steel,'axle-shaft','x');
  for(const side of [-1,1]){ab.box(.16,.16,.16,side*(gauge/2+.09),.18,0,dark,'axlebox');ab.box(.20,.035,.22,side*(gauge/2+.09),.29,0,steel,'suspension-leaf');}
  ab.finish();axles.push({root:axle,offset,wheels});
 }
 for(const offset of wagon?[-1.68,1.68]:[0]){
  const bogie=new THREE.Group();bogie.name=wagon?'Тележка вагона':'Подвеска мотовоза';parent.add(bogie);const bb=batches(bogie);
  for(const side of [-1,1]){
   bb.box(.12,.13,wagon?.94:2.64,side*(gauge/2+.09),.31,0,dark,'bogie-frame');
   if(wagon)for(const z of [-.13,.13])bb.cylinder(.045,.045,.16,side*(gauge/2+.14),.25,z,steel,'suspension-spring');
  }
  bb.box(gauge+.22,.10,.18,0,.33,0,steel,'bogie-bolster');bb.finish();bogies.push({root:bogie,offset});
 }
 return {root,axles,bogies,glass,lights,windows,wheelRadius,wheelbase:wagon?3.36:2.3,
  kind:wagon?'coach':'locomotive',last,detailCounts,lightCount:markers.length+(wagon?4:2),
  setEvening(night){glass.emissiveIntensity=night?1.35:.04;lens.emissiveIntensity=night?2.4:.06;tail.emissiveIntensity=night?1.8:.06;lights.setStrength(night?1:.06);windows.setStrength(night?.68:0);if(spill)spill.visible=night;}
 };
}
