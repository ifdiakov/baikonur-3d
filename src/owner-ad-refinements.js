// Owner-directed surgical refinements of the existing AD source geometry.
// World coordinates use x=(mapX-650)*3.4, z=(mapY-522.5)*3.4.
// The OSM source data and its graph identities are intentionally unchanged.
export const OWNER_AD_REFINEMENTS_VERSION='20261108-owner-19-road-fixes-v1';
const map=p=>({x:p.x/3.4+650,y:p.z/3.4+522.5});
const distance=(p,x,y)=>{const m=map(p);return Math.hypot(m.x-x,m.y-y);};
export function omitOwnerRoadEdge(edge){
 const id=String(edge.wayId),mx=(map(edge.a.position).x+map(edge.b.position).x)/2,
  my=(map(edge.a.position).y+map(edge.b.position).y)/2;
 // Delete stray road tails, not the host network. Segment decisions preserve
 // the main railway and motorway geometries beside these intersections.
 if(id==='172571864'||id==='172441889')return true; // excess arms at AD T-junction 605.7/424.2
 if(id==='172704810'&&mx>556&&my>402)return true; // dead end 558.4/405.2
 if(id==='443174416'||id==='172704752')return true; // user marked dangling road fragments
 return false;
}
const smoothZones=[
 {x:605.7,y:424.2,r:4,ids:['172571782']},
 {x:612.5,y:414.1,r:5,ids:['54570611','54569454','54566004']},
 {x:620,y:402.8,r:6,ids:['54570611','172441909']},
 {x:585,y:402.6,r:5,ids:['172571885','172571880']},
 {x:580.2,y:404,r:4,ids:['172571880','172571693']},
 {x:589.8,y:377.1,r:4,ids:['183464610','172571845']}
];
export function polishOwnerRoadSamples(points,wayId){
 const id=String(wayId??'');
 if(!points||points.length<3)return points;
 const zones=smoothZones.filter(z=>z.ids.includes(id));
 const liftAreas=id==='1135822986'?[{x:538.7,y:440.9}]:
  id==='1135823771'?[{x:543.4,y:446.2}]:[];
 const separate=id==='172704701';
 if(!zones.length&&!liftAreas.length&&!separate)return points;
 const result=points.map(p=>p.clone());
 // Smooth a bounded number of chords around the owner-selected turns.
 // Each new position uses the ORIGINAL neighbours, avoiding cumulative drift.
 for(let i=1;i<points.length-1;i++){
  const p=points[i],q=result[i],prior=points[Math.max(0,i-4)],after=points[Math.min(points.length-1,i+4)];
  const smoothing=Math.max(0,...zones.map(z=>Math.max(0,1-distance(p,z.x,z.y)/z.r)));
  if(smoothing>0){
   const weight=.18*smoothing;
   q.x+=(prior.x+after.x-2*p.x)*weight;
   q.z+=(prior.z+after.z-2*p.z)*weight;
  }
  // Adjacent source ramps sometimes occupy an identical depth plane at
  // X538.7/Y440.9 and X543.4/Y446.2. A small tapered grade offset
  // eliminates coplanar flicker while keeping both roads and junctions.
  for(const area of liftAreas){
   const d=distance(p,area.x,area.y);
   if(d<4)q.y+=.07*Math.pow(1-d/4,2);
  }
  if(separate){
   const d=distance(p,559.5,406.6);
   if(d<7){
    const t=1-d/7,shift=3.4*2.1*t*t*(3-2*t);
    q.x-=shift*.69;q.z-=shift*.72;
   }
  }
 }
 return result;
}

/** Apply identical owner edits in cached route and overview LOD geometry.
 * Return zero or one retained polyline; deleted fragments cannot reappear
 * when camera crosses a level-of-detail threshold. */
export function polishCachedOwnerAd(points,rawId){
 const text=String(rawId??''),id=(text.match(/(?:osm-road-|marking-road-)?(\d{7,})(?:-|$)/)||[])[1]||text;
 const removed=['172571864','172441889','443174416','172704752'];
 if(removed.includes(id))return [];
 let line=points;
 if(id==='172704810'){
  const terminal=points.findIndex(p=>{const q=map(p);return q.x>556&&q.y>402;});
  if(terminal>1)line=points.slice(0,terminal);
 }
 return line.length>1?polishOwnerRoadSamples(line,id):[];
}
