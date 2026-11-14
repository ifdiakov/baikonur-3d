import {TRANSPORT_GROUND_VERSION,TRANSPORT_GROUND_Y,ROAD_SURFACE_CLEARANCE} from './transport-ground-profile.js?v=20261114-ground-contact-v1';

const bridgeRoad=road=>road.tags?.bridge&&road.tags.bridge!=='no';
const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
function sourceIndex(sources){
 const byId=new Map(sources.map(road=>[String(road.id),road]));
 const cells=new Map(),cellSize=24;
 for(const road of sources)for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],segment={a,b,road};
  const margin=Math.max(4,(road.width||2)/2+1);
  for(let x=Math.floor((Math.min(a[0],b[0])-margin)/cellSize);x<=Math.floor((Math.max(a[0],b[0])+margin)/cellSize);x++)
   for(let z=Math.floor((Math.min(a[2],b[2])-margin)/cellSize);z<=Math.floor((Math.max(a[2],b[2])+margin)/cellSize);z++){
    const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);
   }
 }
  const project=(p,segments,accept=()=>true)=>{
  let best=null;
  for(const {a,b,road} of segments){
   const dx=b[0]-a[0],dz=b[2]-a[2],den=dx*dx+dz*dz;if(den<1e-12)continue;
   const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/den));
   const distance=Math.hypot(p[0]-a[0]-t*dx,p[2]-a[2]-t*dz);
    const hit={distance,y:a[1]+t*(b[1]-a[1]),road};
    if(accept(hit)&&(!best||distance<best.distance))best=hit;
  }
  return best;
 };
 const segments=road=>road.points.slice(1).map((b,i)=>({a:road.points[i],b,road}));
  const nearby=p=>cells.get(Math.floor(p[0]/cellSize)+':'+Math.floor(p[2]/cellSize))||[];
  const near=p=>project(p,nearby(p));
  return {byId,project,segments,nearby,near};
}
const terrainSampler=heightAt=>p=>{const y=heightAt?.(p[0],p[2]);return Number.isFinite(y)?y:TRANSPORT_GROUND_Y;};

// Densified owner roads must follow the visible surface between their saved
// control points as well as across their width. Only source bridge decks and
// their raised approaches retain a deliberately elevated profile.
export function createRoadGroundContact(sources,terrainHeightAt){
 const index=sourceIndex(sources),ground=terrainSampler(terrainHeightAt);
 const bridgeAreas=sources.filter(bridgeRoad).map(road=>({
  minX:Math.min(...road.points.map(p=>p[0]))-70,maxX:Math.max(...road.points.map(p=>p[0]))+70,
  minZ:Math.min(...road.points.map(p=>p[2]))-70,maxZ:Math.max(...road.points.map(p=>p[2]))+70
 }));
 const elevatedY=p=>{
  if(!bridgeAreas.some(b=>p[0]>=b.minX&&p[0]<=b.maxX&&p[2]>=b.minZ&&p[2]<=b.maxZ))return null;
  const earth=ground(p);if(p[1]<=earth+ROAD_SURFACE_CLEARANCE+1e-5)return null;
  const hit=index.project(p,index.nearby(p),candidate=>
   candidate.distance<=Math.max(.6,(candidate.road.width||2)/2+.35)&&Math.abs(candidate.y-p[1])<.12&&
   (bridgeRoad(candidate.road)||candidate.y>earth+ROAD_SURFACE_CLEARANCE+1e-5));
  return hit?.y??null;
 };
 function conform(points){
  if(points.length<2)return points.map(p=>[...p]);
  const length=[0];for(let i=1;i<points.length;i++)length.push(length.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][2]-points[i-1][2]));
  const total=length.at(-1),blend=Math.min(9,total*.18);
  const endpointOffset=p=>{const earth=ground(p);return p[1]>=earth+.008&&p[1]<=earth+.12?p[1]-earth-ROAD_SURFACE_CLEARANCE:0;};
  const start=endpointOffset(points[0]),end=endpointOffset(points.at(-1));
  return points.map((p,i)=>{
   const raised=elevatedY(p),weight=distance=>blend>1e-6?1-smooth(distance/blend):distance<1e-6?1:0;
   const y=raised??ground(p)+ROAD_SURFACE_CLEARANCE+start*weight(length[i])+end*weight(total-length[i]);
   return [p[0],y,p[2]];
  });
 }
 function edgeHeight(x,z,center,lift=0){
  if(elevatedY(center)!==null)return center[1]+lift;
  const earth=ground([x,0,z]);
  return Math.max(earth+center[1]-ground(center)+lift,earth+(lift<0?.008:.013));
 }
 return {conform,edgeHeight,elevatedY,ground};
}

// Old saved overlays use the former raised road datum. Reproject their Y
// once while retaining every owner-approved X/Z coordinate, width and cut.
// Cuts follow only their own source route. An unresolved source keeps its
// saved altitude instead of targeting an unrelated road at the same X/Z.
export function groundRoadEdits(edits,sources,terrainHeightAt){
 const {byId,project,segments,near}=sourceIndex(sources),ground=terrainSampler(terrainHeightAt);
 const added=edits.added.map(road=>({...road,points:road.points.map((p,i)=>{
  const base=ground(p),hit=near(p);let y=base+ROAD_SURFACE_CLEARANCE;
  // Existing physical model thresholds can sit a little above the steppe.
  // Keep their short endpoint joins; remove the old multi-unit flat lift.
  if((i===0||i===road.points.length-1)&&p[1]>=base+.008&&p[1]<=base+.12)y=p[1];
  if(hit&&hit.distance<=Math.max(.5,(hit.road.width||2)/2)){
    const bridge=bridgeRoad(hit.road);
   const oldBridgeHeight=hit.y+(.72-(TRANSPORT_GROUND_Y+ROAD_SURFACE_CLEARANCE));
    // Revalidation must be safe even if an older caller dropped metadata:
    // accept both the former raised bridge datum and its current deck height.
    if(bridge&&(Math.abs(p[1]-oldBridgeHeight)<1.2||Math.abs(p[1]-hit.y)<.12))y=hit.y;
   else if(!bridge&&(i===0||i===road.points.length-1)&&hit.distance<1.05)y=Math.max(y,hit.y);
  }
  return [p[0],y,p[2]];
 })}));
 const hidden=edits.hidden.map(cut=>{
   const source=byId.get(cut.sourceId),own=source?segments(source):null;
  return {...cut,points:cut.points.map(p=>{
    const hit=own?project(p,own):null;
    const y=hit&&hit.distance<=Math.max(6,cut.width)?hit.y:p[1];
   return [p[0],y,p[2]];
  })};
 });
 return {...edits,groundVersion:TRANSPORT_GROUND_VERSION,added,hidden};
}
