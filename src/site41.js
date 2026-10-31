import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261031-facilities-rails-lighting-v1';
import {SITE41_VERSION,SITE41_REFERENCE,SITE41_ACCESS,SITE41_VIEWS,site41ImagePoint as P} from './site41-profile.js?v=20261031-facilities-rails-lighting-v1';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const PATHS=[
 [[1200,1020],[1198,946],[1190,820],[1176,691],[1150,592]],
 [[1150,592],[1053,532],[953,474],[899,441],[866,393],[864,323],[887,270],[928,237],[1003,218],[1149,191]],
 [[1149,191],[1130,229],[1125,311],[1136,445],[1150,592]],
 [[1150,592],[1221,508],[1277,419],[1308,357],[1320,302],[1314,236],[1297,180],[1259,161],[1196,179],[1149,191]],
 [[1259,161],[1333,142],[1437,122],[1554,111],[1622,108]],
 [[1308,357],[1411,369],[1511,350],[1542,318]],
 [[1542,318],[1525,232],[1521,171],[1554,111],[1610,108],[1640,144],[1659,226],[1675,307],[1650,368],[1601,405],[1557,410],[1542,318]],
 [[1150,592],[1166,670],[1109,699],[986,713],[940,702],[919,671],[922,640],[899,623],[866,628],[849,650],[858,678],[886,691],[919,671]],
 [[986,713],[947,731],[920,753],[925,779],[955,815],[953,834],[921,848],[882,837],[875,790],[888,764],[920,753]],
 [[1308,357],[1245,333],[1239,256],[1235,205],[1196,179]],
 [[1511,350],[1525,466],[1544,602],[1575,770],[1588,899]],
 [[1176,691],[1285,675],[1434,646],[1544,602]]
];
const padPolygons=[
 [[867,300],[924,296],[974,315],[974,389],[927,390],[876,407],[858,363]],
 [[1265,230],[1313,217],[1353,249],[1354,327],[1316,357],[1281,333]]
];
function curvePoints(points,closed=false){
 const ps=points.map(p=>V(...[p[0],.12,p[1]]));
 const curve=new THREE.CatmullRomCurve3(ps,closed,'centripetal');
 return curve.getSpacedPoints(Math.max(12,Math.ceil(curve.getLength()/2))).map(p=>[p.x,p.z]);
}
function inside(p,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
 const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;
}return c;}
const hash=(a,b=0)=>{let n=Math.imul(a+31,374761393)^Math.imul(b+17,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};

/** Current memorial/ruin ensemble, traced from the owner's overhead image.
 * Hidden structures and distances are interpreted; no active launcher or
 * fictitious illumination mast is added to this abandoned site. */
export function buildSite41(root){
 const k=archiveKit(root),roads=[],parts=[];
 const [mx,mz]=P([916,353]),rim=4.4,wellBounds=[mx-rim,mx+rim,mz-4.7,mz+4.7];
 k.mat.granite=new THREE.MeshStandardMaterial({color:0x944d3d,roughness:.72});
 k.mat.aged=new THREE.MeshStandardMaterial({color:0xb9b09b,roughness:1});
 k.mat.faded=new THREE.MeshStandardMaterial({color:0x918a77,roughness:1});
 k.mat.chalk=new THREE.MeshStandardMaterial({color:0xe1d8bf,roughness:1});
 k.mat.blackened=new THREE.MeshStandardMaterial({color:0x302e29,roughness:.9});
 const solid=(name,bounds)=>parts.push({name,bounds});
 function textPlate(lines,x,y,z,w,h,{color='#e9dfc8',background='#864a3b',size=42,yaw=0,tilt=0}={}){
  let texture;
  if(typeof document!=='undefined'){
   const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
   const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,1024,512);
   ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 '+size+'px Georgia';
   const spacing=Math.min(90,420/Math.max(1,lines.length));lines.forEach((s,i)=>ctx.fillText(s,512,256+(i-(lines.length-1)/2)*spacing,954));
   texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  }else{texture=new THREE.DataTexture(new Uint8Array([148,77,61,255]),1,1);texture.needsUpdate=true;}
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,roughness:.85,side:THREE.DoubleSide}));
  mesh.position.set(x,y,z);mesh.rotation.set(tilt,yaw,0);mesh.name='Площадка 41 · надпись';mesh.userData.site41Text=[...lines];root.add(mesh);
 }
 function polygon(points,y=.13,material='concrete',tag='launch-apron',hole=null){
  const poly=points.map(P);
  if(hole){
   const shape=new THREE.Shape(poly.map(([x,z])=>new THREE.Vector2(x,-z))),[left,right,near,far]=hole;
   shape.holes.push(new THREE.Path([[left,near],[right,near],[right,far],[left,far]].map(([x,z])=>new THREE.Vector2(x,-z))));
   const mesh=k.direct(new THREE.ShapeGeometry(shape),material,tag);mesh.rotation.x=-Math.PI/2;mesh.position.y=y;
  }else k.poly(poly,y,material,tag);
  return poly;
 }
 function panelGrid(poly,spacing=4.4,hole=null){
  const xs=poly.map(p=>p[0]),zs=poly.map(p=>p[1]);let count=0;
  for(let x=Math.min(...xs)+spacing/2;x<Math.max(...xs);x+=spacing)for(let z=Math.min(...zs)+spacing/2;z<Math.max(...zs);z+=spacing){
   const r=spacing*.47,corners=[[-r,-r],[r,-r],[r,r],[-r,r]].map(([a,b])=>[x+a,z+b]);if(!corners.every(p=>inside(p,poly)))continue;
   if(hole&&x+r>hole[0]&&x-r<hole[1]&&z+r>hole[2]&&z-r<hole[3])continue;
   const tone=hash(Math.round(x*11),Math.round(z*11));
   k.box(spacing*.94,.055,spacing*.94,x,.175,z,tone>.75?'aged':tone>.35?'concrete':'faded','weathered-concrete-panel');
   if(tone>.84)k.path([[x-r,z-r*.6],[x-r*.15,z+r*.1],[x+r*.5,z+r]],.055,.207,'dark','panel-crack');
   count++;
  }
  return count;
 }
 for(const trace of PATHS){
  const points=curvePoints(trace.map(P)),width=6;
  k.path(points,width+1.1,.045,'soil','soft-road-shoulder');
  k.path(points,width,.12,'faded','site41-access-road');roads.push({points,width,topY:.12});
 }
 const west=polygon(padPolygons[0],.13,'concrete','west-launch-apron',wellBounds),east=polygon(padPolygons[1]);
 const panels=panelGrid(west,4.4,wellBounds)+panelGrid(east);
 for(const p of [[1311,283]]){
  const[x,z]=P(p);k.cyl(4.6,.34,x,.25,z,'aged','launch-plinth');
  for(let i=0;i<8;i++){const a=i*Math.PI/4;k.box(.55,.55,.55,x+4*Math.cos(a),.7,z+4*Math.sin(a),'rust','surviving-launch-anchor');}
 }

 // West start: the red granite memorial and original circular launch base.
 k.cutouts.push({x:mx,z:mz,rx:rim,rz:4.7,shape:'rectangle'});
 k.box(8.8,.2,9.4,mx,-1.35,mz,'blackened','memorial-well-floor');
 for(const side of [-1,1]){
  k.box(.45,1.3,9.4,mx+side*rim,-.55,mz,'aged','memorial-well-wall');
  k.box(8.8,1.3,.45,mx,-.55,mz+side*4.7,'aged','memorial-well-wall');
  k.box(.15,.18,9.6,mx+side*(rim+.04),.19,mz,'blackened','memorial-steel-rim');
  k.box(9.1,.18,.15,mx,.19,mz+side*4.74,'blackened','memorial-steel-rim');
 }
 k.cyl(3.1,.3,mx,-.94,mz+.5,'chalk','original-circular-launch-base');
 for(let i=0;i<6;i++){const a=i*Math.PI/3;k.rod([mx,-.755,mz+.5],[mx+3.03*Math.cos(a),-.755,mz+.5+3.03*Math.sin(a)],.055,'blackened','launch-base-radial-rib');}
 k.cyl(.24,.17,mx,-.7,mz+.5,'blackened','launch-base-central-hole');
 for(const side of[-1,1])k.box(1.4,.7,1.3,mx+side*3.0,-.8,mz-2.35,'blackened','original-launch-support');
 const stelaShape=new THREE.Shape();[[-4.0,0],[-2.2,0],[-2.2,5.8],[-3.65,6.6],[-4,5.95]].forEach(([x,y],i)=>i?stelaShape.lineTo(x,y):stelaShape.moveTo(x,y));stelaShape.closePath();
 const stela=k.direct(new THREE.ExtrudeGeometry(stelaShape,{depth:.34,bevelEnabled:false}),'granite','memorial-tall-stela');stela.position.set(mx,.22,mz-4.8);
 k.box(6.4,2.9,.34,mx+1.0,1.68,mz-4.63,'granite','memorial-name-wall');
 k.box(10.0,.28,1.2,mx-.2,.12,mz-4.6,'blackened','memorial-plinth');
 textPlate(['ПАМЯТИ','ПОГИБШИХ','ИСПЫТАТЕЛЕЙ','24 ОКТЯБРЯ','1960 ГОДА'],mx-3.06,3.05,mz-4.44,1.55,4.25,{size:61});
 textPlate(['ОНИ ПОГИБЛИ НА БОЕВОМ ПОСТУ','24 ОКТЯБРЯ 1960 ГОДА','ПАМЯТЬ О ПЕРВОПРОХОДЦАХ БАЙКОНУРА'],mx+1.0,2.1,mz-4.43,6.05,1.3,{size:35});
 // Small engraved rows preserve the panel's visual density without
 // inventing a list of names that cannot be read from the supplied photo.
 for(let col=0;col<5;col++)for(let row=0;row<13;row++)k.box(.75+hash(col,row)*.22,.018,.012,mx-1.2+col*1.12,.56+row*.09,mz-4.439,'chalk','memorial-engraved-row');
 for(let i=0;i<13;i++)k.sphere(.055,mx-4.3+i*.7,.34,mz-3.9,'red','memorial-flowers',[1,.7,1]);
 const plaque=new THREE.Mesh(new THREE.BoxGeometry(1.65,2.2,.13),k.mat.granite);plaque.position.set(mx,-.2,mz-1.75);plaque.rotation.x=-.32;plaque.name='Памятная наклонная плита';root.add(plaque);
 textPlate(['ИСПЫТАТЕЛЯМ','РАКЕТНОЙ ТЕХНИКИ','ВЕЧНАЯ ПАМЯТЬ'],mx,.0,mz-1.60,1.55,1.8,{size:48,tilt:-.32});
 for(const x of[-4.55,4.55]){for(const z of[-3.9,0,3.9])k.rod([mx+x,.22,mz+z],[mx+x,1.1,mz+z],.045,'rust','memorial-railing-post');k.rod([mx+x,1.1,mz-4],[mx+x,1.1,mz+4],.045,'rust','memorial-railing');}
 solid('memorial',{min:[mx-5,-1.5,mz-5.5],max:[mx+5,6.9,mz+5]});

 // Low concrete command post, its slit window and surviving protective bars.
 const [cx,cz]=P([962,405]);
 k.box(7.4,.25,6.5,cx,.02,cz,'concrete','command-post-floor');
 k.box(7.4,3.2,.55,cx,1.6,cz-3.0,'aged','command-post-rear-wall');
 for(const s of[-1,1])k.box(.55,3.2,5.6,cx+s*3.45,1.6,cz-.2,'aged','command-post-side-wall');
 k.box(7.0,1.25,.55,cx,.625,cz+2.8,'aged','command-post-window-sill');
 k.box(7.0,.95,.55,cx,2.725,cz+2.8,'aged','command-post-window-lintel');
 for(const s of[-1,1])k.box(1.25,1.0,.55,cx+s*2.875,1.75,cz+2.8,'aged','command-post-window-jamb');
 for(let x=-2.2;x<=2.21;x+=.28)k.box(.045,.98,.12,cx+x,1.75,cz+2.75,'rust','command-window-bars');
 const roof=k.direct(new THREE.CylinderGeometry(4.0,4.17,.46,8),'aged','command-post-low-roof');roof.scale.z=.86;roof.position.set(cx,3.36,cz);roof.rotation.y=Math.PI/8;
 k.box(2.0,.07,2.0,cx,-.01,cz-.5,'blackened','command-post-floor-hatch');
 for(const x of[-1,1]){k.rod([cx+x,.2,cz-.5],[cx+x,1.4,cz-.5],.04,'rust','hatch-railing');k.rod([cx+x,1.4,cz-.5],[cx+x,1.4,cz-2],.04,'rust','hatch-railing');}
 textPlate(['ПОСТ','УПРАВЛЕНИЯ','«УТЮГ»'],cx,2.82,cz+3.1,1.15,.75,{size:62});
 for(let i=0;i<13;i++){const x=cx-3.2+6.4*hash(i,2);k.path([[x,cz+3.085],[x+.18,cz+3.086]],.025,.05,'dark','weathering-trace');}
 solid('command-post',{min:[cx-4.2,0,cz-3.7],max:[cx+4.2,3.8,cz+3.7]});

 // A separate observation shelter visible in DSC_7587, with actual openings.
 const [hx,hz]=P([943,319]);
 k.box(5.6,.2,4.2,hx,.05,hz,'aged','observation-floor');
 k.box(5.6,1.05,.35,hx,.62,hz+2.0,'aged','observation-sill');
 k.box(5.6,.45,.35,hx,2.85,hz+2.0,'aged','observation-lintel');
 for(const x of[-2.6,-.9,.9,2.6])k.box(.4,1.6,.35,hx+x,1.92,hz+2.0,'aged','observation-jamb');
 for(const x of[-2.6,2.6])k.box(.4,3.05,4.1,hx+x,1.55,hz,'aged','observation-side');
 k.box(5.6,.25,4.2,hx,3.14,hz,'aged','observation-roof');
 k.box(5.6,3.0,.35,hx,1.55,hz-2,'aged','observation-back');
 for(const side of[-1,1])for(let i=0;i<5;i++)k.box(.035,1.3,.08,hx+side*1.75+(i-2)*.22,1.92,hz+2.01,'rust','observation-window-bars');

 function ruin(pixel,w=29,d=16){
  const [x,z]=P(pixel);k.box(w,.24,d,x,.02,z,'concrete','ruin-floor');
  for(const s of[-1,1])k.box(.55,4.1,d,x+s*w/2,2.05,z,'aged','ruin-sidewall');
  k.box(w,4.1,.55,x,2.05,z-d/2,'aged','ruin-backwall');
  for(const dx of[-w/2,-w/6,w/6,w/2])k.box(.8,4.1,.7,x+dx,2.05,z+d/2,'chalk','ruin-front-jamb');
  k.box(w,.55,.75,x,4.1,z+d/2,'aged','ruin-cracked-lintel');
  for(const s of[-1,1])k.poly([[x+s*w/2,z-d/2],[x+s*(w/2-3),z-d/2],[x+s*(w/2-5),z-d/2+4],[x+s*(w/2-1),z+d/2]],4.4,'concrete','broken-roof-edge');
  for(let i=0;i<39;i++){
   const dx=(hash(i,11)-.5)*(w+5),dz=(hash(i,12)-.5)*(d+5),h=.1+hash(i,13)*.55;
   k.box(.2+hash(i,14)*1.6,h,.2+hash(i,15)*1.1,x+dx,h/2+.12,z+dz,i%3?'concrete':'chalk','fallen-masonry',hash(i,16)*Math.PI);
  }
  for(let i=0;i<12;i++)k.rod([x-w/2+2+i*w/13,4.35,z+d/2],[x-w/2+2.2+i*w/13,4.9+hash(i,20),z+d/2-.4],.025,'rust','exposed-reinforcement');
  for(const dx of[-8,4]){
   k.box(2.6,1.8,5.2,x+dx,1.45,z,'faded','abandoned-vehicle-shell');
   k.box(2.55,.8,.04,x+dx,1.9,z+2.63,'dark','abandoned-vehicle-windscreen');
   k.box(2.45,.1,5.0,x+dx,2.38,z,'rust','abandoned-vehicle-roof');
   for(const sx of[-1,1])for(const sz of[-1,1])k.rod([x+dx+sx*1.3-.08,.45,z+sz*1.7],[x+dx+sx*1.3+.08,.45,z+sz*1.7],.42,'dark','abandoned-vehicle-wheel');
  }
  solid('ruined-service-building',{min:[x-w/2-3,0,z-d/2-3],max:[x+w/2+3,5.4,z+d/2+3]});
 }
 ruin([1455,382],30,16);
 for(const [p,w,d]of[[[1450,190],15,21],[[1437,300],18,15],[[1589,181],16,18],[[1618,260],17,25]]){
  const[x,z]=P(p);k.box(w,.25,d,x,.08,z,'concrete','service-building-foundation');
  for(const side of[-1,1])k.box(.45,1.0,d,x+side*w/2,.62,z,'aged','low-surviving-wall');
  k.box(w,1.2,.45,x,.72,z-d/2,'aged','low-surviving-wall');
 }
 for(const p of[[899,656],[916,805]]){const[x,z]=P(p);k.box(25,.2,29,x,.1,z,'aged','auxiliary-concrete-apron');panelGrid([[x-12,z-14],[x+12,z-14],[x+12,z+14],[x-12,z+14]]);}
 // Sparse surviving scrub grows beside the structures, not through roads.
 for(let i=0;i<34;i++){
  const c=parts[i%parts.length].bounds,x=c.min[0]+hash(i,61)*(c.max[0]-c.min[0]),z=c.max[2]+1.1+hash(i,62)*2.5;
  for(let j=0;j<3;j++)k.rod([x,.1,z],[x+(hash(i,j)-.5)*1.3,.8+hash(j,i),z+(hash(j+3,i)-.5)],.022,'rust','dry-steppe-scrub');
 }
 const result=k.finish();
 const physical={units:'metres',localScale:1,dimensionsSurveyed:false,compactSitePlan:true,displayShiftMap:SITE41_ACCESS.displayShiftMap,
  interpretation:'Overhead layout and surviving structures interpreted from owner photographs; original OSM anchor retained separately.'};
 root.userData.physicalUnits=physical;
 root.userData.site41={version:SITE41_VERSION,reference:SITE41_REFERENCE,views:SITE41_VIEWS,roadPort:[...SITE41_ACCESS.road],
  roadWidthMetres:SITE41_ACCESS.roadWidthMetres,roads,components:parts,launchAreas:2,memorials:1,commandPosts:1,panels,physical};
 return {...result,version:SITE41_VERSION,launchAreas:2,memorials:1,commandPosts:1,photoCount:7,reference:SITE41_REFERENCE,physical};
}
