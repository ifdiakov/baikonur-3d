import * as THREE from 'three';
import {buildSite2Museum} from './site2-museum.js?v=20261103-site2-main-road-v1';
import {installSite2Exhibit} from './site2-exhibit.js?v=20261103-site2-main-road-v1';
import {registerFacilityFloodlights} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';
import {buildMzkSdi} from './mzk-sdi.js?v=20261102-site2-photo-v3';
import {buildAirport} from './airport-models.js?v=20261102-site2-photo-v3';
import {archiveKit,imageAxisYaw,imageFrame} from './archive-kit.js?v=20261102-site2-photo-v3';
// Hand-interpreted owner photographs. Heights and hidden geometry are approximate.
export function protonHalls(root){
 const k=archiveKit(root),P=imageFrame([680,450],.60);const hall=(p,w,d,h,opts={})=>{const[x,z]=P(p);return k.hall({x,z,w:w*.6,d:d*.6,h,yaw:imageAxisYaw([0,0],[260,198]),...opts});};
 hall([708,378],82,393,25,{roof:'blue',monitor:true,gates:2});hall([635,469],78,393,25,{roof:'blue',monitor:true,gates:2});hall([485,420],27,105,8,{floors:2,wall:'light'});hall([600,515],46,122,11,{floors:2});hall([700,590],27,105,8,{floors:2,wall:'light'});hall([270,747],88,192,13,{roof:'dark',gates:2});hall([508,626],64,116,6);hall([215,182],38,135,7,{roof:'blue'});hall([958,134],47,68,5,{roof:'blue'});hall([850,128],30,53,5,{roof:'blue'});
 for(const p of[[443,180],[416,211],[457,141]]){const[x,z]=P(p);k.tank(x,z,3.2,9);}
 for(const pts of[[[1280,949],[1150,802],[1000,653],[850,540],[807,508]],[[1280,949],[1137,778],[991,623],[861,527]],[[1280,949],[1120,733],[1034,582],[1080,420],[1305,322]],[[1248,924],[1020,824],[845,729],[740,632]],[[20,706],[214,842],[435,971]]])k.rail(pts.map(P));
 k.path([[132,90],[273,180],[417,302],[374,397],[736,685],[987,758]].map(P),7,.16);k.path([[418,302],[550,177],[704,97],[975,202],[1077,431],[901,638]].map(P),5,.14);root.userData.tracedAxes=[{part:'two-main-halls',a:[580,280],b:[838,478]}];return k.finish();
}
export {buildSite95 as settlement95} from './site95.js?v=20261106-site95-town-v1';
export function mik42Facade(root){
 registerFacilityFloodlights(root,{id:'mik42-roof-floodlight',target:[-59,0,24],beacon:[-59,45.5,-5],
  lamps:[{position:[-59,44,-4.5],normal:[0,0,1],size:[2.3,2.3]}]});
 const k=archiveKit(root);k.hall({w:142,d:34,h:28,wall:'light',roof:'dark',windows:false,gates:0,tag:'photo-visible-mik42-frontage'});
 for(const z of[-17.2,17.2]){for(let f=0;f<3;f++){k.box(142,3.8,.25,0,6+f*5,z,'red','red-window-belt');for(let x=-65;x<=66;x+=6.2){k.box(4.2,2.9,.24,x,6+f*5,z+(z>0?.19:-.19),'glass','frontage-window');k.box(.13,2.9,.26,x,6+f*5,z+(z>0?.33:-.33),'light','window-mullion');}}for(let x=-65;x<68;x+=10)k.box(.4,2,.22,x,25,z,'dark','upper-slit');}
 for(const x of[-15,56]){k.box(7,31,9,x,15.5,20,'red','red-stair-tower');k.box(1,31,9.3,x+3.5,15.5,20,'light','stair-tower-rim');}k.box(144,.7,35,0,28.6,0,'red','red-parapet');k.lattice(-59,-5,14,2,2,{y:29,levels:5,tag:'roof-floodlight-tower'});k.box(3,3,1,-59,44,-5,'dark','floodlight');k.path([[-78,32],[-40,32],[0,32],[78,32]],7,.1);for(let x=-65;x<=62;x+=13){k.cyl(.23,5,x,2.5,42,'rust','tree-trunk');for(const dx of[-2,0,2])k.rod([x,3,42],[x+dx,8,42+dx],.1,'rust','bare-tree-branch');}return k.finish();
}
export function mzk112a(root){return buildMzkSdi(root);}
export function yubileiny(root){return buildAirport(root,'yubileiny');}
export {buildCheckpoint7 as checkpoint7} from './checkpoint7.js?v=20261103-checkpoint7-flat-v2';

export function observationPoint(root){
 const k=archiveKit(root);function tent(cx,cz,w,d){const r=w/2,y=2.6,segments=24;for(let i=0;i<segments;i++){const a=i/segments*Math.PI,b=(i+1)/segments*Math.PI;k.quad([cx+r*Math.cos(a),y+r*.47*Math.sin(a),cz-d/2],[cx+r*Math.cos(b),y+r*.47*Math.sin(b),cz-d/2],[cx+r*Math.cos(b),y+r*.47*Math.sin(b),cz+d/2],[cx+r*Math.cos(a),y+r*.47*Math.sin(a),cz+d/2],'white','shelter-fabric');}for(let z=cz-d/2;z<=cz+d/2+.1;z+=d/6){for(let i=0;i<12;i++){const a=i/12*Math.PI,b=(i+1)/12*Math.PI;k.rod([cx+r*Math.cos(a),y+r*.47*Math.sin(a),z],[cx+r*Math.cos(b),y+r*.47*Math.sin(b),z],.07,'steel','arched-frame');}for(const s of[-1,1])k.rod([cx+s*r,0,z],[cx+s*r,y,z],.08,'steel','shelter-post');}for(const s of[-1,1])k.box(.05,2.4,d,cx+s*r,1.2,cz,'light','shelter-side-screen');}
 tent(-15,0,15,20);tent(13,0,20,25);for(const x of[-18,-12,8,15])for(const z of[-5,3]){k.box(3,.18,1,x,1.2,z,'light','buffet-table');for(const dx of[-1,1])k.rod([x+dx,0,z],[x+dx,1.2,z],.055,'steel','table-leg');}for(const x of[-34,34]){k.cyl(.1,8,x,4,-15,'steel','flagpole');k.box(3,1.8,.04,x+1.5,6.8,-15,'blue','flag');}return k.finish();
}
export function nedelinRuins(root){
 const k=archiveKit(root);k.box(66,.35,36,0,-.1,0,'concrete','ruin-floor');for(const x of[-32,32])k.box(1,5,35,x,2.5,0,'light','ruin-sidewall');for(const x of[-27,-12,3,18,31])k.box(2.8,5,1.1,x,2.5,18,'light','ruin-front-jamb');k.box(66,1.1,1.1,0,5.1,18,'light','ruin-front-lintel');k.box(65,5,1,0,2.5,-18,'concrete','ruin-backwall');for(const[x,z,w,d]of[[-24,-9,16,17],[21,-7,22,20]])k.box(w,.5,d,x,5.4,z,'concrete','broken-roof-slab');for(let i=0;i<48;i++)k.box(1+i%4,.3+i%3*.2,1+i%5,-35+i*23%73,.2,-24+i*41%49,'concrete','rubble');for(let i=0;i<14;i++)k.rod([-30+i*4,4.8,18],[-29+i*4,6.5,17],.08,'rust','exposed-rebar');const physical={units:'metres',localScale:1,modelFloorMetres:[66,36],wallHeightMetres:5,dimensionsSurveyed:false,interpretation:'Photo-guided ruin exhibit, not the complete Site 41 launch complex or a measured R-16 launcher.'};root.userData.physicalUnits=physical;return {...k.finish(),physical};
}
export function buranMuseum(root){const result=buildSite2Museum(root);if(typeof window!=='undefined')installSite2Exhibit(root);return result;}
export function cleanroom(root){
 const k=archiveKit(root);k.box(72,.25,94,0,0,0,'green','cleanroom-floor');k.box(72,29,.7,0,14.5,-47,'light','cleanroom-back-wall');for(const x of[-36,36])k.box(.7,29,94,x,14.5,0,'light','cleanroom-side-wall');for(const x of[-34,34]){k.box(1,1,90,x,24,0,'yellow','crane-runway');for(let z=-40;z<45;z+=12)k.box(.6,28,.6,x,14,z,'concrete','cleanroom-column');}k.box(69,2.2,3,0,25,-9,'yellow','overhead-crane');k.box(5,3,5,3,24,-9,'yellow','crane-trolley');k.rod([3,23,-9],[3,15,-9],.08,'dark','crane-cable');k.cyl(4.8,5,0,3,-6,'steel','spacecraft-service-module');k.sphere(4.5,0,8,-6,'dark','spacecraft-reentry-module',[1,.7,1]);k.sphere(3.5,0,13,-6,'dark','spacecraft-orbital-module');for(const x of[-9,9]){k.box(6,.35,14,x,8,-6,'yellow','assembly-platform');for(const z of[-12,0])k.rod([x,0,z],[x,8,z],.25,'yellow','platform-post');}k.cyl(6.7,16,22,7,16,'light','horizontal-clean-container',Math.PI/2);k.sign('ИНТЕРЬЕР · ФОТОЭТЮД',0,22,-46.5,47,4);return k.finish();
}
