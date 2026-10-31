import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261031-rocket-exhibits-v1';
import {RAIL_PROFILE} from './gagarin-rail-approach.js?v=20261031-rocket-exhibits-v1';
import {buildSite31Trench} from './site31-trench.js?v=20261028-museum4-osm-live-v2';
import {SITE31_PIT,SITE31_REFERENCE,SITE31_YAW} from './site31-trench-profile.js?v=20261028-museum4-osm-live-v2';
export {SITE31_PIT} from './site31-trench-profile.js?v=20261028-museum4-osm-live-v2';

// Site 31 is its own exhibit, not Site 1's traced excavation transplanted to
// a different map point. Photographs establish the two opening service masts,
// four supporting arms, open bridge, lined excavation and lightning towers.
// The local plan and compass orientation now follow north-up WV03 imagery.
// Heights and the museum diagram's global anchor remain approximate.
export const SITE31_VERSION='site31-metric-soyuz-v4';
export const SITE31_SOURCES=Object.freeze([
 SITE31_REFERENCE.sourceUrl,
 SITE31_REFERENCE.metadataUrl,
 'https://www.russian.space/multimedia/foto/?PAGEN_1=2',
 'https://www.russian.space/upload/iblock/c07/11221_d.jpg',
 'https://sufps70.organizations.mchs.gov.ru/deyatelnost/press-centr/novosti/4233814'
]);
export const SITE31_PORTS=Object.freeze({road:[60,.1,133],rail:[0,.48,174]});
export const SITE31_MACHINERY_METRE=2/3;
export const SITE31_ROCKET_MOUNT=Object.freeze({position:[0,0,0],rotation:[0,Math.PI/4,0],axis:'y',baseY:0,vehicle:'soyuz',heightMetres:49.51161217689514});
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

export function buildSite31Pad(root){
 let k=archiveKit(root);const apertures=[];
 root.name='Пл. 31 · «Союз» · детализированная музейная реконструкция';
 k.mat.green.color.set(0x426851);k.mat.steel.color.set(0x69736b);
 // Components use the same textured concrete/paint/metal palette and static
 // instancing as the detailed Gagarin model. There are no stacked decal planes.
 function railings(points,y,h=1.2,parent=root,tag='service-safety-railing'){
  for(let n=1;n<points.length;n++){
   const a=points[n-1],b=points[n],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
   for(const level of [h*.52,h])k.rod([a[0],y+level,a[1]],[b[0],y+level,b[1]],.065,'light',tag,parent);
   const count=Math.max(1,Math.ceil(length/2.4));
   for(let j=0;j<=count;j++){const t=j/count,x=THREE.MathUtils.lerp(a[0],b[0],t),z=THREE.MathUtils.lerp(a[1],b[1],t);k.rod([x,y,z],[x,y+h,z],.075,'steel',tag,parent);}
  }
 }
 function ladder(a,b,width=1.2,parent=root,tag='service-ladder'){
  const p=V(...a),q=V(...b),delta=q.clone().sub(p),n=Math.max(2,Math.ceil(delta.length()/.42));
  for(const s of [-1,1])k.rod(p.clone().add(V(s*width/2,0,0)).toArray(),q.clone().add(V(s*width/2,0,0)).toArray(),.075,'light',tag,parent);
  for(let i=0;i<=n;i++){const c=p.clone().addScaledVector(delta,i/n);k.rod(c.clone().add(V(-width/2,0,0)).toArray(),c.clone().add(V(width/2,0,0)).toArray(),.055,'steel',tag,parent);}
 }
 function ring(radius,tube,y,material,tag,parent=root){
  const m=k.direct(new THREE.TorusGeometry(radius,tube,8,64),material,tag,parent);m.rotation.x=Math.PI/2;m.position.y=y;return m;
 }

 // One georeferenced outline drives both the actual concrete banks and the
 // terrain cutout. The floor continues under the table and rises to the mouth.
 const trench=buildSite31Trench(k),floorY=trench.floorY;
 // Service yards sit behind/beside the launch position, outside its wide bowl.
 const forecourtRight=z=>47+(z-44)*3/106;
 k.poly([[-47,44],[47,44],[50,150],[-50,150]],.06,'concrete','rail-forecourt');
 k.poly([[-177,1],[-130,3],[-105,38],[-98,79],[-58,81],[-52,115],[-87,126],[-124,100],[-156,52]],.06,'concrete','southwestern-service-yard');
 k.poly([[113,21],[174,18],[188,42],[172,68],[132,96],[106,121],[forecourtRight(122),122],[forecourtRight(59),59],[82,59]],.06,'concrete','northeastern-service-yard');

 // Open concrete bridge: separate cheeks and a rear crosswalk leave the
 // axial launch passage and the space beneath the launch ring unobstructed.
 for(const s of [-1,1]){
  k.box(14,2.2,65,s*28,-.9,4,'concrete','launch-bridge-side');
  k.box(11,24,11,s*27,-13,-20,'concrete','bridge-foundation-pier');
  k.box(11,20,10,s*27,-11,24,'concrete','bridge-foundation-pier');
  k.box(.45,2,65,s*35.3,.3,4,'rust','bridge-edge-girder');
  for(let z=-26;z<=32;z+=3.1)k.box(.16,5.8,.23,s*34.9,-4.0,z,'light','bridge-corrugated-underside');
  for(const y of [-14,-8]){
   k.box(8,.35,44,s*27,y,0,'steel','underbridge-gallery');
   railings([[s*23,-22],[s*23,22]],y,1.1);
   for(let z=-22;z<22;z+=2.4)k.rod([s*23,y,z],[s*31,y,z],.045,'steel','underbridge-grating');
  }
  railings([[s*35,-28],[s*35,37]],.25,1.3);
 }
 k.box(48,1.1,13,0,-.33,34,'concrete','bridge-rear-crosswalk');
 // The incoming track is supported up to the rear lip of the annular table.
 // Its deck stops before the exhaust opening rather than floating over it.
 k.box(10.4,1.1,28,0,-.33,23,'concrete','rail-approach-bridge-deck');
 for(const s of [-1,1]){
  k.rod([s*5.3,-1.0,9],[s*5.3,-1.0,37],.22,'steel','rail-approach-bridge-girder');
  for(let z=10;z<35;z+=5)k.rod([s*5.3,-2.3,z],[s*5.3,-.8,z+4.5],.13,'steel','rail-approach-bridge-brace');
 }
 // Gallery and staircase descend alongside the opening, never through it.
 function bankHeight(x,z){
  const i=trench.sections.findIndex(s=>s.z<=z);if(i<1)return 0;
  const a=trench.sections[i-1],b=trench.sections[i],t=(a.z-z)/(a.z-b.z);
  const at=key=>THREE.MathUtils.lerp(a[key],b[key],t),left=at('left'),right=at('right');
  if(x<left||x>right)return 0;
  const fl=at('floorLeft'),fr=at('floorRight'),y=at('floorY');
  if(x>=fl&&x<=fr)return y;
  const fraction=x<fl?(x-fl)/(left-fl):(x-fr)/(right-fr);
  const rise=fraction<.18?fraction*.72:.1296+(fraction-.18)*(.8704/.82);
  return y*(1-rise);
 }
 for(const s of [-1,1]){
  const start=s<0?V(-52,0,1):V(43,0,9),end=s<0?V(-20,0,-20):V(10,0,-20),count=58;
  const direction=end.clone().sub(start),yaw=Math.atan2(direction.x,direction.z),normal=V(direction.z,0,-direction.x).normalize();
  const steps=Array.from({length:count+1},(_,i)=>{const p=start.clone().lerp(end,i/count);p.y=bankHeight(p.x,p.z)+.19;return p;});
  for(const p of steps)k.box(2.2,.26,1.05,p.x,p.y,p.z,'concrete','excavation-stair-tread',yaw);
  for(const xoff of [-1.2,1.2]){
   for(let i=1;i<steps.length;i++){
    const a=steps[i-1].clone().addScaledVector(normal,xoff),b=steps[i].clone().addScaledVector(normal,xoff);
    k.rod(a.clone().add(V(0,1.2,0)).toArray(),b.clone().add(V(0,1.2,0)).toArray(),.075,'light','excavation-stair-handrail');
    k.rod(a.clone().add(V(0,-.13,0)).toArray(),b.clone().add(V(0,-.13,0)).toArray(),.09,'steel','excavation-stair-stringer');
   }
   for(let i=0;i<=count;i+=4){const p=steps[i].clone().addScaledVector(normal,xoff);k.rod(p.toArray(),p.clone().add(V(0,1.2,0)).toArray(),.065,'steel','excavation-stair-post');}
  }
 }

 // Bearing cheeks connect the metrically calibrated machinery to the wide
 // existing geographic bridge plan. The annulus carries the four support-arm pivots and
 // the service-mast feet, while a 13.2m central void stays open for exhaust.
 for(const side of [-1,1])k.box(12,2.2,40,side*16,-.9,4,'concrete','metric-launch-bearing-cheek');
 const bearingShape=new THREE.Shape();bearingShape.absarc(0,0,15.5,0,2*Math.PI,false);
 const bearingHole=new THREE.Path();bearingHole.absarc(0,0,6.6,0,2*Math.PI,true);bearingShape.holes.push(bearingHole);
 const bearing=k.direct(new THREE.ExtrudeGeometry(bearingShape,{depth:2.2,bevelEnabled:false,curveSegments:48}),'concrete','metric-launch-bearing-annulus');
 bearing.rotation.x=-Math.PI/2;bearing.position.y=-2;
 for(let i=0;i<4;i++){
  const a=Math.PI/4+i*Math.PI/2;
  k.box(.9,1.9,.9,6.7*Math.cos(a),1.15,6.7*Math.sin(a),'steel','metric-table-stanchion');
  k.box(2,1.2,2,14*Math.cos(a),.6,14*Math.sin(a),'green','metric-support-pivot-bearing');
 }
 // The satellite-derived plan and excavation already use metres. Only the
 // former oversized steel machinery is converted uniformly, including its
 // pivots, widths, heights and access platforms. The rocket is not scaled.
 const metricRoot=root,layoutKit=k,machineryRoot=new THREE.Group();
 machineryRoot.name='Пл.31 · стартовые агрегаты в метрах';machineryRoot.scale.setScalar(SITE31_MACHINERY_METRE);
 root.add(machineryRoot);root=machineryRoot;k=archiveKit(root);
 for(const [name,mat]of Object.entries(k.mat)){mat.dispose();k.mat[name]=layoutKit.mat[name];}
 // Annular steel table with a genuine hole, plus four independent R-7
 // supporting arms. Nothing spans the exhaust axis at or below the ring.
 ring(8.8,.62,3.8,'green','open-soyuz-launch-ring');
 const deckShape=new THREE.Shape();deckShape.absarc(0,0,10.5,0,Math.PI*2,false);
 const passage=new THREE.Path();passage.absarc(0,0,6.8,0,Math.PI*2,true);deckShape.holes.push(passage);
 const collar=k.direct(new THREE.ExtrudeGeometry(deckShape,{depth:.35,bevelEnabled:false,curveSegments:64}),'steel','launch-table-annular-deck');
 collar.rotation.x=-Math.PI/2;collar.position.y=3.18;
 apertures.push({kind:'launch-table',center:[0,0],radius:6.8*SITE31_MACHINERY_METRE,y:3.18*SITE31_MACHINERY_METRE});
 for(let n=0;n<4;n++){
  const angle=Math.PI/4+n*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),t=V(-s,0,c);
  const foot=V(c*21,1.5,s*21),head=V(c*4.8,19,s*4.8);
  for(const offset of [-1.5,1.5]){
   const a=foot.clone().addScaledVector(t,offset),b=head.clone().addScaledVector(t,offset*.55);
   k.rod(a.toArray(),b.toArray(),.48,'green','tulip-support-main');
   for(let i=0;i<8;i++){const u=i/8,v=(i+1)/8,p=foot.clone().lerp(head,u).addScaledVector(t,offset*(1-.45*u)),q=foot.clone().lerp(head,v).addScaledVector(t,-offset*(1-.45*v));k.rod(p.toArray(),q.toArray(),.13,'green','tulip-cross-brace');}
  }
  k.box(1.2,.85,1.2,c*4.8,19,s*4.8,'green','support-arm-gripper',-angle);
  k.rod([c*25,1,s*25],[c*18,12,s*18],.32,'steel','support-arm-actuator');
  const drum=k.direct(new THREE.CylinderGeometry(1.7,1.7,3.4,20),'yellow','tulip-counterweight');
  drum.position.set(c*24,3.4,s*24);drum.quaternion.setFromUnitVectors(V(0,1,0),t);
 }

 // Two opening service masts are the characteristic Site 31 silhouette.
 // Their separate hinged lattice booms and U-shaped decks retain air gaps.
 const mastAngles=[],serviceDecks=[];
 for(const side of [-1,1]){
  const pivot=new THREE.Group();pivot.position.set(side*20,1.2,5);pivot.rotation.z=-side*.34;pivot.name='Пл.31 · раскрытая мачта обслуживания';root.add(pivot);mastAngles.push(pivot.rotation.z);
  const height=side<0?61:52,levels=18,width=4.7,depth=5.5;
  for(let level=0;level<levels;level++){
   const y0=level/levels*height,y1=(level+1)/levels*height,r0=1-.34*level/levels,r1=1-.34*(level+1)/levels;
   for(const sx of [-1,1])for(const sz of [-1,1])k.rod([sx*width*r0/2,y0,sz*depth*r0/2],[sx*width*r1/2,y1,sz*depth*r1/2],.17,'green','service-mast-main-leg',pivot);
   for(const face of [-1,1]){
    k.rod([-width*r0/2,y0,face*depth*r0/2],[width*r1/2,y1,face*depth*r1/2],.105,'green','service-mast-cross-lattice',pivot);
    k.rod([width*r0/2,y0,face*depth*r0/2],[-width*r1/2,y1,face*depth*r1/2],.105,'green','service-mast-cross-lattice',pivot);
    k.rod([face*width*r0/2,y0,-depth*r0/2],[face*width*r1/2,y1,depth*r1/2],.105,'steel','service-mast-side-lattice',pivot);
    k.rod([-width*r0/2,y0,face*depth*r0/2],[width*r0/2,y0,face*depth*r0/2],.12,'green','service-mast-level-belt',pivot);
   }
  }
  for(let level=0;level<8;level++){
   const y=14+level*(height-16)/7,reach=level<3?12:10.5,x=-side*(reach/2),d=level<3?6.5:5.2;
   // The open U faces the rocket; three thin strips form the walking deck.
   k.box(reach,.26,1.0,x,y,-d/2,'green','open-service-balcony',0,pivot);
   k.box(reach,.26,1.0,x,y,d/2,'green','open-service-balcony',0,pivot);
   k.box(1.2,.26,d,0,y,0,'green','open-service-balcony',0,pivot);
   railings([[0,-d/2],[-side*reach,-d/2]],y,1.05,pivot,'service-balcony-railing');
   railings([[0,d/2],[-side*reach,d/2]],y,1.05,pivot,'service-balcony-railing');
   for(const z of [-d/2,d/2])k.rod([0,y-2.3,z],[-side*reach*.8,y,z],.10,'steel','balcony-diagonal-bracket',pivot);
   serviceDecks.push({mast:side,y,openFront:true,reach});
  }
  ladder([side*1.8,1,3.1],[side*1.3,height-1,2.2],.9,pivot,'mast-access-ladder');
  // Cable pipes follow the boom; hinges and hydraulic struts remain at grade.
  for(const z of [-2.3,2.3])k.rod([side*2.4,2,z],[side*1.7,height,z*.7],.12,'light','mast-utility-pipe',pivot);
  k.box(4.2,4.1,4.6,0,height-1.5,0,'green','mast-equipment-cabin',0,pivot);
  k.box(3.1,1.1,.12,0,height-1.0,2.36,'glass','mast-cabin-window',0,pivot);
  const hinge=k.direct(new THREE.CylinderGeometry(2.0,2.0,7,20),'yellow','service-mast-base-hinge');hinge.position.set(side*20,2.0,5);hinge.rotation.x=Math.PI/2;
  k.rod([side*29,.5,7],[side*24,13,6],.45,'steel','mast-hydraulic-cylinder');
  k.rod([side*24,13,6],[side*25.2,17.2,6],.24,'light','mast-hydraulic-rod');
 }
 // Rail erector: a low open truss along the retained incoming rail axis.
 for(const side of [-1,1]){
  k.rod([side*2.8,1.4,14],[side*2.8,1.4,72],.30,'green','rail-erector-longeron');
  k.rod([side*2.8,4.0,14],[side*2.8,4.0,72],.23,'green','rail-erector-longeron');
  for(let z=14;z<72;z+=4){k.rod([side*2.8,1.4,z],[side*2.8,4,z+4],.12,'green','rail-erector-brace');k.rod([side*2.8,4,z],[side*2.8,1.4,z+4],.12,'green','rail-erector-brace');}
 }

 const machineryResult=k.finish();root=metricRoot;k=layoutKit;
 // Full-metre holder; the optimized source model is inserted by the shared
 // loader. The old schematic cylinders must not double the new rocket.
 const rocket=new THREE.Group();rocket.name='Союз · ракета-экспонат';
 rocket.position.fromArray(SITE31_ROCKET_MOUNT.position);rocket.rotation.set(...SITE31_ROCKET_MOUNT.rotation);rocket.visible=true;root.add(rocket);

 // Red/white lightning masts and lower floodlight frames from the photos.
 for(const [x,z,h] of [[-70,-48,88],[70,-48,88]]){
  const levels=20,w=5.3;
  for(let j=0;j<levels;j++){
   const y0=j/levels*h,y1=(j+1)/levels*h,r0=1-.88*j/levels,r1=1-.88*(j+1)/levels,mat=Math.floor(j/4)%2?'light':'red';
   for(const sx of [-1,1])for(const sz of [-1,1])k.rod([x+sx*w*r0,y0,z+sz*w*r0],[x+sx*w*r1,y1,z+sz*w*r1],.12,mat,'soyuz-lightning-mast');
   for(const s of [-1,1]){
    k.rod([x-w*r0,y0,z+s*w*r0],[x+w*r1,y1,z+s*w*r1],.075,mat,'lightning-mast-cross-brace');
    k.rod([x+w*r0,y0,z+s*w*r0],[x-w*r1,y1,z+s*w*r1],.075,mat,'lightning-mast-cross-brace');
    k.rod([x+s*w*r0,y0,z-w*r0],[x+s*w*r1,y1,z+w*r1],.075,mat,'lightning-mast-cross-brace');
   }
  }
  k.rod([x,h,z],[x,h+6,z],.075,'dark','lightning-rod-tip');
 }
 for(const [x,z] of [[-56,69],[52,54]]){
  k.lattice(x,z,35,3.4,3.4,{levels:12,material:'steel',tag:'floodlight-tower'});
  k.box(7,.4,1,x,35.4,z,'steel','floodlight-head');
  for(let row=0;row<2;row++)for(let j=0;j<5;j++)k.box(.9,.72,.38,x-2.8+j*1.4,35.9+row*.9,z+.4,'white','floodlight-panel');
 }
 k.hall({x:61,z:91,w:22,d:40,h:7,roof:'blue',gates:1,tag:'soyuz-service-house'});
 k.hall({x:-64,z:100,w:15,d:24,h:5.5,roof:'roof',gates:1,tag:'soyuz-utility-house'});
 for(const s of [-1,1])for(let j=0;j<3;j++){
  const x=s*(39+j*.65);
  k.rod([x,.7,80],[x,.7,36],.13,'light','utility-pipe-gallery');
  k.rod([x,.7,36],[s*34,1.4,18+j*.7],.13,'light','utility-pipe-gallery');
 }

 // The real network ports are unchanged: road [60,.1,133], track [0,.48,174].
 // The two service courts connect behind the pad, as in the image. There is
 // no U-road across the exhaust outlet. The south edge of the straight rear
 // section is the existing port at [60,133], forming one clean T-junction.
 const accessControlPoints=[[-158,14],[-143,24],[-131,42],[-122,65],[-118,89],[-109,109],[-93,123],[-72,130],[-40,130],[-8,130],[24,130],[48,130],[72,130],[79,130],[88,126],[97,116],[109,100],[116,80],[128,61],[149,49],[171,44]];
 const roadCurve=new THREE.CatmullRomCurve3(accessControlPoints.map(([x,z])=>V(x,0,z)),false,'centripetal');
 const roadPoints=roadCurve.getSpacedPoints(240).map(p=>[p.x,p.z]);
 k.path(roadPoints,6,.10,'asphalt','continuous-site31-access-road');
 k.rail([[0,174],[0,42],[0,9]],{gauge:1.52,y:.30,tag:'site31-incoming-rail'});
 // Keep the centreline over the deck clear. The high erector sides do not
 // substitute for the two running rails and regularly spaced sleepers.
 const layoutResult=k.finish(),combinedFeatures={...layoutResult.features};
 for(const [tag,count]of Object.entries(machineryResult.features))combinedFeatures[tag]=(combinedFeatures[tag]||0)+count;
 const result={...layoutResult,features:combinedFeatures,primitiveCount:layoutResult.primitiveCount+machineryResult.primitiveCount,
  meshCount:layoutResult.meshCount+machineryResult.meshCount,batches:layoutResult.batches+machineryResult.batches,
  boundsSize:new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray()};
 const metadata={version:SITE31_VERSION,siteId:'pad-31',name:'Стартовая позиция 31/6 · семейство «Союз»',
  status:'Контур газоотвода и разворот сверены по спутниковому снимку WorldView-3 от 09.08.2025. Высоты и скрытые под мостом участки реконструированы приблизительно.',
  referenceBasis:'Esri World Imagery / Vantor Vivid: плановая обводка; фотографии КЦ «Южный» / ЦЭНКИ: конструкции. Не инженерный обмер.',
  sources:[...SITE31_SOURCES],orientationVerified:true,orientationScope:'local-plan-from-satellite',
  units:'metres',machineryMetresPerUnit:SITE31_MACHINERY_METRE,
  heightsVerified:false,globalMapAnchorSurveyed:false,yaw:SITE31_YAW,satellite:SITE31_REFERENCE,
  groundDatum:0,pitFloorY:floorY,pit:SITE31_PIT,trench,
  launchPassage:{radius:6.8*SITE31_MACHINERY_METRE,openBelowDeck:true},serviceMasts:2,serviceDecks:serviceDecks.length,mastAngles,
  serviceMastLengths:[61,52].map(h=>h*SITE31_MACHINERY_METRE),rocketMount:SITE31_ROCKET_MOUNT,
  supportingArms:4,rocketExhibit:true,rocketState:'illustrative-prelaunch',
  roadPort:[...SITE31_PORTS.road],railPort:[...SITE31_PORTS.rail],roadLayout:'two-service-yards-connected-behind-launch-pad',
  railGauge:1.52,networkGaugeWorld:RAIL_PROFILE.gauge,railTransition:'external-feeder',featureCounts:result.features,primitiveCount:result.primitiveCount,drawCalls:result.meshCount};
 root.userData.site31Model=metadata;root.userData.orientationNote=metadata.status;
 root.userData.site31Apertures=apertures;
 return {...result,site31:metadata,rocket,rocketMount:SITE31_ROCKET_MOUNT};
}
