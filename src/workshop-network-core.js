// Admin-only topology. Source paths are never mutated. A branch stops at real
// same-grade junctions, not an arbitrary distance or an OSM file boundary.
export const NETWORK_VERSION='20261110-network-editor-v1';
export const emptyRailEdits=()=>({version:1,added:[],hidden:[]});
export const xyz=p=>Array.isArray(p)?[...p]:[p.x,p.y,p.z];
export const dist=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),clamp=t=>Math.max(0,Math.min(1,t));
export function validateRailEdits(value){
 const v=value??emptyRailEdits();
 if(v.version!==1||!Array.isArray(v.added)||!Array.isArray(v.hidden)||v.added.length>100||v.hidden.length>350)throw Error('Некорректная схема ЖД (максимум 100 новых путей и 350 удалений).');
 let totalPoints=0;const ids=new Set();const rows=(items,added)=>items.map(r=>{
  const id=added?r.id:r.sourceId;
  if(typeof id!=='string'||!/^[a-zA-Z0-9_.:#-]{1,180}$/.test(id)||['__proto__','constructor','prototype'].includes(id))throw Error('Некорректный идентификатор ЖД.');
  if(added&&ids.has(id))throw Error('Повторяющийся идентификатор ЖД.');ids.add(id);
  if(!Array.isArray(r.points)||r.points.length<2||r.points.length>12000||r.points.some(p=>!Array.isArray(p)||p.length!==3||p.some((n,i)=>!Number.isFinite(n)||Math.abs(n)>(i===1?3000:60000))))throw Error('Некорректные координаты ЖД.');
  totalPoints+=r.points.length;if(totalPoints>120000)throw Error('Слишком большая схема ЖД: сохраните проект и разделите правки.');
  if(!Number.isFinite(r.width)||r.width<.1||r.width>8)throw Error('Некорректная ширина балласта.');
  if(pathLength(r.points)<.01)throw Error('Путь должен иметь длину.');
  return {[added?'id':'sourceId']:id,width:r.width,points:r.points.map(xyz)};
 });return {version:1,added:rows(v.added,true),hidden:rows(v.hidden,false)};
}
export function pathLength(points){let l=0;for(let i=1;i<points.length;i++)l+=dist(points[i-1],points[i]);return l;}
export function pathStations(points){const d=[0];for(let i=1;i<points.length;i++)d.push(d.at(-1)+dist(points[i-1],points[i]));return d;}
export function pointAt(points,at,ds=pathStations(points)){
 at=Math.max(0,Math.min(ds.at(-1),at));let lo=1,hi=ds.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(ds[mid]<at)lo=mid+1;else hi=mid;}const i=lo;
 return mix(points[i-1],points[i],clamp((at-ds[i-1])/(ds[i]-ds[i-1]||1)));
}
export function slicePath(points,start,end){
 const ds=pathStations(points);if(end-start<1e-5)return [];
 return [pointAt(points,start,ds),...points.filter((_,i)=>ds[i]>start+1e-5&&ds[i]<end-1e-5).map(xyz),pointAt(points,end,ds)];
}
export function nearestOnPath(road,p){
 let result=null,at=0;for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],len=dist(a,b);if(len<1e-7)continue;
  const t=clamp(((p[0]-a[0])*(b[0]-a[0])+(p[2]-a[2])*(b[2]-a[2]))/(len*len)),q=mix(a,b,t),d=dist(q,p);
  if(!result||d<result.distance)result={road,point:q,distance:d,at:at+t*len,segment:i,t};at+=len;
 }return result;
}
export function visibleNetwork(base,edits,kind='road'){
 const out=[];
 for(const r of base){
  const points=r.points.map(xyz),total=pathLength(points),cuts=[];
  for(const h of edits.hidden.filter(h=>h.sourceId===r.id)){
   const a=nearestOnPath({points},h.points[0]),b=nearestOnPath({points},h.points.at(-1));
   if(a&&b&&Math.max(a.distance,b.distance)<Math.max(.3,r.width))cuts.push([Math.min(a.at,b.at),Math.max(a.at,b.at)]);
  }
  let ranges=[[0,total]];
  for(const [a,b]of cuts)ranges=ranges.flatMap(([lo,hi])=>b<=lo||a>=hi?[[lo,hi]]:[[lo,Math.min(hi,a)],[Math.max(lo,b),hi]].filter(([s,e])=>e-s>.02));
  for(const [j,[s,e]]of ranges.entries()){const pts=slicePath(points,s,e);if(pts.length>1)out.push({...r,id:r.id+'#'+j,originId:r.id,added:false,kind,points:pts});}
 }
 for(const r of edits.added)out.push({...r,originId:r.id,added:true,kind,points:r.points.map(xyz)});
 return out;
}
export function createNetworkIndex(input,{tolerance=.16,gradeTolerance=.45}={}){
 const roads=input.filter(r=>r.points?.length>1).map(r=>({...r,points:r.points.map(xyz)})),grid=new Map(),cell=24,cache=new Map();
 const key=(x,z)=>x+':'+z;
 const range=(a,b,pad=tolerance)=>[Math.floor((Math.min(a[0],b[0])-pad)/cell),Math.floor((Math.max(a[0],b[0])+pad)/cell),Math.floor((Math.min(a[2],b[2])-pad)/cell),Math.floor((Math.max(a[2],b[2])+pad)/cell)];
 for(const road of roads){road.stations=pathStations(road.points);road.length=road.stations.at(-1);
  for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],len=dist(a,b);if(len<1e-6)continue;
   const row={road,i,a,b,len,at:road.stations[i-1]},[x0,x1,z0,z1]=range(a,b);
   for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const k=key(x,z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(row);}
  }
 }
 function candidates(a,b=a,pad=tolerance){const [x0,x1,z0,z1]=range(a,b,pad),out=new Set();for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)for(const r of grid.get(key(x,z))||[])out.add(r);return out;}
 function nearest(p,maxDistance=5){let best=null;for(const s of candidates(p,p,maxDistance)){
  const a=s.a,b=s.b,t=clamp(((p[0]-a[0])*(b[0]-a[0])+(p[2]-a[2])*(b[2]-a[2]))/(s.len*s.len)),q=mix(a,b,t),d=dist(q,p);
  if(d<=maxDistance&&(!best||d<best.distance))best={road:s.road,point:q,distance:d,at:s.at+t*s.len,segment:s.i,t};
 }return best;}
 function nodes(road){
  if(cache.has(road.id))return cache.get(road.id);
  const cuts=[0,road.length];
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[2]-a[2],len=dist(a,b);if(len<1e-6)continue;
   for(const o of candidates(a,b)){
    if(o.road.id===road.id)continue;const ex=o.b[0]-o.a[0],ez=o.b[2]-o.a[2],det=dx*ez-dz*ex;
    const record=(t,u)=>{if(t< -1e-6||t>1+1e-6||u< -1e-6||u>1+1e-6)return;const p=mix(a,b,clamp(t)),q=mix(o.a,o.b,clamp(u));if(Math.abs(p[1]-q[1])<=gradeTolerance)cuts.push(road.stations[i-1]+clamp(t)*len);};
    if(Math.abs(det)>1e-7){const x=o.a[0]-a[0],z=o.a[2]-a[2];record((x*ez-z*ex)/det,(x*dz-z*dx)/det);}
    // Only endpoint-to-line snapping: close parallel tracks are NOT junctions.
    for(const [p,isEndpoint]of [[o.a,o.i===1],[o.b,o.i===o.road.points.length-1]])if(isEndpoint){const t=clamp(((p[0]-a[0])*dx+(p[2]-a[2])*dz)/(len*len)),q=mix(a,b,t);if(dist(p,q)<tolerance&&Math.abs(p[1]-q[1])<=gradeTolerance)cuts.push(road.stations[i-1]+t*len);}
   }
  }
  cuts.sort((a,b)=>a-b);const unique=cuts.filter((v,i)=>!i||v-cuts[i-1]>tolerance*.4);cache.set(road.id,unique);return unique;
 }
 const arc=(r,lo,hi)=>({key:r.id+':'+lo.toFixed(3)+':'+hi.toFixed(3),road:r,lo,hi,points:slicePath(r.points,lo,hi)});
 function incident(p){
  const touched=new Set([...candidates(p,p,tolerance*2)].map(s=>s.road)),arms=[];
  for(const r of touched){const hit=nearestOnPath(r,p);if(!hit||hit.distance>tolerance*1.2||Math.abs(hit.point[1]-p[1])>gradeTolerance)continue;
   const ns=nodes(r);for(let i=1;i<ns.length;i++){
    if(Math.abs(ns[i-1]-hit.at)<tolerance*1.5)arms.push(arc(r,ns[i-1],ns[i]));
    else if(Math.abs(ns[i]-hit.at)<tolerance*1.5)arms.push(arc(r,ns[i-1],ns[i]));
   }
  }return [...new Map(arms.map(a=>[a.key,a])).values()];
 }
 function branch(p,maxDistance=5){
  const hit=nearest(p,maxDistance);if(!hit)return null;
  const ns=nodes(hit.road);let i=1;while(i<ns.length-1&&ns[i]<hit.at)i++;
  const first=arc(hit.road,ns[i-1],ns[i]),selected=new Map([[first.key,first]]),ends=[];
  function walk(current,p){
   for(let n=0;n<500;n++){
    const connected=incident(p);if(connected.length!==2){ends.push({point:p,junction:connected.length>2,degree:connected.length});return;}
    const next=connected.find(a=>a.key!==current.key);if(!next||selected.has(next.key))return;
    selected.set(next.key,next);current=next;p=dist(p,next.points[0])<dist(p,next.points.at(-1))?next.points.at(-1):next.points[0];
   }throw Error('Ветка слишком длинная. Разделите правку.');
  }
  walk(first,first.points[0]);walk(first,first.points.at(-1));
  const sections=[...selected.values()].map(a=>({road:a.road,start:a.lo,end:a.hi,points:a.points}));
  return {sections,ends,length:sections.reduce((n,s)=>n+pathLength(s.points),0),kind:hit.road.kind};
 }
 return {nearest,branch,roads,nodes,incident};
}
export function deleteBranch(edits,branch,newId){
 if(!branch?.sections?.length)throw Error('Сначала выделите ветку.');
 const next=structuredClone(edits),addedSections=new Map();
 for(const s of branch.sections){const r=s.road;
  if(r.added){if(!addedSections.has(r.originId))addedSections.set(r.originId,[]);addedSections.get(r.originId).push(s);}
  else next.hidden.push({sourceId:r.originId,width:r.width,points:s.points.map(xyz)});
 }
 for(const [id,sections]of addedSections){
  const original=next.added.find(r=>r.id===id);if(!original)continue;
  const all=sections[0].road.points,total=pathLength(all);let ranges=[[0,total]];
  for(const s of sections)ranges=ranges.flatMap(([a,b])=>s.end<=a||s.start>=b?[[a,b]]:[[a,Math.min(b,s.start)],[Math.max(a,s.end),b]].filter(([x,y])=>y-x>.02));
  next.added=next.added.filter(r=>r.id!==id);
  for(const [a,b]of ranges)next.added.push({...original,id:newId(),points:slicePath(all,a,b)});
 }return next;
}
