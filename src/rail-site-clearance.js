import {SITE92_HALLS,SITE92_YAW,site92Point,site92HallPosition} from './site92-layout.js?v=20261112-pantsirs-v1';
import {RAIL_PROFILE} from './rail-profile.js?v=20261031-facilities-rails-lighting-v1';
import {rectangleSegmentInterval} from './exhibit-road-filter.js?v=20261030-river-roads-signs-v1';

export const RAIL_SITE_CLEARANCE_VERSION='rail-building-footprints-site92-v2';

// These are footprints of the displayed museum models, not surveyed buildings.
// Their dimensions and transforms come directly from archive-buildings.js
// protonHalls()/mik42Facade(), archive-kit.js hall()/tank()/imageFrame(), and
// archive-manifest.js. The rail network keeps its archived OSM coordinates.
// The supplied railway scheme establishes which yards should remain visible:
// https://drive.google.com/file/d/1gONZXQYrHThNCu7M8wwifIM05SIdF7_6/view
const HALL92_YAW=SITE92_YAW;
const HALL92_IMAGE_ROWS=SITE92_HALLS;
const image92=site92Point;
const rectangle=(id,x,z,width,depth,yaw=0)=>({id,kind:'rectangle',x,z,width,depth,yaw});
const footprints92=HALL92_IMAGE_ROWS.map(([ix,iz,w,d],i)=>{
 const [x,z]=site92HallPosition(i);
 const depth=d*.60,minZ=-depth/2-.4;
 // hall() places windows at zz+2.9 with depth 4.6. The last window can
 // extend past the front roof edge, so the solid envelope is asymmetric.
 // All these halls have at least one gate; its seam reaches d/2+.41.
 let maxZ=depth/2+.41;
 for(let zz=-depth/2+3;zz<depth/2;zz+=7.5)maxZ=Math.max(maxZ,zz+2.9+2.3);
 const shiftZ=(minZ+maxZ)/2;
 // Side piers extend .475 m past each wall. Rotate the bounds-centre
 // offset in exactly the same frame as archiveKit.hall().
 return rectangle('hall-'+i,x+Math.sin(HALL92_YAW)*shiftZ,z+Math.cos(HALL92_YAW)*shiftZ,
  w*.60+.95,maxZ-minZ,HALL92_YAW);
});
for(const [i,position] of [[443,180],[416,211],[457,141]].entries()){
 const [x,z]=image92(position);
 // tank(): r=3.2, band major radius r+.04 and tube radius .10.
 footprints92.push({id:'tank-'+i,kind:'circle',x,z,radius:3.34,yaw:0});
 footprints92.push(rectangle('tank-ladder-'+i,x+4.2,z,.28,.28));
}
const footprints42=[
 // mik42Facade(): parapet width 144; the outermost window mullions reach
 // z=±(17.2+.33+.13). No railway gate or internal rail is authored here.
 rectangle('frontage',0,0,144,35.32),
 // Stair tower (7×9) and its adjacent 1×9.3 rim form this exact envelope.
 ...[-15,56].map((x,i)=>rectangle('stair-tower-'+i,x+.25,20,7.5,9.3))
];

export const RAIL_SITE_FOOTPRINTS=Object.freeze([
 {siteId:'pad-92',scale:.14,yaw:0,modelSource:'src/site92.js:buildSite92',
  sourceReference:'way/454633553',formerCircleRadius:25,footprints:footprints92},
 {siteId:'pad-42',scale:.28,yaw:0,modelSource:'src/archive-buildings.js:mik42Facade',
  sourceReference:'museum-photo-facade; absolute azimuth unverified',formerCircleRadius:22,footprints:footprints42}
].map(site=>Object.freeze({...site,footprints:Object.freeze(site.footprints.map(Object.freeze))})));

function circleInterval(a,b,radius){
 const dx=b[0]-a[0],dz=b[2]-a[2],aa=dx*dx+dz*dz;
 if(aa<1e-20)return a[0]*a[0]+a[2]*a[2]<radius*radius?[0,1]:null;
 const bb=2*(a[0]*dx+a[2]*dz),cc=a[0]*a[0]+a[2]*a[2]-radius*radius;
 const discriminant=bb*bb-4*aa*cc;
 if(discriminant<=0)return null;
 const root=Math.sqrt(discriminant),lo=Math.max(0,(-bb-root)/(2*aa)),hi=Math.min(1,(-bb+root)/(2*aa));
 return hi-lo>1e-10?[lo,hi]:null;
}

/** Rail-only clearance. Callers replace the old site-92/42 circular rail masks
 * with these footprints; road clipping and model geometry are independent.
 * clipPath accepts THREE.Vector3 points and preserves source heights exactly.
 */
export function createRailSiteClearancePlan({siteRecords,point,marginWorld=RAIL_PROFILE.ballastWidth/2+.02}){
 if(!Number.isFinite(marginWorld)||marginWorld<0)throw new Error('Rail footprint margin must be non-negative');
 const sites=[],footprints=[];
 for(const spec of RAIL_SITE_FOOTPRINTS){
  const site=siteRecords.find(row=>row.id===spec.siteId);if(!site)continue;
  const origin=point(site.x,site.y,0),yaw=site.runtimeYaw??spec.yaw,cos=Math.cos(yaw),sin=Math.sin(yaw);
  const siteFootprints=spec.footprints.map(shape=>{
   const x=origin.x+(shape.x*cos+shape.z*sin)*spec.scale,z=origin.z+(-shape.x*sin+shape.z*cos)*spec.scale;
   const angle=yaw+shape.yaw,c=Math.cos(angle),s=Math.sin(angle);
   const halfX=shape.kind==='rectangle'?shape.width*spec.scale/2:shape.radius*spec.scale;
   const halfZ=shape.kind==='rectangle'?shape.depth*spec.scale/2:shape.radius*spec.scale;
   const extentX=shape.kind==='circle'?halfX:Math.abs(c)*halfX+Math.abs(s)*halfZ;
   const extentZ=shape.kind==='circle'?halfZ:Math.abs(s)*halfX+Math.abs(c)*halfZ;
   const footprint={id:spec.siteId+'/'+shape.id,siteId:spec.siteId,kind:shape.kind,x,z,c,s,halfX,halfZ,
    bounds:{minX:x-extentX,maxX:x+extentX,minZ:z-extentZ,maxZ:z+extentZ}};
   footprints.push(footprint);return footprint;
  });
  sites.push({siteId:spec.siteId,modelSource:spec.modelSource,sourceReference:spec.sourceReference,
   formerCircleRadius:spec.formerCircleRadius,origin:[origin.x,origin.y,origin.z],scale:spec.scale,yaw,footprints:siteFootprints});
 }
 const local=(p,f)=>{const dx=p.x-f.x,dz=p.z-f.z;return [dx*f.c-dz*f.s,p.y,dx*f.s+dz*f.c];};
 const containsFootprint=(p,f)=>{
  const [x,,z]=local(p,f),rx=f.halfX+marginWorld,rz=f.halfZ+marginWorld;
  return f.kind==='circle'?x*x+z*z<rx*rx-1e-10:Math.abs(x)<rx-1e-8&&Math.abs(z)<rz-1e-8;
 };
 const contains=p=>footprints.some(f=>containsFootprint(p,f));
 const containsSite=(siteId,p)=>footprints.some(f=>f.siteId===siteId&&containsFootprint(p,f));
 const clippedWays=new Set(),cutRecords=[];
 let clippedPaths=0,hiddenLength=0;
 function clipPath(points,{sourceWayId=null}={}){
  if(points.length<2)return {runs:[],cuts:[]};
  if(!footprints.length)return {runs:[points],cuts:[]};
  const runs=[],cuts=[];let run=[],changed=false;
  const same=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<1e-8&&Math.abs(a.y-b.y)<1e-8;
  const add=p=>{if(!run.length||!same(run.at(-1),p))run.push(p);};
  const flush=()=>{if(run.length>1)runs.push(run);run=[];};
  const mix=(a,b,t)=>t<=0?a:t>=1?b:a.clone().lerp(b,t);
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],intervals=[];
   for(const f of footprints){
    // An oriented rectangle expanded in its own frame can extend farther
    // than marginWorld along world axes; sqrt(2) is a safe broad-phase pad.
    const pad=marginWorld*Math.SQRT2,box=f.bounds;
    if(Math.max(a.x,b.x)<box.minX-pad||Math.min(a.x,b.x)>box.maxX+pad||
      Math.max(a.z,b.z)<box.minZ-pad||Math.min(a.z,b.z)>box.maxZ+pad)continue;
    const aa=local(a,f),bb=local(b,f),interval=f.kind==='circle'?circleInterval(aa,bb,f.halfX+marginWorld):
     rectangleSegmentInterval(aa,bb,{minX:-f.halfX-marginWorld,maxX:f.halfX+marginWorld,minZ:-f.halfZ-marginWorld,maxZ:f.halfZ+marginWorld});
    if(interval)intervals.push({lo:interval[0],hi:interval[1],siteIds:[f.siteId]});
   }
   if(!intervals.length){add(a);add(b);continue;}
   changed=true;intervals.sort((a,b)=>a.lo-b.lo||a.hi-b.hi);
   const merged=[];
   for(const interval of intervals){const previous=merged.at(-1);
    if(previous&&interval.lo<=previous.hi+1e-10){previous.hi=Math.max(previous.hi,interval.hi);previous.siteIds=[...new Set([...previous.siteIds,...interval.siteIds])];}
    else merged.push({...interval});
   }
   let cursor=0;
   for(const interval of merged){
    const {lo,hi,siteIds}=interval;
    if(lo>cursor+1e-10){add(mix(a,b,cursor));add(mix(a,b,lo));}
    flush();
    for(const t of [lo,hi])if(t>1e-9&&t<1-1e-9)cuts.push({sourceWayId,siteIds:[...siteIds],position:mix(a,b,t)});
    hiddenLength+=(hi-lo)*Math.hypot(b.x-a.x,b.z-a.z);cursor=hi;
   }
   if(cursor<1-1e-10){add(mix(a,b,cursor));add(b);}
  }
  flush();
  if(changed){clippedPaths++;if(sourceWayId!==null)clippedWays.add(String(sourceWayId));
   cutRecords.push(...cuts.map(c=>({...c,position:[c.position.x,c.position.y,c.position.z]})));
  }
  return {runs:changed?runs:[points],cuts};
 }
 const stats=()=>({version:RAIL_SITE_CLEARANCE_VERSION,sourceGraphUnchanged:true,scope:'rails-only',marginWorld,
  siteIds:sites.map(s=>s.siteId),footprintCount:footprints.length,
  sites:sites.map(site=>({...site,footprints:site.footprints.map(({c,s,...f})=>({...f,yaw:Math.atan2(s,c),bounds:{...f.bounds}}))})),
  clippedPaths,clippedWayIds:[...clippedWays].sort(),hiddenLength,cuts:cutRecords.map(c=>({...c,siteIds:[...c.siteIds],position:[...c.position]}))});
 return {siteIds:Object.freeze(sites.map(s=>s.siteId)),contains,containsSite,clipPath,stats};
}
