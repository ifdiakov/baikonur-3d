import * as THREE from 'three';
import {RAIL_PROFILE} from './gagarin-rail-approach.js?v=20261031-facilities-rails-lighting-v1';
import {MUSEUM_METRE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';
import {adaptUkssRailProfile} from './ukss-rail-profile.js?v=20261031-facilities-rails-lighting-v1';

// Track axes retain their authored spacing; every individual track uses the
// common running gauge and cross-section through both source and connectors.
export function buildUkssConnections(root,source){
 if(!source?.railSourceEndpoints?.length)return {connected:false};
 const railAdaptation=adaptUkssRailProfile(root,source);
 const group=new THREE.Group();group.name='УКСС · стыки с дорогами музея';root.add(group);
 const scale=MUSEUM_METRE,networkGauge=RAIL_PROFILE.gauge/scale;
 const railMaterial=new THREE.MeshStandardMaterial({color:0x5d625f,metalness:.62,roughness:.61,side:THREE.DoubleSide});
 const ballastMaterial=new THREE.MeshStandardMaterial({color:0x948a77,roughness:1,side:THREE.DoubleSide});
 const sleeperMaterial=new THREE.MeshStandardMaterial({color:0x716d60,roughness:1});
 const roadMaterial=new THREE.MeshStandardMaterial({color:0x5b5b51,roughness:1,side:THREE.DoubleSide});
 const shoulderMaterial=new THREE.MeshStandardMaterial({color:0xa4987c,roughness:1,side:THREE.DoubleSide});
 const V=(...v)=>new THREE.Vector3(...v),mix=THREE.MathUtils.lerp;
 const sleepers=[],reports=[];
 function ribbon(samples,width,height,offset,material,name,thickness=0){
  const positions=[],indices=[];
  for(let i=0;i<samples.length;i++){
   const {point,normal,t}=samples[i],half=width(t)/2,dy=height(t),mid=offset(t);
   for(const side of [-1,1])positions.push(point.x+normal.x*(mid+side*half),point.y+dy,point.z+normal.z*(mid+side*half));
   if(i){const j=i*2;indices.push(j-2,j-1,j,j-1,j+1,j);}
  }
  if(thickness>0){
   const count=positions.length/3;
   for(let i=0;i<count;i++)positions.push(positions[i*3],positions[i*3+1]-thickness,positions[i*3+2]);
   for(let i=1;i<samples.length;i++){
    const a=(i-1)*2,b=a+1,c=i*2,d=c+1;indices.push(a,c,a+count,c,c+count,a+count,b,b+count,d,d,b+count,d+count);
   }
   indices.push(0,count,1,1,count,count+1,count-2,count-1,2*count-2,count-1,2*count-1,2*count-2);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;mesh.userData.museumComponent='ukss-museum-connection';group.add(mesh);return mesh;
 }
 function sample(curve,n=48){return Array.from({length:n+1},(_,i)=>{
  const t=i/n,point=curve.getPoint(t),tangent=i===0?curve.v1.clone().sub(curve.v0):i===n?curve.v3.clone().sub(curve.v2):curve.getTangent(t);
  const normal=V(-tangent.z,0,tangent.x).normalize();return {point,normal,t};
 });}
 const sourceEntries=railAdaptation.headEndpoints?.length===source.railSourceEndpoints.length?railAdaptation.headEndpoints:source.railSourceEndpoints;
 sourceEntries.forEach((entry,i)=>{
  const start=V(...entry),socket=V(...source.museumRailSockets[i]);
  // Both endpoints measure the actual running surface.
  const end=socket.clone();
  const reach=(end.z-start.z)*.4;
  const curve=new THREE.CubicBezierCurve3(start,start.clone().add(V(0,0,reach)),end.clone().add(V(0,0,-reach)),end);
  const samples=sample(curve),sourceGauge=networkGauge;
  const depth=(RAIL_PROFILE.headY-RAIL_PROFILE.ballastY)/scale;
  ribbon(samples,()=>RAIL_PROFILE.ballastWidth/scale,()=>-depth,()=>0,ballastMaterial,'УКСС · балласт перехода');
  for(const side of [-1,1])ribbon(samples,()=>RAIL_PROFILE.headWidth/scale,()=>0,()=>side*networkGauge/2,railMaterial,'УКСС · непрерывный рельс',RAIL_PROFILE.railHeight/scale);
  const length=curve.getLength();
  for(let d=2;d<length-1;d+=3.3){
   const t=curve.getUtoTmapping(d/length),p=curve.getPoint(t),dir=curve.getTangent(t),height=RAIL_PROFILE.sleeperHeight/scale;
   p.y-=(RAIL_PROFILE.headY-RAIL_PROFILE.sleeperY)/scale;
   sleepers.push(new THREE.Matrix4().compose(p,new THREE.Quaternion().setFromAxisAngle(V(0,1,0),Math.atan2(dir.x,dir.z)),V(RAIL_PROFILE.sleeperLength/scale,height,RAIL_PROFILE.sleeperWidth/scale)));
  }
  reports.push({sourceEndpoint:entry,sourceManifestEndpoint:source.railSourceEndpoints[i],sourceQuantizationGap:start.distanceTo(V(...source.railSourceEndpoints[i])),socket:source.museumRailSockets[i],renderedHeadEndpoint:end.toArray(),sourceGap:curve.getPoint(0).distanceTo(start),socketGap:curve.getPoint(1).distanceTo(socket),length,sourceGauge,networkGauge,headWidth:RAIL_PROFILE.headWidth/scale});
 });
 const ties=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),sleeperMaterial,sleepers.length);sleepers.forEach((m,i)=>ties.setMatrixAt(i,m));ties.instanceMatrix.needsUpdate=true;ties.name='УКСС · шпалы переходов';ties.userData.museumComponent='ukss-museum-connection';group.add(ties);
 // The service approach stays west of the transport tracks and joins the
 // western toe of the actual concrete platform (source ChamferBox09 #25196).
 // Its chamfer is near grade here, so the approach does not float above it.
 const legacyToMetres=1/.687885342706393;
 const roadStart=V(...source.museumRoadSocket),roadEnd=V(-29.7,.0539054715,78).multiplyScalar(legacyToMetres);
 const roadCurve=new THREE.CubicBezierCurve3(roadStart,V(-40,.2,111).multiplyScalar(legacyToMetres),V(-40,.0539054715,78).multiplyScalar(legacyToMetres),roadEnd),roadSamples=sample(roadCurve,64);
 ribbon(roadSamples,()=>2.2/scale,()=>-.045,()=>0,shoulderMaterial,'УКСС · обочина подъезда');
 ribbon(roadSamples,()=>1.8/scale,()=>0,()=>0,roadMaterial,'УКСС · подъезд к площадке');
 return {version:'ukss-source-connections-v3',connected:true,railTracks:reports,road:{socket:source.museumRoadSocket,endpoint:roadEnd.toArray(),sourcePlatformId:25196,gap:0,width:1.8/scale},railAdaptation,sourceStructuresStretched:false,sourceGeometryStretched:railAdaptation.changed};
}
