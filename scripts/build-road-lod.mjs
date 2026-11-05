import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ROOT=new URL('../',import.meta.url);
const load=async name=>JSON.parse(await readFile(new URL(name,ROOT),'utf8'));
const roads=await load('data/osm/roads.geojson'),rails=await load('data/osm/railways.geojson');
const tolerance=(kind,level)=>kind==='rail'?(level==='far'?.00016:.000055):(level==='far'?.00025:.00006);
function simplify(points,t){
 if(points.length<=2)return points;
 // Repeated endpoints in a source OSM way are retained. This is display-only
 // simplification: topology and source IDs remain untouched in GeoJSON.
 const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]],d2=t*t;
 while(stack.length){
  const [first,last]=stack.pop();const a=points[first],b=points[last],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  let index=-1,best=-1;
  for(let i=first+1;i<last;i++){
   const p=points[i],u=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
   const x=a[0]+u*dx-p[0],y=a[1]+u*dy-p[1],distance=x*x+y*y;
   if(distance>best){best=distance;index=i;}
  }
  if(index>first&&index<last&&best>d2){keep.add(index);stack.push([first,index],[index,last]);}
 }
 return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
function assemble(features,kind,level){
 const allowed=new Set(level==='far'?['motorway','trunk','primary','secondary','tertiary','unclassified']:['motorway','trunk','primary','secondary','tertiary','unclassified','residential','service','track','living_street']);
 const rows=[];
 for(const f of features){
  if(f.geometry?.type!=='LineString'||f.geometry.coordinates.length<2)continue;
  const tags=f.properties?.tags||{},highway=tags.highway||'';
  if(kind==='road'&&!allowed.has(highway))continue;
  if(kind==='rail'&&!['rail','disused','abandoned'].includes(tags.railway))continue;
  if(kind==='rail'&&tags.railway!=='rail'&&level==='far')continue;
  const coordinates=simplify(f.geometry.coordinates,tolerance(kind,level));
  if(coordinates.length<2)continue;
  const width=kind==='rail'?1.8:({motorway:10,trunk:9,primary:7,secondary:6,tertiary:4.7,unclassified:4,service:2.5,track:2.2,residential:3.4,living_street:2.7}[highway]||3.2);
  const center=coordinates[Math.floor(coordinates.length/2)];
  // Deterministic spatial ordering; unloaded distant segments do not affect
  // the display order of local segments. Coordinates are quantized only in
  // this decorative LOD layer, NEVER in the real detailed road network.
  const tile=[Math.floor((center[0]-63.1)/.055),Math.floor((center[1]-45.55)/.055)];
  rows.push({id:String(f.properties.osmId),w:width,tile,points:coordinates.map(c=>[Math.round(c[0]*1e6)/1e6,Math.round(c[1]*1e6)/1e6])});
 }
 rows.sort((a,b)=>a.tile[0]-b.tile[0]||a.tile[1]-b.tile[1]||a.id.localeCompare(b.id));
 return rows;
}
const sourceHash=createHash('sha256').update(JSON.stringify([roads.osmBaseTimestamp,rails.osmBaseTimestamp,roads.features.length,rails.features.length])).digest('hex').slice(0,16);
const content={version:'road-lod-prebuilt-v1',sourceHash,projection:'OSM WGS84; project at runtime with museum geography',levels:{
 far:{roads:assemble(roads.features,'road','far'),rails:assemble(rails.features,'rail','far')},
 medium:{roads:assemble(roads.features,'road','medium'),rails:assemble(rails.features,'rail','medium')}
}};
const name=new URL('data/osm/road-lod-prebuilt-v1.json',ROOT),serialized=JSON.stringify(content);
if(process.argv.includes('--check')){
 const old=await readFile(name,'utf8');
 if(old!==serialized)throw Error('Prebuilt road LOD is stale; run node scripts/build-road-lod.mjs');
 console.log('ROAD_LOD_CHECK_PASS',JSON.stringify({bytes:serialized.length,...Object.fromEntries(Object.entries(content.levels).map(([k,v])=>[k,{roads:v.roads.length,rails:v.rails.length}]))}));}
else{await writeFile(name,serialized);console.log('ROAD_LOD_BUILT',serialized.length,sourceHash);}
