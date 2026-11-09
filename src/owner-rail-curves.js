import * as THREE from 'three';
export const OWNER_RAIL_CURVES_VERSION='20261109-owner19-v2';
const V=(x,y,z)=>new THREE.Vector3(x,y,z),w=([x,z],y)=>V((x-650)*3.4,y,(z-522.5)*3.4);
const idOf=id=>(String(id??'').match(/(?:^|-)(\d{7,})(?:-|$)/)||[])[1]||String(id??'');
function nearest(points,p){let hit=null,along=0;for(let i=1;i<points.length;i++){
 const a=points[i-1],b=points[i],d=b.clone().sub(a).setY(0),len=d.length();if(!len)continue;
 const t=THREE.MathUtils.clamp(p.clone().sub(a).setY(0).dot(d)/(len*len),0,1),q=a.clone().lerp(b,t),dist=Math.hypot(q.x-p.x,q.z-p.z);
 if(!hit||dist<hit.distance)hit={point:q,index:i,t,at:along+t*len,distance:dist,tangent:d.multiplyScalar(1/len)};along+=len;}return hit;}
export function replaceOwnerRailSection(points,startMap,endMap,via=[]){
 if(points.length<3)return points;
 const start=nearest(points,w(startMap,0)),end=nearest(points,w(endMap,0));
 if(!start||!end||start.distance>10||end.distance>10||Math.abs(start.at-end.at)<8)return points;
 if(start.at>end.at)return replaceOwnerRailSection([...points].reverse(),startMap,endMap,via).reverse();
 const a=start.point,b=end.point,controls=[a,...via.map((m,i)=>w(m,a.y+(b.y-a.y)*(i+1)/(via.length+1))),b];
 const tangent=controls.map((p,i)=>i===0?start.tangent:i===controls.length-1?end.tangent:controls[i+1].clone().sub(controls[i-1]).setY(0).normalize());
 const curve=[];
 for(let i=1;i<controls.length;i++){
  const p=controls[i-1],q=controls[i],length=Math.hypot(q.x-p.x,q.z-p.z),reach=length*.30;
  const c1=p.clone().addScaledVector(tangent[i-1],reach),c2=q.clone().addScaledVector(tangent[i],-reach);
  c1.y=p.y+(q.y-p.y)/3;c2.y=p.y+(q.y-p.y)*2/3;
  const c=new THREE.CubicBezierCurve3(p,c1,c2,q),count=Math.max(16,Math.ceil(c.getLength()/.45));
  for(let j=i===1?0:1;j<=count;j++)curve.push(c.getPoint(j/count));
 }
 return [...points.slice(0,start.index),...curve,...points.slice(end.index)];
}
export function shapeOwnerRail(points,rawId){
 const id=idOf(rawId);
 if(id==='37548027')return replaceOwnerRailSection(points,[607.195197,416.396457],[600.345519,429.440837],[[605.2,420.9],[604.6,425.7]]);
 if(id==='37547653')return replaceOwnerRailSection(points,[607.589,415.981],[612.848,434.865],[[605.95,420.9],[605.45,424.3],[606.8,427.7]]);
 if(id==='37546649'){
  let result=replaceOwnerRailSection(points,[539.33135,437.55756],[538.37404,428.85133],[[538.2,434.7],[537.98,431.5]]);
  result=replaceOwnerRailSection(result,[576.2,390.8],[590.2,377.5],[[579,389],[583.2,384.95],[587.4,380.9]]);return result;
 }
 return points;
}
export function shapeOwnerTrain(points){
 let result=replaceOwnerRailSection(points,[607.589,415.981],[612.848,434.865],[[605.95,420.9],[605.45,424.3],[606.8,427.7]]);
 result=replaceOwnerRailSection(result,[539.33135,437.55756],[538.37404,428.85133],[[538.2,434.7],[537.98,431.5]]);
 return replaceOwnerRailSection(result,[576.2,390.8],[590.2,377.5],[[579,389],[583.2,384.95],[587.4,380.9]]);
}
// No second overlay track; the source through path is restored at its mask.
export const missingOwnerRailSeam=()=>false;
export const makeOwnerRailSeam=()=>[];
