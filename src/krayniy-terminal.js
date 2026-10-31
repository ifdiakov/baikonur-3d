import * as THREE from 'three';
import {registerFacilityBeacon} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';

export const KRAYNIY_TERMINAL_VERSION='krayniy-drive-terminal-v1';
export const KRAYNIY_AIRPORT_DISPLAY=Object.freeze({terminalX:-270,apronX:-132.5,apronZ:0,apronWidth:195,apronLength:400,taxiX:-100});
export const KRAYNIY_TERMINAL_REFERENCE=Object.freeze({
 folder:'https://drive.google.com/drive/folders/1Liw88KWINElSf9WRBRF9RhV1hHBM5Pws',
 photos:Object.freeze([
  {id:'1jH4yVxvzLhtdCBS3jb-fzV-5isF4a6-M',name:'TMA-13M_Soyuz_Raising_&_Launch_(14319764894).jpg',role:'landside facade and integrated tower'},
  {id:'1sShK4Sk4WgPQrt4l4eh9fnBmq4dj-NHb',name:'1337003.jpg',role:'airside tower, inclined cab glazing and balcony'},
  {id:'1Qtp5R4m1N6K9RvXa_5mHHdRoSAhtcRtG',name:'5.-Baikonur.jpg',role:'entrance glazing, blue canopy and facade rhythm'},
  {id:'1AP4Ty5T6kSJWITxPfo4eZ3Msu-8zhRju',name:'2579952_original.jpg',role:'airside composition, apron and rear parking'},
  {id:'1G-mn6KWov4VihctCMOd4bfmUi__Y5fS2',name:'1549603790_71f55sfq7wsewb9qq5k551citrlael2.jpg',role:'airside silhouette and connected terminal grounds'}
 ]),
 satelliteReferences:['Снимок экрана — 2026-10-30 в 23.55.23.png','Снимок экрана — 2026-10-30 в 23.55.41.png'],
 basis:'owner-provided facade photos and satellite screenshots; OSM runway-relative terminal station; interpreted display dimensions'
});

export function krayniyTerminalLayout(apronZ){
 return {center:[KRAYNIY_AIRPORT_DISPLAY.terminalX,1.8,apronZ],side:-1,airsideDirection:[1,0,0],
  layoutBasis:'OSM terminal way/173450632 at runway midpoint; cross-axis enlarged for museum readability',
  terminalSource:{osmWayId:173450632,lonLat:[63.2142915575,45.6180972748],sourceLocal:[-95.3024743,-0.01760034],displayStation:0},
  main:{width:36,length:106,height:14},tower:{center:[10,-31],height:37.7},
  apron:[KRAYNIY_AIRPORT_DISPLAY.apronX,apronZ],apronWidth:KRAYNIY_AIRPORT_DISPLAY.apronWidth,taxiX:KRAYNIY_AIRPORT_DISPLAY.taxiX,
  // Retained OSM approach junction outside the enlarged airport apron. The
  // short museum connector skirts the apron; it never crosses the runway.
  access:{sourceWayId:'183464379',sourceNodeId:'11928484150',
   sourceLocal:[-201.654311864158,2.571428571428571,260.9439701180045],
   anchors:[[-201.654311864158,2.571428571428571,260.9439701180045],[-260,2.4,246],[-320,2.2,225],[-375,1.94,188],[-405,1.94,145],[-405,1.94,70]],
   width:6.4,profile:'landside approach outside the apron'},
  grounds:{garden:{minX:-372,maxX:-310,minZ:-45,maxZ:53},parking:{minX:-436,maxX:-374,minZ:-70,maxZ:70},circularFeature:{center:[-341,13.5],radius:5.6}},
  camera:{airside:{target:[-270,16,apronZ],eye:[-105,160,apronZ+165]},
   landside:{target:[-315,10,apronZ],eye:[-560,200,apronZ-195]},
   top:{target:[-245,0,apronZ],eye:[-245,540,apronZ+.01]}}};
}

// A few material batches retain the distinctive building composition. Tiny
// rooftop fittings, wire fences, cladding screws and individual paving tiles
// are intentionally omitted. No photo textures or external requests are used.
export function buildKrayniyTerminal(parent,apronZ){
 const layout=krayniyTerminalLayout(apronZ),root=new THREE.Group();
 root.name='Крайний · аэровокзал по фотографиям';root.position.set(layout.center[0],0,apronZ);parent.add(root);
 const colors={silver:0xc5ced0,white:0xdce2df,blue:0x1677ac,navy:0x154b78,glass:0x284e59,
  dark:0x3b4d53,concrete:0xb8b7aa,asphalt:0xa3aaab,grass:0x68815b,soil:0x9e9381,water:0x4d7993};
 const materials=Object.fromEntries(Object.entries(colors).map(([key,color])=>[key,new THREE.MeshStandardMaterial({
  color,roughness:key==='glass'?.3:.8,metalness:key==='glass'?.3:key==='silver'?.2:.02,side:THREE.DoubleSide})]));
 for(const [name,material]of Object.entries(materials))material.name='Крайний · '+name;
 const cube=new THREE.BoxGeometry(1,1,1),rodGeometry=new THREE.CylinderGeometry(1,1,1,6),up=new THREE.Vector3(0,1,0);
 const batches=new Map(),custom=new Map(),features={};
 const count=tag=>features[tag]=(features[tag]||0)+1;
 function primitive(geometry,material,position,scale,quaternion,tag){
  const key=geometry.uuid+':'+material;let batch=batches.get(key);
  if(!batch){batch={geometry,material,matrices:[]};batches.set(key,batch);}
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),quaternion,new THREE.Vector3(...scale));
  batch.matrices.push(matrix);count(tag);
 }
 const identity=new THREE.Quaternion();
 function box(w,h,d,x,y,z,material,tag){primitive(cube,material,[x,y,z],[w,h,d],identity,tag);}
 function rod(a,b,r,material,tag){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),length=delta.length();
  if(length<1e-6)return;primitive(rodGeometry,material,start.add(end).multiplyScalar(.5).toArray(),[r,length,r],new THREE.Quaternion().setFromUnitVectors(up,delta.divideScalar(length)),tag);}
 function quad(a,b,c,d,material,tag){let vertices=custom.get(material);if(!vertices){vertices=[];custom.set(material,vertices);}
  vertices.push(...a,...b,...c,...a,...c,...d);count(tag);}
 function strip(points,width,material,tag){
  const edges=points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz)||1,nx=-dz/length*width/2,nz=dx/length*width/2;
   return [[p[0]+nx,p[1],p[2]+nz],[p[0]-nx,p[1],p[2]-nz]];});
  for(let i=1;i<points.length;i++)quad(edges[i-1][0],edges[i][0],edges[i][1],edges[i-1][1],material,tag);
 }
 function sign(text,side){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
  const context=canvas.getContext('2d');context.clearRect(0,0,1024,128);context.fillStyle='#164d7a';
  context.textAlign='center';context.textBaseline='middle';context.font='bold 88px Arial';context.fillText(text,512,65,990);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(73,3.5),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.FrontSide}));
  mesh.name='Крайний · '+text;mesh.userData.museumComponent='krayniy-terminal-sign';mesh.userData.signText=text;
  mesh.position.set(side*18.06,14.1,13.5);mesh.rotation.y=side*Math.PI/2;root.add(mesh);count('facade-sign');
 }

 // Silver two-storey administrative body. Both long elevations are visible
 // in the source set: the airside says БАЙКОНУР, the entrance АЭРОПОРТ.
 box(40,.65,110,0,1.475,0,'concrete','terminal-foundation');
 box(36,14,106,0,8.8,0,'silver','terminal-main-body');
 box(37,.65,107,0,16.125,0,'silver','terminal-flat-roof');
 for(const side of [-1,1]){box(.3,.28,107,side*18.35,16.59,0,'blue','terminal-blue-roofline');box(37,.28,.3,0,16.59,side*53.35,'blue','terminal-blue-roofline');}
 for(const side of [-1,1]){
  box(.22,.35,106,side*18.08,2,0,'blue','terminal-blue-plinth');
  box(.2,.28,106,side*18.08,10.5,0,'blue','terminal-blue-belt');
  for(const z of [-48,-40,-32]){
   if(side===1&&z>=-40&&z<=-24)continue;
   for(const y of [5.1,10]){
    box(.22,3.2,2.6,side*18.14,y,z,'blue','terminal-window-border');
    box(.25,2.8,2.18,side*18.29,y,z,'white','terminal-window-frame');
    box(.28,2.43,1.8,side*18.45,y,z,'glass','terminal-window');
   }
  }
  // Long glazed entrance pavilion, with outward-leaning glazing and a broad
  // vivid-blue canopy. Its major mullions are retained as one batch.
  const z0=-24,z1=53,back=side*18,base=side*29,top=side*32,y0=2,y1=10.6;
  quad([base,y0,z0],[base,y0,z1],[top,y1,z1],[top,y1,z0],'glass','sloped-pavilion-glazing');
  quad([back,y0,z0],[base,y0,z0],[top,y1,z0],[back,y1,z0],'glass','pavilion-end-glazing');
  quad([back,y0,z1],[base,y0,z1],[top,y1,z1],[back,y1,z1],'glass','pavilion-end-glazing');
  box(15.3,.7,80,side*25.4,11.08,14.5,'silver','terminal-canopy-roof');
  for(const end of [-25.5,54.5])box(15.3,.9,.5,side*25.4,10.98,end,'blue','terminal-blue-canopy');
  box(1,.9,80,side*33.05,10.98,14.5,'blue','terminal-canopy-fascia');
  box(11.8,.32,78,side*24.5,1.98,14.5,'blue','pavilion-blue-plinth');
  for(let z=z0;z<=z1+.01;z+=7.7)rod([base+.08*side,y0,z],[top+.08*side,y1,z],.12,'white','pavilion-mullion');
  for(const y of [2.1,5.8,8.8,10.55]){const x=base+(top-base)*(y-y0)/(y1-y0)+side*.12;rod([x,y,z0],[x,y,z1],.11,'white','pavilion-transom');}
  for(const z of [11.8,17.2]){const x=base+(top-base)*2.9/(y1-y0)+side*.28;box(.24,4.7,4.5,x,4.35,z,'white','entrance-door-frame');box(.29,4.25,3.96,x+side*.18,4.35,z,'glass','entrance-door');}
  // Two broad paths and lawn rectangles preserve the source's entrance
  // composition without individual shrubs or paving tiles.
  const walkwayX=side>0?36.6:-36.6,walkwayWidth=8.4,lawnWidth=8.1;
  box(walkwayWidth,.18,80,walkwayX,1.8,14.5,'concrete','terminal-walkway');
  box(lawnWidth,.2,25,walkwayX,1.9,-10,'grass','terminal-front-lawn');
  box(lawnWidth,.2,26,walkwayX,1.9,40,'grass','terminal-front-lawn');
 }
 sign('БАЙКОНУР',1);sign('АЭРОПОРТ',-1);

 // The control tower is part of the terminal, not a separate generic post.
 const tx=10,tz=-31;
 box(16,24.7,17,tx,14.15,tz,'silver','integrated-control-tower');
 box(.15,10.3,14,18.1,20.9,tz,'glass','tower-airside-glazing');
 for(const y of [16,19.5,23,26])box(.24,.16,14.1,18.21,y,tz,'dark','tower-glazing-transom');
 for(const z of [tz-4.65,tz,tz+4.65])box(.23,10.3,.13,18.22,20.9,z,'dark','tower-glazing-mullion');
 box(25.5,.75,26.5,tx,26.7,tz,'white','tower-balcony');
 const cabBottom=27.3,cabTop=33.4,lower=8.6,upper=11.3;
 for(const side of [-1,1]){
  quad([tx+side*lower,cabBottom,tz-lower],[tx+side*lower,cabBottom,tz+lower],[tx+side*upper,cabTop,tz+upper],[tx+side*upper,cabTop,tz-upper],'glass','inclined-control-cab');
  quad([tx-lower,cabBottom,tz+side*lower],[tx+lower,cabBottom,tz+side*lower],[tx+upper,cabTop,tz+side*upper],[tx-upper,cabTop,tz+side*upper],'glass','inclined-control-cab');
  for(let i=0;i<=5;i++){const t=-1+i*.4;
   rod([tx+side*lower,cabBottom,tz+t*lower],[tx+side*upper,cabTop,tz+t*upper],.12,'dark','control-cab-mullion');
   rod([tx+t*lower,cabBottom,tz+side*lower],[tx+t*upper,cabTop,tz+side*upper],.12,'dark','control-cab-mullion');
  }
  for(const y of [27.35,28.1,28.85]){
   rod([tx+side*12.4,y,tz-12.9],[tx+side*12.4,y,tz+12.9],.1,'white','tower-balcony-rail');
   rod([tx-12.4,y,tz+side*12.9],[tx+12.4,y,tz+side*12.9],.1,'white','tower-balcony-rail');
  }
  for(const z of [tz-12.9,tz,tz+12.9])rod([tx+side*12.4,27.1,z],[tx+side*12.4,29,z],.11,'white','tower-balcony-post');
  for(const x of [tx-6,tx,tx+6])rod([x,27.1,tz+side*12.9],[x,29,tz+side*12.9],.11,'white','tower-balcony-post');
 }
 box(24.5,1.4,24.5,tx,34.1,tz,'silver','control-cab-roof');
 for(const side of [-1,1]){box(.28,.3,24.6,tx+side*12.15,34.95,tz,'blue','control-cab-blue-cap');box(24.6,.3,.28,tx,34.95,tz+side*12.15,'blue','control-cab-blue-cap');}
 // A single readable antenna assembly replaces the small cables and fittings.
 rod([tx,34.9,tz],[tx,39.5,tz],.17,'silver','tower-main-aerial');
 registerFacilityBeacon(root,{id:'krayniy-control-tower',position:[tx,39.5,tz],kind:'control-tower'});
 for(const y of [36.4,37.9])rod([tx-2,y,tz],[tx+2,y,tz],.12,'silver','tower-aerial-crossbar');
 for(const z of [tz-8.7,tz+8.7])rod([tx+7.5,34.9,z],[tx+7.5,37.2,z],.12,'silver','tower-secondary-aerial');
 // Source-visible small side balcony remains a simple slab and handrail.
 box(4.2,.45,6.7,.3,20.4,tz,'white','tower-side-balcony');
 rod([-1.5,20.65,tz-3.3],[-1.5,22.3,tz-3.3],.1,'white','tower-side-balcony-post');
 rod([-1.5,20.65,tz+3.3],[-1.5,22.3,tz+3.3],.1,'white','tower-side-balcony-post');
 rod([-1.5,22.3,tz-3.3],[-1.5,22.3,tz+3.3],.1,'white','tower-side-balcony-rail');
 for(const z of [0,22,44]){box(3.1,1.8,3.3,0,17.45,z,'dark','roof-vent');box(3.8,.4,4,0,18.55,z,'silver','roof-vent-cap');}

 // The supplied satellite close-up shows a broad forecourt with diagonal
 // walks around a round central basin, then a parking rectangle farther from
 // the runway. Keep that composition; cars, paving joints and tiny bushes are
 // omitted. The road and all parking corners are checked against the river.
 const localX=x=>x-layout.center[0];
 const garden=layout.grounds.garden,parking=layout.grounds.parking,center=layout.grounds.circularFeature.center;
 box(garden.maxX-garden.minX,.2,garden.maxZ-garden.minZ,localX((garden.minX+garden.maxX)/2),1.7,(garden.minZ+garden.maxZ)/2,'soil','terminal-forecourt-garden');
 box(parking.maxX-parking.minX,.24,parking.maxZ-parking.minZ,localX((parking.minX+parking.maxX)/2),1.68,(parking.minZ+parking.maxZ)/2,'concrete','terminal-parking');
 const gc=[localX(center[0]),1.95,center[1]],corners=[[garden.minX,garden.minZ],[garden.maxX,garden.minZ],[garden.maxX,garden.maxZ],[garden.minX,garden.maxZ]];
 // Four diagonals and the entrance axis reproduce the visible star-like
 // paving without duplicating each individual paver.
 for(const [x,z]of corners)strip([gc,[localX(x),1.95,z]],3.8,'concrete','forecourt-diagonal-walk');
 strip([[localX(garden.minX),1.96,13.5],[localX(garden.maxX),1.96,13.5],[-29,1.96,13.5]],5.2,'concrete','terminal-entrance-axis');
 for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];strip([[localX(a[0]),1.96,a[1]],[localX(b[0]),1.96,b[1]]],3.5,'concrete','forecourt-border-walk');}
 const radius=layout.grounds.circularFeature.radius,ringSteps=32;
 for(let i=0;i<ringSteps;i++){
  const a=i/ringSteps*Math.PI*2,b=(i+1)/ringSteps*Math.PI*2,p=(r,t,y)=>[gc[0]+Math.cos(t)*r,y,gc[2]+Math.sin(t)*r];
  quad(p(radius,a,2.15),p(radius,b,2.15),p(radius-.8,b,2.15),p(radius-.8,a,2.15),'white','forecourt-circular-rim');
  let waterVertices=custom.get('water');if(!waterVertices){waterVertices=[];custom.set('water',waterVertices);}
  waterVertices.push(gc[0],2.06,gc[2],...p(radius-.85,a,2.06),...p(radius-.85,b,2.06));count('forecourt-circular-basin');
 }
 // Lawn islands and a few large planting beds remain separate from traffic.
 box(8,.2,96,localX(-375),1.9,0,'grass','forecourt-side-lawn');
 for(const x of [-429,-381])for(let z=-56;z<=56;z+=8){
  box(10,.04,.2,localX(x),1.95,z,'white','parking-bay-mark');
 }
 const road=layout.access.anchors.map(([x,y,z])=>[localX(x),y,z-apronZ]);
 strip(road,layout.access.width,'asphalt','terminal-road-connection');
 // One circulation aisle joins the entrance road and both parking rows.
 strip([[localX(-405),1.94,-66],[localX(-405),1.94,66]],8,'asphalt','terminal-parking-aisle');
 for(const z of [-66,66])strip([[localX(-431),1.94,z],[localX(-379),1.94,z]],7,'asphalt','terminal-parking-end-aisle');

 for(const [material,vertices]of custom){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,materials[material]);mesh.name='Крайний · '+material+' surfaces';mesh.userData.museumComponent='krayniy-terminal-'+material;mesh.receiveShadow=true;root.add(mesh);
 }
 for(const batch of batches.values()){
  const mesh=new THREE.InstancedMesh(batch.geometry,materials[batch.material],batch.matrices.length);
  batch.matrices.forEach((matrix,index)=>mesh.setMatrixAt(index,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();
  mesh.name='Крайний · '+batch.material+' structures';mesh.userData.museumComponent='krayniy-terminal-'+batch.material;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
 }
 root.updateWorldMatrix(true,true);let triangles=0,meshCount=0;const bounds=new THREE.Box3(),inverseParent=parent.matrixWorld.clone().invert();
 root.traverse(mesh=>{if(mesh.isMesh){meshCount++;triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*(mesh.isInstancedMesh?mesh.count:1);
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const box=(mesh.isInstancedMesh?mesh.boundingBox:mesh.geometry.boundingBox).clone();box.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseParent,mesh.matrixWorld));bounds.union(box);}});
 const metadata={version:KRAYNIY_TERMINAL_VERSION,...layout,source:KRAYNIY_TERMINAL_REFERENCE,
  composition:['two-storey silver body','two inclined glass entrance pavilions','blue canopy and facade bands','integrated control tower','inclined glazed control cab','balcony and aerials'],
  features,primitiveCount:Object.values(features).reduce((sum,count)=>sum+count,0),meshCount,triangles,
  signTexts:['БАЙКОНУР','АЭРОПОРТ'],externalTextures:0,drawCalls:meshCount,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),size:bounds.getSize(new THREE.Vector3()).toArray()}};
 root.userData.krayniyTerminal=metadata;
 parent.userData.airport.terminal=metadata;
 return {root,metadata};
}
