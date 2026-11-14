// Pure, deterministic road-editor state. OSM source remains immutable.
import {TRANSPORT_GROUND_VERSION} from './transport-ground-profile.js?v=20261114-ground-contact-v1';
export const ROAD_EDITOR_VERSION=1;
export const ROAD_EDITOR_STORAGE='rockettrip-baikonur-road-editor-v1';
export const ROAD_EDITOR_LIMITS=Object.freeze({roads:250,hidden:350,pointsPerRoad:500,pointsPerCut:700});
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const length=(a,b)=>Math.hypot(b[0]-a[0],b[2]-a[2]);
const bounds=p=>p.length===3&&p.every((n,i)=>finite(n)&&Math.abs(n)<(i===1?3000:60000));
function points(value,limit){
 if(!Array.isArray(value)||value.length<2||value.length>limit||!value.every(bounds))throw Error('Некорректные точки дороги.');
 return value.map(p=>[...p]);
}
export function validateRoadEdits(data){
 if(!data||data.version!==ROAD_EDITOR_VERSION||!Array.isArray(data.added)||!Array.isArray(data.hidden))throw Error('Нужна схема автодорог версии 1.');
 if(data.added.length>ROAD_EDITOR_LIMITS.roads||data.hidden.length>ROAD_EDITOR_LIMITS.hidden)throw Error('Превышено количество правок.');
 const ids=new Set();
 const added=data.added.map((r,i)=>{
  const id=String(r.id);
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||ids.has(id)||!finite(r.width)||r.width<1.5||r.width>18||!['asphalt','ground'].includes(r.surface))throw Error('Некорректные параметры дороги.');
  ids.add(id);
  return {id,width:r.width,surface:r.surface,points:points(r.points,ROAD_EDITOR_LIMITS.pointsPerRoad)};
 });
 const hidden=data.hidden.map((r,i)=>{
  if(!finite(r.width)||r.width<1||r.width>30||typeof r.sourceId!=='string'||r.sourceId.length>180)throw Error('Некорректный удалённый участок.');
  return {sourceId:r.sourceId,width:r.width,points:points(r.points,ROAD_EDITOR_LIMITS.pointsPerCut)};
 });
 // Keep only the ground policy this build understands. Workshop validation,
 // import and Undo all pass through here before returning to the road editor.
 const validated={version:ROAD_EDITOR_VERSION,added,hidden};
 if(data.groundVersion===TRANSPORT_GROUND_VERSION)validated.groundVersion=TRANSPORT_GROUND_VERSION;
 return validated;
}
export function nearestRoadSegment(roads,position,{maxDistance=Infinity,skip=()=>false}={}){
 let best=null;
 for(const road of roads){
  if(skip(road))continue;
  let at=0;
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[2]-a[2],span=Math.hypot(dx,dz);
   if(span<1e-7)continue;
   const t=clamp(((position[0]-a[0])*dx+(position[2]-a[2])*dz)/(span*span),0,1);
   const p=[a[0]+t*dx,a[1]+t*(b[1]-a[1]),a[2]+t*dz],d=length(p,position);
   if(d<=maxDistance&&(!best||d<best.distance))best={road,distance:d,point:p,segment:i,t,at:at+t*span};
   at+=span;
  }
 }
 return best;
}
export function roadSection(road,centerAt,span=30){
 const original=road.points,starts=[0];
 for(let i=1;i<original.length;i++)starts.push(starts[i-1]+length(original[i-1],original[i]));
 const left=clamp(centerAt-span/2,0,starts.at(-1)),right=clamp(centerAt+span/2,0,starts.at(-1));
 if(right-left<1e-5)return null;
 function at(d){
  let i=1;while(i<starts.length-1&&starts[i]<d)i++;
  const l=starts[i]-starts[i-1],t=l?clamp((d-starts[i-1])/l,0,1):0;
  return original[i-1].map((v,k)=>v+(original[i][k]-v)*t);
 }
 const path=[at(left)];
 for(let i=1;i<original.length-1;i++)if(starts[i]>left+1e-5&&starts[i]<right-1e-5)path.push([...original[i]]);
 path.push(at(right));
 return {sourceId:String(road.id),width:road.width,points:path};
}


// Bring an older browser's road overlay forward to a new published owner
// scheme without discarding manual edits or multiplying the same cut due to
// a few millimetres of file-coordinate rounding.
export function reconcileRoadEdits(localInput,baselineInput){
 const local=validateRoadEdits(localInput),baseline=validateRoadEdits(baselineInput);
 let copiedBaseline=false;
 const ids=new Set(local.added.map(r=>r.id));
 for(const r of baseline.added)if(!ids.has(r.id)&&local.added.length<ROAD_EDITOR_LIMITS.roads){
  local.added.push({...r,points:r.points.map(p=>[...p])});ids.add(r.id);copiedBaseline=true;
 }
 const close=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])<.015;
 const sameCut=(a,b)=>a.sourceId===b.sourceId&&Math.abs(a.width-b.width)<.01&&(
  close(a.points[0],b.points[0])&&close(a.points.at(-1),b.points.at(-1))||
  close(a.points[0],b.points.at(-1))&&close(a.points.at(-1),b.points[0])
 );
 const used=new Set();
 for(const h of baseline.hidden){
  let matchingIndex=-1;
  for(let i=0;i<local.hidden.length;i++){
   if(!used.has(i)&&sameCut(h,local.hidden[i])){matchingIndex=i;break;}
  }
  if(matchingIndex>=0){used.add(matchingIndex);continue;}
  if(local.hidden.length>=ROAD_EDITOR_LIMITS.hidden)break;
  local.hidden.push({...h,points:h.points.map(p=>[...p])});used.add(local.hidden.length-1);copiedBaseline=true;
 }
 // A current local marker cannot certify newly merged legacy coordinates.
 if(copiedBaseline&&baseline.groundVersion!==local.groundVersion)delete local.groundVersion;
 return local;
}
