import * as THREE from 'three';
import {registerFacilityBeacon} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';
import {RAIL_PROFILE} from './gagarin-rail-approach.js?v=20261102-site2-photo-v3';
import {railProfileAtScale} from './rail-profile.js?v=20261031-facilities-rails-lighting-v1';
import {MUSEUM_METRE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';
import {createSurfacePalette} from './surface-materials.js';
// Museum geometry kit. Dimensions are interpretive, not a survey.
export function archiveKit(root){
 const colors={wall:0xc9c7bd,light:0xe0e0d7,concrete:0xa6a397,roof:0x7f9295,blue:0x6c8991,steel:0x6c7b76,dark:0x303a38,glass:0x45616a,green:0x537b67,red:0x96534a,yellow:0xc2a771,rust:0x84614f,soil:0x9c927f,asphalt:0x686a63,ballast:0x8f8a7b,rail:0x727974,white:0xe7e8df};
 const mat=createSurfacePalette(root,colors,{wall:'concrete',concrete:'concrete',roof:'sheet',steel:'metal',green:'paint',red:'paint',rust:'rust',rail:'metal'},{});
 const geos={box:new THREE.BoxGeometry(1,1,1),rod:new THREE.CylinderGeometry(1,1,1,6),cyl:new THREE.CylinderGeometry(1,1,1,20),sphere:new THREE.SphereGeometry(1,24,16)};
 geos.sleeper=geos.box.clone();
 const sleeperIndex=[];for(let i=0;i<geos.sleeper.index.count;i+=3){const indices=[0,1,2].map(j=>geos.sleeper.index.getX(i+j));if(geos.sleeper.attributes.normal.getY(indices[0])>-.99)sleeperIndex.push(...indices);}
 geos.sleeper.setIndex(sleeperIndex);geos.sleeper.clearGroups();
 const batches=new Map(),counts={},meshes=[],cutouts=[],up=new THREE.Vector3(0,1,0),q0=new THREE.Quaternion();
 const motionCaptures=new Map(),motionBatches=new Map();let activeCapture=null;
 const kineticTags=new Set(['tulip-support-main','tulip-cross-brace','support-arm-gripper','support-arm-actuator','tulip-counterweight']);
 function count(tag){counts[tag]=(counts[tag]||0)+1;}
 // STATIC_ARCHIVE_BATCHES: bake static hall-local transforms into exhibit space.
 function add(geo,m,p,q,size,tag,parent=root){
  if(!mat[m])throw Error('Unknown archive material '+m);
  const transform=new THREE.Matrix4().compose(new THREE.Vector3(...p),q,new THREE.Vector3(...size));
  let cursor=parent;
  while(cursor&&cursor!==root){cursor.updateMatrix();transform.premultiply(cursor.matrix);cursor=cursor.parent;}
  if(cursor!==root)throw Error('Archive primitive has an unrelated parent');
  const kineticTag=kineticTags.has(tag)?tag:null;
  const key=geo.uuid+':'+m+(kineticTag?':'+kineticTag:'');
  let batch=batches.get(key);if(!batch){batch={geo,m,tag:kineticTag,parent:root,matrices:[]};batches.set(key,batch);}
  const index=batch.matrices.length;batch.matrices.push(transform);
  if(activeCapture)activeCapture.instances.push({batch,index});
  count(tag);
 }
 function box(w,h,d,x,y,z,m='wall',tag='block',yaw=0,parent=root){add(geos.box,m,[x,y,z],new THREE.Quaternion().setFromAxisAngle(up,yaw),[w,h,d],tag,parent);}
 function rod(a,b,r=.2,m='steel',tag='beam',parent=root){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av),len=v.length();if(len<1e-6)return;add(geos.rod,m,av.add(bv).multiplyScalar(.5).toArray(),new THREE.Quaternion().setFromUnitVectors(up,v.divideScalar(len)),[r,len,r],tag,parent);}
 function cyl(r,h,x,y,z,m='light',tag='tank',yaw=0,parent=root){add(geos.cyl,m,[x,y,z],new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),yaw),[r,h,r],tag,parent);}
 function sphere(r,x,y,z,m='white',tag='sphere',size=[1,1,1],parent=root){add(geos.sphere,m,[x,y,z],q0,size.map(n=>n*r),tag,parent);}
 function direct(geo,m,tag,parent=root){const o=new THREE.Mesh(geo,mat[m]);o.name=tag;o.userData.museumComponent=tag;o.receiveShadow=true;parent.add(o);meshes.push(o);count(tag);if(activeCapture){activeCapture.direct.push(o);o.userData.archiveMotionPart=activeCapture.id;}return o;}
 // Opt-in motion records the original primitives, without splitting static
 // material batches or adding a replacement copy of the visible structure.
 function captureMotion(id,draw){
  if(typeof id!=='string'||!id||motionCaptures.has(id)||activeCapture)throw new Error('Invalid or nested archive motion capture');
  const capture={id,instances:[],direct:[],handle:null};motionCaptures.set(id,capture);activeCapture=capture;
  try{draw();}finally{activeCapture=null;}
  return id;
 }
 function finishMotionCaptures(){
  if(!motionCaptures.size)return;
  const rootInverse=root.matrixWorld.clone().invert(),identity=new THREE.Matrix4();
  const refreshBounds=state=>{
   state.mesh.boundingBox.copy(state.box);
   if(!state.activeBounds.size){state.mesh.boundingSphere.copy(state.sphere);return;}
   for(const box of state.activeBounds.values())state.mesh.boundingBox.union(box);
   state.mesh.boundingBox.getBoundingSphere(state.mesh.boundingSphere);
  };
  const dirty=(mesh,index)=>{
   mesh.instanceMatrix.addUpdateRange(index*16,16);mesh.instanceMatrix.needsUpdate=true;
  };
  for(const capture of motionCaptures.values()){
   const grouped=new Map(),current=new THREE.Matrix4(),next=new THREE.Matrix4(),box=new THREE.Box3();
   for(const {batch,index}of capture.instances){
    const mesh=batch.mesh;mesh.geometry.computeBoundingBox();mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if(!motionBatches.has(mesh))motionBatches.set(mesh,{mesh,box:mesh.boundingBox.clone(),sphere:mesh.boundingSphere.clone(),activeBounds:new Map()});
    const entries=grouped.get(mesh)||[],rest=new THREE.Matrix4();mesh.getMatrixAt(index,rest);entries.push({index,rest});grouped.set(mesh,entries);
   }
   const direct=capture.direct.map(mesh=>{
    const parentMatrix=new THREE.Matrix4().multiplyMatrices(rootInverse,mesh.parent.matrixWorld);
    return {mesh,rest:mesh.matrix.clone(),rootMatrix:new THREE.Matrix4().multiplyMatrices(rootInverse,mesh.matrixWorld),parentInverse:parentMatrix.invert(),matrixAutoUpdate:mesh.matrixAutoUpdate};
   });
   for(const [mesh,entries]of grouped)(mesh.userData.archiveMotionInstances??=[]).push({id:capture.id,indices:entries.map(entry=>entry.index)});
   const reset=()=>{
    for(const [mesh,entries]of grouped){for(const {index,rest}of entries){mesh.setMatrixAt(index,rest);dirty(mesh,index);}const state=motionBatches.get(mesh);state.activeBounds.delete(capture.id);refreshBounds(state);}
    for(const item of direct){item.mesh.matrix.copy(item.rest);item.mesh.matrixAutoUpdate=item.matrixAutoUpdate;item.mesh.matrixWorldNeedsUpdate=true;}
    current.identity();
   };
   const setDelta=delta=>{
    if(!delta?.isMatrix4||!delta.elements.every(Number.isFinite))throw new Error('Archive motion requires a finite root-local matrix');
    if(delta.equals(current))return false;if(delta.equals(identity)){reset();return true;}
    for(const [mesh,entries]of grouped){
     const bound=new THREE.Box3();
     for(const {index,rest}of entries){next.multiplyMatrices(delta,rest);mesh.setMatrixAt(index,next);dirty(mesh,index);mesh.getMatrixAt(index,next);box.copy(mesh.geometry.boundingBox).applyMatrix4(next);bound.union(box);}
     const state=motionBatches.get(mesh);state.activeBounds.set(capture.id,bound);refreshBounds(state);
    }
    for(const item of direct){item.mesh.matrix.multiplyMatrices(item.parentInverse,delta).multiply(item.rootMatrix);item.mesh.matrixAutoUpdate=false;item.mesh.matrixWorldNeedsUpdate=true;}
    current.copy(delta);return true;
   };
   capture.handle={id:capture.id,setDelta,reset,stats:()=>({id:capture.id,delta:current.toArray(),instanceCount:capture.instances.length,directMeshCount:direct.length,
    bindings:[...grouped].map(([mesh,entries])=>({meshUuid:mesh.uuid,indices:entries.map(entry=>entry.index)})),directMeshUuids:direct.map(item=>item.mesh.uuid)})};
  }
  // Live motion handles need only their captured rest poses. Release the
  // construction matrices for the thousands of unrelated static members.
  for(const batch of batches.values())batch.matrices.length=0;
 }
 function motion(id){const capture=motionCaptures.get(id);if(!capture?.handle)throw new Error('Archive motion is unavailable before finish(): '+id);return capture.handle;}
 function poly(points,y,m='concrete',tag='apron',parent=root){const shape=new THREE.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();const o=direct(new THREE.ShapeGeometry(shape),m,tag,parent);o.rotation.x=-Math.PI/2;o.position.y=y;return o;}
 function quad(a,b,c,d,m='concrete',tag='face',parent=root){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...c,...a,...c,...d],3));g.computeVertexNormals();return direct(g,m,tag,parent);}
 function path(points,width=5,y=.12,m='asphalt',tag='internal-road',parent=root){if(points.length<2)return;const pos=[],idx=[];points.forEach((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;for(const s of [-1,1])pos.push(p[0]-dz/len*s*width/2,y,p[1]+dx/len*s*width/2);if(i<points.length-1){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}});const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();return direct(geo,m,tag,parent);}
 function rail(points,{bed=true,y=.30,tag='rail',parent=root}={}){
  if(parent===root)(root.userData.archiveRailPaths??=[]).push({points:points.map(p=>[...p]),y,tag});
  const worldScale=parent.getWorldScale(new THREE.Vector3()).x,scale=worldScale===1?MUSEUM_METRE:worldScale,p=railProfileAtScale(scale);
  const headTop=y+p.sleeperHeight/2+p.railHeight,headBottom=headTop-p.railHeight;
  const frame=new THREE.Matrix4();let cursor=parent;
  while(cursor&&cursor!==root){cursor.updateMatrix();frame.premultiply(cursor.matrix);cursor=cursor.parent;}
  if(cursor!==root)throw new Error('Rail geometry has an unrelated model frame');
  // Bake static local rail faces into the same root/material batch as the
  // instanced sleepers; nested launch-pad frames must not add one draw/face.
  const railFace=(...corners)=>quad(...corners.map(c=>new THREE.Vector3(...c).applyMatrix4(frame).toArray()),'rail',tag,root);
  if(bed)path(points,p.ballastWidth,y-p.sleeperHeight/2,'ballast','rail-ballast',parent);
  const normals=points.map((point,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],length=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [-(b[1]-a[1])/length,(b[0]-a[0])/length];});
  for(const side of [-1,1]){
   const sections=points.map(([x,z],i)=>[-1,1].map(s=>[x+normals[i][0]*(side*p.gauge/2+s*p.headWidth/2),headTop,z+normals[i][1]*(side*p.gauge/2+s*p.headWidth/2)]));
   for(let i=1;i<sections.length;i++){
    const [a,b]=sections[i-1],[c,d]=sections[i];railFace(a,b,d,c);
    for(const [from,to]of [[a,c],[d,b]])railFace(from,[from[0],headBottom,from[2]],[to[0],headBottom,to[2]],to);
   }
  }
  let next=p.sleeperStep/2,along=0;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
   while(next<=along+length){const t=(next-along)/(length||1);add(geos.sleeper,'dark',[a[0]+dx*t,y,a[1]+dz*t],new THREE.Quaternion().setFromAxisAngle(up,yaw),[p.sleeperLength,p.sleeperHeight,p.sleeperWidth],'sleeper',parent);next+=p.sleeperStep;}
   along+=length;
  }
  (root.userData.railProfiles??=[]).push({tag,gauge:p.gauge,headWidth:p.headWidth,railHeight:p.railHeight,sleeperLength:p.sleeperLength,sleeperHeight:p.sleeperHeight,sleeperWidth:p.sleeperWidth,ballastWidth:p.ballastWidth,headTop,scale});
 }
 function hall({x=0,z=0,w=30,d=80,h=16,yaw=0,wall='wall',roof='roof',floors=1,gates=1,windows=true,monitor=false,tag='hall'}){const p=new THREE.Group();p.position.set(x,0,z);p.rotation.y=yaw;root.add(p);box(w,h,d,0,h/2,0,wall,tag,0,p);box(w+.8,.6,d+.8,0,h+.3,0,roof,'roof',0,p);for(const side of [-1,1])for(let zz=-d/2+3;zz<d/2;zz+=7.5){box(.55,h,.48,side*(w/2+.2),h/2,zz,'concrete','facade-pier',0,p);if(windows)for(let f=0;f<floors;f++)box(.18,1.7,4.6,side*(w/2+.31),3+f*3.4,zz+2.9,'glass','window',0,p);}for(let n=0;n<gates;n++){const gx=(n-(gates-1)/2)*Math.min(w/gates,13),gw=Math.min(9,w/(gates+.5)),gh=Math.min(h-1.7,17);box(gw,gh,.22,gx,gh/2,d/2+.14,'dark','gate-recess',0,p);for(let k=0;k<Math.floor(gw);k++)box(.09,gh,.12,gx-gw/2+k+.5,gh/2,d/2+.3,'steel','gate-rib',0,p);for(let yy=2;yy<gh;yy+=3)box(gw,.1,.14,gx,yy,d/2+.34,'steel','gate-seam',0,p);}for(let zz=-d/2+5;zz<d/2;zz+=10)box(w,.09,.12,0,h+.64,zz,'steel','roof-sheet-seam',0,p);if(monitor){box(w*.28,2.2,d*.80,0,h+1.6,0,'glass','roof-monitor',0,p);box(w*.30,.4,d*.82,0,h+2.9,0,'light','monitor-cap',0,p);}return p;}
 function lattice(x,z,h=50,w=5,d=w,{y=0,levels=10,material='steel',tag='lattice',deck=false}={}){for(let k=0;k<levels;k++){const y0=y+h*k/levels,y1=y+h*(k+1)/levels,r0=1-.55*k/levels,r1=1-.55*(k+1)/levels;for(const sx of [-1,1])for(const sz of [-1,1])rod([x+sx*w*r0/2,y0,z+sz*d*r0/2],[x+sx*w*r1/2,y1,z+sz*d*r1/2],.26,material,tag);for(const s of [-1,1]){rod([x-w*r0/2,y0,z+s*d*r0/2],[x+w*r1/2,y1,z+s*d*r1/2],.14,material,'cross-brace');rod([x+w*r0/2,y0,z+s*d*r0/2],[x-w*r1/2,y1,z+s*d*r1/2],.14,material,'cross-brace');rod([x+s*w*r0/2,y0,z-d*r0/2],[x+s*w*r1/2,y1,z+d*r1/2],.14,material,'cross-brace');}if(deck)box(w*r0,.28,d*r0,x,y0,z,'dark','tower-deck');}}
 function tank(x,z,r=5,h=12){cyl(r,h,x,h/2,z,'light','tank-shell');sphere(r,x,h,z,'light','tank-dome',[1,.22,1]);for(const yy of [h*.28,h*.7]){const o=direct(new THREE.TorusGeometry(r+.04,.10,5,24),'steel','tank-band');o.rotation.x=Math.PI/2;o.position.set(x,yy,z);}rod([x+r+1,0,z],[x+r+1,h+1,z],.14,'steel','tank-ladder');}
 function pit(x,z,rx=15,rz=15,depth=20){const N=48;for(let i=0;i<N;i++){const a=i/N*Math.PI*2,b=(i+1)/N*Math.PI*2;quad([x+rx*Math.cos(a),0,z+rz*Math.sin(a)],[x+rx*Math.cos(b),0,z+rz*Math.sin(b)],[x+rx*.48*Math.cos(b),-depth,z+rz*.48*Math.sin(b)],[x+rx*.48*Math.cos(a),-depth,z+rz*.48*Math.sin(a)],'concrete','below-grade-pit-wall');}poly(Array.from({length:N},(_,i)=>[x+rx*.49*Math.cos(i/N*Math.PI*2),z+rz*.49*Math.sin(i/N*Math.PI*2)]),-depth,'dark','pit-floor');cutouts.push({x,z,rx,rz,yaw:0,shape:'ellipse'});}
 function sign(text,x,y,z,w=24,h=5,yaw=0){const cv=document.createElement('canvas');cv.width=768;cv.height=128;const c=cv.getContext('2d');c.fillStyle='#263a40';c.fillRect(0,0,768,128);c.fillStyle='#eee9df';c.font='bold 42px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(text,384,64,735);const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;const m=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide});const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);o.position.set(x,y,z);o.rotation.y=yaw;root.add(o);meshes.push(o);count('sign');}
 function finish(){root.userData.archiveCutouts=cutouts;
  // Merge static custom faces by material: petal lining is hundreds of faces,
  // but must cost a handful of draw calls rather than a mesh per slab.
  const groups=new Map();for(const o of [...meshes]){if(o.parent!==root||!o.geometry?.attributes?.position||!o.material||kineticTags.has(o.userData.museumComponent)||o.userData.archiveMotionPart)continue;const key=o.material.uuid;let b=groups.get(key);if(!b){b={material:o.material,items:[]};groups.set(key,b);}b.items.push(o);}
  for(const b of groups.values()){if(b.items.length<2)continue;const positions=[],normals=[],uvs=[];
   for(const o of b.items){o.updateMatrix();const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrix);const pa=g.attributes.position,na=g.attributes.normal,uv=g.attributes.uv;positions.push(...pa.array);normals.push(...(na?na.array:new Float32Array(pa.count*3)));uvs.push(...(uv?uv.array:new Float32Array(pa.count*2)));root.remove(o);meshes.splice(meshes.indexOf(o),1);o.geometry.dispose();g.dispose();}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));const m=new THREE.Mesh(g,b.material);m.name='Архив · объединённые поверхности';root.add(m);meshes.push(m);
  }
for(const b of batches.values()){const im=new THREE.InstancedMesh(b.geo,mat[b.m],b.matrices.length);b.matrices.forEach((a,i)=>im.setMatrixAt(i,a));im.instanceMatrix.needsUpdate=true;im.computeBoundingBox();im.computeBoundingSphere();im.receiveShadow=true;im.name='Архив · '+b.m;im.userData.museumComponent=b.tag||'archive-instanced-structure';b.parent.add(im);meshes.push(im);b.mesh=im;}root.updateWorldMatrix(true,true);finishMotionCaptures();const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());return {features:counts,primitiveCount:Object.values(counts).reduce((s,n)=>s+n,0),meshCount:meshes.length,batches:batches.size,cutouts,boundsSize:size.toArray()};}
 const beaconRoles=new Set(['proton-service-tower','lightning-mast','soyuz-lightning-mast','soyuz-service-gantry','zenit-lightning-tower','energia-service-pylon']);
 function latticeWithBeacon(x,z,h=50,w=5,d=w,options={}){
  lattice(x,z,h,w,d,options);
  if(beaconRoles.has(options.tag))registerFacilityBeacon(root,{id:`${options.tag}-${x}-${z}`,position:[x+w*.45/2,(options.y||0)+h,z+d*.45/2],kind:options.tag.includes('lightning')?'lightning-mast':'service-tower'});
 }
 return {root,mat,cutouts,box,rod,cyl,sphere,direct,poly,quad,path,rail,hall,lattice:latticeWithBeacon,tank,pit,sign,captureMotion,motion,finish};
}
export const imageAxisYaw=(a,b)=>Math.atan2(b[0]-a[0],b[1]-a[1]);
export function imageFrame(center,scale){return p=>[(p[0]-center[0])*scale,(p[1]-center[1])*scale];}
