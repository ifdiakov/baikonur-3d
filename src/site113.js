import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';
import {SITE113_VERSION,SITE113_REFERENCE,SITE113_BUILDINGS,SITE113_PATHS,SITE113_VIEWS,site113Pixel} from './site113-layout.js?v=20261105-site113-town-v1';

export function buildSite113(root){
 const k=archiveKit(root),P=site113Pixel;
 for(const [key,c]of Object.entries({wall:0xb9b7a7,light:0xc8c9c1,concrete:0x949487,roof:0x777e79,dark:0x292f2c,glass:0x475953,rust:0x875239,steel:0x718a89,soil:0x978a6c,asphalt:0x555751,green:0x76784d,blue:0x658b92}))k.mat[key].color.setHex(c);
 const box=(parent,w,h,d,x,y,z,m,tag)=>k.box(w,h,d,x,y,z,m,tag,0,parent);
 const blocks=[];
 for(const [i,b]of SITE113_BUILDINGS.entries()){
  const g=new THREE.Group();g.position.set(b.position[0],0,b.position[1]);g.rotation.y=b.yaw;root.add(g);
  const {length:w,depth:d,floors}=b,h=floors*3.05+.6,wall=b.family==='panel'?'light':'wall';
  box(g,w,h,d,0,h/2,0,wall,'site113-residential-block');
  box(g,w+.24,.22,d+.24,0,h+.11,0,'roof','site113-flat-roof');
  box(g,w,.7,d+.08,0,.35,0,'concrete','site113-weathered-plinth');
  for(const s of [-1,1]){
   box(g,w,.32,.18,0,h+.15,s*d/2,'concrete','site113-parapet');
   const n=Math.max(6,Math.round(w/2.6)),step=w/(n+.6);
   for(let c=0;c<n;c++){
    const x=-w/2+step*(c+.8),balcony=b.family==='panel'&&c%5===2;
    for(let f=0;f<floors;f++){
     const y=2.05+f*3.05,z=s*(d/2+.055),broken=(i*17+c*7+f*11+s)%7!==0;
     box(g,balcony?1.85:1.35,balcony?2.2:1.65,.11,x,y,z,broken?'dark':'glass','site113-window-opening');
     if(!broken||c%4===0){box(g,.07,1.7,.13,x,y,z+s*.07,'concrete','site113-window-mullion');box(g,1.4,.08,.18,x,y-.87,z+s*.09,'light','site113-window-sill');}
     if(balcony&&f>0){
      box(g,2.05,.15,1.35,x,y-1.15,s*(d/2+.65),'concrete','site113-balcony-slab');
      if((c+f+i)%4!==0)box(g,2,.73,.12,x,y-.7,s*(d/2+1.3),'wall','site113-balcony-panel');
      box(g,.15,2.8,1.3,x-1.02,y-.0,s*(d/2+.66),'concrete','site113-balcony-divider');
     }
    }
    if(b.family==='panel'&&c%2===0)box(g,.045,h,.025,x+step*.47,h/2,s*(d/2+.018),'concrete','site113-panel-joint');
   }
   for(let f=1;f<floors;f++)box(g,w,.055,.027,0,f*3.05+.52,s*(d/2+.02),'concrete','site113-floor-seam');
  }
  // Blank end panels, inset stair windows and entrances are different from
  // the repetitive long facade: the reference blocks are not warehouse halls.
  for(const s of [-1,1]){
   for(let f=0;f<floors;f++)box(g,.13,1.7,1.5,s*(w/2+.07),2.1+f*3.05,0,'dark','site113-stair-window');
   for(let z=-d/2+2;z<d/2;z+=3.1)box(g,.035,h,.045,s*(w/2+.02),h/2,z,'concrete','site113-end-panel-joint');
  }
  for(let x=-w/2+5;x<w/2-2;x+=13){
   box(g,1.6,2.2,.15,x,1.1,d/2+.08,'dark','site113-entry');
   box(g,2.4,.15,1.6,x,2.45,d/2+.7,'concrete','site113-entry-canopy');
   box(g,1.1,.9,1.1,x,h+.65,0,'concrete','site113-vent');
  }
  blocks.push({...b,height:h});
 }
 // Low community frontage west of the residential rows, following the crop.
 const civic=new THREE.Group();const cp=P([425,355]);civic.position.set(cp[0],0,cp[1]);civic.rotation.y=Math.PI/4;root.add(civic);
 box(civic,27,7.8,22,0,3.9,0,'wall','site113-community-building');
 box(civic,28,.3,23,0,8.05,0,'roof','site113-community-roof');
 box(civic,16,3.2,6,0,1.6,13,'glass','site113-community-foyer');
 box(civic,18,.25,8,0,3.55,13,'concrete','site113-community-canopy');
 for(let x=-10;x<=10;x+=2.5)box(civic,1.6,3,.1,x,4.7,11.08,'dark','site113-community-window');

 // Keep the calibrated streets BETWEEN houses, not along their centres.
 // Pavement -2.675 clears detailed ground (-2.705) by 30 mm.
 for(const road of SITE113_PATHS)k.path(road.map(P),3.4,.32,'asphalt','site113-internal-ad');
 for(const [u,v,w,d]of [[919,340,70,57],[933,486,76,62],[1004,287,31,27]]){
  const [x,z]=P([u,v]);k.box(w*.319,.12,d*.319,x,.08,z,'concrete','site113-court',Math.PI/4);
 }
 // Open-air shell from the owner photographs: rusted half-cylinder, exposed
 // ribs, a low stage and a clear opening. No full rocket is invented here.
 const stage=new THREE.Group();const sp=P([919,340]);stage.position.set(sp[0],0,sp[1]);stage.rotation.y=-Math.PI/4;root.add(stage);
 stage.updateMatrix();
 const face=(points,material,tag)=>k.quad(...points.map(p=>new THREE.Vector3(...p).applyMatrix4(stage.matrix).toArray()),material,tag);
 const radius=6.2,depth=4.7,base=.35,segments=16;
 box(stage,13,.35,7,0,.175,0,'concrete','site113-stage-platform');
 for(let i=0;i<segments;i++){
  const a=i/segments*Math.PI,b=(i+1)/segments*Math.PI;
  const pt=(r,t,z)=>[r*Math.cos(t),base+r*Math.sin(t),z];
  face([pt(radius,a,-depth/2),pt(radius,b,-depth/2),pt(radius,b,depth/2),pt(radius,a,depth/2)],i%5===0?'concrete':'rust','site113-stage-shell');
  face([pt(radius-.1,a,depth/2),pt(radius-.1,b,depth/2),pt(radius-.1,b,-depth/2),pt(radius-.1,a,-depth/2)],'dark','site113-stage-inner');
  for(const z of [-depth/2,depth/2])k.rod(pt(radius-.13,a,z),pt(radius-.13,b,z),.055,'steel','site113-stage-rib',stage);
 }
 for(const x of [-4,0,4])box(stage,3.9,2.4,.15,x,1.55,-depth/2,'blue','site113-stage-back-panel');
 // Painted above-ground heating mains on individual concrete supports.
 const pipeRoutes=[[[553,479],[572,502],[813,745]],[[464,648],[636,822]],[[761,391],[939,563]],[[835,272],[1014,451]]];
 for(const route of pipeRoutes){const pts=route.map(P);for(let i=1;i<pts.length;i++){
  const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
  for(const s of [-1,1])k.rod([a[0]+nx*s*.34,1.1,a[1]+nz*s*.34],[b[0]+nx*s*.34,1.1,b[1]+nz*s*.34],.16,'steel','site113-heating-pipe');
  for(let t=0;t<len;t+=5.8){const x=a[0]+dx*t/len,z=a[1]+dz*t/len;k.box(.45,.9,1.55,x,.45,z,'concrete','site113-pipe-support',-Math.atan2(dz,dx));}
 }}
 // A few surviving utility portals and leafless courtyard trees. They are
 // instanced with the rest of the district, without individual textures.
 for(const [u,v]of [[668,631],[853,446]]){const[x,z]=P([u,v]);for(const dx of [-2,2])k.rod([x+dx,0,z],[x+dx,5.6,z],.12,'steel','site113-pipe-portal');k.rod([x-2,5.6,z],[x+2,5.6,z],.14,'steel','site113-pipe-portal');}
 const treePoints=[[744,465],[760,486],[786,512],[807,535],[838,566],[863,586],[833,307],[849,323],[868,341],[885,361],[908,383],[941,414],[435,419],[451,436],[478,460],[526,518],[552,544],[582,781],[609,807],[645,842]];
 for(const [i,p]of treePoints.entries()){const[x,z]=P(p),h=3.4+(i%4)*.5;k.rod([x,0,z],[x+.3,h,z],.11,'rust','site113-bare-tree');for(let j=0;j<3;j++){const a=j*2.1+i;k.rod([x,h*.55,z],[x+Math.cos(a)*1.4,h+.8,z+Math.sin(a)*1.4],.045,'rust','site113-bare-branch');}}
 for(const [u,v,w,d]of [[754,902,61,36],[815,947,58,30],[1195,160,60,25],[1290,225,52,30]]){const[x,z]=P([u,v]);k.box(w*.319,.24,d*.319,x,.12,z,'concrete','site113-surviving-foundation',Math.PI/4);}
 const metadata={version:SITE113_VERSION,reference:SITE113_REFERENCE,buildings:blocks,views:SITE113_VIEWS,anchorPreserved:true,
  condition:'photo-guided abandoned housing district',windowLights:false,sourcePhotosPublished:false};
 root.userData.site113Model=metadata;const result=k.finish();return {...result,site113:metadata};
}
