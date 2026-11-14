import {ROAD_SHOULDER_DROP} from './transport-ground-profile.js?v=20261114-ground-contact-v1';
// Road editor appearance is a function of the adjoining built OSM network,
// not a separate design system. Keep this helper independent of Three.js so
// that road joins/width inheritance can be validated without a GPU.
export const ROAD_EDIT_STYLE_VERSION='neighbour-road-parity-v1';
export const ROAD_EDIT_SHOULDER_EXTRA=.6;
export const ROAD_EDIT_SHOULDER_LIFT=-ROAD_SHOULDER_DROP;
export const ROAD_EDIT_SURFACE_LIFT=.006;
export const ROAD_EDIT_HIGHWAY_LIFT=.006;
export const ROAD_EDIT_PAINT_LIFT=.017;
export const ROAD_EDIT_WHITE_EDGE_WIDTH=.065;
export const ROAD_EDIT_WHITE_EDGE_INSET=.22;
export const ROAD_EDIT_CENTER_LINE_WIDTH=.10;
export const ROAD_EDIT_YELLOW_WIDTH=.055;
export const ROAD_EDIT_YELLOW_OFFSET=.074;
const MAIN=new Set(['motorway','trunk','primary','secondary','tertiary']);
const RENDER_HIGHWAY=new Set(['motorway','trunk','motorway_link','trunk_link']);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=t=>{const s=clamp(t,0,1);return s*s*(3-2*s);};
function nearestOnRoad(road,p){
 let best=null;
 for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[2]-a[2],den=dx*dx+dz*dz;
  if(den<1e-8)continue;
  const t=clamp(((p[0]-a[0])*dx+(p[2]-a[2])*dz)/den,0,1);
  const q=[a[0]+dx*t,a[1]+(b[1]-a[1])*t,a[2]+dz*t],d=dist(q,p);
  if(!best||d<best.distance)best={point:q,distance:d,segment:i};
 }
 return best;
}
export function nearestSourceRoad(p,sources,{maxDistance=7,heightTolerance=1.4}={}){
 let best=null;
 for(const road of sources){
  if(!road.points?.length||road.points.length<2)continue;
  const hit=nearestOnRoad(road,p);
  if(!hit||hit.distance>maxDistance||Math.abs(hit.point[1]-p[1])>heightTolerance)continue;
  // Prefer an actual road centreline within the established body, not a
  // slightly closer display extension or a railway-adjacent fake segment.
  const score=hit.distance+(road.source==='OpenStreetMap'?0:.45);
  if(!best||score<best.score)best={...hit,score,road};
 }
 return best;
}
function styleOf(source){
 const tags=source?.tags||{},type=String(tags.highway||'service').replace(/_link$/,'');
 const dirt=source?.surface==='ground'||type==='track'||['dirt','ground','unpaved','sand'].includes(tags.surface);
 const highway=RENDER_HIGHWAY.has(String(tags.highway||''))||source?.highway===true;
 const marked=source?.marked===true||MAIN.has(type)||type==='unclassified'||highway;
 const classId=dirt?'ground':highway?'highway':'asphalt';
 const oneway=['yes','true','1','-1'].includes(String(tags.oneway||'').toLowerCase())||
  tags.junction==='roundabout'&&tags.oneway!=='no';
 const sourceLanes=Number(tags.lanes);
 const lanes=Number.isInteger(sourceLanes)&&sourceLanes>0?sourceLanes:oneway||Number(source?.width||0)<2.4?1:2;
 const marking=dirt||!marked||oneway||lanes<=1?null:MAIN.has(type)?'double-yellow':'dashed-white';
 return {classId,marked:!dirt&&marked,marking,sourceType:type,sourceId:source?.id||null};
}
export function deriveEditedRoadStyle(road,sources,{maxDistance=7}={}){
 const start=nearestSourceRoad(road.points[0],sources,{maxDistance});
 const end=nearestSourceRoad(road.points.at(-1),sources,{maxDistance});
 const primary=(!start||end&&end.distance+.25<start.distance)?end:start;
 const source=primary?.road||null,style=styleOf(source);
 const type=road.surface==='ground'?'ground':style.classId;
 const widthStart=start?.road.width||road.width,widthEnd=end?.road.width||start?.road.width||road.width;
 const length=road.points.reduce((n,p,i)=>n+(i?dist(p,road.points[i-1]):0),0);
 return {
  ...style,classId:type,sourceId:source?.id||null,
  width:road.width,widthStart:clamp(widthStart,1.2,18),widthEnd:clamp(widthEnd,1.2,18),
  startY:start?.point[1]??null,endY:end?.point[1]??null,length,
  matching:{start:start?{id:start.road.id,distance:start.distance,width:start.road.width}:null,
   end:end?{id:end.road.id,distance:end.distance,width:end.road.width}:null},
  marked:type==='ground'?false:style.marked,
  marking:type==='ground'?null:style.marking,
 };
}
export function widthAtEditedRoad(profile,distance){
 const t=profile.length?clamp(distance/profile.length,0,1):0;
 return lerp(profile.widthStart,profile.widthEnd,smooth(t));
}
export function applyEditedRoadEndpointGrades(points,profile){
 if(points.length<2)return points;
 const last=points.length-1,total=points.reduce((sum,p,i)=>sum+(i?dist(p,points[i-1]):0),0),blend=Math.min(9,total*.18);
 let distance=0;
 const startShift=profile.startY===null?0:profile.startY-points[0][1];
 const endShift=profile.endY===null?0:profile.endY-points[last][1];
 return points.map((p,i)=>{
  if(i)distance+=dist(points[i-1],p);
  const startWeight=blend>1e-4?1-smooth(distance/blend):i===0?1:0;
  const endWeight=blend>1e-4?1-smooth((total-distance)/blend):i===last?1:0;
  return [p[0],p[1]+startShift*startWeight+endShift*endWeight,p[2]];
 });
}
