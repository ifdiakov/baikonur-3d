// Display-only bypass of the real OSM road beside Site 250A.
// The underlying road/rail graphs and their source coordinates never change.
export const SITE250A_THROUGH_WAY_ID='54568055';
export const SITE250A_THROUGH_VERSION='osm-54568055-smooth-ukss-road-v2';
export const SITE250A_THROUGH_PROFILE=Object.freeze({
 width:2.5,spurWidth:2.5,offset:13.5,
 halfX:160*.14,minZ:-138*.14,maxZ:160*.14
});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const interpolate=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const cubic=(a,b,c,d,t)=>{const u=1-t;return a.map((v,i)=>v*u*u*u+3*b[i]*u*u*t+3*c[i]*u*t*t+d[i]*t*t*t);};
const unit=(a,b)=>{const n=horizontal(a,b)||1;return [(b[0]-a[0])/n,0,(b[2]-a[2])/n];};
const valid=items=>items.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite));

export function planSite250aThroughRoad({sourcePoints,siteCenter,siteYaw,cryoGate,ukssGate}={}){
 if(!Array.isArray(sourcePoints)||sourcePoints.length<5||!valid([...sourcePoints,siteCenter,cryoGate,ukssGate])||!Number.isFinite(siteYaw))
  throw Error('The real 250A road and both model entrances are required');
 const points=sourcePoints.map(p=>[...p]);
 if(horizontal(points[0],ukssGate)<horizontal(points.at(-1),ukssGate))points.reverse();
 const c=Math.cos(siteYaw),s=Math.sin(siteYaw),right=[c,0,-s],forward=[s,0,c];
 const local=p=>{const x=p[0]-siteCenter[0],z=p[2]-siteCenter[2];return [x*c-z*s,x*s+z*c];};
 const cutoff=points.findIndex((p,i)=>i>2&&horizontal(p,ukssGate)<12);
 const spine=points.slice(0,cutoff>=3?cutoff+1:points.length);
 const startZ=local(spine[0])[1];
 if(startZ<48)throw Error('250A main road approach is not on the north side');
 // Source line geometry is sparse precisely where it passes the complex.
 // Subdivide BEFORE applying the local offset; otherwise a single straight
 // triangle chord cuts through the enlarged photographed buildings.
 const original=[spine[0].slice()];
 for(let i=1;i<spine.length;i++){
  const a=spine[i-1],b=spine[i],n=Math.max(1,Math.ceil(horizontal(a,b)/1.1));
  for(let j=1;j<=n;j++)original.push(interpolate(a,b,j/n));
 }
 const shaped=original.map(p=>{
  const z=local(p)[1];
  const inBlend=smooth((42-z)/14),outBlend=smooth((z+55)/20);
  const detour=SITE250A_THROUGH_PROFILE.offset*inBlend*outBlend;
  // Lateral shaping and grading are independent. A short local-Z height
  // blend previously created a 12% ramp beside the cryogenic compound.
  // Use true cumulative roadway distance for the smooth level transition.
  return [p[0]+right[0]*detour,p[1],p[2]+right[2]*detour];
 });
 // The lateral shift briefly increases local arc length. Re-sample after
 // offsetting so the road's real geometric vertex spacing stays uniform.
 const main=[shaped[0].slice()];
 for(let i=1;i<shaped.length;i++){
  const a=shaped[i-1],b=shaped[i],count=Math.max(1,Math.ceil(horizontal(a,b)/1.05));
  for(let j=1;j<=count;j++)main.push(interpolate(a,b,j/count));
 }
 // Stop along the existing source road near UKSS. Do not follow its last
 // unnecessary node and then reverse direction into the launch-site gate.
 const last=main.at(-1),span=horizontal(last,ukssGate);
 if(span<.1||span>45)throw Error('UKSS is not attached to the retained OSM road');
 const tangent=unit(main[Math.max(0,main.length-4)],last);
 const ukssInward=[-Math.sin(-.56),0,-Math.cos(-.56)],reach=Math.min(span*.34,5);
 const c1=last.map((v,i)=>v+tangent[i]*reach),c2=ukssGate.map((v,i)=>v-ukssInward[i]*reach);
 const count=Math.max(8,Math.ceil(span/.7));
 for(let i=1;i<=count;i++)main.push(cubic(last,c1,c2,ukssGate,i/count));
 main[main.length-1]=[...ukssGate];
 // A single short side branch connects the photographed 250A gate.
 let nearest=-1,distance=Infinity;
 const gateZ=local(cryoGate)[1];
 for(let i=2;i<main.length-2;i++){
  if(Math.abs(local(main[i])[1]-gateZ)>10)continue;
  const d=horizontal(main[i],cryoGate);
  if(d<distance){distance=d;nearest=i;}
 }
 if(nearest<0||distance<5||distance>23)throw Error('The bypass cannot connect to the 250A gate');
 // A road passing beside the buildings must have a practical, continuous
 // grade. Smooth between the original access datum, the 250A side-junction
 // and the actual UKSS entry using travelled distance (not plan Z).
 const stations=[0];
 for(let i=1;i<main.length;i++)stations.push(stations.at(-1)+horizontal(main[i-1],main[i]));
 const atGate=stations[nearest],total=stations.at(-1),startY=main[0][1];
 if(atGate<50||total-atGate<10)throw Error('250A bypass is too short for a safe road grade');
 for(let i=0;i<main.length;i++){
  const at=stations[i];
  main[i][1]=at<=atGate
   ?startY+(cryoGate[1]-startY)*smooth(at/atGate)
   :cryoGate[1]+(ukssGate[1]-cryoGate[1])*smooth((at-atGate)/(total-atGate));
 }
 const junction=main[nearest],approach=unit(main[nearest-2],main[nearest+2]);
 const r=Math.min(3,distance*.32),p1=junction.map((v,i)=>v+approach[i]*r),p2=cryoGate.map((v,i)=>v+right[i]*r);
 const spur=[junction.slice()],steps=Math.max(10,Math.ceil(distance/.6));
 for(let i=1;i<=steps;i++)spur.push(cubic(junction,p1,p2,cryoGate,i/steps));
 spur[spur.length-1]=[...cryoGate];
 let minClearance=Infinity,maxGrade=0,length=0,spurLength=0;
 for(const p of main){const [x,z]=local(p);
  if(z>=SITE250A_THROUGH_PROFILE.minZ-3.25&&z<=SITE250A_THROUGH_PROFILE.maxZ+3.25)
   minClearance=Math.min(minClearance,x-SITE250A_THROUGH_PROFILE.halfX-SITE250A_THROUGH_PROFILE.width/2);
 }
 for(const [line,isSpur] of [[main,false],[spur,true]])for(let i=1;i<line.length;i++){
  const ds=horizontal(line[i-1],line[i]);
  if(isSpur)spurLength+=ds;else length+=ds;
  if(ds>0)maxGrade=Math.max(maxGrade,Math.abs(line[i][1]-line[i-1][1])/ds);
 }
 if(minClearance<3)throw Error('The 250A bypass still clips the complex: '+minClearance);
 return {main,spur,report:{version:SITE250A_THROUGH_VERSION,sourceWayId:SITE250A_THROUGH_WAY_ID,
  sourceTopologyPreserved:true,mainLength:length,spurLength,mainSamples:main.length,spurSamples:spur.length,
  minimumSiteClearance:minClearance,maxGrade,sourceStart:[...points[0]],junction:[...junction],
  slopeProfile:'arc-length-cubic-eased',endDatum:ukssGate[1]}};
}
