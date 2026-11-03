import * as THREE from 'three';
import {MUSEUM_METRE} from './museum-scale.js';
export const CHECKPOINT7_VERSION='20261103-checkpoint7-road-v1';
export const CHECKPOINT7_REFERENCE={folder:'1Q-MRnlsJmvVGdW78jIqdnuI9UoJlVCZl',photos:['1ZEcU0Q7ZI8zvrOe6cYQSVbC8DnUS3nuM','1IYqqXhfc0FlV0ndoFKCkkTavtdE0Ox4L','1_UfDgK5uSlx9mVbdQxBUbWpmxHSdrXho','1TAgzSQTwvd4TBE-omKUVG9yzjtvFbGUN','1WS2Ofp7NbMl4CV65HqNEWpfST-bfzivk'],dimensionsSurveyed:false};
const V=p=>p.isVector3?p.clone():new THREE.Vector3(...p);
export function checkpointRoadProjection(points,position){
 let best=null,along=0;const p=V(position);
 for(let i=1;i<points.length;i++){
  const a=V(points[i-1]),b=V(points[i]),d=b.clone().sub(a),length=Math.hypot(d.x,d.z);
  if(!length)continue;
  const t=THREE.MathUtils.clamp(((p.x-a.x)*d.x+(p.z-a.z)*d.z)/(length*length),0,1),q=a.clone().addScaledVector(d,t),distance=Math.hypot(q.x-p.x,q.z-p.z);
  if(!best||distance<best.distance)best={point:q,tangent:d.setY(0).normalize(),distance,along:along+t*length};
  along+=length;
 }
 if(!best)throw Error('КПП №7: отсутствует ось дороги');return best;
}
export function checkpoint7Placement({roads,ownerRoadEdits,geography,roadPaths}){
 const source=id=>{const f=roads.features.find(f=>String(f.properties.osmId)===id);if(!f)throw Error('КПП №7: отсутствует дорога '+id);return f.geometry.coordinates.map(p=>{const [x,z]=geography.project(...p);return new THREE.Vector3((x-650)*3.4,.72,(z-522.5)*3.4);});};
 const city=source('1082534308'),main=source('173082916'),spine=[...city,...main.slice(1)];
 const bridgePoints=source('172422627'),bridge=bridgePoints[0].clone().lerp(bridgePoints.at(-1),.5);
 const turn=(ownerRoadEdits.added||[]).find(r=>r.id==='road-31');
 if(!turn)throw Error('КПП №7: отсутствует поворот на Сатурн');
 const turnAnchor=V(turn.points[0]),from=checkpointRoadProjection(spine,bridge),to=checkpointRoadProjection(spine,turnAnchor),station=(from.along+to.along)/2;
 if(to.along<=from.along)throw Error('КПП №7: неверный порядок ориентиров');
 let along=0,at;
 for(let i=1;i<spine.length;i++){
  const a=spine[i-1],b=spine[i],length=a.distanceTo(b);
  if(along+length>=station){at={point:a.clone().lerp(b,(station-along)/length),tangent:b.clone().sub(a).setY(0).normalize(),width:3.6};break;}along+=length;
 }
 if(!at)throw Error('КПП №7: точка вне участка дороги');
 if(roadPaths){
  const candidates=roadPaths.filter(r=>r.osmWayIds?.includes('173082916')).map(r=>({...checkpointRoadProjection(r.points,at.point),width:r.width})).sort((a,b)=>a.distance-b.distance);
  if(!candidates.length||candidates[0].distance>.5)throw Error('КПП №7: нет дорожного полотна под проездами');
  const rendered=candidates[0];if(rendered.tangent.dot(at.tangent)<0)rendered.tangent.negate();at=rendered;
 }
 const cityDirection=at.tangent.clone().negate();
 return {version:CHECKPOINT7_VERSION,position:at.point.toArray(),map:[at.point.x/3.4+650,at.point.z/3.4+522.5],yaw:Math.atan2(cityDirection.x,cityDirection.z),scale:MUSEUM_METRE,roadWidth:at.width,
  placementBasis:'owner-directed-between-bridge-and-saturn-turnoff',surveyed:false,roadWayId:'173082916',bridgeWayId:'172422627',turnoffId:'road-31',bridge:from.point.toArray(),turnoff:to.point.toArray(),bridgeStation:from.along,turnoffStation:to.along,station,fraction:.5};
}
