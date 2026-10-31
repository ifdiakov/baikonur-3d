import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMuseumGeography,OSM_RUNTIME_ANCHORS} from '../src/osm-geography.js';
import * as FLANK_GEOMETRY from '../src/flank-boundaries.js';
const {FLANK_POLYGONS,FLANK_COORDINATE_SYSTEM}=FLANK_GEOMETRY;

const load=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const [catalog,matches,airports,facilities]=await Promise.all([
  load('../data/catalog.json'),load('../data/osm/catalog-matches.json'),
  load('../data/osm/airports.geojson'),load('../data/osm/facilities.geojson')
]);
const original=JSON.stringify(catalog),geo=createMuseumGeography({catalog,matches}),report=geo.stats();
const active=geo.sites.filter(s=>!s.aliasOf&&s.render!==false);
assert.equal(report.activeSites,98);
assert.equal(report.anchored+report.inferred,report.activeSites);
assert.equal(report.anchored,72);
assert.equal(report.resolvedByName,3);
assert.equal(report.sharedCompoundSites,2);
assert.equal(report.inferred,26);
assert.equal(JSON.stringify(catalog),original,'Input catalogue was mutated');
const byId=new Map(geo.sites.map(s=>[s.id,s]));
for(const before of catalog.sites){
  const after=byId.get(before.id);
  for(const key of ['id','model','organisation','purpose','purposeLong','firstYear','titleShort','photoFolder','aliasOf','render'])
    assert.deepEqual(after[key],before[key],`${before.id}: metadata ${key} changed`);
  assert.deepEqual(after.originalSchematic,{x:before.x,y:before.y});
  assert(Number.isFinite(after.x)&&Number.isFinite(after.y));
}

// This checks orientation and reversibility without assuming legacy pixel
// positions, which are no longer the geographic source of the live scene.
assert.deepEqual(geo.project(63.35,45.85),[650,522.5]);
assert(geo.project(63.36,45.85)[0]>650,'East must remain right');
assert(geo.project(63.35,45.86)[1]<522.5,'North must remain up');
for(const point of [[62.83,45.58],[63.35,45.85],[64.08,46.12]]){
  const returned=geo.inverseProject(geo.project(point));
  assert(Math.hypot(returned[0]-point[0],returned[1]-point[1])<1e-11);
}

for(const match of matches.matches.filter(m=>m.status.startsWith('exact-'))){
  const site=byId.get(match.siteId),expected=geo.project(match.representativeLonLat);
  assert.deepEqual(site.geoSource.sourceLonLat,match.representativeLonLat);
  if(site.id==='pad-23'){
    assert(Math.abs(site.x-expected[0]-20)<1e-9,'Saturn must move exactly 20 map units east');
    assert(Math.abs(site.y-expected[1])<1e-9,'Moving Saturn east must not change its north/south placement');
    assert.deepEqual(site.geoSource.displayOffset,[20,0]);
    assert.equal(site.geoSource.displayOffsetBasis,'owner-request-20261030');
    assert.equal(site.positionConfidence,'owner-adjusted-display');
    assert.deepEqual(site.geoSource.displayLonLat,geo.inverseProject(site.x,site.y));
  }else if(site.id==='pad-41'){
    const offset=site.geoSource.displayOffset;
    assert(Math.abs(Math.hypot(...offset)-30)<1e-9,'Site41 must move exactly30 map units along its road');
    assert(offset[0]<0&&offset[1]<0,'Site41 follows the access road northward, away from42');
    assert(Math.hypot(site.x-expected[0]-offset[0],site.y-expected[1]-offset[1])<1e-9);
    assert.equal(site.geoSource.displayOffsetBasis,'owner-request-20261031');
    assert.equal(site.positionConfidence,'owner-adjusted-display');
  }else if(site.geoSource.status!=='shared-compound-relative')
    assert(Math.hypot(site.x-expected[0],site.y-expected[1])<1e-9,`${site.id}: not at its source point`);
}

function centroid(coordinates){
  const origin=coordinates[0];let twiceArea=0,cx=0,cy=0;
  for(let i=1;i<coordinates.length;i++){
    const a=coordinates[i-1].map((v,k)=>v-origin[k]),b=coordinates[i].map((v,k)=>v-origin[k]);
    const cross=a[0]*b[1]-b[0]*a[1];twiceArea+=cross;cx+=(a[0]+b[0])*cross;cy+=(a[1]+b[1])*cross;
  }
  return [origin[0]+cx/(3*twiceArea),origin[1]+cy/(3*twiceArea)];
}
const sourceFeatures=new Map([...airports.features,...facilities.features].map(f=>[f.id,f]));
const mzk=centroid(sourceFeatures.get('way/172704643').geometry.coordinates[0]);
const sdi=centroid(sourceFeatures.get('way/172704656').geometry.coordinates[0]);
const mzkSource=byId.get('pad-112a').geoSource.sourceLonLat;
assert(Math.hypot(mzkSource[0]-(mzk[0]+sdi[0])/2,mzkSource[1]-(mzk[1]+sdi[1])/2)<1e-12);
const mik92=centroid(sourceFeatures.get('way/454633553').geometry.coordinates[0]);
assert(Math.hypot(...mik92.map((v,i)=>v-byId.get('pad-92').geoSource.sourceLonLat[i]))<1e-12);
assert.equal(byId.get('pad-75').geoSource.refs[0].id,4395821037,'The hotel must not use the unrelated Site75 polygon');
assert.equal(byId.get('pad-75').geoSource.refs[0].type,'node');
assert.equal(byId.get('pad-104').geoSource.status,'inferred','Repeated Site104 labels cannot be treated as a resolved source');

// A shared source territory cannot place two different model roots on top of
// each other. Its display offsets retain the previous relative arrangement.
const a106=byId.get('pad-106'),a109=byId.get('pad-109');
assert.deepEqual(a106.geoSource.sourceLonLat,a109.geoSource.sourceLonLat);
assert(Math.hypot(a106.x-a109.x,a106.y-a109.y)>15);
assert(a106.x<a109.x);
const sharedCenter=geo.project(a106.geoSource.sourceLonLat);
assert(Math.hypot((a106.x+a109.x)/2-sharedCenter[0],(a106.y+a109.y)/2-sharedCenter[1])<.1);

// Numerically differentiate the actual mapping on a finer grid than the
// implementation's guard. Positive determinant prevents flipped areas.
let minJacobian=Infinity,probes=0;
const h=.02;
for(let y=-300;y<=1300;y+=25)for(let x=-400;x<=1700;x+=25){
  const x1=geo.legacyPoint(x+h,y),x0=geo.legacyPoint(x-h,y),y1=geo.legacyPoint(x,y+h),y0=geo.legacyPoint(x,y-h);
  const j=[(x1[0]-x0[0])/(2*h),(y1[0]-y0[0])/(2*h),(x1[1]-x0[1])/(2*h),(y1[1]-y0[1])/(2*h)];
  const det=j[0]*j[3]-j[1]*j[2];minJacobian=Math.min(minJacobian,det);probes++;
  assert(det>.25&&j[0]>.25&&j[3]>.25,'Historical-layer warp folded');
  assert(Math.abs(det-geo.legacyJacobian(x,y))<1e-7,'Analytical derivative differs from actual warp');
}

function inside(p,polygon){
  let yes=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }
  return yes;
}
const districts=FLANK_COORDINATE_SYSTEM==='osm-map'?FLANK_POLYGONS:FLANK_POLYGONS.map(polygon=>polygon.map(p=>geo.legacyPoint(p)));
for(const [id,expected] of [['pad-81',0],['pad-200',0],['pad-1',1],['pad-110',1],['pad-23',1],['pad-31',2],['pad-42',2],['pad-43',2],['pad-45',2],['city',-1],['airfield',-1]]){
  const site=byId.get(id),hits=districts.map((polygon,i)=>inside([site.x,site.y],polygon)?i:-1).filter(i=>i!==-1);
  assert.deepEqual(hits,expected===-1?[]:[expected],`${id}: moved into a wrong flank`);
}
assert.equal(byId.get('sector-east').x,byId.get('pad-43').x);
assert.equal(byId.get('sector-east').y,byId.get('pad-43').y);
for(const site of active)assert(site.x>=geo.bounds.minX&&site.x<=geo.bounds.maxX&&site.y>=geo.bounds.minY&&site.y<=geo.bounds.maxY);
console.log('OSM_GEOGRAPHY_PASS',JSON.stringify({anchored:report.anchored,inferred:report.inferred,
  resolvedByName:report.resolvedByName,sharedCompoundSites:report.sharedCompoundSites,
  warpProbes:probes,minimumJacobian:minJacobian,bounds:geo.bounds,overrides:Object.keys(OSM_RUNTIME_ANCHORS)}));
