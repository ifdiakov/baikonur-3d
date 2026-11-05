import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

// Build overview geometry only from the FINAL render-visible road paths,
// never from unfiltered raw OSM, because owner deletions (250A, campus,
// airports, junctions) must not reappear in the fast overview.
const root=new URL('../',import.meta.url);
const src=new URL('data/osm/transport-geometry-bake-v1.json.gz',root);
const bake=JSON.parse(gunzipSync(await readFile(src)));
if(bake.version!=='transport-geometry-bake-v1'||bake.cacheKind!=='routes-only')
 throw Error('Expected verified compact source-display routes; never bake a giant mesh snapshot into first view');
function simplify(points,tolerance){
 if(!Array.isArray(points)||points.length<2)return [];
 const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]],sq=tolerance*tolerance;
 while(stack.length){
  const [from,to]=stack.pop(),a=points[from],b=points[to],dx=b[0]-a[0],dz=b[2]-a[2],den=dx*dx+dz*dz;
  let max=0,index=-1;
  for(let i=from+1;i<to;i++){
   const p=points[i],t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/den)):0,
    px=a[0]+t*dx-p[0],pz=a[2]+t*dz-p[2],dist=px*px+pz*pz;
   if(dist>max){max=dist;index=i;}
  }
  if(max>sq&&index>=0){keep.add(index);stack.push([from,index],[index,to]);}
 }
 return [...keep].sort((a,b)=>a-b).map(i=>points[i].map(n=>Math.round(n*1000)/1000));
}
function roadAllowed(row,level){
 const kind=row.tags?.highway||'';
 return level==='far' ? row.highway||row.marked||['trunk','motorway','primary','secondary','tertiary','unclassified'].includes(kind) : true;
}
function toRows(items,level,rail=false){
 const rows=[],used=new Set();
 for(const row of items||[]){
  if(!row.points?.length||row.points.length<2||!rail&&!roadAllowed(row,level))continue;
  // The editor may expose a route twice (network source plus simplified
  // panel copy); avoid opaque overlapping duplicate strips.
  const hash=row.id+'|'+row.points.length+'|'+row.points[0].join(',');
  if(used.has(hash))continue;used.add(hash);
  const points=simplify(row.points,level==='far'?1.25:.22);
  if(points.length<2)continue;
  rows.push({id:row.id,w:rail?2.4:row.width??4.5,points});
 }
 return rows;
}
const data={version:'road-lod-prebuilt-v1',projection:'world-xz',sourceFingerprint:bake.sourceFingerprint,
 sourceHash:createHash('sha256').update(JSON.stringify([bake.sourceFingerprint,bake.stats.roadFeatureCount,
  bake.stats.railFeatureCount])).digest('hex').slice(0,16),source:'final-owner-filtered-rendered-paths',
 levels:{
  far:{roads:toRows(bake.editable,'far'),rails:toRows(bake.terrain?.rails,'far',true)},
  medium:{roads:toRows(bake.editable,'medium'),rails:toRows(bake.terrain?.rails,'medium',true)}
 }};
if(data.levels.far.roads.length<100||data.levels.medium.roads.length<data.levels.far.roads.length)
 throw Error('Invalid owner-filtered LOD roads: '+JSON.stringify(data.levels.far.roads.length));
await mkdir(new URL('data/osm/',root),{recursive:true});
const target=new URL('data/osm/road-lod-authoritative-v1.json.gz',root);
const bytes=gzipSync(Buffer.from(JSON.stringify(data)),{level:9});
if(bytes.length>2000000)throw Error('First-view authoritative LOD exceeds 2MB: '+bytes.length);
await writeFile(target,bytes);
console.log('AUTHORITATIVE_ROAD_LOD_PASS',JSON.stringify({gzipBytes:bytes.length,
 sourceFingerprint:data.sourceFingerprint,far:{roads:data.levels.far.roads.length,rails:data.levels.far.rails.length},
 medium:{roads:data.levels.medium.roads.length,rails:data.levels.medium.rails.length}}));
