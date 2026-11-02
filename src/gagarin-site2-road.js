// Display-only, OSM-grounded approach to Gagarin's Start with one museum
// junction to the relocated Site 2. Never mutate OSM source nodes or routes.
export const GAGARIN_ROAD_VERSION='gagarin-site2-road-v4';
export const GAGARIN_APPROACH_WAY_ID='54570611';
export const GAGARIN_NORTH_FORK_WAY_ID='54569454';
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const xyz=p=>Array.isArray(p)?p:[p.x,p.y,p.z];
const minClearance=26.5;
// Samples are in the scene's world units, not nominal OSM metres.
export function planGagarinSite2Road({sourcePoints,gagarin,site2,site2Gate,metre=.14}){
 if(!Array.isArray(sourcePoints)||sourcePoints.length<3)throw new Error('Gagarin road requires the source OSM polyline');
 const origin=sourcePoints.map(p=>[...xyz(p)]);
 const g=xyz(gagarin),s=xyz(site2),entry=xyz(site2Gate);
 if([g,s,entry,...origin].some(p=>p.length!==3||p.some(v=>!Number.isFinite(v))))
  throw new TypeError('Invalid Gagarin access coordinates');
 if(dist(origin[0],g)<dist(origin.at(-1),g))origin.reverse();
 const gagarinGate=[g[0]-138*metre,entry[1],g[2]];
 // End on the west edge of the model forecourt, not inside the launch stand.
 const source=[];
 let trimmed=false;
 for(let i=0;i<origin.length-1;i++){
  const a=origin[i],b=origin[i+1];
  if(!source.length)source.push(a);
  if(a[0]<=gagarinGate[0]&&b[0]>=gagarinGate[0]&&b[0]>a[0]){
   source.push(lerp(a,b,(gagarinGate[0]-a[0])/(b[0]-a[0])));
   trimmed=true;break;
  }
  source.push(b);
 }
 if(!trimmed)throw new Error('OSM Gagarin road does not cross the model forecourt');
 if(dist(source.at(-1),gagarinGate)>.02)source.push(gagarinGate);
 else source[source.length-1]=gagarinGate;
 const dense=[source[0]];
 for(let i=1;i<source.length;i++){
  const a=source[i-1],b=source[i],pieces=Math.max(1,Math.ceil(dist(a,b)/1.15));
  for(let j=1;j<=pieces;j++)dense.push(lerp(a,b,j/pieces));
 }
 // Shift only the tiny part of the road approaching the relocated museum
 // footprint; smooth radial clearance prevents clipping the building apron.
 for(let i=1;i<dense.length-1;i++){
  const p=dense[i],dx=p[0]-s[0],dz=p[2]-s[2],d=Math.hypot(dx,dz);
  if(d>=minClearance)continue;
  const shift=(minClearance-d)*(.65+.35*smooth(0,2.5,minClearance-d));
  const r=Math.max(d,1e-6);
  p[0]+=dx/r*shift;p[2]+=dz/r*shift;
 }
 // A short 3-point smoothing pass removes elbows in the sampled OSM geometry.
 const smoothed=dense.map(p=>[...p]);
 for(let i=1;i<dense.length-1;i++){
  smoothed[i][0]=dense[i][0]*.62+(dense[i-1][0]+dense[i+1][0])*.19;
  smoothed[i][2]=dense[i][2]*.62+(dense[i-1][2]+dense[i+1][2])*.19;
 }
 // Re-enforce clearance after smoothing; endpoints are exact OSM/model joins.
 for(let i=1;i<smoothed.length-1;i++){
  const p=smoothed[i],dx=p[0]-s[0],dz=p[2]-s[2],d=Math.hypot(dx,dz);
  if(d<minClearance-.2){const r=Math.max(d,1e-6),fix=minClearance-d;
   p[0]+=dx/r*fix;p[2]+=dz/r*fix;
  }
 }
 smoothed[0]=[...source[0]];smoothed[smoothed.length-1]=gagarinGate;
 let length=0;
 for(let i=0;i<smoothed.length;i++){
  if(i)length+=dist(smoothed[i-1],smoothed[i]);
  // Gentle approach grade joins OSM exterior pavement to the museum datum
  // before the branch and the already-modelled Gagarin apron.
  const t=smooth(0,31,length);
  smoothed[i][1]=source[0][1]*(1-t)+gagarinGate[1]*t;
 }
 let best={distance:Infinity};
 for(let i=1;i<smoothed.length;i++){
  const a=smoothed[i-1],b=smoothed[i],dx=b[0]-a[0],dz=b[2]-a[2];
  const denom=dx*dx+dz*dz;
  if(denom<1e-8)continue;
  const t=clamp(((entry[0]-a[0])*dx+(entry[2]-a[2])*dz)/denom);
  const near=lerp(a,b,t),d=dist(near,entry);
  if(d<best.distance)best={distance:d,point:near,index:i,t,
   tangent:[dx,0,dz]};
 }
 if(best.distance>32)throw new Error('Site 2 entrance has no nearby segment of the OSM approach road');
 const pointDistance=dist(smoothed[0],origin[0]);
 const maxStep=Math.max(...smoothed.slice(1).map((p,i)=>dist(p,smoothed[i])));
 const minBodyClearance=Math.min(...smoothed.slice(1,-1).map(p=>dist(p,s)));
 return {main:smoothed,branchStart:best.point,branchTangent:best.tangent,
  site2Gate:entry,sourceWayId:GAGARIN_APPROACH_WAY_ID,
  metrics:{version:GAGARIN_ROAD_VERSION,sourceWayId:GAGARIN_APPROACH_WAY_ID,
   sourceJoinGap:pointDistance,site2BranchGap:best.distance,
   site2MinClearance:minBodyClearance,mainLength:length,
   maxSampleStep:maxStep,forecourtGap:dist(smoothed.at(-1),gagarinGate),
   sourceNodeCount:sourcePoints.length,samples:smoothed.length}};
}
