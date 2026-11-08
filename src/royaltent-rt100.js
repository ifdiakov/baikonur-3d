import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Manufacturer dimensions. Tube sections and connection hardware below are a
// photographic reconstruction, not fabrication drawings or a structural model.
export const ROYALTENT_RT100_SPEC=Object.freeze({
 width:10,depth:10,height:5.549,entryHeight:4.413,
 cornerFeet:4,perimeterArches:4,trussChords:3,roofRibs:4,
 model:'ARCH DUNE RT100/10',
 sourceURL:'https://royaltent.ru/tent-sale/arochnye-shatry/15-shater-100-metrov/',
});

const V=(p)=>new THREE.Vector3(...p);
const FOOT=4.76,ARCH_HALF=4.62,BASE=.19,CHORD_R=.03,TRUSS_DEPTH=.32,TRUSS_HALF=.145;
const ARCH_RISE=ROYALTENT_RT100_SPEC.entryHeight+CHORD_R-BASE;
const ARCH_OUTER_HALF=ARCH_HALF+TRUSS_DEPTH;
const ROOF_HALF=FOOT+TRUSS_HALF;
const CORNER_T=.56/Math.PI;
const CLOTH_CLEARANCE=.035,JOINT_LIFT=.05,JOINT_FLAT=.009,JOINT_FADE=.04,CORNER_FADE=.018;
const ARCH_JOINTS=[.25,.5,.75];
// The cloth follows the bare tubes closely, with a smooth local allowance
// over the bolted sleeves. Raising the whole roof would leave an air gap.
function clothClearance(t){
 const ease=u=>1-u*u*(3-2*u);let lift=0;
 for(const joint of ARCH_JOINTS){
  const u=THREE.MathUtils.clamp((Math.abs(t-joint)-JOINT_FLAT)/(JOINT_FADE-JOINT_FLAT),0,1);
  lift=Math.max(lift,JOINT_LIFT*ease(u));
 }
 const cornerDistance=Math.min(Math.abs(t-CORNER_T),Math.abs(t-(1-CORNER_T)));
 lift=Math.max(lift,.025*ease(THREE.MathUtils.clamp(cornerDistance/CORNER_FADE,0,1)));
 return CLOTH_CLEARANCE+lift;
}
const CORNER_X=Math.abs(archSection(CORNER_T).outer[0]);
const CORNER_Y=archSection(CORNER_T).outer[1]+clothClearance(CORNER_T);
const CORNER_SUM=CORNER_X+ROOF_HALF;

class ParametricCurve extends THREE.Curve{
 constructor(fn){super();this.fn=fn;}
 getPoint(t,target=new THREE.Vector3()){return target.fromArray(this.fn(t));}
}

// Elliptic arch with its outer chords offset normally from the inner chord.
// Unlike a cosine-height strip, this keeps the legs round and nearly vertical.
function archSection(t){
 const a=Math.PI*t,s=Math.sin(a),c=Math.cos(a);
 const n=new THREE.Vector2(-ARCH_RISE*c,ARCH_HALF*s).normalize();
 const p=[-ARCH_HALF*c,BASE+ARCH_RISE*s];
 return {inner:p,outer:[p[0]+TRUSS_DEPTH*n.x,p[1]+TRUSS_DEPTH*n.y],n};
}
function sidePoint(side,x,y,offset=0){
 if(side===0)return [x,y,-FOOT+offset];
 if(side===1)return [FOOT-offset,y,x];
 if(side===2)return [-x,y,FOOT-offset];
 return [-FOOT+offset,y,-x];
}
function archPoint(side,t,chord=0){
 const p=archSection(t);
 return chord===0?sidePoint(side,...p.inner):sidePoint(side,...p.outer,chord===1?-TRUSS_HALF:TRUSS_HALF);
}
function edgeHeight(x){
 const target=THREE.MathUtils.clamp(x,-ARCH_OUTER_HALF,ARCH_OUTER_HALF);
 let lo=0,hi=1;
 for(let i=0;i<22;i++){
  const mid=(lo+hi)/2;
  if(archSection(mid).outer[0]<target)lo=mid;else hi=mid;
 }
 const t=(lo+hi)/2;
 return archSection(t).outer[1]+clothClearance(t);
}
function roofHeight(x,z){
 const ax=Math.abs(x),az=Math.abs(z),d=Math.max(ax,az);
 if(d<1e-9)return ROYALTENT_RT100_SPEC.height;
 const scale=Math.min(ROOF_HALF/d,CORNER_SUM/(ax+az));
 const bx=ax*scale,bz=az*scale;
 let boundary;
 if(Math.abs(bz-ROOF_HALF)<1e-7)boundary=edgeHeight(bx);
 else if(Math.abs(bx-ROOF_HALF)<1e-7)boundary=edgeHeight(bz);
 else{
  const u=THREE.MathUtils.clamp((bx-CORNER_X)/(ROOF_HALF-CORNER_X),0,1);
  boundary=CORNER_Y-.09*Math.sin(Math.PI*u);
 }
 const r=1/scale;
 return ROYALTENT_RT100_SPEC.height+(boundary-ROYALTENT_RT100_SPEC.height)*r*r;
}

/** Build unscaled metre geometry. Solid parts are batched by material; the
 * optional skin switches are also used to inspect the actual hidden frame. */
export function createRoyalTentRT100Geometry({front='open',walls=true,membrane=true}={}){
 const batches=new Map();let components=0;
 function add(g,key){
  const flat=g.index?g.toNonIndexed():g;flat.deleteAttribute('uv');
  if(!batches.has(key))batches.set(key,[]);batches.get(key).push(flat);
  if(flat!==g)g.dispose();components++;
 }
 function box(w,h,d,p,key='metal',q=null){
  const g=new THREE.BoxGeometry(w,h,d);if(q)g.applyQuaternion(q);
  g.translate(...p);add(g,key);
 }
 function rod(a,b,r=.018,key='metal',segments=6){
  const p=V(a),q=V(b),delta=q.clone().sub(p),length=delta.length();
  if(length<1e-7)return;
  // Small web members end inside the chords; invisible caps only add work.
  const hiddenCaps=key==='metal'&&r<=.018;
  const g=new THREE.CylinderGeometry(r,r,length,segments,1,hiddenCaps);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.divideScalar(length)));
  g.translate(...p.add(q).multiplyScalar(.5).toArray());add(g,key);
 }
 function tube(fn,r=.03,key='metal',segments=56,radial=8){
  add(new THREE.TubeGeometry(new ParametricCurve(fn),segments,r,radial,false),key);
 }
 function surface(fn,nx,nz,key){
  const p=[],idx=[];
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)p.push(...fn(i/nx,j/nz));
  const triangle=(a,b,c)=>{
   const ab=new THREE.Vector3(p[b*3]-p[a*3],p[b*3+1]-p[a*3+1],p[b*3+2]-p[a*3+2]);
   const ac=new THREE.Vector3(p[c*3]-p[a*3],p[c*3+1]-p[a*3+1],p[c*3+2]-p[a*3+2]);
   if(ab.cross(ac).lengthSq()>1e-16)idx.push(a,b,c);
  };
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
   const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;triangle(a,c,b);triangle(b,c,d);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setIndex(idx);g.computeVertexNormals();add(g,key);
 }
 function flange(p,tangent,r=.048){
  const c=V(p),d=V(tangent).normalize();
  rod(c.clone().addScaledVector(d,-.042).toArray(),c.clone().addScaledVector(d,.042).toArray(),r,'fastener',8);
  for(const sign of [-1,1]){
   const q=c.clone().addScaledVector(d,sign*.052);
   rod(q.clone().addScaledVector(d,-.008).toArray(),q.clone().addScaledVector(d,.008).toArray(),r*1.14,'metal',6);
  }
 }
 function bolt(p,axis=[0,1,0],r=.018){
  const c=V(p),d=V(axis).normalize();
  rod(c.clone().addScaledVector(d,-.018).toArray(),c.clone().addScaledVector(d,.018).toArray(),r*1.6,'metal',8);
  rod(c.clone().addScaledVector(d,.018).toArray(),c.clone().addScaledVector(d,.045).toArray(),r,'fastener',6);
 }

 // Four true triangular-section perimeter trusses. Three continuous round
 // chords, transverse triangles and alternating diagonals on all three faces.
 const bays=24;
 for(let side=0;side<4;side++){
  for(let chord=0;chord<3;chord++)tube(t=>archPoint(side,t,chord),CHORD_R,'metal',64,8);
  for(let j=0;j<=bays;j++){
   const t=j/bays;
   for(let c=0;c<3;c++)rod(archPoint(side,t,c),archPoint(side,t,(c+1)%3),.0125);
   if(j===bays)continue;
   const t2=(j+1)/bays;
   for(let c=0;c<3;c++)rod(archPoint(side,j%2?t2:t,c),archPoint(side,j%2?t:t2,(c+1)%3),.0115);
  }
  // Four transportable quarter-arch segments, with visible bolted couplings.
  for(const t of [.25,.5,.75])for(let c=0;c<3;c++){
   const p=archPoint(side,t,c),a=V(archPoint(side,t-.001,c)),b=V(archPoint(side,t+.001,c));
   flange(p,b.sub(a).toArray());
  }
 }

 // Four short roof trusses converge at a compact four-way crown connector.
 // No centre column reaches the floor: the usable 100 m² space remains free.
 for(let side=0;side<4;side++){
  const rib=(t,chord)=>{
   const roofR=ROOF_HALF-(ROOF_HALF-.17)*t;
   const r=chord===0?FOOT-(FOOT-.17)*t:roofR;
   const across=chord===0?0:chord===1?-.115:.115;
   let x,z;
   if(side===0){x=across;z=-r;}else if(side===1){x=r;z=across;}
   else if(side===2){x=-across;z=r;}else{x=-r;z=-across;}
   const roofX=side===1?roofR:side===3?-roofR:across;
   const roofZ=side===0?-roofR:side===2?roofR:across;
   // Keep the rib seated on the unchanged arch while the cloth rises over
   // its coupling; the correction fades to zero at the crown connector.
   const anchorLift=(clothClearance(.5)-CLOTH_CLEARANCE)*(1-t)**2;
   return [x,roofHeight(roofX,roofZ)-(chord===0?.37:.075)-anchorLift,z];
  };
  for(let c=0;c<3;c++)tube(t=>rib(t,c),.024,'metal',24,7);
  for(let j=0;j<=10;j++)for(let c=0;c<3;c++){
   rod(rib(j/10,c),rib(j/10,(c+1)%3),.0105);
   if(j<10)rod(rib(j/10,c),rib((j+1)/10,(c+1)%3),.0105);
  }
  for(const t of [.05,.53,.95])for(let c=0;c<3;c++){
   const a=V(rib(t-.001,c)),b=V(rib(t+.001,c));flange(rib(t,c),b.sub(a).toArray(),.038);
  }
 }
 box(.38,.035,.38,[0,5.452,0],'fastener');
 box(.38,.03,.38,[0,5.174,0],'metal');
 rod([0,5.174,0],[0,5.452,0],.064,'metal',10);
 for(const x of [-.13,.13])for(const z of [-.13,.13])bolt([x,5.475,z],[0,1,0],.015);

 // Shared corner feet, two perpendicular hinged arch shoes, anchor washers,
 // nuts and a small tensioning assembly. No unreferenced tall plinths.
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const x=sx*FOOT,z=sz*FOOT;
  box(.48,.038,.48,[x,.019,z],'fastener');
  box(.36,.022,.36,[x,.049,z],'metal');
  for(const dx of [-.175,.175])for(const dz of [-.175,.175])bolt([x+dx,.05,z+dz],[0,1,0],.022);
  for(let axis=0;axis<2;axis++){
   const px=x-(axis===0?sx*.12:0),pz=z-(axis===1?sz*.12:0);
   for(const e of [-1,1]){
    if(axis===0)box(.13,.16,.025,[px,.135,pz+e*.052],'metal');
    else box(.025,.16,.13,[px+e*.052,.135,pz],'metal');
   }
   const a=axis===0?[px,.17,pz-.085]:[px-.085,.17,pz];
   const b=axis===0?[px,.17,pz+.085]:[px+.085,.17,pz];
   rod(a,b,.029,'fastener',8);
   bolt(b,axis===0?[0,0,1]:[1,0,0],.025);
  }
  const h=archSection(CORNER_T).outer[1];
  const p1=[sx*CORNER_X,h,sz*ROOF_HALF],p2=[sx*ROOF_HALF,h,sz*CORNER_X];
  const tensionAnchor=[sx*FOOT,.38,sz*FOOT];
  rod(p1,p2,.028,'metal',8);
  flange(p1,V(p2).sub(V(p1)).toArray(),.039);flange(p2,V(p1).sub(V(p2)).toArray(),.039);
  if(membrane){
   const low=tensionAnchor;
   surface((u,v)=>{
    const top=V(p1).lerp(V(p2),u);top.y=CORNER_Y-.09*Math.sin(Math.PI*u);
    const p=V(low).lerp(top,v);
    p.y-=.025*Math.sin(Math.PI*u)*Math.sin(Math.PI*v);return p.toArray();
   },8,8,'film');
   for(const p of [p1,p2])rod(low,p,.009,'stitch',5);
   tube(t=>{
    const p=V(p1).lerp(V(p2),t);p.y=CORNER_Y-.09*Math.sin(Math.PI*t);return p.toArray();
   },.012,'stitch',16,5);
  }
  const a=[x,.063,z],b=tensionAnchor;
  rod(a,b,.0075,'metal',5);
  const ca=V(a).lerp(V(b),.36),cb=V(a).lerp(V(b),.69);
  rod(ca.toArray(),cb.toArray(),.021,'fastener',6);
  for(const t of [.28,.75]){
   const p=V(a).lerp(V(b),t),g=new THREE.TorusGeometry(.026,.006,4,10);
   g.rotateY(Math.PI/4);g.translate(...p.toArray());add(g,'metal');
  }
 }

 if(membrane){
  // A single indexed radial mesh shares all panel boundaries. Its perimeter
  // follows the actual outer arch chords, with four clipped fabric corners.
  // The clear corner inserts continue from precisely the same hem to the feet.
  const contour=[],arcSamples=32,cornerSamples=8,rings=20;
  const edge=(side,t)=>{
   const p=archSection(t).outer;return sidePoint(side,p[0],p[1]+clothClearance(t),-TRUSS_HALF);
  };
  // Sample the sleeve peaks and shoulders explicitly: a uniform grid can
  // cut through the raised cloth between its neighbouring vertices.
  const arcParameters=[...new Set([
   ...Array.from({length:arcSamples},(_,j)=>CORNER_T+(1-2*CORNER_T)*j/arcSamples),
   ...ARCH_JOINTS.flatMap(t=>[t-JOINT_FADE,t-JOINT_FLAT,t,t+JOINT_FLAT,t+JOINT_FADE]),
   CORNER_T+CORNER_FADE,1-CORNER_T-CORNER_FADE,
  ])].sort((a,b)=>a-b);
  for(let side=0;side<4;side++){
   for(const t of arcParameters)contour.push(edge(side,t));
   const a=V(edge(side,1-CORNER_T)),b=V(edge((side+1)%4,CORNER_T));
   for(let j=0;j<cornerSamples;j++){
    const u=j/cornerSamples,p=a.clone().lerp(b,u);p.y=CORNER_Y-.09*Math.sin(Math.PI*u);contour.push(p.toArray());
   }
  }
  const vertices=[0,ROYALTENT_RT100_SPEC.height,0],indices=[],count=contour.length;
  for(let ring=1;ring<=rings;ring++){
   const r=ring/rings;
   for(const [x,y,z] of contour)vertices.push(x*r,ROYALTENT_RT100_SPEC.height+(y-ROYALTENT_RT100_SPEC.height)*r*r,z*r);
  }
  for(let j=0;j<count;j++)indices.push(0,1+(j+1)%count,1+j);
  for(let ring=1;ring<rings;ring++)for(let j=0;j<count;j++){
   const a=1+(ring-1)*count+j,b=1+(ring-1)*count+(j+1)%count,c=1+ring*count+j,d=1+ring*count+(j+1)%count;
   indices.push(a,b,c,b,d,c);
  }
  const roof=new THREE.BufferGeometry();roof.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  roof.setIndex(indices);roof.computeVertexNormals();add(roof,'fabric');
  // Reinforced white hems wrap the four arched openings; the lattice remains
  // below them and is visible from both the outside and the interior.
  for(let side=0;side<4;side++){
   tube(t=>edge(side,CORNER_T+(1-2*CORNER_T)*t),.016,'stitch',48,5);
  }
  // Narrow welded seams, flush to the cloth rather than raised heavy ropes.
  const seam=(fn,width=.025)=>surface((u,v)=>{
   const p=fn(u),a=fn(Math.max(0,u-.001)),b=fn(Math.min(1,u+.001));
   const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;
   const x=THREE.MathUtils.clamp(p[0]-(v-.5)*width*dz/l,-ROOF_HALF,ROOF_HALF);
   const z=THREE.MathUtils.clamp(p[1]+(v-.5)*width*dx/l,-ROOF_HALF,ROOF_HALF);
   return [x,roofHeight(x,z)+.004,z];
  },56,1,'stitch');
  for(const sx of [-1,1])for(const sz of [-1,1])seam(t=>[sx*CORNER_SUM*.5*t,sz*CORNER_SUM*.5*t],.032);
  for(const a of [-2.47,2.47]){
   seam(t=>[a,(2*t-1)*ROOF_HALF],.018);seam(t=>[(2*t-1)*ROOF_HALF,a],.018);
  }
 }

 if(walls){
  const wallHalf=4.585;
  const topAt=x=>BASE+ARCH_RISE*Math.sqrt(Math.max(0,1-(x/ARCH_HALF)**2))-.065;
  for(let side=0;side<4;side++){
   const isOpen=side===0&&front==='open',isDoor=side===0&&front==='doors';
   const lowAt=x=>isOpen?.10+3.76*Math.sqrt(Math.max(0,1-(x/4.23)**2)):.055;
   const divisions=isDoor?[-wallHalf,-1.10,1.10,wallHalf]:[-wallHalf,wallHalf];
   for(let span=0;span<divisions.length-1;span++){
    const start=divisions[span],end=divisions[span+1],overDoor=isDoor&&span===1;
    surface((u,v)=>{
     const x=start+(end-start)*u,top=topAt(x),low=Math.min(top,overDoor?2.28:lowAt(x));
     const y=low+(top-low)*v;
     // Small regular vertical folds along the curtain's bottom seam.
     const wave=.017*Math.sin(x*22)*Math.pow(1-v,1.5);
     return sidePoint(side,x,y,.085+wave);
    },Math.max(12,Math.ceil((end-start)*7)),8,'tentWall');
   }
   // Hem and panel joins follow the cut wall profile and stay inside the arch.
   for(const x of [-2.30,0,2.30]){
    if(isDoor&&Math.abs(x)<1.10)continue;
    const low=lowAt(x),high=topAt(x);
    rod(sidePoint(side,x,low,.06),sidePoint(side,x,high,.06),.006,'stitch',5);
   }
   const hem=(a,b)=>tube(t=>{
    const x=a+(b-a)*t;return sidePoint(side,x,lowAt(x)+.012,.058);
   },.011,'stitch',48,5);
   if(isDoor){hem(-wallHalf,-1.10);hem(1.10,wallHalf);}else hem(-wallHalf,wallHalf);
   // Small perimeter eyelets/ties, attached to the inner truss chord.
   for(let j=1;j<20;j++){
    const t=j/20,p=archPoint(side,t,0),section=archSection(t);
    const q=sidePoint(side,section.inner[0],section.inner[1]-.090,.085);
    rod(p,q,.008,'fastener',5);
   }
  }
  if(front==='doors'){
   const z=-FOOT+.085;
   for(const x of [-1.085,0,1.085])box(.046,2.23,.07,[x,1.165,z],'trim');
   box(2.215,.052,.07,[0,2.28,z],'trim');box(2.215,.043,.10,[0,.063,z],'metal');
   for(const sx of [-1,1]){
    box(1.015,2.135,.016,[sx*.5425,1.16,z+.008],'glass');
    box(1.015,.035,.055,[sx*.5425,.88,z-.012],'trim');
    rod([sx*.115,.98,z-.11],[sx*.115,1.27,z-.11],.016,'metal',8);
    for(const y of [.98,1.27])rod([sx*.115,y,z-.11],[sx*.115,y,z-.035],.012,'metal',6);
    for(const y of [.35,1.17,2.02])rod([sx*1.078,y-.042,z-.035],[sx*1.078,y+.042,z-.035],.018,'fastener',6);
   }
  }
 }

 const parts={};let triangles=0;
 for(const [key,list] of batches){
  const g=mergeGeometries(list,false);list.forEach(p=>p.dispose());
  g.computeBoundingBox();g.computeBoundingSphere();parts[key]=g;
  triangles+=g.attributes.position.count/3;
 }
 return {parts,metadata:{...ROYALTENT_RT100_SPEC,front,walls,membrane,components,triangles,
  archSections:4,sectionJoints:12,anchorBolts:16,cornerStruts:4,
  detailBasis:'manufacturer envelope and photographed structure; hardware dimensions reconstructed'}};
}
