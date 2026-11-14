import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {RAIL_PROFILE} from '../src/rail-profile.js';
import {TRANSPORT_GROUND_VERSION} from '../src/transport-ground-profile.js';

// Build overview geometry only from the FINAL render-visible road paths,
// never from unfiltered raw OSM, because owner deletions (250A, campus,
// airports, junctions) must not reappear in the fast overview.
const root=new URL('../',import.meta.url);
registerHooks({resolve(specifier,context,next){
 if(specifier==='three')return{url:new URL('src/vendor/three-r160/build/three.module.js',root).href,shortCircuit:true};
 return next(specifier,context);
}});
const {HIGHWAY_ASPHALT_LIFT}=await import('../src/highway-surface.js');
const {values:options}=parseArgs({options:{bake:{type:'string'},output:{type:'string'}}});
const src=options.bake?pathToFileURL(resolve(options.bake)):new URL('data/osm/transport-geometry-bake-v1.json.gz',root);
const bake=JSON.parse(gunzipSync(await readFile(src)));
if(bake.version!=='transport-geometry-bake-v1'||bake.cacheKind!=='routes-only')
 throw Error('Expected verified compact source-display routes; never bake a giant mesh snapshot into first view');
if(bake.groundVersion!==TRANSPORT_GROUND_VERSION)throw Error('Rebuild the transport routes with the current ground profile before creating LOD');
function simplify(points,tolerance,verticalTolerance=.01){
 if(!Array.isArray(points)||points.length<2)return [];
 const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]],sq=tolerance*tolerance,verticalSq=verticalTolerance*verticalTolerance;
 while(stack.length){
  const [from,to]=stack.pop(),a=points[from],b=points[to],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],den=dx*dx+dy*dy+dz*dz;
  let max=0,index=-1;
  for(let i=from+1;i<to;i++){
   const p=points[i],t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy+(p[2]-a[2])*dz)/den)):0,
    px=a[0]+t*dx-p[0],py=a[1]+t*dy-p[1],pz=a[2]+t*dz-p[2],
    // Preserve the existing plan-view tolerance while independently keeping
    // shallow climbs, rail crossings and port approaches within .01 world units
    // of the source world-space profile. XZ-only simplification erased them.
    dist=Math.max((px*px+pz*pz)/sq,py*py/verticalSq);
   if(dist>max){max=dist;index=i;}
  }
  if(max>1&&index>=0){keep.add(index);stack.push([from,index],[index,to]);}
 }
 return [...keep].sort((a,b)=>a-b).map(i=>points[i].map(n=>Math.round(n*1000)/1000));
}
function roadAllowed(row,level){
 const kind=row.tags?.highway||'';
 return level==='far' ? row.highway||row.marked||['trunk','motorway','primary','secondary','tertiary','unclassified'].includes(kind) : true;
}
function toRows(items,level,rail=false){
 const rows=[],used=new Set();
 const supports=new Map((bake.groundSupports??[]).map(profile=>[profile.id,profile]));
 for(const row of items||[]){
  if(!row.points?.length||row.points.length<2||!rail&&!roadAllowed(row,level))continue;
  // The editor may expose a route twice (network source plus simplified
  // panel copy); avoid opaque overlapping duplicate strips.
  // Shared source junctions intentionally start multiple distinct branches.
  // A first-point/length key erased those branches once their ground datum
  // became equal, including one physical MZK model-port approach.
  const hash=createHash('sha256').update(JSON.stringify([row.id??row.sourceWayId??null,
   row.width,row.abandoned??false,row.groundSupportId??null,row.points])).digest('hex');
  if(used.has(hash))continue;used.add(hash);
  const support=rail&&row.groundSupportId?supports.get(row.groundSupportId):null;
  if(rail&&row.groundSupportId&&!support)throw Error('Missing model-rail ground support '+row.groundSupportId);
  const points=support?row.points.map(p=>[...p]):simplify(row.points,level==='far'?1.25:.22);
  // Runtime consumes literal final surface heights. Rails render the top of
  // their ballast; highway rows include the same thin asphalt as near meshes.
  const lift=rail?RAIL_PROFILE.ballastY:row.highway&&row.surface!=='ground'?HIGHWAY_ASPHALT_LIFT:0;
  if(lift)for(const p of points)p[1]+=lift;
  if(points.length<2)continue;
  rows.push({id:row.id,w:rail?(support?row.width:2.4):row.width??4.5,points,
   ...(row.tags?.bridge&&row.tags.bridge!=='no'?{elevated:true}:{}),
   ...(support?{groundSupportId:row.groundSupportId,normals:support.normals,...(support.heightField?{heightField:support.heightField}: {})}: {})});
 }
 return rows;
}
const data={version:'road-lod-prebuilt-v1',projection:'world-xz',ownerRevision:bake.ownerRevision??null,sourceFingerprint:bake.sourceFingerprint,displayGradeVersion:bake.displayGradeVersion??null,
 groundVersion:bake.groundVersion??null,buildInputsHash:bake.buildInputsHash??null,groundSupports:bake.groundSupports??[],
 sourceHash:createHash('sha256').update(JSON.stringify([bake.sourceFingerprint,bake.groundVersion??null,bake.buildInputsHash??null,
  bake.editable,bake.terrain?.rails,bake.groundSupports??[]])).digest('hex').slice(0,16),source:'final-owner-filtered-rendered-paths',
 levels:{
  far:{roads:toRows(bake.editable,'far'),rails:toRows(bake.terrain?.rails,'far',true)},
  medium:{roads:toRows(bake.editable,'medium'),rails:toRows(bake.terrain?.rails,'medium',true)}
 }};
if(data.levels.far.roads.length<100||data.levels.medium.roads.length<data.levels.far.roads.length)
 throw Error('Invalid owner-filtered LOD roads: '+JSON.stringify(data.levels.far.roads.length));
const target=options.output?pathToFileURL(resolve(options.output)):new URL('data/osm/road-lod-authoritative-v1.json.gz',root);
await mkdir(new URL('./',target),{recursive:true});
const bytes=gzipSync(Buffer.from(JSON.stringify(data)),{level:9});
if(bytes.length>2000000)throw Error('First-view authoritative LOD exceeds 2MB: '+bytes.length);
await writeFile(target,bytes);
console.log('AUTHORITATIVE_ROAD_LOD_PASS',JSON.stringify({gzipBytes:bytes.length,
 sourceFingerprint:data.sourceFingerprint,far:{roads:data.levels.far.roads.length,rails:data.levels.far.rails.length},
 medium:{roads:data.levels.medium.roads.length,rails:data.levels.medium.rails.length}}));
