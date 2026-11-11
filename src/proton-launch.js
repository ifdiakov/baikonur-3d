import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';
import {createProtonRocket} from './proton-rocket.js?v=20261101-source-exhibits-v2';
import {registerFacilityBeacon,registerFacilityFloodlights} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';

export const PROTON_LAUNCH_VERSION='proton-launch-source-v2';
// Photo reconstruction, metres, Y up. +Z points from launch aperture to parked
// service tower. Two lateral outlets, not six radial trenches. The 8 m depth
// follows the Barmin engineering history, p.63; all other civil dimensions are
// photo estimates. See docs/proton-launch-reference.md for evidence and limits.
export const PROTON_LAUNCH_DIMENSIONS=Object.freeze({depth:8,apertureRadius:6.8,supports:6,outlets:2,towerHeight:60,towerTrackGauge:18,railGauge:1.52});
let sharedRocket;
const handles=new WeakMap();
export const protonPositionController=root=>handles.get(root);
const radial=(r,a,y)=>[Math.cos(a)*r,y,Math.sin(a)*r];
function softenPaint(material){
 const compile=material.onBeforeCompile;
 material.onBeforeCompile=function(shader,renderer){compile.call(this,shader,renderer);if(shader.uniforms.museumWear){shader.uniforms.museumWear.value=.14;shader.uniforms.museumRelief.value=.008;}};
}

function ringDeck(k,{outer=8,inner=2.8,y=0,z=0,height=.45,material='steel',tag='annular-platform',sides=8}={}){
 const shape=new THREE.Shape(),hole=new THREE.Path();
 for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,x=Math.cos(a)*outer,v=Math.sin(a)*outer;i?shape.lineTo(x,v):shape.moveTo(x,v);}shape.closePath();
 hole.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(hole);
 const g=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:32});g.rotateX(-Math.PI/2);g.translate(0,y,z);k.direct(g,material,tag);
}
function guard(k,a,b,{material='yellow',height=1.1,tag='guardrail'}={}){
 for(const y of [height*.48,height])k.rod([a[0],a[1]+y,a[2]],[b[0],b[1]+y,b[2]],.035,material,tag);
 const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/2.8));
 for(let i=0;i<=n;i++){const p=a.map((v,j)=>v+(b[j]-v)*i/n);k.rod(p,[p[0],p[1]+height,p[2]],.045,material,'guardrail-post');}
}
function plate(k,points,material,tag){return k.quad(...points,material,tag);}

function launchInterface(k){
 // Continuous reinforced-concrete deck with an actual open launch aperture.
 const shape=new THREE.Shape();shape.moveTo(-26,-39);shape.lineTo(26,-39);shape.lineTo(26,42);shape.lineTo(-26,42);shape.closePath();
 const hole=new THREE.Path();hole.absarc(0,0,6.8,0,Math.PI*2,true);shape.holes.push(hole);
 const deck=new THREE.ExtrudeGeometry(shape,{depth:.65,bevelEnabled:false,curveSegments:48});deck.rotateX(-Math.PI/2);deck.translate(0,-.45,0);k.direct(deck,'concrete','perforated-launch-deck');
 for(const x of [-25,25]){k.box(2,.12,80,x,.28,1.5,'red','perimeter-walkway');guard(k,[x,.35,-38],[x,.35,41]);}
 for(let x=-24;x<=24;x+=6)for(const [za,zb] of [[-38,-14],[14,40]])k.rod([x,.215,za],[x,.215,zb],.018,'steel','concrete-expansion-joint');
 for(let z=-36;z<=40;z+=6)for(const [xa,xb]of [[-24,-14],[14,24]])k.rod([xa,.215,z],[xb,.215,z],.018,'steel','concrete-expansion-joint');
 const collar=k.direct(new THREE.CylinderGeometry(6.8,6.3,3.5,48,1,true),'green','open-armoured-collar');collar.position.y=-1.55;
 // Six separate armoured housings, recessed pivots and hydraulic hold-downs.
 for(let i=0;i<6;i++){
  const a=i*Math.PI/3,p=new THREE.Group();p.rotation.y=Math.PI/2-a;k.root.add(p);
  const q=(r,y,side)=>radial(r,a+side,y);
  plate(k,[q(7.3,2.05,-.32),q(12.8,.23,-.29),q(12.8,.23,.29),q(7.3,2.05,.32)],'green','sloping-armour-casing');
  for(const s of [-1,1])plate(k,[q(7.3,2.05,s*.32),q(12.8,.23,s*.29),q(12.8,.21,s*.42),q(6.5,-2.8,s*.36)],'green','armour-side-cheek');
  plate(k,[q(7.3,2.05,-.32),q(7.3,2.05,.32),q(6.3,-2.8,.36),q(6.3,-2.8,-.36)],'green','recessed-support-shield');
  for(let j=0;j<7;j++){const r=7.7+j*.67,y=2.05-(r-7.3)/5.5*1.82+.05;k.rod(q(r,y,-.24),q(r,y,.24),.055,'steel','armour-stiffener');}
  k.box(2.7,.5,2.1,0,-2.6,5.7,'steel','hold-down-base',0,p);
  k.rod([-1.05,-2.3,6.2],[-.9,.8,4.2],.18,'dark','hydraulic-cylinder',p);k.rod([1.05,-2.3,6.2],[.9,.8,4.2],.18,'dark','hydraulic-cylinder',p);
  k.rod([0,-2.6,6],[0,.3,3.7],.42,'green','retractable-support-arm',p);
  k.box(1.25,.35,1.35,0,.62,3.8,'steel','rocket-support-seat',0,p);
  k.rod([-.7,-1.6,5.2],[.7,-1.6,5.2],.35,'steel','support-hinge',p);
  // Open gas cup around each engine footprint; no solid plate below a nozzle.
  const cup=new THREE.CylinderGeometry(1.45,1.15,1.4,6,1,true);cup.translate(Math.cos(a)*3.55,-4.25,Math.sin(a)*3.55);k.direct(cup,'green','six-open-gas-cups');
 }
 // Hexagonal central splitter, solid tip, sloping faces reaching the collector.
 const deflector=new THREE.CylinderGeometry(.18,3.3,4.1,6,1,false);deflector.rotateY(Math.PI/6);deflector.translate(0,-5.95,0);k.direct(deflector,'green','hexagonal-gas-deflector');
 const floor=k.direct(new THREE.BoxGeometry(52,.35,32),'dark','collector-floor');floor.position.set(0,-8.18,0);
 for(const z of [-16,16])k.box(52,7.8,.7,0,-4.1,z,'concrete','collector-side-wall');
 // The stationary erector is stowed in its own covered longitudinal recess.
 k.box(4.9,.5,20,0,-.1,23,'dark','erector-recess');
 for(const x of [-1.9,1.9])k.box(.55,.65,21,x,.4,23,'green','8u260-stowed-beam');
 for(let z=14;z<=32;z+=2.2)k.box(3.5,.3,.5,0,.55,z,'green','erector-cross-member');
 k.box(4.8,.5,5,0,.65,12,'green','8u260-pivot-cover');
 for(const x of [-2.5,2.5])k.cyl(.48,1.1,x,.55,9,'steel','erector-pivot');
}

function flameDucts(k){
 // One connected terrain mask preserves the aperture and both outlets beneath
// the deck. No terrain can cover the collector or the rising channel floors.
 k.cutouts.push({polygon:[[-58,-24],[-26,-17],[-26,-9],[26,-9],[26,-17],[58,-24],[58,24],[26,17],[26,9],[-26,9],[-26,17],[-58,24]],source:'Proton paired lateral ducts and launch aperture'});
 for(const s of [-1,1]){
  const p=(x,y,z)=>[s*x,y,z],sections=[[26,-8,15],[32,-7.7,16],[40,-5.6,18],[49,-2.5,21],[58,-.22,24]];
  for(let i=1;i<sections.length;i++){
   const [xa,ya,wa]=sections[i-1],[xb,yb,wb]=sections[i];
   plate(k,[p(xa,ya,-wa),p(xb,yb,-wb),p(xb,yb,wb),p(xa,ya,wa)],'concrete','rising-flame-channel-floor');
   for(const side of [-1,1])plate(k,[p(xa,ya,side*wa),p(xb,yb,side*wb),p(xb,.18,side*(wb+1.5)),p(xa,.18,side*(wa+1.5))],'concrete','flame-channel-wing-wall');
   for(const z of [-.66,-.33,0,.33,.66])k.rod(p(xa,ya+.035,z*wa),p(xb,yb+.035,z*wb),.026,'steel','channel-slab-joint');
   k.rod(p(xa,ya+.035,-wa),p(xa,ya+.035,wa),.026,'steel','channel-slab-joint');
  }
  // Three real openings in each portal, visible beneath the massive lintel.
  k.box(1.2,5.5,32,s*26,-2.55,0,'concrete','outlet-lintel');
  for(const z of [-15.7,-5.25,5.25,15.7])k.box(1.2,2.8,.65,s*26,-6.55,z,'concrete','outlet-pier');
  for(const z of [-14,14]){
   for(const dx of [-.32,.32])k.rod(p(26.7,0,z+dx),p(26.7,-7.6,z+dx),.055,'steel','outlet-access-ladder');
   for(let y=-7.4;y<.2;y+=.3)k.rod(p(26.75,y,z-.34),p(26.75,y,z+.34),.035,'steel','ladder-rung');
  }
 }
}

function perforatedGirder(k,x,y,z,length,height,yaw=0){
 const shape=new THREE.Shape();shape.moveTo(-length/2,-height/2);shape.lineTo(length/2,-height/2);shape.lineTo(length/2,height/2);shape.lineTo(-length/2,height/2);shape.closePath();
 for(let xx=-length/2+1;xx<length/2-.6;xx+=1.45){const hole=new THREE.Path();hole.absellipse(xx,0,.38,height*.31,0,Math.PI*2,true);shape.holes.push(hole);}
 const g=new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:false,curveSegments:6});g.rotateY(yaw);g.translate(x,y,z);k.direct(g,'steel','perforated-platform-girder');
}
function serviceTower(root){
 const k=archiveKit(root);k.mat.steel.color.set('#79867c');k.mat.light.color.set('#a5ada6');k.mat.red.color.set('#c17a45');
 // Wide four-bogie carriage. Rocket enters the open front between the legs.
 for(const x of [-9,9]){
  k.box(1.7,2.4,20,x,3,5,'steel','tower-carriage-side');
  for(const z of [-2,12]){k.box(2.3,1.1,4,x,1.3,z,'dark','tower-travel-bogie');for(const dz of [-1.35,1.35]){const wheel=new THREE.CylinderGeometry(.65,.65,.36,16);wheel.rotateZ(Math.PI/2);wheel.translate(x,.75,z+dz);k.direct(wheel,'steel','tower-bogie-wheel');}}
  k.box(.25,55,1.5,x,32,4,'light','tower-front-column-web');for(const z of [3.3,4.7])k.box(1.7,55,.16,x,32,z,'light','tower-front-column-flange');
  k.rod([x,4,15],[x,59,6],.48,'steel','inclined-rear-leg');
  for(let y=5;y<58;y+=5.5){const z=15-(y-4)/55*9,zn=15-(y+5.5-4)/55*9;k.rod([x,y,4],[x,y+5.5,zn],.17,'steel','tower-side-cross-brace');k.rod([x,y,z],[x,y+5.5,4],.17,'steel','tower-side-cross-brace');k.rod([x,y,4],[x,y,z],.21,'steel','tower-side-tie');}
  // Two slender enclosed lifts; ribbed shaft and landing doors.
  k.box(1.5,51,1.6,x*1.18,29,6.6,'light','cargo-passenger-lift');
  for(let y=4;y<56;y+=2.2)k.box(1.57,.09,1.65,x*1.18,y,6.6,'steel','lift-shaft-seam');
  for(const y of [9,17,23,36,42,48,53])k.box(1.1,1.8,.07,x*1.18,y+1,5.75,'dark','lift-landing-door');
 }
 k.box(20,2.1,2.8,0,4,14,'steel','tower-carriage-rear');k.box(18,1,1.5,0,58,4,'steel','tower-top-cross-beam');
 for(const y of [11,28,33,56]){k.rod([-9,y,6],[9,y,6],.28,'steel','tower-transverse-tie');k.rod([-9,y,6],[9,y+4,6],.16,'steel','tower-transverse-brace');}
 for(const [j,y]of [16,20.5,25,36,41,46,50.5,54].entries()){
  const r=j<3?7.5:6.5,inside=j<3?4.0:2.8;
  ringDeck(k,{outer:r,inner:inside,y,height:.4,material:'steel',tag:'service-ring-with-open-centre'});
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4,b=(i+1)*Math.PI/4,pa=radial(r,a,y+.4),pb=radial(r,b,y+.4);guard(k,pa,pb,{material:'steel'});
   // Segmented weather screens alternate with open observation platforms.
   if([0,1,2,4,6,7].includes(j)&&i!==2){const midpoint=pa.map((v,n)=>(v+pb[n])/2),len=Math.hypot(pb[0]-pa[0],pb[2]-pa[2]);k.box(len,1.65,.10,midpoint[0],y+1.25,midpoint[2],'light','segmented-platform-screen',-a-5*Math.PI/8);for(let t=0;t<4;t++){const x=pa[0]+(pb[0]-pa[0])*(t+.5)/4,z=pa[2]+(pb[2]-pa[2])*(t+.5)/4;k.rod([x,y+.43,z],[x,y+2.1,z],.027,'steel','screen-panel-seam');}}
  }
  for(const x of [-6.5,6.5]){k.box(2.7,.4,4,x,y,6,'steel','platform-access-bridge');k.box(1.2,.9,.8,x,y+1,7.5,'light','air-conditioning-unit');for(let yy=0;yy<5;yy++)k.box(.9,.035,.02,x,y+.65+yy*.13,7.08,'dark','equipment-louvre');}
  // Lightening apertures in the plate girders remain actual geometry holes.
  for(const z of [-4.7,4.7])perforatedGirder(k,0,y-.65,z,13,1.3);
 }
 // External zigzag stairs, separate treads and continuous handrails.
 for(let y=5,flight=0;y<53;y+=3,flight++){
  const za=flight%2?11:5,zb=flight%2?5:11;
  for(let i=0;i<12;i++)k.box(1.3,.1,.47,11.8,y+i*.25,za+(zb-za)*i/12,'steel','stair-tread');
  for(const x of [11.1,12.5]){k.rod([x,y,za],[x,y+3,zb],.10,'steel','stair-stringer');guard(k,[x,y,za],[x,y+3,zb],{material:'steel'});}
  k.box(1.6,.18,1.5,11.8,y+3,zb,'steel','stair-landing');
 }
 // Unequal cranes above the two lift heads, as in IMG_0488 / 0905.
 k.box(2.6,3,2.6,-9,60,4,'light','main-crane-pedestal');
 k.rod([-9,62,4],[-1,66,4],.27,'red','main-crane-boom');k.rod([-9,64,4],[-1,66,4],.14,'red','main-crane-upper-chord');
 for(let i=0;i<8;i++)k.rod([-9+i,62+i*.5,4],[-8+i,64+(i+1)*.25,4],.09,'red','crane-lattice');
 k.box(3,1.5,2,-11,62,4,'red','crane-counterweight');k.rod([-1,66,4],[-1,57,4],.035,'dark','crane-hoist');
 k.rod([9,57,3],[4,59,-1],.19,'red','small-crane-boom');k.rod([4,59,-1],[4,54,-1],.025,'dark','small-crane-hoist');
 const beaconPosition=[-9,61.5,4];registerFacilityBeacon(root,{id:'proton-service-tower',position:beaconPosition,kind:'service-tower'});
 const report=k.finish();root.name='Передвижная башня обслуживания Протона';root.userData.protonTower={platforms:8,lifts:2,cranes:2,travelGauge:18,height:60};return report;
}

function trackAndGallery(k,serviceZ){
 const end=serviceZ+22;
 for(const x of [-9,9]){k.box(2,.32,end+10,x,.03,(end-10)/2,'concrete','wide-gauge-foundation');k.box(.12,.18,end+10,x,.29,(end-10)/2,'rail','tower-travel-rail');for(let z=-8;z<end;z+=2.8)k.box(.6,.08,.45,x,.23,z,'steel','tower-rail-fastening');}
 k.rail([[0,serviceZ+40],[0,34]],{tag:'proton-transport-rail'});
 // Continuous service gallery on its own trestles, alongside the moving tower.
 const x=-14.5,y=12,z0=35; k.box(1.7,.25,end-z0,x,y,(end+z0)/2,'steel','utility-gallery-deck');
 for(const side of [-1,1])guard(k,[x+side*.8,y,z0],[x+side*.8,y,end],{material:'steel'});
 for(let z=z0;z<end;z+=13){for(const sx of [-1,1])k.rod([x+sx*1.0,0,z],[x+sx*.75,y,z],.14,'steel','gallery-trestle');k.rod([x-1,0,z],[x+.75,y,z],.09,'steel','gallery-trestle-brace');k.rod([x+.75,3,z],[x+.75,y,Math.min(end,z+13)],.10,'steel','gallery-longitudinal-brace');}
 for(const dx of [-.42,.42])k.rod([x+dx,y-.5,z0],[x+dx,y-.5,end],.18,'steel','gallery-process-pipe');
 k.path([[-20,38],[-20,serviceZ+30],[20,serviceZ+30],[20,38]],4,.12,'asphalt','tower-service-road');
}
function mastsAndUtilities(k,includeLegacyVaults){
 for(const [index,[x,z]]of [[-42,-33],[42,-33],[-42,58],[42,58]].entries()){
  k.box(8,1.2,8,x,.6,z,'concrete','lightning-mast-foot');
  for(let j=0;j<12;j++){const y=1.2+j*6.5,w=(5.5-j*.34)/2,wn=(5.5-(j+1)*.34)/2,material=j%2?'red':'light';for(const sx of [-1,1])for(const sz of [-1,1])k.rod([x+sx*w,y,z+sz*w],[x+sx*wn,y+6.5,z+sz*wn],.18,material,'proton-banded-mast');for(const s of [-1,1]){k.rod([x-w,y,z+s*w],[x+wn,y+6.5,z+s*wn],.10,material,'mast-cross-brace');k.rod([x+w,y,z+s*w],[x-wn,y+6.5,z+s*wn],.10,material,'mast-cross-brace');k.rod([x+s*w,y,z-w],[x+s*wn,y+6.5,z+wn],.10,material,'mast-cross-brace');k.rod([x+s*w,y,z+w],[x+s*wn,y+6.5,z-wn],.10,material,'mast-cross-brace');}}
  k.box(1.6,.22,1.6,x,79.2,z,'steel','lightning-mast-cap');
  k.rod([x,77,z],[x,82,z],.09,'steel','lightning-rod');registerFacilityBeacon(k.root,{id:'proton-lightning-'+index,position:[x,82,z],kind:'lightning-mast'});
 }
 for(const [index,x]of [-31,31].entries()){
  const z=27;k.lattice(x,z,28,2.4,2.4,{levels:8,tag:'proton-floodlight-mast'});k.box(4.8,6,.22,x,30,z,'steel','floodlight-board');
  const lamps=[];for(let c=0;c<4;c++)for(let r=0;r<6;r++){const px=x+(c-1.5)*1.1,py=27.6+r*.97;k.box(.78,.66,.18,px,py,z-.22,'light','floodlight-lens');lamps.push({position:[px,py,z-.32],normal:[0,0,-1],size:[.78,.66]});}
  registerFacilityFloodlights(k.root,{id:'proton-board-'+index,lamps,target:[0,.3,0]});
 }
 if(includeLegacyVaults)for(const x of [-36,36]){
  // Low earth-covered utility vaults rather than tall hangars at the apron.
  k.box(15,4.8,62,x,2.35,83,'concrete','service-vault');k.box(15.5,.3,63,x,4.9,83,'soil','earth-covered-vault-roof');
  for(const s of [-1,1])plate(k,[[x+s*7.8,4.9,51],[x+s*15,.1,51],[x+s*15,.1,115],[x+s*7.8,4.9,115]],'soil','vault-earth-slope');
  k.box(3,3,.15,x,1.5,51.85,'green','vault-access-door');for(const z of [66,95])k.cyl(.5,2,x,5.8,z,'steel','vault-vent');
 }
}

export function buildProtonPosition(root,{serviceZ=300,sharedVehicle=false,rocketVisible=true,sourceLoader=null,includeLegacyVaults=true}={}){
 const core=new THREE.Group();root.add(core);const k=archiveKit(core);k.mat.green.color.set('#365b45');k.mat.concrete.color.set('#929b97');k.mat.red.color.set('#966c62');softenPaint(k.mat.green);
 launchInterface(k);flameDucts(k);
 const surroundings=new THREE.Group();root.add(surroundings);const external=archiveKit(surroundings);trackAndGallery(external,serviceZ);mastsAndUtilities(external,includeLegacyVaults);const externalReport=external.finish();
 const tower=new THREE.Group();tower.position.z=serviceZ;root.add(tower);const towerReport=serviceTower(tower);
 const vehicle=sharedVehicle?(sharedRocket??=createProtonRocket({detail:'map'})):createProtonRocket({detail:'map'});
 const rocket=sharedVehicle?vehicle.root.clone(true):vehicle.root;rocket.name='Протон-М · музейный экспонат на старте';rocket.position.y=-1.1;rocket.visible=rocketVisible;root.add(rocket);
 const report=k.finish();root.userData.archiveCutouts=core.userData.archiveCutouts;delete core.userData.archiveCutouts;for(const key of ['primitiveCount','meshCount','batches'])report[key]+=externalReport[key];for(const [tag,count]of Object.entries(externalReport.features))report.features[tag]=(report.features[tag]||0)+count;const views={all:{target:[0,20,serviceZ*.35],eye:[180,210,serviceZ*.75+170]},launch:{target:[0,23,0],eye:[100,100,-125]},duct:{target:[25,-3,0],eye:[73,31,40]},interface:{target:[0,-.7,0],eye:[18,21,23]},tower:{target:[0,32,serviceZ+3],eye:[70,67,serviceZ-110]},top:{target:[0,0,0],eye:[0,140,.01]}};
 const features={...report.features};for(const [tag,count]of Object.entries(towerReport.features))features[tag]=(features[tag]||0)+count;
 const data={version:PROTON_LAUNCH_VERSION,dimensions:PROTON_LAUNCH_DIMENSIONS,serviceZ,referencePhotos:25,satellitePlans:2,physical:{units:'metres',localScale:1,depthSource:'Barmin, Startovye raketnye kompleksy, p.63',photoEstimated:true},features,views};
 root.userData.protonLaunch=data;root.userData.physicalUnits={units:'metres',localScale:1,railGauge:1.52,serviceGantryHeight:60,serviceGantryParkDistance:serviceZ,heightsSurveyed:false};
 const fallbackTowerChildren=[...tower.children],fallbackMeshes=[];for(const group of [core,rocket,...fallbackTowerChildren])group.traverse(o=>{if(o.isMesh)fallbackMeshes.push(o);});
 const state={version:'proton-source-20261108-v1',status:'unloaded',detail:false,error:null};data.source=state;
 let pending=null,parts=null,visible=!!rocketVisible,detailMeshes=[];
 function detail(active){
  if(!parts||state.detail===active)return;
  state.detail=active;core.visible=!active;rocket.visible=visible&&!active;fallbackTowerChildren.forEach(o=>o.visible=!active);
  parts.pad.visible=active;parts.gantry.visible=active;parts.rocket.visible=active&&visible;
  (root.parent||root).dispatchEvent({type:'museum-exhibit-loaded',removed:active?fallbackMeshes:detailMeshes,added:active?detailMeshes:fallbackMeshes});
 }
 async function loadSource(){
  if(parts){detail(true);return true;}if(pending)return pending;state.status='loading';state.error=null;
  pending=(async()=>{
   try{
    const load=sourceLoader||(await import('./proton-source.js?v=20261108-proton-source-v1')).loadProtonPart;
    const [pad,gantry,exactRocket]=await Promise.all(['pad','gantry','rocket'].map(part=>load(part,{isolated:!sharedVehicle})));
    pad.position.y=1.2;exactRocket.position.y=0;root.add(pad,exactRocket);tower.add(gantry);parts={pad,gantry,rocket:exactRocket};
    for(const group of Object.values(parts))group.traverse(o=>{if(o.isMesh)detailMeshes.push(o);});
    state.status='ready';detail(true);return true;
   }catch(error){state.status='error';state.error=error.message;return false;}finally{pending=null;}
  })();return pending;
 }
 const point=new THREE.Vector3(),towerPoint=new THREE.Vector3(),scale=new THREE.Vector3();let retryAt=0;
 function update(now,camera){
  if(!camera)return;for(let p=root;p;p=p.parent)if(!p.visible)return;
  root.getWorldPosition(point);tower.getWorldPosition(towerPoint);root.getWorldScale(scale);
  const near=Math.min(camera.position.distanceTo(point),camera.position.distanceTo(towerPoint))<260*scale.x;
  if(near&&!parts&&now>retryAt){retryAt=now+10000;loadSource();}if(parts)detail(near);
 }
 handles.set(root,{loadSource,update,source:()=>({...state}),setRocketVisible:value=>{visible=!!value;rocket.visible=visible&&!state.detail;if(parts)parts.rocket.visible=visible&&state.detail;},rocketVisible:()=>visible,rocket,tower});
 return {...report,primitiveCount:report.primitiveCount+towerReport.primitiveCount,meshCount:report.meshCount+towerReport.meshCount,batches:report.batches+towerReport.batches,features:data.features,model:data};
}
