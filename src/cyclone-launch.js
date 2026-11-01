import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261031-facilities-rails-lighting-v1';
import {registerFacilityBeacon,registerFacilityFloodlights} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';
export const CYCLONE_VERSION='cyclone-v1';
// Metres. Photographic reconstruction of the late operating period, not a
// civil-engineering survey. The low table is deliberately unlike Soyuz's pit.
import {CYCLONE_VIEWS,CYCLONE_MOUNTS,CYCLONE_PAD_ORIGINS} from './cyclone-profile.js?v=20261101-cyclone-v1';
export {CYCLONE_VIEWS,CYCLONE_MOUNTS};
function ring(k,outer,inner,y,height,material,tag){const shape=new THREE.Shape();shape.absarc(0,0,outer,0,Math.PI*2);const hole=new THREE.Path();hole.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(hole);const g=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:48});g.rotateX(-Math.PI/2);g.translate(0,y,0);k.direct(g,material,tag);}
function guard(k,a,b){for(const y of [.52,1])k.rod([a[0],a[1]+y,a[2]],[b[0],b[1]+y,b[2]],.035,'steel','handrail');for(let t=0;t<=1.001;t+=.25){const p=a.map((v,i)=>v+(b[i]-v)*t);k.rod(p,[p[0],p[1]+1,p[2]],.04,'steel','handrail-post');}}
function mast(k,x,z,h,width,tag){const levels=Math.ceil(h/4.5);for(let i=0;i<levels;i++){const y=h*i/levels,yy=h*(i+1)/levels,w=width*(1-.55*i/levels)/2,v=width*(1-.55*(i+1)/levels)/2;for(const a of [-1,1])for(const b of [-1,1])k.rod([x+a*w,y,z+b*w],[x+a*v,yy,z+b*v],width*.035,'steel',tag);for(const a of [-1,1]){k.rod([x-w,y,z+a*w],[x+v,yy,z+a*v],width*.017,'steel','mast-cross-brace');k.rod([x+w,y,z+a*w],[x-v,yy,z+a*v],width*.017,'steel','mast-cross-brace');k.rod([x+a*w,y,z-w],[x+a*v,yy,z+v],width*.017,'steel','mast-cross-brace');k.rod([x+a*w,y,z+w],[x+a*v,yy,z-v],width*.017,'steel','mast-cross-brace');}}}
export function buildCyclonePosition(root){
 const k=archiveKit(root);
 // A shallow flame apron and low open pedestal; photos do not justify a deep
 // Proton-style excavation. Both lateral exits remain unobstructed.
 k.poly([[-27,-27],[27,-27],[27,40],[-27,40]],.04,'concrete','launch-apron');
 for(const x of [-18,-9,0,9,18])k.box(.025,.012,67,x,.052,6.5,'dark','slab-joint');
 for(let z=-27;z<=40;z+=9)k.box(54,.012,.025,0,.052,z,'dark','slab-joint');
 k.cyl(3.9,.025,0,.067,0,'dark','scorched-flame-apron');
 for(const s of [-1,1]){
  k.quad([0,.53,-1.6],[s*2.7,.08,-2.1],[s*2.7,.08,2.1],[0,.53,1.6],'steel','flame-splitter');
  k.path([[s*2.7,0],[s*6,0],[s*11,0]],4.2,.075,'dark','shallow-flame-outlet');
 }
 ring(k,2.65,1.65,.79,.26,'green','open-launch-ring');
 for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.cos(a)*2.17,z=Math.sin(a)*2.17;k.box(.48,.76,.55,x,.46,z,'steel','table-foot',-a);k.box(.50,.29,.55,x,1.2,z,'yellow','rocket-support-seat',-a);k.rod([x,.42,z],[x*.72,.79,z*.72],.11,'steel','table-brace');}
 // Recessed longitudinal transporter channel and two flush rails.
 for(const s of [-1,1])k.box(.55,.28,95,s*3.1,.18,50.5,'concrete','transporter-channel-edge');
 k.path([[0,3],[0,98]],5.7,.055,'dark','transporter-channel');k.rail([[0,6],[0,115]],{y:.07,bed:false,tag:'erector-approach-rail'});
 // Green articulated transport/erector, retained in its near-vertical pose.
 const boom=new THREE.Group();boom.name='Транспортно-установочный агрегат';boom.position.set(0,.75,3.25);boom.rotation.x=.035;root.add(boom);const e=archiveKit(boom);
 for(const x of [-.85,.85])for(const z of [-.55,.55])e.box(.24,32.5,.24,x,16.25,z,'green','erector-longeron');
 for(let y=0;y<32;y+=2.1){for(const z of [-.55,.55]){e.rod([-.85,y,z],[.85,y+2.1,z],.07,'green','erector-diagonal');e.rod([.85,y,z],[-.85,y+2.1,z],.07,'green','erector-diagonal');}e.box(1.85,.14,1.2,0,y,0,'steel','erector-crossmember');}
 for(const y of [4,13,22,29]){for(const s of [-1,1])e.rod([s*.85,y,-.55],[s*1.3,y,-2.0],.095,'green','automatic-connection-arm');e.box(.65,.65,.35,0,y,-1.1,'dark','umbilical-panel');}
 e.box(.60,31.5,.22,0,16,-.75,'dark','cable-spine');for(let y=1;y<30;y+=.42)e.rod([-.28,y,.85],[.28,y,.85],.025,'steel','erector-ladder');e.finish();
 for(const s of [-1,1]){k.cyl(.45,.6,s*1.3,.8,3.4,'steel','erector-trunnion',Math.PI/2);k.rod([s*1.5,.5,9],[s*.9,14,4],.18,'green','hydraulic-cylinder');}
 // Transport chassis stays on the approach rails behind the tilted support.
 k.box(2.2,.6,9,0,.65,76,'green','transport-frame');for(const z of [72.5,73.5,78.5,79.5])for(const s of [-1,1])k.cyl(.39,.20,s*.78,.43,z,'dark','transport-wheel',Math.PI/2);
 k.box(2.3,2.2,2.5,0,1.9,81,'green','transport-cabin');k.box(1.75,.68,.025,0,2.38,79.74,'glass','transport-window');
 // Three tall lattice lightning masts visible in the launch photography.
 for(const [i,[x,z,h]]of [[-21,-17,54],[24,-12,54],[-22,34,49]].entries()){
  k.box(4,.55,4,x,.28,z,'concrete','mast-foundation');mast(k,x,z,h,3.3,'cyclone-lightning-mast');k.rod([x,h,z],[x,h+4,z],.055,'steel','lightning-tip');
  for(let y=1;y<h;y+=.48)k.rod([x-.25,y,z-.7],[x+.25,y,z-.7],.024,'steel','mast-ladder');registerFacilityBeacon(root,{id:'cyclone-lightning-'+i,position:[x,h+4,z],kind:'lightning-mast'});
 }
 for(const [i,[x,z]]of [[-32,25],[34,39]].entries()){
  k.box(3,.25,3,x,.13,z,'concrete','floodlight-foundation');mast(k,x,z,19,1.7,'cyclone-floodlight-mast');k.box(4,.3,1.5,x,19,z,'steel','floodlight-platform');guard(k,[x-2,19,z+.75],[x+2,19,z+.75]);const lamps=[];
  for(let j=0;j<4;j++){const p=[x+(j-1.5)*.82,19.6,z-.25];k.box(.62,.5,.5,...p,'dark','floodlight-housing');k.box(.54,.40,.03,p[0],p[1],p[2]-.27,'light','floodlight-lens');lamps.push({position:[p[0],p[1],p[2]-.29],normal:[0,0,-1],size:[.54,.40]});}
  registerFacilityFloodlights(root,{id:'cyclone-floodlight-'+i,lamps,target:[0,1,0]});
 }
 for(const s of [-1,1]){mast(k,s*5,4,7,1,'connection-mast');for(let n=0;n<3;n++)k.rod([s*5,.4+n*.2,10],[s*3,.4+n*.2,3],.07,'steel','fuel-service-line');}
 k.hall({x:19,z:61,w:8,d:12,h:3.7,windows:false,tag:'utility-building'});
 const built=k.finish();root.userData.cyclonePosition={version:CYCLONE_VERSION,features:built.features,dimensions:{rocketBase:1.38,mastHeight:58,tableOuterDiameter:5.3,tableOpeningDiameter:3.3},interpretation:'photo-reconstruction; shallow exhaust apron and civil dimensions estimated'};
 return built;
}
export function buildCycloneComplex(root){
 const positions=[];for(const [i,mount]of CYCLONE_MOUNTS.entries()){const p=new THREE.Group();p.position.set(mount.position[0],0,mount.position[2]);root.add(p);buildCyclonePosition(p);positions.push({index:i,position:p.position.toArray()});}
 const k=archiveKit(root);const curve=new THREE.CatmullRomCurve3([[-9.5,152.9],[-25,145],[-48,140],[-75,110],[-88.1,64.9]].map(([x,z])=>new THREE.Vector3(x,.05,z)),false,'centripetal');k.path(curve.getSpacedPoints(90).map(p=>[p.x,p.z]),6,.05,'asphalt','complex-access');k.path([[-48,140],[-48,170]],6,.05,'asphalt','complex-gate');k.hall({x:-55,z:118,w:18,d:10,h:4.5,windows:false,tag:'control-building'});
 const built=k.finish();root.userData.cycloneModel={version:CYCLONE_VERSION,positions,rocketMounts:CYCLONE_MOUNTS,views:CYCLONE_VIEWS,source:'https://rvsn.ruzhany.info/0_2019/kbu_2019_08_06_ru.html',layoutBasis:'pad origins inferred from OSM rail termini 172571378 and 172571036; civil dimensions estimated',period:'Циклон-2 · историческая реконструкция'};return {...built,positions:2};
}
