import * as THREE from 'three';

// Exterior and surviving structure interpreted from the owner's six MIK-112
// photographs received 2026-11-10. Positions of fractures are visual, not a
// survey or an assertion about the engineering sequence of the 2002 collapse.
export const MIK112_PHOTO_VERSION='20261110-photo-v1';
const random=(i,seed=0)=>{const a=Math.sin(i*127.1+seed*311.7)*43758.5453;return a-Math.floor(a);};
const V=(...v)=>new THREE.Vector3(...v);

function brokenSlabGeometry(shape){
 const vertices=[],indices=[],points=shape.map(p=>new THREE.Vector2(...p));
 for(const y of [-.5,.5])for(const [x,z]of shape)vertices.push(x,y,z);
 const n=shape.length;
 for(const [a,b,c]of THREE.ShapeUtils.triangulateShape(points,[]))indices.push(a,b,c,a+n,c+n,b+n);
 for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,i+n,j,j,i+n,j+n);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);
 const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();return flat;
}

export function buildMik112PhotoDetails({root,intact,ruins,floor,box,beam,rod,instance,boxGeo,count}){
 const facade=new THREE.Group(),modern=new THREE.Group(),historicGlazing=new THREE.Group();
 facade.name='МИК112 · фасад и пожарные лестницы';facade.userData.museumComponent='mik112-photo-facade';
 modern.name='МИК112 · три открытых пролёта по фото';modern.userData.museumComponent='mik112-photo-ruins';
 historicGlazing.name='МИК112 · целое верхнее остекление';historicGlazing.userData.museumComponent='mik112-historical-glazing';
 root.add(facade);ruins.add(modern);intact.add(historicGlazing);
 const q=new THREE.Quaternion(),euler=new THREE.Euler();
 const tilted=(geo,size,position,rotation,material,tag,parent=modern)=>{
  q.setFromEuler(euler.set(...rotation));instance(geo,material,V(...position),q,V(...size),tag,parent);
 };
 const shards=[
  brokenSlabGeometry([[-.5,-.42],[-.16,-.5],[.48,-.35],[.5,.25],[.21,.5],[-.5,.32]]),
  brokenSlabGeometry([[-.5,-.5],[.18,-.5],[.5,-.12],[.4,.5],[-.24,.41],[-.5,.05]]),
  brokenSlabGeometry([[-.49,-.25],[-.2,-.5],[.5,-.35],[.21,.5],[-.5,.36]])
 ];

 // Continuous green-grey lower glazing is recessed in a genuine void in the
 // western facade. Concrete piers and metal mullions have separate depth.
 for(let bay=0;bay<20;bay++){
  const z=-114+bay*12;
  box(.32,10.9,11.35,-94.1,floor+8.3,z,'glass','lower-glazing-pane',facade);
  for(let row=0;row<4;row++)box(.54,.15,11.5,-94.2,floor+2.8+row*3.65,z,'steel','facade-window-mullion',facade);
  for(let col=0;col<=4;col++)box(.54,11,.15,-94.2,floor+8.3,z-5.7+col*2.85,'steel','facade-window-mullion',facade);
  box(1.8,11.4,.55,-94.1,floor+8.3,z-6,'wall','glazed-band-concrete-pier',facade);
  box(.62,.25,11.45,-94.3,floor+2.72,z,'concrete','glazing-sill',facade);
 }
 box(1.8,11.4,.55,-94.1,floor+8.3,120,'wall','glazed-band-concrete-pier',facade);

 // Upper side screen: complete before 2002, variable surviving sections in
 // the modern ruins. Do not draw unbroken glass across a demolished edge.
 const upperHeights=[7.7,7.7,6.9,2.7,.5,1.2,2.0,.6,.2,1.5,1.0,.4,2.6,2.1,1.5,3.5,5.2,7.7,7.7,7.7];
 for(let bay=0;bay<20;bay++){
  const z=-114+bay*12,h=upperHeights[bay];
  box(.32,7.7,11.4,-94.1,floor+51.85,z,'glass','historical-upper-glazing',historicGlazing);
  for(const y of [48,51.85,55.7])box(.5,.16,11.5,-94.2,floor+y,z,'steel','historical-window-frame',historicGlazing);
  for(const zz of [z-5.7,z,z+5.7])box(.5,7.9,.15,-94.2,floor+51.85,zz,'steel','historical-window-frame',historicGlazing);
  if(h>4){
   box(.32,h,11.35,-94.1,floor+48+h/2,z,'glass','upper-glazing-remnant',modern);
   for(const zz of [z-5.7,z,z+5.7])box(.5,h,.16,-94.2,floor+48+h/2,zz,'steel','broken-window-mullion',modern);
   for(let yy=48;yy<48+h;yy+=3.6)box(.5,.16,11.45,-94.2,floor+yy,z,'steel','broken-window-transom',modern);
  }else if(h>.7){
   box(1.05,h,4+random(bay,4)*5,-94.1,floor+48+h/2,z+random(bay,5)*2,'wall','torn-upper-wall',modern);
   beam([-94.1,floor+48,z-5],[-93.8,floor+48+h+1.4,z-2],.16,.18,'rust','broken-window-mullion',modern);
  }
  // A chipped cap and a few exposed bars make the silhouette irregular.
  tilted(shards[bay%3],[1.65,.5+random(bay,6)*.5,6+random(bay,7)*4],[-94.05,floor+48+h+.1,z],[.08*(random(bay,8)-.5),.05,.11*(random(bay,9)-.5)],'concrete','torn-roof-panel');
  for(let k=0;k<2;k++)rod([-94.05,floor+48+h-.3,z+k*2],[-93.7+random(bay+k,10)*.6,floor+49+h+random(bay+k,11),z+k*2+.7],.07,'rust','exposed-rebar',modern);
 }

 // Two full-height *wall assemblies* separate the three high bays. Their
 // piers connect spandrels and crane runways; they are never detached poles.
 // The lower portals and upper window bands remain open between those walls.
 for(const [wallIndex,x]of [-55,-15].entries()){
  for(const [bottom,top]of [[1,8],[14,20],[26,32],[38,47.5]])box(1.35,top-bottom,236,x,floor+(bottom+top)/2,0,'wall','interior-partition-wall',modern);
  for(let row=0;row<20;row++){
   const z=-114+row*12;
   box(1.7,46.5,1.3,x,floor+24.25,z,'steel','partition-attached-pier',modern);
   for(const y of [23,35]){
    if((row+wallIndex*3)%7!==2)box(1.42,5.5,10.5,x,floor+y,z+5.85,'glass','interior-glazing-remnant',modern);
    for(const zz of [z+1.0,z+6,z+11])box(1.65,6,.14,x,floor+y,zz,'steel','interior-window-mullion',modern);
    box(1.64,.18,10.6,x,floor+y-3,z+5.85,'steel','interior-window-mullion',modern);
   }
   // Roof edge over the partition is ragged, with no line of free columns.
   const remnantHeight=2+random(row,12+wallIndex)*3.2;
   box(1.45,remnantHeight,5+random(row,20+wallIndex)*4.5,x,floor+47.5+remnantHeight/2,z+3,'wall','partition-upper-remnant',modern);
   for(const side of [-1,1])beam([x+side*.9,floor+11,z],[x+side*.9,floor+16,z+4.4],.19,.24,'steel','partition-bracing',modern);
  }
 }

 // Rust-red longitudinal crane runways on both sides of all three bays.
 // The girders include their web, two flanges, rails, brackets and stiffeners.
 const runways=[[-92.1,1],[-57.0,-1],[-53.0,1],[-17.0,-1],[-13.0,1],[21.8,-1]];
 for(const [x,towards]of runways){
  box(.48,2.35,232,x,floor+44.6,0,'rust','crane-runway-web',modern);
  for(const y of [43.38,45.82])box(1.65,.22,233,x,floor+y,0,'rust','crane-runway-flange',modern);
  box(.25,.30,232,x,floor+46.08,0,'steel','crane-running-rail',modern);
  for(let z=-111;z<=111;z+=12){
   box(1.62,2.3,.16,x,floor+44.6,z,'rust','crane-girder-stiffener',modern);
   beam([x-towards*1.6,floor+40.5,z],[x,floor+43.4,z],.4,.5,'steel','crane-wall-bracket',modern);
  }
 }

 // The aerial photographs show four sparse transverse surviving strips, not
 // a complete regular roof grid. Bent trusses span only those narrow strips.
 const crossLines=[-108,-38,48,111];
 for(let bay=0;bay<3;bay++)for(let row=0;row<crossLines.length;row++){
  const i=bay*4+row,cx=-75+bay*40,z=crossLines[row]+(bay===1?2:0),sag=1.5+random(i,30)*2;
  const left=[cx-19,floor+52.7,z],mid=[cx+1,floor+52.7-sag,z+1.7],right=[cx+19,floor+52.2,z-1];
  beam(left,mid,.53,.58,'rust','surviving-roof-truss',modern);beam(mid,right,.53,.58,'rust','surviving-roof-truss',modern);
  for(let segment=0;segment<8;segment++){
   const t=segment/8,next=(segment+1)/8,x=cx-19+t*38,xn=cx-19+next*38;
   const y=floor+55.25-Math.sin(t*Math.PI)*sag,yn=floor+55.25-Math.sin(next*Math.PI)*sag;
   if(!((i+segment)%11===0))beam([x,y,z],[xn,yn,z+.4],.38,.42,'steel','surviving-roof-truss',modern);
   beam([x,y,z],[xn,yn-2.6,z+.4],.23,.28,'rust','roof-truss-diagonal',modern);
  }
  for(let piece=0;piece<4;piece++){
   const x=cx-16+piece*10.5;
   tilted(shards[(i+piece)%3],[7+random(i+piece,31)*4,.55,3.4+random(i+piece,32)*2.3],[x,floor+54.4-sag*.4,z+1],[.12*(random(i,33)-.5),.10*(random(i+piece,34)-.5),.11*(random(i+piece,35)-.5)],'concrete','torn-roof-panel');
  }
  // Torn short hangers stop inside the building and are tied to the truss.
  for(let k=0;k<2;k++)beam([cx-10+k*19,floor+52,z],[cx-9+k*18,floor+45+random(i+k,36)*3,z+3],.22,.28,'rust','hanging-frame-remnant',modern);
 }

 // Ground debris uses three shared chipped slab meshes, distributed mostly
 // along the collapsed walls. The open floor is not a uniform field of cubes.
 let slabCount=0;
 for(let bay=0;bay<3;bay++)for(let k=0;k<74;k++){
  const i=bay*74+k,cx=-75+bay*40,side=k%2?1:-1;
  const x=cx+side*(k%5===0?random(i,40)*8:8+random(i,41)*9),z=-111+random(i,42)*222;
  const length=2.0+random(i,43)*8.5,width=1.2+random(i,44)*4.8,rx=(random(i,45)-.5)*.35,rz=(random(i,46)-.5)*.30;
  tilted(shards[i%3],[length,.35+random(i,47)*.6,width],[x,floor+1.6+random(i,48)*1.8,z],[rx,random(i,49)*Math.PI,rz],i%9===0?'roof':'concrete','roof-debris');slabCount++;
 }
 for(let bay=0;bay<3;bay++)for(let k=0;k<6;k++){
  const i=bay*6+k,cx=-75+bay*40,z=-95+k*35+random(i,50)*9,sign=k%2?1:-1;
  const ax=cx-15,bx=cx+12,az=z-4,bz=z+4,ay=floor+2.2,by=floor+5+random(i,51)*4;
  beam([ax,ay,az],[bx,by,bz],.42,.48,'rust','fallen-roof-frame',modern);
  beam([ax,ay+2.5,az+sign],[bx-4,by+2,bz-sign],.34,.4,'steel','broken-roof-truss',modern);
  for(let s=0;s<7;s++){
   const t=s/7,n=(s+1)/7,x=ax+(bx-ax)*t,xn=ax+(bx-ax)*n,y=ay+(by-ay)*t,yn=ay+(by-ay)*n,zz=az+(bz-az)*t,zn=az+(bz-az)*n;
   beam([x,y+(s%2?2.4:0),zz],[xn,yn+(s%2?0:2.4),zn],.17,.22,'rust','fallen-truss-web',modern);
  }
 }

 // Two visible switchback escape stairs, with proper horizontal treads,
 // landings, stringers and guardrails anchored to the western facade.
 const stairs=[];
 for(const zCenter of [-104,98]){
  const stair=new THREE.Group();stair.name='МИК112 · пожарная лестница '+(stairs.length+1);stair.userData.museumComponent='mik112-fire-stair';facade.add(stair);stairs.push(stair);
  const innerX=-96.1,outerX=-98.5,rise=6.4,startY=floor+1.6,run=6.6;
  for(let flight=0;flight<8;flight++){
   const direction=flight%2?1:-1,y=startY+flight*rise,z1=zCenter-direction*run/2,z2=zCenter+direction*run/2;
   for(const x of [innerX,outerX])beam([x,y,z1],[x,y+rise,z2],.22,.28,'steel','fire-stair-flight',stair);
   for(let step=0;step<20;step++){
    const t=(step+.5)/20;box(2.5,.12,run/20+.03,(innerX+outerX)/2,y+rise*t,z1+(z2-z1)*t,'steel','fire-stair-step',stair);
   }
   box(3.1,.23,2,(innerX+outerX)/2,y,z1,'steel','fire-stair-landing',stair);
   for(const x of [innerX,outerX]){
    rod([x,y+1.05,z1],[x,y+rise+1.05,z2],.055,'steel','fire-stair-guardrail',stair);
    for(let p=0;p<=6;p++){const t=p/6,zz=z1+(z2-z1)*t,yy=y+rise*t;rod([x,yy,zz],[x,yy+1.1,zz],.05,'steel','fire-stair-guardrail',stair);}
   }
   beam([-94.7,y-.1,z1],[outerX,y-.1,z1],.24,.28,'steel','fire-stair-wall-bracket',stair);
  }
  box(3.1,.23,2,(innerX+outerX)/2,startY+8*rise,zCenter+run/2,'steel','fire-stair-landing',stair);
  stair.userData.height=8*rise;stair.userData.flights=8;stair.userData.steps=160;
 }

 // Small roof vents preserve the retained block's broad, flat silhouette.
 for(let i=0;i<18;i++){
  const x=52+(i%3)*15,z=-96+Math.floor(i/3)*37;
  box(1.0,.8,1.0,x,floor+30.5,z,'steel','retained-roof-vent',facade);
  box(1.5,.18,1.5,x,floor+31.0,z,'whiteRoof','roof-vent-cap',facade);
 }
 return {version:MIK112_PHOTO_VERSION,photoCount:6,highBays:3,connectedPartitionWalls:2,craneRunways:runways.length,
  transverseRemnantRows:crossLines,sharedDebrisGeometries:shards.length,debrisSlabs:slabCount,fireStairs:stairs.length,
  facadeWindowBand:[floor+2.8,floor+13.8],newTextureDownloads:0,newLightSources:0,
  interpretation:'Photo-based facade and surviving ruin structure; fracture positions are illustrative. Original site placement, measured envelope, two gates and four rail approaches remain unchanged.'};
}
