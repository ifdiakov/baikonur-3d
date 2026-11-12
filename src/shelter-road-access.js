import * as THREE from 'three';
import {PANTSIR_PROFILES} from './earth-covered-shelters.js?v=20261112-road-facing-v1';
export const SHELTER_ACCESS_VERSION='20261112-road-facing-v1';
const V=a=>Array.isArray(a)?new THREE.Vector3(...a):a.clone();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=t=>t*t*(3-2*t);

// Select the closest usable paved segment, with enough length for a graded
// entrance. The road itself, its traffic graph and all source vertices stay intact.
export function planShelterRoadAccess(root,id,roads){
 const p=PANTSIR_PROFILES[id];if(!p)throw Error('Unknown recessed structure '+id);
 const scale=root.scale.x,origin=root.position.clone(),startZ=p.depth/2+p.ramp+8;
 let best=null;
 for(const road of roads){
  if(road.surface==='ground'||road.tags?.highway==='track'||road.tags?.bridge==='yes'||!road.points?.length)continue;
  const width=road.width||2.4;
  for(let i=1;i<road.points.length;i++){
   const a=V(road.points[i-1]),b=V(road.points[i]),d=b.clone().sub(a),len=Math.hypot(d.x,d.z);
   if(len<10)continue;
   const tangent=new THREE.Vector3(d.x/len,0,d.z/len),margin=Math.min(.20,Math.max(2,width)/len);
   const projection=clamp(((origin.x-a.x)*d.x+(origin.z-a.z)*d.z)/(len*len),margin,1-margin);
   const candidates=[projection];for(let j=0;j<=40;j++)candidates.push(margin+(1-2*margin)*j/40);
   for(const t of candidates){
    const q=a.clone().lerp(b,t),dx=q.x-origin.x,dz=q.z-origin.z,distance=Math.hypot(dx,dz);
    if(distance>90||distance<startZ*scale+width/2+2)continue;
    const normal=new THREE.Vector3(-tangent.z,0,tangent.x);
    if(normal.dot(origin.clone().sub(q))<0)normal.negate();
    const join=q.clone().addScaledVector(normal,width/2),horizontal=Math.hypot(join.x-origin.x,join.z-origin.z);
    // Smooth grade's maximum slope is 1.5 times the mean. No floating slab or
    // abrupt step against the existing raised road.
    const needed=Math.abs(q.y-(origin.y+.025*scale))*1.5/.22;
    if(horizontal-startZ*scale<Math.max(2,needed))continue;
    const yaw=Math.atan2(join.x-origin.x,join.z-origin.z);
    const score=distance+(Math.abs(t-projection)*.001);
    if(!best||score<best.score)best={score,roadId:road.id,segment:i-1,roadWidth:width,yaw,join:q.toArray(),edge:join.toArray(),tangent:tangent.toArray(),normal:normal.toArray(),roadSlope:d.y/len,startZ,scale,sourceSegment:[a.toArray(),b.toArray()]};
   }
  }
 }
 if(!best)throw Error('No safe road approach for '+id);
 return best;
}

export function buildShelterRoadAccess(root,plan){
 root.updateWorldMatrix(true,true);
 const inv=root.matrixWorld.clone().invert(),normal=V(plan.normal),tangent=V(plan.tangent),scale=plan.scale;
 const p0=root.localToWorld(new THREE.Vector3(1.7,.025,plan.startZ));
 const p3=V(plan.edge),forward=new THREE.Vector3(Math.sin(plan.yaw),0,Math.cos(plan.yaw));
 const length=Math.hypot(p3.x-p0.x,p3.z-p0.z),p1=p0.clone().addScaledVector(forward,length*.28),p2=p3.clone().addScaledVector(forward,-length*.28);
 const curve=new THREE.CubicBezierCurve3(p0,p1,p2,p3),count=32,rows=[];
 const mouth=Math.max(13.4*scale,Math.min(3.8,plan.roadWidth*1.20));
 // Select the tangent sign that agrees with the approaching road's left/right.
 const endRight=new THREE.Vector3(-normal.z,0,normal.x);
 const roadRight=endRight.dot(tangent)>0?tangent.clone():tangent.clone().negate();
 const startRight=new THREE.Vector3(Math.cos(plan.yaw),0,-Math.sin(plan.yaw));
 let maxGrade=0;
 for(let i=0;i<=count;i++){
  const t=i/count,c=curve.getPoint(t),dir=curve.getTangent(t);dir.y=0;dir.normalize();
  const right=new THREE.Vector3(dir.z,0,-dir.x).lerp(roadRight,ease(clamp((t-.65)/.35,0,1))).normalize();
  if(i===0)right.copy(startRight);
  c.y=THREE.MathUtils.lerp(p0.y,p3.y,ease(t));
  const width=THREE.MathUtils.lerp(13.4*scale,mouth,ease(clamp((t-.55)/.45,0,1)));
  rows.push({c,right,width,t});
  if(i){const prev=rows[i-1].c;maxGrade=Math.max(maxGrade,Math.abs(c.y-prev.y)/Math.hypot(c.x-prev.x,c.z-prev.z));}
 }
 const geometries={asphalt:[],shoulder:[],earth:[]},indices={asphalt:[],shoulder:[],earth:[]};
 function quad(key,a,b,c,d){
  // Clip every layer at the existing road edge. A straight oblique approach
  // meets the road cleanly, without a hairpin or coplanar pavement overlap.
  const input=[a,b,d,c],poly=[],q=V(plan.join),distance=v=>v.clone().sub(q).dot(normal)-plan.roadWidth/2;
  for(let i=0;i<input.length;i++){
   const from=input[i],to=input[(i+1)%input.length],da=distance(from),db=distance(to),ia=da>=-1e-8,ib=db>=-1e-8;
   if(ia)poly.push(from);
   if(ia!==ib){const v=from.clone().lerp(to,da/(da-db));if(key==='asphalt')v.y=q.y+v.clone().sub(q).dot(tangent)*plan.roadSlope;poly.push(v);}
  }
  if(poly.length<3)return;
  const pos=geometries[key],idx=indices[key],n=pos.length/3;for(const v of poly)pos.push(...v.clone().applyMatrix4(inv).toArray());for(let i=1;i+1<poly.length;i++)idx.push(n,n+i+1,n+i);
 }
 function edge(row,side,extra=0,drop=0){const v=row.c.clone().addScaledVector(row.right,side*(row.width/2+extra));v.y-=drop;
  // Final cross-section is precisely the existing asphalt boundary, including
  // its along-road grade. No second coplanar asphalt layer is put over it.
  if(row.t===1)v.y=plan.join[1]+v.clone().sub(V(plan.join)).dot(tangent)*plan.roadSlope-drop;
  return v;
 }
 for(let i=0;i<count;i++){
  const a=rows[i],b=rows[i+1];quad('asphalt',edge(a,-1),edge(b,-1),edge(a,1),edge(b,1));
  for(const side of [-1,1]){
   quad('shoulder',edge(a,side,0,.035),edge(b,side,0,.035),edge(a,side,.3,.055),edge(b,side,.3,.055));
   const bottom=row=>{const v=edge(row,side,.3+Math.max(.2,(row.c.y+2.755)*1.25),.055);v.y=-2.755;return v;};
   quad('earth',edge(a,side,.3,.055),edge(b,side,.3,.055),bottom(a),bottom(b));
  }
 }
 const materials={asphalt:new THREE.MeshStandardMaterial({color:0x555751,roughness:.9,side:THREE.DoubleSide}),shoulder:new THREE.MeshStandardMaterial({color:0xc5c1b4,roughness:1,side:THREE.DoubleSide}),earth:new THREE.MeshBasicMaterial({color:0x9c927f,side:THREE.DoubleSide})};
 for(const key of Object.keys(geometries)){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(geometries[key],3));g.setIndex(indices[key]);g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,materials[key]);mesh.name='Подъезд · '+key;mesh.receiveShadow=true;mesh.userData.shelterDrive=key;mesh.userData.groundSurface=true;if(key==='earth')mesh.userData.pantsirEarth=true;root.add(mesh);
 }
 root.userData.shelterAccess={version:SHELTER_ACCESS_VERSION,roadId:plan.roadId,yaw:plan.yaw,roadWidth:plan.roadWidth,join:plan.join,edge:plan.edge,sourceSegment:plan.sourceSegment,start:p0.toArray(),end:p3.toArray(),maxGrade,length:curve.getLength(),centreline:rows.map(r=>r.c.toArray()),joinEdges:[edge(rows.at(-1),-1).toArray(),edge(rows.at(-1),1).toArray()],roadGraphUnchanged:true,triangleCount:Object.values(indices).reduce((n,a)=>n+a.length/3,0)};
 return root.userData.shelterAccess;
}
export function shelterAccessView(root){
 const p=root.userData.pantsirModel,w=p.width/2+8,access=root.userData.shelterAccess;
 const points=[[-w,0,-p.depth/2-8],[w,3.2,-p.depth/2-8],[-w,0,p.end+8],[w,0,p.end+8]];
 if(access)for(const v of [...access.joinEdges,access.end])points.push(root.worldToLocal(new THREE.Vector3(...v)).toArray());
 const end=Math.max(p.end+8,...points.map(v=>v[2]));
 return {eye:[Math.max(68,end*.4),Math.max(80,end*.75),end+100],target:[0,0,(end-p.depth/2)*.42],framePoints:points};
}
