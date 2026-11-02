import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';

export const PUA_VERSION='pua-100-reference-v1';
// Photo reconstruction in metres, not measured construction drawings.
export const PUA_SPEC=Object.freeze({columnX:20.5,columnZ:12,roof:41,height:47,frameY:19,orbiterBottom:11.7403,lowLift:-8.84,highLift:7,duration:110});
const installations=new WeakMap();
export function getPuaInstallation(airfield){return installations.get(airfield);}

function railings(k,x0,x1,z,y){
 k.rod([x0,y+1.1,z],[x1,y+1.1,z],.045,'steel','guardrail');
 k.rod([x0,y+.55,z],[x1,y+.55,z],.035,'steel','guardrail');
 for(let x=x0;x<=x1+.01;x+=Math.max(.5,(x1-x0)/Math.ceil((x1-x0)/2)))k.rod([x,y,z],[x,y+1.1,z],.04,'steel','railing-post');
}
function girder(k,a,b,width=1,depth=1){
 const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),direction=bv.clone().sub(av).normalize();
 const u=new THREE.Vector3(1,0,0);if(Math.abs(direction.x)>.8)u.set(0,0,1);
 u.addScaledVector(direction,-u.dot(direction)).normalize().multiplyScalar(width/2);
 const v=new THREE.Vector3().crossVectors(direction,u).normalize().multiplyScalar(depth/2),n=Math.ceil(av.distanceTo(bv)/2.7);
 const point=(t,s,r)=>av.clone().lerp(bv,t).addScaledVector(u,s).addScaledVector(v,r).toArray();
 for(const s of [-1,1])for(const r of [-1,1])k.rod(point(0,s,r),point(1,s,r),.15,'steel','truss-chord');
 for(let i=0;i<n;i++)for(const s of [-1,1]){
  k.rod(point(i/n,s,-1),point((i+1)/n,s,1),.08,'steel','truss-diagonal');
  k.rod(point(i/n,-1,s),point((i+1)/n,1,s),.08,'steel','truss-diagonal');
  k.rod(point(i/n,s,-1),point(i/n,s,1),.09,'steel','truss-tie');
 }
}
function ladder(k,x,z,h,y=0){
 for(const dx of [-.34,.34])k.rod([x+dx,y,z],[x+dx,y+h,z],.045,'steel','ladder-stringer');
 for(let yy=y;yy<y+h;yy+=.32)k.rod([x-.34,yy,z],[x+.34,yy,z],.035,'steel','ladder-rung');
 for(let yy=y+2.2;yy<y+h;yy+=1.5){
  const arc=k.direct(new THREE.TorusGeometry(.45,.025,4,12,Math.PI),'steel','ladder-cage');arc.rotation.x=Math.PI/2;arc.position.set(x,yy,z);k.root.add(arc);
 }
}
function wheel(k,r,w,x,y,z,material,tag){
 const mesh=k.direct(new THREE.CylinderGeometry(r,r,w,20).rotateZ(Math.PI/2),material,tag);mesh.position.set(x,y,z);
}
function finish(k){const s=k.finish();k.root.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});return s;}

export function buildPua100(parent,{cx=0,cz=0,eventTarget=parent,aircraft=null}={}){
 const root=new THREE.Group();root.name='ПУА-100 · погрузочный агрегат';root.position.set(cx,1.75,cz);parent.add(root);
 const fixed=new THREE.Group(),traverse=new THREE.Group(),dolly=new THREE.Group(),tug=new THREE.Group();
 fixed.name='ПУА · портал и направляющие';traverse.name='ПУА · подъёмная траверса и люльки';dolly.name='ПУА · транспортная опора';tug.name='ПУА · аэродромный тягач';root.add(fixed,traverse,dolly,tug);
 const k=archiveKit(fixed),m=archiveKit(traverse),d=archiveKit(dolly),t=archiveKit(tug),{columnX:X,columnZ:Z,roof:H}=PUA_SPEC;
 for(const side of [-1,1]){
  const x=side*X;
  k.box(5,1.1,6,x,.25,Z,'concrete','column-footing');
  girder(k,[x,1,Z],[x,47,Z],2.2,2.2);
  for(const dz of [-1.3,1.3])k.box(.25,44,.18,x,23,Z+dz,'rail','carriage-guide');
  // Splayed braced struts stand ahead of the wing. The rear is open for entry.
  for(const dx of [-1.3,1.3]){
   girder(k,[x+side*8+dx,1,Z+22],[x+dx,H-2,Z],1.2,1.4);
   k.box(4,.7,4,x+side*8+dx,.1,Z+22,'concrete','strut-footing');
  }
  for(let yy=4;yy<42;yy+=4)for(const dz of [-1.22,1.22]){
   k.box(2.5,.32,.16,x,yy,Z+dz,'rust','joint-plate');
   for(const dx of [-.9,-.6,.6,.9])k.sphere(.055,x+dx,yy,Z+dz+.12,'dark','rivet');
  }
  ladder(k,x+side*1.6,Z,43);
  k.box(4,2.2,4,x,H+2.2,Z,'roof','winch-house');
  k.box(2.2,.9,.06,x,H+2.3,Z-2.04,'glass','winch-window');
  for(const z of [Z-1,Z+1])k.cyl(.65,2.7,x,H+.6,z,'dark','hoist-drum',Math.PI/2);
  k.box(3,.2,4,x,46,Z,'steel','mast-platform');
  railings(k,x-1.5,x+1.5,Z-2,46);
 }
 // Main transverse roof trusses, walkways and machinery, visible in archive photos.
 for(const z of [Z-3,Z+3])girder(k,[-X,H-1,z],[X,H-1,z],2.2,2.4);
 for(let x=-X;x<=X;x+=4){girder(k,[x,H-1,Z-3],[x,H-1,Z+3],.6,.6);k.box(3.8,.18,5.8,x,H+.3,Z,'steel','roof-deck');}
 for(const z of [Z-3.2,Z+3.2])railings(k,-X-2,X+2,z,H+.4);
 // Clad service/elevator shaft with external switchback flights.
 const sx=X+8,sz=Z+13;
 k.box(3.5,40,3.8,sx,20,sz,'light','service-shaft');
 for(let yy=2;yy<40;yy+=2.5){k.box(3.6,.09,3.9,sx,yy,sz,'steel','cladding-seam');k.box(1.1,1.1,.06,sx,yy+.8,sz-1.94,'glass','service-window');}
 for(let level=0;level<10;level++){
  const y=level*4,dir=level%2?1:-1,x=sx-3.6;
  k.box(2.6,.18,2.3,x,y+.2,sz+dir*2.6,'steel','stair-landing');
  for(let step=0;step<16;step++)k.box(1.4,.14,.34,x,y+.25+step*.25,sz+dir*(2.5-step*.32),'steel','stair-tread');
  for(const dx of [-.8,.8])k.rod([x+dx,y+1.2,sz+dir*2.5],[x+dx,y+5,sz-dir*2.6],.055,'steel','stair-handrail');
 }
 girder(k,[sx-1.5,40,sz],[X,40,Z+3],1.5,1.2);
 // Fore-and-aft cantilever lifting frame; its central gap clears Buran's fin.
 girder(m,[-X,0,Z],[X,0,Z],2.4,2.5);
 for(const x of [-5.8,5.8]){
  girder(m,[x,0,-13],[x,0,28],1.3,2.0);
  m.box(1.2,.12,42,x,1.07,7.5,'steel','traverse-walkway');
  for(const dx of [-.68,.68]){
   m.rod([x+dx,2.2,-13],[x+dx,2.2,28],.045,'steel','traverse-handrail');
   for(let z=-13;z<=28;z+=2)m.rod([x+dx,1.1,z],[x+dx,2.2,z],.04,'steel','traverse-stanchion');
  }
  for(const z of [-9,1,12,22]){
   m.box(1.8,.18,2,x,-3.4,z,'rust','work-cage-floor');
   for(const dx of [-.9,.9])for(const dz of [-1,1])m.rod([x+dx,-3.4,z+dz],[x+dx,1,z+dz],.055,'steel','work-cage-suspension');
   for(const yy of [-2.8,-2.2]){railings(m,x-.9,x+.9,z-1,yy-1.1);m.rod([x-.9,yy,z+1],[x+.9,yy,z+1],.04,'steel','work-cage-rail');}
   for(const dx of [-.9,.9])for(const yy of [-2.8,-2.2])m.rod([x+dx,yy,z-1],[x+dx,yy,z+1],.04,'steel','work-cage-rail');
   m.rod([x,2.1,z],[x,3.4,z],.04,'steel','task-light-pole');m.box(.5,.13,.4,x,3.4,z,'light','task-light');
  }
 }
 for(const z of [-13,28])girder(m,[-5.8,0,z],[5.8,0,z],1.0,1.2);
 for(const x of [-X,X]){
  m.box(3.2,4,3.2,x,0,Z,'green','guide-carriage');
  for(const dz of [-1.8,1.8])for(const yy of [-1.2,1.2])m.cyl(.4,.22,x,yy,Z+dz,'dark','guide-roller',Math.PI/2);
 }
 // Ground transporter and independent tow tractor (museum motion reconstruction).
 for(const x of [-3.1,3.1]){
  d.box(.45,.7,26,x,1.05,7,'green','transporter-side-member');
  for(const z of [-3,0,15,18]){wheel(d,.6,.5,x,.6,z,'dark','transporter-wheel');wheel(d,.3,.52,x,.6,z,'steel','transporter-hub');}
 }
 for(const z of [-3,18]){d.box(7,.6,1.2,0,1.3,z,'steel','transporter-cross-member');for(const x of [-1.6,1.6]){d.box(.6,1.4,.9,x,2,z,'green','transport-support');d.box(.8,.22,1.3,x,2.8,z,'dark','transport-pad');}}
 t.box(3.4,1.6,6,0,1.3,0,'yellow','tow-tractor-body');t.box(3.2,1.7,2.4,0,2.6,-.5,'yellow','tow-tractor-cab');
 t.box(2.7,.9,.04,0,2.9,.73,'glass','tow-tractor-windscreen');
 for(const x of [-1.75,1.75])for(const z of [-1.9,1.9])wheel(t,.8,.55,x,.8,z,'dark','tow-tractor-wheel');
 for(const x of [-1,1])t.box(.45,.24,.05,x,1.5,3.04,'light','tow-tractor-headlight');
 t.rod([0,.7,-3],[0,.7,-9],.1,'steel','towbar');
 // Hoist ropes and four lifting links are instanced and updated without allocations.
 const ropes=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,6),k.mat.dark,8),links=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,6),k.mat.steel,4);
 ropes.name='ПУА · восемь ветвей полиспаста';links.name='ПУА · грузовые связи';root.add(ropes,links);
 const up=new THREE.Vector3(0,1,0),matrix=new THREE.Matrix4(),q=new THREE.Quaternion();
 const segment=(mesh,i,a,b,r)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av);matrix.compose(av.add(bv).multiplyScalar(.5),q.setFromUnitVectors(up,v.clone().normalize()),new THREE.Vector3(r,v.length(),r));mesh.setMatrixAt(i,matrix);};
 const parts=[finish(k),finish(m),finish(d),finish(t)];
 const state={version:PUA_VERSION,basis:'photo-reconstruction',dimensionsApproximate:true,referenceImages:7,workCages:8,hoistRopes:8,guideColumns:2,primitiveCount:parts.reduce((s,p)=>s+p.primitiveCount,0),drawCalls:0,pose:{}};
 root.traverse(o=>{if(o.isMesh){state.drawCalls++;o.userData.museumComponent='pua-100';}});
 parent.userData.airport&&(parent.userData.airport.pua=state);
 function pose({lift=0,frameLift=10,aircraftZ=0,orbiterZ=0,dollyX=0,dollyVisible=false,tugVisible=false,linksVisible=false}={}){
  traverse.position.y=PUA_SPEC.frameY+frameLift;dolly.position.x=dollyX;dolly.visible=dollyVisible;tug.visible=tugVisible;tug.position.z=aircraftZ+36;
  let i=0;for(const x of [-X,X])for(const dx of [-.6,.6])for(const dz of [-.7,.7])segment(ropes,i++,[x+dx,H+.4,Z+dz],[x+dx,traverse.position.y+2.2,Z+dz],.035);
  i=0;for(const x of [-1.9,1.9])for(const z of [1,18])segment(links,i++,[Math.sign(x)*5.8,PUA_SPEC.frameY+frameLift-.3,z],[x,15.6+lift,z+orbiterZ],.09);
  ropes.instanceMatrix.needsUpdate=true;links.instanceMatrix.needsUpdate=true;ropes.computeBoundingSphere();links.computeBoundingSphere();links.visible=linksVisible;
  state.pose={lift,frameLift,aircraftZ,orbiterZ,dollyX,dollyVisible,tugVisible,linksVisible};
 }
 pose();
 const installation={root,state,pose,aircraft,reset:()=>{pose();aircraft?.setPose({});}};
 installations.set(eventTarget,installation);
 return installation;
}
