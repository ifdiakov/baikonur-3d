import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261111-launch-motion-v1';

export const PROTON_CIVIL_VERSION='proton-civil-photo-20261111-v1';
const GRADE=-.25,PATH_Y=-.13,V=(...p)=>new THREE.Vector3(...p);
const sourceFolder='199muXRaZ0iCvWuHWVvLoEypkrDeJGfrd';
// These are coordinates in the original height-1000 tracing frame, not in a
// stretched 1300×1000 copy. The already calibrated launch frames remain fixed.
// Outer dimensions describe the whole earth covering, not the concrete room.
export const PROTON_CIVIL_LAYOUT=Object.freeze({
 'pad-81':{
  sourcePlan:'1vcxpuL94AAEsfmwW0hDPCc5vQH0qIcdZ',sourceSize:[1890,1528],reviewHeight:1000,
  shelters:[
   {id:'central-north',pixel:[779,322],size:[46,95],yaw:.949,height:4.2,front:1},
   {id:'central-middle',pixel:[708,429],size:[31,87],yaw:-.6,height:3.6,front:-1},
   {id:'central-south',pixel:[544,539],size:[31,89],yaw:-.6,height:3.5,front:1},
   {id:'southwest-north',pixel:[223,697],size:[49,96],yaw:.9,height:4.6,front:-1},
   {id:'southwest-south',pixel:[223,783],size:[67,113],yaw:.9,height:4.9,front:1}
  ],
  flankShelters:[
   {id:'launch-1-covered-left',pixel:[416,312],size:[42,91],yaw:-.408,height:3.2,twinRidges:true},
   {id:'launch-1-covered-right',pixel:[516,363],size:[42,91],yaw:-.481,height:3.4,twinRidges:true},
   {id:'launch-2-covered-left',pixel:[782,556],size:[42,94],yaw:-.550,height:3.2,twinRidges:true},
   {id:'launch-2-covered-right',pixel:[875,623],size:[43,94],yaw:-.598,height:3.35,twinRidges:true}
  ],
  yards:[
   {id:'vessels-north',pixel:[351,490],size:[25,65],yaw:-.4,count:4},
   {id:'vessels-west',pixel:[308,487],size:[17,39],yaw:-.4,count:3},
   {id:'vessels-middle',pixel:[326,548],size:[20,46],yaw:-.4,count:4},
   {id:'vessels-south',pixel:[341,603],size:[22,45],yaw:-.4,count:4}
  ],
  buildings:[
   {id:'small-service-row',pixel:[638,588],size:[23,48],yaw:-.6,height:3.9,parts:3},
   {id:'south-service-house',pixel:[482,830],size:[27,45],yaw:-.4,height:4.3}
  ],
  caps:[[606,414,6.6],[621,448,5.8],[587,443,5.6],[614,384,5.1]],
  paths:[[[355,850],[415,758],[504,638],[588,519],[659,405],[703,311],[744,240]],[[272,633],[384,635],[466,643],[504,638]],[[504,638],[636,689],[807,731]]],
  entryView:'central-north'
 },
 'pad-200':{
  sourcePlan:'1txB3LDU8wx-fP_hJngeWH3nIGvNlE0Zb',sourceSize:[2258,1586],reviewHeight:1000,
  shelters:[
   {id:'central-north',pixel:[779,390],size:[52,83],yaw:.82,height:4.1,front:1},
   {id:'central-middle',pixel:[675,470],size:[31,60],yaw:-.6,height:3.3,front:-1},
   {id:'central-west',pixel:[540,515],size:[35,99],yaw:.86,height:3.7,front:1},
   {id:'central-south',pixel:[629,617],size:[28,57],yaw:.84,height:3.1,front:-1}
  ],
  flankShelters:[
   {id:'launch-1-covered-left',pixel:[467,300],size:[41,84],yaw:-.691,height:3.2,twinRidges:true},
   {id:'launch-1-covered-right',pixel:[544,378],size:[39,87],yaw:-.706,height:3.4,twinRidges:true},
   {id:'launch-2-covered-left',pixel:[812,591],size:[41,91],yaw:-.646,height:3.2,twinRidges:true},
   {id:'launch-2-covered-right',pixel:[906,674],size:[40,91],yaw:-.705,height:3.35,twinRidges:true}
  ],
  yards:[
   {id:'vessels-east',pixel:[197,256],size:[24,48],yaw:-.6,count:4},
   {id:'vessels-west',pixel:[156,274],size:[19,38],yaw:-.6,count:3},
   {id:'vessels-north',pixel:[214,223],size:[18,38],yaw:-.6,count:3}
  ],
  buildings:[{id:'west-service-house',pixel:[422,588],size:[22,45],yaw:-.6,height:4.1}],
  equipmentMarkers:[{pixel:[998,680],size:[8,9],yaw:-.6,height:1.2}],
  caps:[[634,539,5.6],[674,505,4.8],[610,572,5.2]],
  paths:[[[380,736],[513,647],[595,552],[683,427],[788,331]],[[260,394],[346,367],[409,369]],[[513,647],[660,701],[812,747]]],
  entryView:'central-north'
 }
});

// Registered walkways are stored as plan polylines. No route search runs at startup.
const PHOTO_WALKWAYS=Object.freeze({
 "pad-81":[
  {"id":"plan-walk-1-1","width":2.1,"points":[[355,850],[415,758]]},
  {"id":"plan-walk-1-2","width":2.1,"points":[[415,758],[504,638]]},
  {"id":"plan-walk-1-3","width":2.1,"points":[[504,638],[588,519]]},
  {"id":"plan-walk-1-4","width":2.1,"points":[[588,519],[659,405]]},
  {"id":"plan-walk-1-5","width":2.1,"points":[[659,405],[703,311]]},
  {"id":"plan-walk-1-6","width":2.1,"points":[[703,311],[744,240]]},
  {"id":"plan-walk-2-1","width":2.1,"points":[[272,633],[384,635]]},
  {"id":"plan-walk-2-2","width":2.1,"points":[[384,635],[466,643]]},
  {"id":"plan-walk-2-3","width":2.1,"points":[[466,643],[504,638]]},
  {"id":"plan-walk-3-1","width":2.1,"points":[[504,638],[636,689]]},
  {"id":"plan-walk-3-2","width":2.1,"points":[[636,689],[807,731]]},
  {"id":"pad-81-central-north-approach","width":2,"shelterId":"pad-81-central-north","points":[[824.686488,354.74005],[804.703838,370.421094],[703,311]]},
  {"id":"pad-81-central-middle-approach","width":2,"shelterId":"pad-81-central-middle","points":[[737.477984,385.91215],[719.575649,382.253744],[659,405]]},
  {"id":"pad-81-central-south-approach","width":2,"shelterId":"pad-81-central-south","points":[[513.957373,582.913186],[504,638]]},
  {"id":"pad-81-southwest-north-approach","width":2,"shelterId":"pad-81-southwest-north","points":[[178.580305,661.7507],[200.248098,645.88829],[272,633]]},
  {"id":"pad-81-southwest-south-approach","width":2,"shelterId":"pad-81-southwest-south","points":[[274.077974,823.532985],[355,850]]},
  {"id":"pad-81-launch-1-covered-left-approach","width":2,"shelterId":"pad-81-launch-1-covered-left","points":[[437.507729,262.243013],[543.166497,316.809655],[659,405]]},
  {"id":"pad-81-launch-1-covered-right-approach","width":2,"shelterId":"pad-81-launch-1-covered-right","points":[[541.079482,314.944202],[659,405]]},
  {"id":"pad-81-launch-2-covered-left-approach","width":2,"shelterId":"pad-81-launch-2-covered-left","points":[[811.117055,508.508878],[696.424351,475.746256],[668.625188,456.727826],[659,405]]},
  {"id":"pad-81-launch-2-covered-right-approach","width":2,"shelterId":"pad-81-launch-2-covered-right","points":[[906.362217,576.960659],[921.269652,595.711462],[866.544306,676.047584],[807,731]]}
 ],
 "pad-200":[
  {"id":"plan-walk-1-1","width":2.1,"points":[[380,736],[513,647]]},
  {"id":"plan-walk-1-2","width":2.1,"points":[[513,647],[595,552]]},
  {"id":"plan-walk-1-3","width":2.1,"points":[[595,552],[683,427]]},
  {"id":"plan-walk-1-4","width":2.1,"points":[[683,427],[766.226852,340.64558],[788,331]]},
  {"id":"plan-walk-2-1","width":2.1,"points":[[260,394],[346,367]]},
  {"id":"plan-walk-2-2","width":2.1,"points":[[346,367],[409,369]]},
  {"id":"plan-walk-3-1","width":2.1,"points":[[513,647],[660,701]]},
  {"id":"plan-walk-3-2","width":2.1,"points":[[660,701],[812,747]]},
  {"id":"pad-200-central-north-approach","width":2,"shelterId":"pad-200-central-north","points":[[815.449663,424.010634],[829.119527,399.329793],[766.226852,340.64558]]},
  {"id":"pad-200-central-middle-approach","width":2,"shelterId":"pad-200-central-middle","points":[[696.655617,438.346072],[683,427]]},
  {"id":"pad-200-central-west-approach","width":2,"shelterId":"pad-200-central-west","points":[[583.843311,552.745331],[595,552]]},
  {"id":"pad-200-central-south-approach","width":2,"shelterId":"pad-200-central-south","points":[[601.55782,592.402129],[595,552]]},
  {"id":"pad-200-launch-1-covered-left-approach","width":2,"shelterId":"pad-200-launch-1-covered-left","points":[[499.090245,261.197678],[477.920233,252.540402],[422.433192,319.633253],[409,369]]},
  {"id":"pad-200-launch-1-covered-right-approach","width":2,"shelterId":"pad-200-launch-1-covered-right","points":[[577.64184,338.541934],[683,427]]},
  {"id":"pad-200-launch-2-covered-left-approach","width":2,"shelterId":"pad-200-launch-2-covered-left","points":[[844.419234,547.998642],[857.739177,566.574793],[812,747]]},
  {"id":"pad-200-launch-2-covered-right-approach","width":2,"shelterId":"pad-200-launch-2-covered-right","points":[[940.898433,632.985089],[920.249686,624.360877],[812,747]]}
 ]
});

const rect=(w,d,inset=0)=>[[-w/2-inset,-d/2-inset],[w/2+inset,-d/2-inset],[w/2+inset,d/2+inset],[-w/2-inset,d/2+inset]];
const chamfer=(w,d,c)=>[[-w/2+c,-d/2],[w/2-c,-d/2],[w/2,-d/2+c],[w/2,d/2-c],[w/2-c,d/2],[-w/2+c,d/2],[-w/2,d/2-c],[-w/2,-d/2+c]];
const transform=(g,p)=>V(...p).applyMatrix4(g.matrix).toArray();
const polygon=(g,points)=>points.map(([x,z])=>{const p=transform(g,[x,0,z]);return [p[0],p[2]];});
function anchor(parent,id,position,yaw,component){
 const g=new THREE.Group();g.name=id;g.position.fromArray(position);g.rotation.y=yaw;
 g.userData={museumComponent:component,civilId:id};parent.add(g);g.updateMatrix();return g;
}
function localQuad(k,g,points,material,tag){return k.quad(...points.map(p=>transform(g,p)),material,tag);}
function localPoly(k,g,points,y,material,tag){return k.poly(polygon(g,points),y,material,tag);}
function footProbe(g,point,expectedY){return {space:'site-local-metres',origin:transform(g,point),direction:[0,-1,0],expectedY};}

function shelter(k,root,definition,index){
 const {id,position,yaw,width:w,depth:d,height}=definition;
 const g=anchor(root,id,position,yaw,'proton-civil-shelter');
 const floorY=GRADE-(definition.sillDepth??.65),roofY=GRADE+height;
 const insetX=Math.min(w*.27,height*1.9),insetZ=Math.min(d*.18,height*2.15);
 const cw=w-insetX*2,cd=d-insetZ*2,c=Math.min(6,w*.15,d*.09),cc=Math.min(c*.58,cw*.16,cd*.12);
 const base=chamfer(w,d,c),crown=chamfer(cw,cd,cc),front=-d/2;
 const clearWidth=definition.entryWidth??(w>65?4.1:3.2),clearHeight=2.35,wall=.48;
 const passageHalf=clearWidth/2+wall,passageDepth=insetZ+3.5,approachLength=9.5;
 const frontZ=front+.95,backZ=front+passageDepth,roofUnderside=floorY+clearHeight,portalTop=roofUnderside+.4;
 // Seven intact slopes and a split entrance slope. No full hall solid or
 // uncut terrain triangle is left behind the visible recessed portal.
 for(let i=1;i<base.length;i++){
  const j=(i+1)%base.length;
  localQuad(k,g,[[base[i][0],GRADE-.04,base[i][1]],[crown[i][0],roofY,crown[i][1]],[crown[j][0],roofY,crown[j][1]],[base[j][0],GRADE-.04,base[j][1]]],'soil','earth-covered-shelter-slope');
 }
 for(const side of [-1,1]){
  const i=side<0?0:1,x=side*passageHalf;
  const points=side<0?[[base[i][0],GRADE-.04,front],[crown[i][0],roofY,crown[i][1]],[x,roofY,crown[i][1]],[x,GRADE-.04,front]]:
   [[x,GRADE-.04,front],[x,roofY,crown[i][1]],[crown[i][0],roofY,crown[i][1]],[base[i][0],GRADE-.04,front]];
  localQuad(k,g,points,'soil','shelter-slope-beside-portal');
 }
 localPoly(k,g,crown,roofY,'soil','earth-covered-shelter-crown');
 if(definition.twinRidges)for(const side of [-1,1])k.box(cw*.26,.18,cd*.84,side*cw*.25,roofY+.09,0,'concrete','paired-cover-ridge',0,g);
 localQuad(k,g,[[-passageHalf,portalTop+.08,frontZ-.25],[-passageHalf,roofY,-cd/2],[passageHalf,roofY,-cd/2],[passageHalf,portalTop+.08,frontZ-.25]],'soil','earth-over-entrance');
 // A shallow, lined approach slopes only 0.65 m below the surrounding grade.
 // The closed door is at the back of the open vestibule, never across its mouth.
 k.box(clearWidth+wall*2,.20,passageDepth+2.1,0,floorY-.10,front+(passageDepth-1.15)/2,'concrete','shelter-vestibule-floor',0,g);
 for(const side of [-1,1]){
  k.box(wall,clearHeight+.4,passageDepth,side*(clearWidth/2+wall/2),floorY+(clearHeight+.4)/2,front+passageDepth/2,'concrete','shelter-vestibule-wall',0,g);
  const low=[side*(passageHalf+.18),floorY-.1,front-1.15],high=[side*(passageHalf+.18),GRADE-.02,front-approachLength];
  localQuad(k,g,[high,[high[0],GRADE+.28,high[2]],[low[0],floorY+.5,low[2]],low],'concrete','shallow-approach-retaining-edge');
 }
 k.box(clearWidth+wall*2,.4,passageDepth,0,roofUnderside+.2,front+passageDepth/2,'concrete','shelter-vestibule-roof',0,g);
 k.box(clearWidth+wall*2,clearHeight+.4,.4,0,floorY+(clearHeight+.4)/2,backZ+.26,'concrete','shelter-vestibule-back-wall',0,g);
 k.box(clearWidth-.12,clearHeight-.12,.16,0,floorY+(clearHeight-.12)/2,backZ-.04,'green','shelter-recessed-closed-door',0,g);
 for(const side of [-1,1])k.box(.06,clearHeight-.2,.04,side*clearWidth*.23,floorY+clearHeight/2,backZ-.135,'steel','shelter-door-rib',0,g);
 k.box(.055,clearHeight-.14,.05,0,floorY+clearHeight/2,backZ-.15,'steel','shelter-door-centre-seam',0,g);
 for(const side of [-1,1])k.box(.07,.3,.10,side*.16,floorY+1.1,backZ-.21,'dark','shelter-door-handle',0,g);
 localQuad(k,g,[[-passageHalf,floorY,front-1.15],[-passageHalf,PATH_Y,front-approachLength],[passageHalf,PATH_Y,front-approachLength],[passageHalf,floorY,front-1.15]],'concrete','shelter-shallow-entrance-ramp');
 localQuad(k,g,[[-passageHalf,PATH_Y,front-approachLength],[-passageHalf,PATH_Y,front-approachLength-1.9],[passageHalf,PATH_Y,front-approachLength-1.9],[passageHalf,PATH_Y,front-approachLength]],'concrete','shelter-level-approach-landing');
 // Small concrete portal cheeks make the opening legible without making the
 // entire end of the earth mound look like an above-ground hangar facade.
 for(const side of [-1,1])k.box(.75,clearHeight+.48,1.5,side*(clearWidth/2+.38),floorY+(clearHeight+.48)/2,frontZ,'light','shelter-portal-jamb',0,g);
 k.box(clearWidth+1.5,.34,1.5,0,roofUnderside+.34,frontZ,'light','shelter-portal-lintel',0,g);
 for(let i=0;i<3+(index%3);i++){
  const x=((i%2)*2-1)*cw*.24,z=-cd*.30+i/(3+index%3)*cd*.6;
  k.cyl(.28,.65,x,roofY+.325,z,'steel','low-roof-vent',0,g);
  k.box(.85,.15,.85,x,roofY+.68,z,'light','low-roof-vent-cap',0,g);
 }
 k.box(1.7,.16,1.35,cw*.23,roofY+.09,cd*.23,'concrete','shelter-roof-inspection-hatch',0,g);
 // A few thin joints conform to the cover. They are not large repeated tiles.
 for(let z=-cd*.35;z<cd*.4;z+=Math.max(12,cd/5))k.rod([-cw*.44,roofY+.025,z],[cw*.44,roofY+.025,z],.018,'concrete','shelter-cover-joint',g);
 const cutLocal=[[-passageHalf-.2,front-approachLength-.1],[passageHalf+.2,front-approachLength-.1],[passageHalf+.2,backZ+.5],[-passageHalf-.2,backZ+.5]];
 const cutoutPolygon=polygon(g,cutLocal);k.cutouts.push({id,polygon:cutoutPolygon,source:'Photo-interpreted shallow shelter entrance; not a launch flame channel'});
 const outside=transform(g,[0,floorY+1.1,front-approachLength*.5]),inside=transform(g,[0,floorY+1.1,backZ-.9]);
 const mouth=transform(g,[0,floorY+clearHeight/2,frontZ-.8]),normal=V(0,0,-1).applyQuaternion(g.quaternion).toArray();
 const data={id,position:[...position],yaw,width:w,depth:d,floorY,roofY,gradeY:GRADE,outerFootprint:polygon(g,base),crownFootprint:polygon(g,crown),cutoutPolygon,
  entry:{centre:mouth,normal,width:clearWidth,height:clearHeight,thresholdY:floorY,depth:passageDepth,doorState:'recessed-closed',
   probe:{space:'site-local-metres',outside,inside,door:transform(g,[0,floorY+1.1,backZ-.12])}},
  floorProbe:footProbe(g,[0,floorY+1.1,front+passageDepth*.65],floorY),
  roofProbe:footProbe(g,[definition.twinRidges?0:-cw*.26,roofY+3,cd*.1],roofY),
  sideProbes:[-1,1].map(side=>({space:'site-local-metres',origin:transform(g,[0,floorY+1.1,front+passageDepth*.6]),direction:V(side,0,0).applyQuaternion(g.quaternion).toArray(),distance:clearWidth/2})),
  approach:transform(g,[0,PATH_Y,front-approachLength-1.6]),
  ramp:{space:'site-local-metres',centreline:[transform(g,[0,PATH_Y,front-approachLength-1.6]),transform(g,[0,PATH_Y,front-approachLength]),transform(g,[0,floorY,front-1.15])]},
  dimensionsBasis:'existing calibrated plan footprint; cover height, portal and shallow sill are photographic interpretation'};
 const rampObstacle=polygon(g,[[-passageHalf-1.2,front-approachLength-.15],[passageHalf+1.2,front-approachLength-.15],[passageHalf+1.2,backZ+.5],[-passageHalf-1.2,backZ+.5]]);
 g.userData.shelterId=id;g.userData.profile=data;return {data,g,obstacle:polygon(g,rect(w,d,1.5)),rampObstacle};
}

function surfaceBuilding(k,root,d){
 const g=anchor(root,d.id,d.position,d.yaw,'proton-civil-surface-building'),parts=d.parts||1;
 const sectionWidth=d.width/parts,roomW=sectionWidth*(parts>1?.82:1),roomD=d.depth*(parts>1?.72:1),h=d.height;
 for(let part=0;part<parts;part++){
  const x=(part-(parts-1)/2)*sectionWidth;
  k.box(roomW,h,roomD,x,GRADE+h/2,0,'wall','surface-service-building',0,g);
  k.box(roomW+.6,.25,roomD+.6,x,GRADE+h+.125,0,'roof','surface-service-building-roof',0,g);
  for(const side of [-1,1])for(let z=-roomD/2+3;z<roomD/2-1;z+=6.3){
   k.box(.08,1.25,1.7,x+side*(roomW/2+.05),GRADE+2.2,z,'glass','surface-service-window',0,g);
   k.box(.13,.12,1.85,x+side*(roomW/2+.09),GRADE+1.5,z,'light','surface-window-sill',0,g);
  }
  k.box(1.35,2.2,.10,x,GRADE+1.1,-roomD/2-.06,'green','surface-service-door',0,g);
  k.box(2.4,.11,1.4,x,GRADE+.055,-roomD/2-.65,'concrete','surface-service-doorstep',0,g);
 }
 return {data:{id:d.id,position:d.position,yaw:d.yaw,width:d.width,depth:d.depth,height:h,parts,footprint:polygon(g,rect(d.width,d.depth))},obstacle:polygon(g,rect(d.width,d.depth,1.5))};
}

function equipmentYard(k,root,d){
 const g=anchor(root,d.id,d.position,d.yaw,'proton-civil-equipment-yard');
 k.box(d.width,.16,d.depth,0,GRADE+.08,0,'concrete','equipment-yard-slab',0,g);
 const length=Math.min(25,d.depth*.65),r=Math.min(2.1,d.width/(d.count*2.6));
 for(let i=0;i<d.count;i++){
  const x=(i-(d.count-1)/2)*(d.width/(d.count+.25));
  k.cyl(r,length,x,GRADE+r+.65,0,'blue','horizontal-utility-vessel',Math.PI/2,g);
  for(const side of [-1,1]){
   k.box(r*2+.5,.7,1.1,x,GRADE+.35,side*length*.34,'light','utility-vessel-saddle',0,g);
   k.cyl(r*.78,.10,x,GRADE+r+.65,side*(length/2+.06),'light','utility-vessel-end',Math.PI/2,g);
  }
  k.rod([x,GRADE+r+.65,length/2],[x,GRADE+1,length/2+2.1],.12,'steel','utility-yard-pipe',g);
 }
 for(const x of [-d.width/2,d.width/2])for(const z of [-d.depth/2,d.depth/2])k.box(.25,1.1,.25,x,GRADE+.55,z,'steel','equipment-yard-corner-post',0,g);
 return {data:{id:d.id,position:d.position,yaw:d.yaw,width:d.width,depth:d.depth,vessels:d.count,footprint:polygon(g,rect(d.width,d.depth))},obstacle:polygon(g,rect(d.width,d.depth,1.5))};
}

export function buildProtonCivil(siteRoot,{siteId,planOrigin,metresPerPixel}){
 const layout=PROTON_CIVIL_LAYOUT[siteId];if(!layout)throw new Error('Unknown Proton civil plan '+siteId);
 const root=new THREE.Group();root.name='Протон · обвалованные сооружения и дорожки';root.userData.museumComponent='proton-civil';siteRoot.add(root);
 const k=archiveKit(root),P=([x,z])=>[(x-planOrigin[0])*metresPerPixel,(z-planOrigin[1])*metresPerPixel];
 for(const [key,color]of Object.entries({soil:'#a5a194',concrete:'#afafa2',wall:'#b8b9ae',light:'#c3c4b8',roof:'#627675',blue:'#608c92',green:'#4b6252',asphalt:'#797a6c'}))k.mat[key].color.set(color);
 const plan=d=>({...d,id:siteId+'-'+d.id,position:[P(d.pixel)[0],0,P(d.pixel)[1]],width:d.size[0]*metresPerPixel,depth:d.size[1]*metresPerPixel,yaw:d.yaw+(d.front===1?Math.PI:0)});
 const shelters=[],surfaceBuildings=[],yards=[],paths=[];
 const definitions=[...layout.shelters,...(layout.flankShelters||[])].map(plan);
 // Replace only the map's generic paired vaults. These envelopes are attached
 // to the unchanged launch/tower-track frames; the standalone viewer is intact.
 if(!layout.flankShelters)for(const [launchIndex,launch]of siteRoot.children.filter(g=>g.userData.protonLaunch).entries()){
  launch.updateMatrix();
  for(const side of [-1,1]){
   const width=side<0?37:39,depth=launchIndex?88:98,z=launchIndex?104:111;
   const p=V(side*44,0,z).applyMatrix4(launch.matrix);
   definitions.push({id:`${siteId}-launch-${launchIndex+1}-covered-${side<0?'left':'right'}`,position:p.toArray(),yaw:launch.rotation.y,
    width,depth,height:side<0?3.1:3.35,sillDepth:.55,entryWidth:3.3,twinRidges:true,dimensionsBasis:'launch-adjacent earth-covered forms in owner photos; indicative envelope'});
  }
 }
 for(const [index,d]of definitions.entries()){const built=shelter(k,root,d,index);shelters.push(built.data);}
 for(const d of layout.buildings.map(plan)){const built=surfaceBuilding(k,root,d);surfaceBuildings.push(built.data);}
 for(const d of layout.yards.map(plan)){const built=equipmentYard(k,root,d);yards.push(built.data);}
 for(const d of layout.equipmentMarkers||[]){
  const [x,z]=P(d.pixel);k.box(d.size[0]*metresPerPixel,d.height,d.size[1]*metresPerPixel,x,GRADE+d.height/2,z,'blue','small-surface-equipment-enclosure',d.yaw);
 }
 for(const [index,[px,pz,radius]]of layout.caps.entries()){
  const [x,z]=P([px,pz]),r=radius*metresPerPixel;
  k.cyl(r,.9,x,GRADE+.45,z,'concrete','low-circular-utility-cover');k.sphere(r,x,GRADE+.88,z,'light','shallow-utility-cover-crown',[1,.16,1]);
  k.cyl(.28,.7,x,GRADE+r*.16+1.2,z,'steel','utility-cover-vent');
 }
 const addPath=(id,points,width=1.9)=>{
  if(!points||points.length<2)return;
  for(let i=1;i<points.length;i++){
   k.path([points[i-1],points[i]],width+.35,PATH_Y-.035,'soil','civil-footpath-shoulder');
   k.path([points[i-1],points[i]],width,PATH_Y,'concrete','civil-footpath');
  }
  for(const [x,z]of points)k.poly(Array.from({length:12},(_,i)=>[x+Math.cos(i*Math.PI/6)*width*.5,z+Math.sin(i*Math.PI/6)*width*.5]),PATH_Y,'concrete','civil-footpath-junction');
  const samples=[];for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/5));
   for(let j=0;j<n;j++){const t=j/n;samples.push([a[0]+(b[0]-a[0])*t,PATH_Y,a[1]+(b[1]-a[1])*t]);}
  }samples.push([points.at(-1)[0],PATH_Y,points.at(-1)[1]]);
  paths.push({id,space:'site-local-metres',width,topY:PATH_Y,centreline:points.map(p=>[p[0],PATH_Y,p[1]]),samples});
 };
 for(const path of PHOTO_WALKWAYS[siteId]){
  addPath(path.id,path.points.map(P),path.width);
  if(path.shelterId){const s=shelters.find(s=>s.id===path.shelterId);if(s)s.pathId=path.id;}
 }
 const report=k.finish();root.updateWorldMatrix(true,true);
 const geometryBounds=new THREE.Box3();root.traverse(mesh=>{if(!mesh.isMesh)return;mesh.geometry.computeBoundingBox();if(mesh.isInstancedMesh){const matrix=new THREE.Matrix4();for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);geometryBounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));}}else{mesh.updateMatrix();geometryBounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix));}});
 const centre=geometryBounds.getCenter(V()),size=geometryBounds.getSize(V()),span=Math.max(size.x,size.z);
 const entry=shelters.find(s=>s.id===siteId+'-'+layout.entryView)||shelters[0],entryAnchor=root.getObjectByName(entry.id);
 const target=transform(entryAnchor,[0,1,-entry.depth/2+4]);
 const entryEye=transform(entryAnchor,[entry.width*.72,Math.max(43,entry.width*.72),-entry.depth/2-Math.max(64,entry.width*1.2)]);
 const entryFrame=[[-entry.width*.45,GRADE,-entry.depth/2-11],[entry.width*.45,GRADE,-entry.depth/2-11],[-entry.width*.35,entry.roofY,-entry.depth/2+entry.depth*.32],[entry.width*.35,entry.roofY,-entry.depth/2+entry.depth*.32]].map(p=>transform(entryAnchor,p));
 const planFrame=[geometryBounds.min.x,geometryBounds.max.x].flatMap(x=>[geometryBounds.min.z,geometryBounds.max.z].map(z=>[x,GRADE,z]));
 const data={version:PROTON_CIVIL_VERSION,siteId,units:'metres',gradeY:GRADE,rootName:root.name,
  planCalibration:{origin:[...planOrigin],metresPerPixel,sourcePlan:layout.sourcePlan,sourceSize:layout.sourceSize,reviewHeight:layout.reviewHeight,absoluteMapAnchorSurveyed:false},
  shelters,surfaceBuildings,yards,paths,features:report.features,viewBounds:{min:geometryBounds.min.toArray(),max:geometryBounds.max.toArray()},
  views:{'civil-entry':{shelterId:entry.id,target,eye:entryEye,framePoints:entryFrame},'civil-plan':{target:[centre.x,2,centre.z],eye:[centre.x+span*.12,span*.9,centre.z+span*.55],framePoints:planFrame}},
  references:{folder:sourceFolder,plans:[layout.sourcePlan],ownerPhotoDate:'2026-11-11',uniqueNewPhotos:5},
  interpretation:'Earth-covered volumes and separate low service buildings follow the owner photographs and registered satellite plans. Cover heights, shallow sill depths and hidden vestibules are visual interpretation; individual functions and current operating status are not assigned.',
  legacyMapVaultsReplaced:true,sourceVehicleAndLaunchGeometryChanged:false};
 siteRoot.userData.protonCivil=data;root.userData.protonCivil=data;return {...report,model:data};
}
