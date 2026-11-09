import * as THREE from 'three';
import {MUSEUM_METRE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';
import {RAIL_PROFILE} from './rail-profile.js';
export const RAIL_STATION_VERSION='rail-station-road-clearance-v2';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),S=MUSEUM_METRE;
const vector=p=>p.isVector3?p:V(...p);
/** Align a platform pair to the existing railway corridor, without adding rails. */
export function planRailStations(stations,paths,roads=[]){
 const segments=[];
 for(const path of paths){if(path.abandoned||Math.abs((path.width??RAIL_PROFILE.ballastWidth)-RAIL_PROFILE.ballastWidth)>.05)continue;
  for(let i=1;i<path.points.length;i++){
   const a=vector(path.points[i-1]),b=vector(path.points[i]),d=b.clone().sub(a),den=d.x*d.x+d.z*d.z;
   if(den>1e-8)segments.push({a,b,d,den});
  }
 }
 // Test the entire two-sided platform footprint, not just the label anchor.
 // A road's full asphalt width (plus a small safety margin) is forbidden.
 const roadSegments=[];
 for(const road of roads)for(let i=1;i<(road.points?.length||0);i++){
  const a=vector(road.points[i-1]),b=vector(road.points[i]),w=(Number(road.width)||2)/2+.25;
  if(a.distanceToSquared(b)<1e-12)continue;
  roadSegments.push({a,b,w,minX:Math.min(a.x,b.x)-w,maxX:Math.max(a.x,b.x)+w,
   minZ:Math.min(a.z,b.z)-w,maxZ:Math.max(a.z,b.z)+w});
 }
 function overlapsRoads(position,axis,normal,innerMetres){
  const halfLength=55*S+.25,near=(innerMetres+.15)*S,far=(innerMetres+5.1)*S;
  const radius=halfLength+far+4;
  function segmentBox(a,b,minX,maxX,minZ,maxZ){
   let lo=0,hi=1;const dx=b[0]-a[0],dz=b[1]-a[1];
   for(const [p,q] of [[-dx,a[0]-minX],[dx,maxX-a[0]],[-dz,a[1]-minZ],[dz,maxZ-a[1]]]){
    if(Math.abs(p)<1e-12){if(q<0)return false;continue;}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;
   }return true;
  }
  for(const road of roadSegments){
   if(road.minX>position.x+radius||road.maxX<position.x-radius||road.minZ>position.z+radius||road.maxZ<position.z-radius)continue;
   const local=p=>{const x=p.x-position.x,z=p.z-position.z;return [x*axis.x+z*axis.z,x*normal.x+z*normal.z];};
   const a=local(road.a),b=local(road.b);
   for(const side of [-1,1]){
    const lo=side===1?near:-far,hi=side===1?far:-near;
    if(segmentBox(a,b,-halfLength-road.w,halfLength+road.w,lo-road.w,hi+road.w))return true;
   }
  }
  return false;
 }
 return stations.map(st=>{
  const anchor=st.group?.position||vector(st.position),nearest={distance:Infinity};
  for(const s of segments){
   if(anchor.x<Math.min(s.a.x,s.b.x)-70||anchor.x>Math.max(s.a.x,s.b.x)+70||anchor.z<Math.min(s.a.z,s.b.z)-70||anchor.z>Math.max(s.a.z,s.b.z)+70)continue;
   const t=THREE.MathUtils.clamp(((anchor.x-s.a.x)*s.d.x+(anchor.z-s.a.z)*s.d.z)/s.den,0,1),p=s.a.clone().addScaledVector(s.d,t),distance=Math.hypot(p.x-anchor.x,p.z-anchor.z);
   if(distance<nearest.distance)Object.assign(nearest,{distance,p,d:s.d});
  }
  if(!nearest.p)return {id:st.id,skipped:'no-displayed-rail',position:anchor.toArray()};
  const axis=nearest.d.clone().setY(0).normalize();if(axis.x<0)axis.negate();const normal=V(-axis.z,0,axis.x),halfLength=55*S,offsets=[0],corridors=[];
  for(const s of segments){
   const dir=s.d.clone().setY(0).normalize();
   const a=s.a.clone().sub(nearest.p),b=s.b.clone().sub(nearest.p),x0=a.dot(axis),x1=b.dot(axis);
   if(Math.min(x0,x1)>halfLength||Math.max(x0,x1)<-halfLength)continue;
   const t0=THREE.MathUtils.clamp((-halfLength-x0)/(x1-x0||1),0,1),t1=THREE.MathUtils.clamp((halfLength-x0)/(x1-x0||1),0,1);
   const ends=[t0,t1].map(t=>a.clone().lerp(b,t).dot(normal)),low=Math.min(...ends),high=Math.max(...ends);
   corridors.push([low,high]);
   if(Math.abs(dir.dot(axis))>=.94)for(const z of ends)if(Math.abs(z)<12)offsets.push(z);
  }
  const sorted=[];for(const z of offsets.sort((a,b)=>a-b))if(!sorted.length||z-sorted.at(-1)>.08)sorted.push(z);
  const zero=sorted.reduce((best,z,i)=>Math.abs(z)<Math.abs(sorted[best])?i:best,0);
  let lo=zero,hi=zero;while(lo>0&&sorted[lo]-sorted[lo-1]<1.2)lo--;while(hi<sorted.length-1&&sorted[hi+1]-sorted[hi]<1.2)hi++;
  let left=sorted[lo],right=sorted[hi];
  // Include diverging turnout rails along the entire platform, not just its centre.
  for(let pass=0;pass<corridors.length;pass++){let changed=false;for(const [a,b]of corridors)if(a<=right+1.1&&b>=left-1.1){if(a<left){left=a;changed=true;}if(b>right){right=b;changed=true;}}if(!changed)break;}
  const mid=(left+right)/2,position=nearest.p.clone().addScaledVector(normal,mid);position.y+=.008;
  // Quantize upward so the closest rail retains >=1.25 m platform clearance.
  const innerMetres=Math.ceil(((right-left)/2/S+1.25+RAIL_PROFILE.gauge/(2*S))*4)/4;
  // Slide the station along the SAME railway corridor to the first asphalt-
  // free location. Never place a slab over a road when no such span exists.
  const shifts=[0,8,-8,16,-16,28,-28,45,-45,70,-70],chosen=shifts.find(shift=>
   !overlapsRoads(position.clone().addScaledVector(axis,shift),axis,normal,innerMetres));
  if(chosen==null)return {id:st.id,name:st.name,skipped:'road-overlap',position:position.toArray(),
   yaw:-Math.atan2(axis.z,axis.x),innerMetres,trackSpan:right-left,nearestRailDistance:nearest.distance,trackCount:hi-lo+1};
  position.addScaledVector(axis,chosen);
  return {id:st.id,name:st.name,position:position.toArray(),yaw:-Math.atan2(axis.z,axis.x),innerMetres,
   shiftAlongRail:chosen,trackSpan:right-left,nearestRailDistance:nearest.distance,trackCount:hi-lo+1};
 });
}
export function metricStationGeometry(mesh){
 const geometry=mesh.geometry.clone(),p=geometry.attributes.position,positions=[];
 for(let i=0;i<p.count;i++)positions.push(p.getX(i),p.getY(i),p.getZ(i));
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.deleteAttribute('normal');geometry.applyMatrix4(mesh.matrixWorld);geometry.computeVertexNormals();return geometry;
}
let template;
export async function loadRailStation(){
 if(!template)template=(async()=>{
  const [{GLTFLoader},{MeshoptDecoder}]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs')]);
  const url=new URL('../assets/models/rail-station/model-v1.glb',import.meta.url),r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Rail station: HTTP '+r.status);
  const bytes=await r.arrayBuffer();if(bytes.byteLength>50000)throw Error('Unexpected station asset size');
  const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,new URL('.',url).href);scene.updateMatrixWorld(true);
  let mesh;scene.traverse(o=>{if(o.isMesh){if(mesh)throw Error('Station must be a single draw call');mesh=o;}});
  if(!mesh||mesh.material.map)throw Error('Invalid lightweight station');
  const geometry=metricStationGeometry(mesh);return {geometry,material:mesh.material,bytes:bytes.byteLength};
 })().catch(error=>{template=null;throw error;});
 return template;
}
export function stationGeometry(template,innerMetres){
 const geometry=template.clone(),p=geometry.attributes.position;
 for(let i=0;i<p.count;i++){const z=p.getZ(i),a=Math.abs(z);p.setZ(i,Math.sign(z)*(a<=5?a*innerMetres/5:innerMetres+a-5));}
 p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
export function createRailStations({stations,paths,roads=[],parent,clickable,firstIndex,loadSource=loadRailStation}){
 let plans=planRailStations(stations,paths,roads),root=new THREE.Group();root.userData.excludeTransportBake=true;root.name='ЖД станции · перроны и навесы без зданий';parent.add(root);
 const fallbackGeometry=new THREE.BoxGeometry(110,1.38,4.95),fallbackMaterial=new THREE.MeshStandardMaterial({color:0xa9aa9c,roughness:1});
 const labels=stations.map((st,i)=>{
  const plan=plans[i],group=new THREE.Group(),anchor=new THREE.Object3D(),detail=new THREE.Group();group.name=st.name;group.position.fromArray(plan.position);group.rotation.y=plan.yaw||0;
  group.add(anchor,detail);root.add(group);anchor.position.y=1.5;detail.scale.setScalar(S);detail.visible=false;
  if(!plan.skipped)for(const side of [-1,1]){const m=new THREE.Mesh(fallbackGeometry,fallbackMaterial);m.position.set(0,.69,side*(plan.innerMetres+2.475));m.userData.idx=firstIndex+i;detail.add(m);clickable.push(m);}
  return {...st,group,anchor,detail,plan};
 });
 const state={version:RAIL_STATION_VERSION,status:'idle',bytes:0,triangles:0,visible:0,error:null};
 let pending=null,lastCamera=null,loadedSource=null;
 const geometryCache=new Map();
 function fillStationDetail(s,i){
  for(const mesh of s.detail.children){const index=clickable.indexOf(mesh);if(index>=0)clickable.splice(index,1);}
  s.detail.clear();
  if(s.plan.skipped)return;
  if(loadedSource){
   if(!geometryCache.has(s.plan.innerMetres))geometryCache.set(s.plan.innerMetres,stationGeometry(loadedSource.geometry,s.plan.innerMetres));
   const mesh=new THREE.Mesh(geometryCache.get(s.plan.innerMetres),loadedSource.material);
   mesh.name='Перроны · навесы · переход';mesh.userData.idx=firstIndex+i;mesh.userData.railStation=true;
   s.detail.add(mesh);clickable.push(mesh);
  }else for(const side of [-1,1]){
   const mesh=new THREE.Mesh(fallbackGeometry,fallbackMaterial);
   mesh.position.set(0,.69,side*(s.plan.innerMetres+2.475));mesh.userData.idx=firstIndex+i;
   s.detail.add(mesh);clickable.push(mesh);
  }
 }

 const api={labels:()=>labels,plans:()=>plans,
  applyPlans(nextPlans){
   if(nextPlans.length!==labels.length||nextPlans.some((p,i)=>p.id!==labels[i].id))throw Error('Station plan identity mismatch');
   plans=nextPlans;
   labels.forEach((s,i)=>{s.plan=plans[i];s.group.position.fromArray(s.plan.position);s.group.rotation.y=s.plan.yaw||0;fillStationDetail(s,i);});
   if(lastCamera)api.update(lastCamera);
   return {count:labels.filter(s=>!s.plan.skipped).length,relocated:plans.filter(p=>p.shiftAlongRail).length,roadCollisionSkips:plans.filter(p=>p.skipped==='road-overlap').length};
  },
  replan(nextPaths,nextRoads=roads){return api.applyPlans(planRailStations(stations,nextPaths,nextRoads));},
  async load(){
   if(state.status==='ready')return true;if(pending)return pending;state.status='loading';state.error=null;
   pending=(async()=>{try{const source=await loadSource();loadedSource=source;
    labels.forEach(fillStationDetail);
    state.status='ready';state.bytes=source.bytes;state.triangles=(source.geometry.index?.count||source.geometry.attributes.position.count)/3;if(lastCamera)api.update(lastCamera);return true;
   }catch(error){state.status='error';state.error=String(error.message||error);return false;}finally{pending=null;}})();return pending;
  },
  update(camera){lastCamera=camera;state.visible=0;for(const s of labels){s.detail.visible=!s.plan.skipped&&camera.position.distanceToSquared(s.group.position)<240*240;if(s.detail.visible)state.visible++;}},
  inspect(id,camera,controls){const s=labels.find(s=>s.id===id);if(!s)return false;controls.target.copy(s.group.position).add(V(0,.7,0));const width=(s.plan.innerMetres||5)*S+5*S,range=Math.max(16,width*2);camera.position.copy(controls.target).add(V(range*.48,range*.75,range*.82).applyAxisAngle(V(0,1,0),s.plan.yaw||0));api.update(camera);return true;},
  stats:()=>({...state,count:labels.filter(s=>!s.plan.skipped).length,skipped:plans.filter(p=>p.skipped),relocated:plans.filter(p=>p.shiftAlongRail).length,roadCollisionSkips:plans.filter(p=>p.skipped==='road-overlap').length,placements:plans})
 };return api;
}
