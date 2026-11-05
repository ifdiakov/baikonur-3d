import * as THREE from 'three';
import {MUSEUM_METRE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';
import {RAIL_PROFILE} from './rail-profile.js';
export const RAIL_STATION_VERSION='rail-station-lite-v1';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),S=MUSEUM_METRE;
const vector=p=>p.isVector3?p:V(...p);
/** Align a platform pair to the existing railway corridor, without adding rails. */
export function planRailStations(stations,paths){
 const segments=[];
 for(const path of paths){if(path.abandoned||Math.abs((path.width??RAIL_PROFILE.ballastWidth)-RAIL_PROFILE.ballastWidth)>.05)continue;
  for(let i=1;i<path.points.length;i++){
   const a=vector(path.points[i-1]),b=vector(path.points[i]),d=b.clone().sub(a),den=d.x*d.x+d.z*d.z;
   if(den>1e-8)segments.push({a,b,d,den});
  }
 }
 return stations.map(st=>{
  const anchor=st.group?.position||vector(st.position),nearest={distance:Infinity};
  for(const s of segments){
   if(anchor.x<Math.min(s.a.x,s.b.x)-70||anchor.x>Math.max(s.a.x,s.b.x)+70||anchor.z<Math.min(s.a.z,s.b.z)-70||anchor.z>Math.max(s.a.z,s.b.z)+70)continue;
   const t=THREE.MathUtils.clamp(((anchor.x-s.a.x)*s.d.x+(anchor.z-s.a.z)*s.d.z)/s.den,0,1),p=s.a.clone().addScaledVector(s.d,t),distance=Math.hypot(p.x-anchor.x,p.z-anchor.z);
   if(distance<nearest.distance)Object.assign(nearest,{distance,p,d:s.d});
  }
  if(!nearest.p)return {id:st.id,skipped:'no-displayed-rail',position:anchor.toArray()};
  const axis=nearest.d.clone().setY(0).normalize();if(axis.x<0)axis.negate();const normal=V(-axis.z,0,axis.x),halfLength=55*S,offsets=[0];
  for(const s of segments){
   const dir=s.d.clone().setY(0).normalize();if(Math.abs(dir.dot(axis))<.94)continue;
   const a=s.a.clone().sub(nearest.p),b=s.b.clone().sub(nearest.p),x0=a.dot(axis),x1=b.dot(axis);
   if(Math.min(x0,x1)>halfLength||Math.max(x0,x1)<-halfLength)continue;
   const t=THREE.MathUtils.clamp(-x0/(x1-x0||1),0,1),z=a.clone().lerp(b,t).dot(normal);if(Math.abs(z)<12)offsets.push(z);
  }
  const sorted=offsets.sort((a,b)=>a-b).filter((z,i,a)=>!i||z-a[i-1]>.08),zero=sorted.reduce((best,z,i)=>Math.abs(z)<Math.abs(sorted[best])?i:best,0);
  let lo=zero,hi=zero;while(lo>0&&sorted[lo]-sorted[lo-1]<1.2)lo--;while(hi<sorted.length-1&&sorted[hi+1]-sorted[hi]<1.2)hi++;
  const mid=(sorted[lo]+sorted[hi])/2,position=nearest.p.clone().addScaledVector(normal,mid);position.y+=.008;
  // Quantize upward so the closest rail retains >=1.25 m platform clearance.
  const innerMetres=Math.ceil(((sorted[hi]-sorted[lo])/2/S+1.25+RAIL_PROFILE.gauge/(2*S))*4)/4;
  return {id:st.id,name:st.name,position:position.toArray(),yaw:-Math.atan2(axis.z,axis.x),innerMetres,trackSpan:sorted[hi]-sorted[lo],nearestRailDistance:nearest.distance,trackCount:hi-lo+1};
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
export function createRailStations({stations,paths,parent,clickable,firstIndex,loadSource=loadRailStation}){
 // Older full-scene caches may still contain the former station boxes.
 const obsolete=[];parent.updateMatrixWorld(true);parent.traverse(m=>{
  if(!m.isMesh||m.userData.museumComponent!=='prebaked-transport'||m.name||m.geometry.attributes.position.count!==24)return;
  m.geometry.computeBoundingBox();const size=m.geometry.boundingBox.getSize(V()),p=m.getWorldPosition(V());
  const body=Math.abs(size.x-5.4)<.01&&Math.abs(size.y-3.8)<.01&&Math.abs(size.z-9)<.01,roof=Math.abs(size.x-6)<.01&&Math.abs(size.y-.45)<.01&&Math.abs(size.z-9.6)<.01;
  if((body||roof)&&stations.some(st=>{const a=st.group.position;return Math.abs(p.x-a.x-4)<.01&&Math.abs(p.z-a.z)<.01&&Math.abs(p.y-a.y-(body?1.9:3.9))<.01;}))obsolete.push(m);
 });obsolete.forEach(m=>{m.removeFromParent();m.geometry.dispose();});
 const plans=planRailStations(stations,paths),root=new THREE.Group();root.userData.excludeTransportBake=true;root.name='ЖД станции · перроны и навесы без зданий';parent.add(root);
 const fallbackGeometry=new THREE.BoxGeometry(110,1.38,4.95),fallbackMaterial=new THREE.MeshStandardMaterial({color:0xa9aa9c,roughness:1});
 const labels=stations.map((st,i)=>{
  const plan=plans[i],group=new THREE.Group(),anchor=new THREE.Object3D(),detail=new THREE.Group();group.name=st.name;group.position.fromArray(plan.position);group.rotation.y=plan.yaw||0;
  group.add(anchor,detail);root.add(group);anchor.position.y=1.5;detail.scale.setScalar(S);detail.visible=false;
  if(!plan.skipped)for(const side of [-1,1]){const m=new THREE.Mesh(fallbackGeometry,fallbackMaterial);m.position.set(0,.69,side*(plan.innerMetres+2.475));m.userData.idx=firstIndex+i;detail.add(m);clickable.push(m);}
  return {...st,group,anchor,detail,plan};
 });
 const state={version:RAIL_STATION_VERSION,status:'idle',bytes:0,triangles:0,visible:0,error:null};let pending=null,lastCamera=null;
 const api={labels:()=>labels,plans:()=>plans,
  async load(){
   if(state.status==='ready')return true;if(pending)return pending;state.status='loading';state.error=null;
   pending=(async()=>{try{const source=await loadSource(),cache=new Map();
    labels.forEach((s,i)=>{if(s.plan.skipped)return;const obsolete=new Set(s.detail.children);for(let j=clickable.length-1;j>=0;j--)if(obsolete.has(clickable[j]))clickable.splice(j,1);s.detail.clear();
     if(!cache.has(s.plan.innerMetres))cache.set(s.plan.innerMetres,stationGeometry(source.geometry,s.plan.innerMetres));
     const m=new THREE.Mesh(cache.get(s.plan.innerMetres),source.material);m.name='Перроны · навесы · переход';m.userData.idx=firstIndex+i;m.userData.railStation=true;s.detail.add(m);clickable.push(m);
    });state.status='ready';state.bytes=source.bytes;state.triangles=(source.geometry.index?.count||source.geometry.attributes.position.count)/3;if(lastCamera)api.update(lastCamera);return true;
   }catch(error){state.status='error';state.error=String(error.message||error);return false;}finally{pending=null;}})();return pending;
  },
  update(camera){lastCamera=camera;state.visible=0;for(const s of labels){s.detail.visible=!s.plan.skipped&&camera.position.distanceToSquared(s.group.position)<240*240;if(s.detail.visible)state.visible++;}},
  inspect(id,camera,controls){const s=labels.find(s=>s.id===id);if(!s)return false;controls.target.copy(s.group.position).add(V(0,.7,0));const width=(s.plan.innerMetres||5)*S+5*S,range=Math.max(16,width*2);camera.position.copy(controls.target).add(V(range*.48,range*.75,range*.82).applyAxisAngle(V(0,1,0),s.plan.yaw||0));api.update(camera);return true;},
  stats:()=>({...state,count:labels.filter(s=>!s.plan.skipped).length,skipped:plans.filter(p=>p.skipped),placements:plans})
 };return api;
}
