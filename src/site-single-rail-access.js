// Owner-directed rail simplification around map X=567.7, Y=743.6.
// Keep the single south-east approach (OSM way 37543654 plus feeder
// 172571249); remove the crossing yard fan and all unrelated spurs
// inside the facility area. No changes to authoritative OSM source files.
export const SINGLE_RAIL_ACCESS_VERSION='south-east-access-only-v1';
export const SINGLE_RAIL_ACCESS_BOUNDS=Object.freeze({
 minX:540,maxX:577,minY:687,maxY:752
});
const preserved=new Set(['37543654','172571249']);
export function railSourceId(pathOrId){
 if(typeof pathOrId==='string'||typeof pathOrId==='number')return String(pathOrId).replace(/^osm-rail-/,'').replace(/-\d+$/,'');
 const path=pathOrId||{};
 return String(path.sourceWayId??path.osmWayIds?.[0]??path.id??'').replace(/^osm-rail-/,'').replace(/-\d+$/,'');
}
export function isPreservedAccess(pathOrId,points=null){
 if(preserved.has(railSourceId(pathOrId)))return true;
 // Older baked archives did not serialize sourceWayId. Recover only the
 // approved approach by both end anchors; nearby parallel spurs differ.
 if(!points||points.length<2)return false;
 const map=p=>({x:p.x/3.4+650,y:p.z/3.4+522.5});
 const ends=[map(points[0]),map(points.at(-1))];
 const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1.2;
 return (near(ends[0],{x:573.1,y:751.3})&&near(ends[1],{x:565.7,y:738.8}))||
  (near(ends[1],{x:573.1,y:751.3})&&near(ends[0],{x:565.7,y:738.8}));
}
export function inRailClearance(x,y){
 const b=SINGLE_RAIL_ACCESS_BOUNDS;
 return x>b.minX&&x<b.maxX&&y>b.minY&&y<b.maxY;
}
export function clipSingleRailAccess(points,pathOrId,{world=true}={}){
 if(isPreservedAccess(pathOrId,points)||points.length<2)return [points];
 const b=SINGLE_RAIL_ACCESS_BOUNDS;
 // Parameterize in museum coordinates; retain shared endpoint and height.
 const mp=p=>world?{x:p.x/3.4+650,y:p.z/3.4+522.5}:{x:p.x,y:p.z};
 const lerp=(a,c,t)=>world?a.clone().lerp(c,t):{...a,x:a.x+(c.x-a.x)*t,z:a.z+(c.z-a.z)*t};
 const mix=(a,c,t)=>world?lerp(a,c,t):Array.isArray(a)?a.map((v,i)=>v+(c[i]-v)*t):lerp(a,c,t);
 const xy=p=>Array.isArray(p)?{x:p[0],y:p[1]}:mp(p);
 const fractions=(a,c)=>{
  const q=xy(a),r=xy(c),dx=r.x-q.x,dy=r.y-q.y,cut=[0,1];
  for(const [edge,origin,delta]of [[b.minX,q.x,dx],[b.maxX,q.x,dx],[b.minY,q.y,dy],[b.maxY,q.y,dy]]){
   if(Math.abs(delta)>1e-12){let t=(edge-origin)/delta;if(t>1e-8&&t<1-1e-8)cut.push(t);}
  }
  return [...new Set(cut)].sort((x,y)=>x-y);
 };
 const result=[];let run=[];
 const flush=()=>{if(run.length>1)result.push(run);run=[];};
 for(let i=1;i<points.length;i++){
  const a=points[i-1],c=points[i],cuts=fractions(a,c);
  for(let j=1;j<cuts.length;j++){
   const lo=cuts[j-1],hi=cuts[j],m=xy(mix(a,c,(lo+hi)/2));
   if(inRailClearance(m.x,m.y)){flush();continue;}
   const start=mix(a,c,lo),end=mix(a,c,hi);
   if(!run.length)run.push(start);
   else {
    const old=xy(run.at(-1)),now=xy(start);
    if(Math.hypot(old.x-now.x,old.y-now.y)>1e-5){flush();run.push(start);}
   }
   run.push(end);
  }
 }
 flush();return result;
}

/**
 * Owner deletion near Site 5: remove the redundant parallel line of
 * OSM way 172458467 between map Y=512.9 and 521.2. The through mainline
 * OSM way 37547653 must remain intact for the locomotive.
 *
 * Uses precise boundary clipping, preserving all unaffected segments.
 */
export const PAD5_REDUNDANT_RAIL_WAY='172458467';
export function clipPad5DuplicateRail(points,pathOrId){
 const id=railSourceId(pathOrId);
 if(points.length<2)return [points];
 if(String(id)!==PAD5_REDUNDANT_RAIL_WAY){
  // Legacy terrain bake omits sourceWayId. Recover this precise branch
  // only when its points include BOTH unique anchors (not the adjacent
  // through line 37547653). Never infer from a single nearby point.
  if(id&&id!=='unknown'&&!String(id).startsWith('rail-'))return [points];
  const distanceTo=(x,y)=>{
   let best=Infinity;
   for(const p of points){
    const mx=p.x/3.4+650,my=p.z/3.4+522.5;
    best=Math.min(best,Math.hypot(mx-x,my-y));
   }
   return best;
  };
  if(distanceTo(621.77,521.08)>1.5||distanceTo(616.85,491.97)>2.2)return [points];
 }
 const lo=512.7,hi=521.4;
 const mapY=p=>p.z/3.4+522.5;
 const output=[];let run=[];
 const flush=()=>{if(run.length>1)output.push(run);run=[];};
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],ay=mapY(a),by=mapY(b);
  const cuts=[0,1];
  if(Math.abs(by-ay)>1e-9)for(const bound of [lo,hi]){
   const t=(bound-ay)/(by-ay);if(t>1e-9&&t<1-1e-9)cuts.push(t);
  }
  cuts.sort((x,y)=>x-y);
  for(let j=1;j<cuts.length;j++){
   const ta=cuts[j-1],tb=cuts[j],y=ay+(by-ay)*(ta+tb)/2;
   if(y>=lo&&y<=hi){flush();continue;}
   const start=a.clone().lerp(b,ta),end=a.clone().lerp(b,tb);
   if(!run.length)run.push(start);
   else if(run.at(-1).distanceToSquared(start)>1e-10){flush();run.push(start);}
   run.push(end);
  }
 }
 flush();return output;
}
