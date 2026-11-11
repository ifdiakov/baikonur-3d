// Owner-approved display corrections; archived OSM coordinates remain intact.
export const OWNER_AD_REFINEMENTS_VERSION='20261109-owner19-v2';
const map=p=>({x:p.x/3.4+650,y:p.z/3.4+522.5});
export const SITE113_STREET_IDS=new Set(['172571693','172571703','172571718','172571743','172571754','172571790','172571792','172571808','172571823','172571852','172571888']);
export const ownerRoadId=id=>(String(id??'').match(/(?:^|-)(\d{7,})(?:-|$)/)||[])[1]||String(id??'');
export function keepOwnerTownRoadEdge(edge){
 if(!SITE113_STREET_IDS.has(String(edge.wayId)))return false;
 const a=map(edge.a.position),b=map(edge.b.position),x=(a.x+b.x)/2,y=(a.y+b.y)/2;
 return x>556&&x<572&&y>404&&y<419;
}
// This obsolete source spur was already invisible under the old Site92 mask.
// Keep it removed when the halls move: it crosses the approved Site95 homes.
const removed=new Set(['172961129','172571864','172441889','172571782','172441896','443174416','172704752','172704782']);
export function omitOwnerRoadEdge(edge){
 const id=String(edge.wayId);if(removed.has(id))return true;
 const a=map(edge.a.position),b=map(edge.b.position);
 return id==='172704810'&&(a.x+b.x)/2>556&&(a.y+b.y)/2>402;
}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10-15*t+6*t*t);};
export function polishOwnerRoadSamples(points,rawId){
 const id=ownerRoadId(rawId);if(id!=='172704701'||points.length<2)return points;
 // Broad C2-tapered shift; preserve railway and all unaffected endpoints.
 return points.map(p=>{const q=p.clone(),m=map(p),weight=smooth((m.y-397)/5)*(1-smooth((m.y-411)/6));q.x-=3.4*3*.69*weight;q.z-=3.4*3*.72*weight;return q;});
}
export function polishCachedOwnerAd(points,rawId){
 const id=ownerRoadId(rawId);if(removed.has(id))return [];
 let line=points;
 if(id==='172704810'){
  const rejected=p=>{const m=map(p);return m.x>556&&m.y>402;};
  const runs=[];let run=[];for(const p of points){if(rejected(p)){if(run.length>1)runs.push(run);run=[];}else run.push(p);}if(run.length>1)runs.push(run);
  line=runs.sort((a,b)=>b.length-a.length)[0]||[];
 }
 return line.length>1?polishOwnerRoadSamples(line,id):[];
}
