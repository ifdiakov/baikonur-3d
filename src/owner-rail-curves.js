import * as THREE from 'three';
export const OWNER_RAIL_CURVES_VERSION='20261109-owner19-shared-rail-v3';
const w=(x,z,y=.653)=>new THREE.Vector3((x-650)*3.4,y,(z-522.5)*3.4);
const idOf=id=>String(id??'').match(/\d{7,}/)?.[0]||String(id??'');
const planar=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const profiles={
 '37547653':[[609.6,431.32],[607.25,428.7],[604.6,425.7],[605.2,420.9],[608.3,414.62]],
 '37546649':[[539.45,439.2],[538.2,436.9],[538.2,434.7],[537.9,431.5],[539.2,426.9]],
 '37548027':[[607.76,415.31],[605.2,420.9],[604.6,425.7],[600.35,429.44]]
};
// Both routes use ONE C1 centreline between the owner checkpoints.
const N=w(605.2,420.9,.68),S=w(604.6,425.7,.68),D=new THREE.Vector3(-.12,0,1).normalize();
function closestVertex(points,target){let best=-1,d=Infinity;for(let i=0;i<points.length;i++){const n=planar(points[i],target);if(n<d){d=n;best=i;}}return {i:best,d};}
function sharedApproach(points,id){
 const spec=profiles[id],one=closestVertex(points,w(...spec[0])),two=closestVertex(points,w(...spec.at(-1)));
 if(one.d>5||two.d>5||Math.abs(one.i-two.i)<2)return points;
 const lo=Math.min(one.i,two.i),hi=Math.max(one.i,two.i),north=points[lo].z<points[hi].z?lo:hi,south=north===lo?hi:lo,sign=south>north?1:-1;
 const a=points[north],b=points[south],direction=i=>points[Math.min(points.length-1,i+1)].clone().sub(points[Math.max(0,i-1)]).multiplyScalar(sign).setY(0).normalize();
 const ta=direction(north),tb=direction(south),northReach=Math.min(8,planar(a,N)*.32),southReach=Math.min(8,planar(S,b)*.32);
 const curves=[new THREE.CubicBezierCurve3(a,a.clone().addScaledVector(ta,northReach),N.clone().addScaledVector(D,-5),N),
  new THREE.CubicBezierCurve3(N,N.clone().addScaledVector(D,5),S.clone().addScaledVector(D,-5),S),
  new THREE.CubicBezierCurve3(S,S.clone().addScaledVector(D,5),b.clone().addScaledVector(tb,-southReach),b)];
 const samples=[];for(const c of curves){const part=c.getPoints(Math.max(12,Math.ceil(c.getLength()/.4)));if(samples.length)part.shift();samples.push(...part);}
 if(sign<0)samples.reverse();return [...points.slice(0,lo),...samples,...points.slice(hi+1)];
}
// Preserve exact shared endpoints; do not round an already smooth curve twice.
export const isOwnerSharedRail=rawId=>['37547653','37548027'].includes(idOf(rawId));
export function separateOwnerRailRuns(points,rawId){
 if(idOf(rawId)!=='37548027')return [points];
 const a=closestVertex(points,N),b=closestVertex(points,S);if(a.d>.05||b.d>.05)return [points];
 const lo=Math.min(a.i,b.i),hi=Math.max(a.i,b.i);return [points.slice(0,lo+1),points.slice(hi)].filter(p=>p.length>1);
}
export function shapeOwnerRail(points,rawId){
 const id=idOf(rawId),spec=profiles[id];if(!spec||points.length<4)return points;
 if(isOwnerSharedRail(id))return sharedApproach(points,id);
 let a=closestVertex(points,w(...spec[0])),b=closestVertex(points,w(...spec.at(-1)));
 if(a.d>5||b.d>5||Math.abs(a.i-b.i)<2)return points;
 let control=spec;if(a.i>b.i){[a,b]=[b,a];control=[...spec].reverse();}
 const first=points[a.i],last=points[b.i],knots=control.map(([x,z],i)=>w(x,z,i===0?first.y:i===control.length-1?last.y:Math.max(.653,first.y+(last.y-first.y)*i/(control.length-1))));
 knots[0]=first.clone();knots[knots.length-1]=last.clone();
 const curve=new THREE.CatmullRomCurve3(knots,false,'centripetal'),count=Math.max(60,Math.ceil(curve.getLength()/.45)),samples=curve.getPoints(count);
 for(const p of samples){const z=p.z/3.4+522.5;if(id==='37546649'&&z>=433&&z<=438)p.y=Math.max(.653,p.y);}
 return [...points.slice(0,a.i),...samples,...points.slice(b.i+1)];
}
export function missingOwnerRailSeam(paths){const mid=w(583.2,385);return !paths.some(r=>r.points.some(p=>planar(p,mid)<2));}
export function makeOwnerRailSeam(paths){
 const find=target=>{let best=null;for(const r of paths){if(!String(r.id).includes('37546649'))continue;for(const i of [0,r.points.length-1]){const p=r.points[i],d=planar(p,target);if(!best||d<best.d)best={p,inner:r.points[i===0?Math.min(3,r.points.length-1):Math.max(0,i-3)],d};}}return best;};
 const a=find(w(579,389)),b=find(w(587.4,380.9));if(!a||!b||a.d>5||b.d>5)throw Error('Owner railway seam endpoints are not present');
 const reach=Math.min(12,planar(a.p,b.p)/3),ta=a.p.clone().sub(a.inner).setY(0).normalize(),tb=b.inner.clone().sub(b.p).setY(0).normalize();
 const curve=new THREE.CubicBezierCurve3(a.p,a.p.clone().addScaledVector(ta,reach),b.p.clone().addScaledVector(tb,-reach),b.p),out=curve.getPoints(Math.ceil(curve.getLength()/.5));
 out.forEach((p,i)=>{const t=i/(out.length-1);p.y=a.p.y+(b.p.y-a.p.y)*t*t*(3-2*t);});return out;
}
export function matchOwnerTrainToRenderedRail(points,paths){
 const rendered=paths.find(r=>r.id==='osm-rail-37547653');if(!rendered)return points;
 const local=rendered.points.filter(p=>{const x=p.x/3.4+650,y=p.z/3.4+522.5;return x>598&&x<615&&y>412&&y<433;});if(local.length<4)return points;
 let a=closestVertex(points,local[0]),b=closestVertex(points,local.at(-1));if(a.d>2||b.d>2)return points;
 if(a.i>b.i){[a,b]=[b,a];local.reverse();}return [...points.slice(0,a.i),...local.map(p=>p.clone()),...points.slice(b.i+1)];
}

// Keep the original rounding everywhere outside the repaired shared approach.
export function roundOwnerRailCorners(points,rawId,round){
 if(!isOwnerSharedRail(rawId))return round(points,{radius:15});
 const protectedIndices=[];for(let i=0;i<points.length;i++){const p=points[i],x=p.x/3.4+650,y=p.z/3.4+522.5;if(x>598&&x<615&&y>412&&y<434)protectedIndices.push(i);}
 if(!protectedIndices.length)return round(points,{radius:15});
 const first=protectedIndices[0],last=protectedIndices.at(-1),before=points.slice(0,first+1),after=points.slice(last);
 return [...(before.length>2?round(before,{radius:15}):before).slice(0,-1),...points.slice(first,last+1),...(after.length>2?round(after,{radius:15}):after).slice(1)];
}
