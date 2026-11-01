// Asset-level registration checks. The sampler's generic filtering fixtures live
// in steppe-surface.mjs; these checks protect the actual photograph registration.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {projectOsm} from '../src/osm-geography.js';
import {loadSatelliteReference} from '../src/satellite-reference.js';
import {createSatelliteProjection,createSatelliteUvCorrection} from '../src/steppe-surface.js';

const metadataUrl=new URL('../assets/terrain/satellite-uv-correction-v1.json',import.meta.url);
const gridUrl=new URL('../assets/terrain/satellite-uv-correction-v1.bin',import.meta.url);
const [metadataText,bytes]=await Promise.all([readFile(metadataUrl,'utf8'),readFile(gridUrl)]);
const metadata=JSON.parse(metadataText);
const [imageWidth,imageHeight]=metadata.imageResolution;
const {width,height,maxOffset}=metadata;
const hash=createHash('sha256').update(bytes).digest('hex');
assert.equal(metadata.version,'satellite-uv-correction-v1');
assert.equal(metadata.format,'RGBA8');
assert.deepEqual([width,height],[256,256]);
assert.deepEqual(metadata.imageResolution,[1278,1231]);
assert.deepEqual(maxOffset,[.08,.08]);
assert.equal(bytes.length,width*height*4,'The numerical texture must contain every RGBA texel');
assert.equal(bytes.length,metadata.bytes,'The manifest byte count must describe the committed grid');
assert.match(metadata.sha256,/^[0-9a-f]{64}$/);
assert.equal(hash,metadata.sha256,'The committed grid must match the reviewed manifest hash');
assert.equal(metadata.controls.length,38,'The reviewed registration has 38 river controls');

const requests=[];
const reference=await loadSatelliteReference({fetcher:async url=>{
 requests.push(url);
 assert.equal(new URL(url).href,gridUrl.href,'The runtime must load the reviewed numerical asset');
 return {ok:true,status:200,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
}});
assert.equal(requests.length,1,'One registration grid is shared by all terrain materials');
assert.deepEqual([reference.uvCorrection.width,reference.uvCorrection.height],[width,height]);
assert.deepEqual(reference.uvCorrection.maxOffset,maxOffset);
assert.deepEqual(Buffer.from(reference.uvCorrection.data),bytes);
await assert.rejects(loadSatelliteReference({fetcher:async()=>({ok:false,status:404})}),/failed to load.*404/);
await assert.rejects(loadSatelliteReference({fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(bytes.length-4)})}),/incomplete/);

const correction=createSatelliteUvCorrection(reference.uvCorrection);
const projection=createSatelliteProjection(reference);
const near=(actual,expected,tolerance,message)=>assert.ok(Math.abs(actual-expected)<=tolerance,
 `${message}: ${actual} differs from ${expected} by ${Math.abs(actual-expected)}`);
const toUv=([x,y])=>[x/imageWidth,1-y/imageHeight];
const toImage=([u,v])=>[u*imageWidth,(1-v)*imageHeight];
const offsetPixels=offset=>[offset[0]*imageWidth,-offset[1]*imageHeight];
const worldAt=lonLat=>{const [x,y]=projectOsm(lonLat);return [(x-650)*3.4,(y-522.5)*3.4];};
let riverSquaredError=0,riverMaxError=0,maxInteriorPinError=0;

// Compute affine positions from geographic coordinates rather than sampling the
// metadata's target pixels alone. This detects a mismatched world/UV transform.
for(const control of metadata.controls){
 assert.equal(control.kind,'river');
 const affineUv=projection.sample(...worldAt(control.lonLat)).uv;
 const target=toImage(affineUv);
 target.forEach((value,axis)=>near(value,control.target[axis],1e-5,`OSM river control ${control.index}, axis ${axis}`));
 const {offset}=correction.sample(...affineUv);
 const delta=offsetPixels(offset);
 const residual=Math.hypot(target[0]+delta[0]-control.source[0],target[1]+delta[1]-control.source[1]);
 assert.ok(residual<1,`River control ${control.index} must remain within one image pixel; got ${residual}`);
 near(residual,control.postQuantizedErrorPx,1e-6,`Recorded river residual ${control.index}`);
 riverSquaredError+=residual*residual;riverMaxError=Math.max(riverMaxError,residual);
}
const riverRms=Math.sqrt(riverSquaredError/metadata.controls.length);
assert.ok(riverRms<.5,'The registered river controls must retain subpixel RMS agreement');

// Independent named geographic fixtures: the two OSM runway endpoint pairs and
// western rail crossing used to establish the original affine placement.
const fixedLandmarks=[
 {name:'Yubileiny SW',lonLat:[63.2224604,46.0443881],pixel:[575.014,249.811],limit:.05},
 {name:'Yubileiny NE',lonLat:[63.2758234,46.0604768],pixel:[644.638,219.572],limit:.05},
 {name:'Krayniy SW',lonLat:[63.1941252,45.6143654],pixel:[539.424,1063.315],limit:.05},
 {name:'Krayniy NE',lonLat:[63.2272132,45.6294972],pixel:[582.578,1034.809],limit:.05},
 {name:'Western rail crossing',lonLat:[62.86694005,45.74724365],pixel:[111.775,810.675],limit:.15}
];
for(const landmark of fixedLandmarks){
 const uv=projection.sample(...worldAt(landmark.lonLat)).uv;
 const position=toImage(uv);
 position.forEach((value,axis)=>near(value,landmark.pixel[axis],.002,`${landmark.name} affine placement`));
 const change=Math.hypot(...offsetPixels(correction.sample(...uv).offset));
 assert.ok(change<=landmark.limit,`${landmark.name} must stay pinned; displacement ${change} px`);
}
for(const pin of metadata.zeroPins){
 // Perimeter pins have zero photo coverage; clamped filtering can retain a small
 // tangential offset there. The cell bounds below check their actual safety.
 if(pin[0]<=0||pin[0]>=imageWidth||pin[1]<=0||pin[1]>=imageHeight)continue;
 maxInteriorPinError=Math.max(maxInteriorPinError,Math.hypot(...offsetPixels(correction.sample(...toUv(pin)).offset)));
}
assert.ok(maxInteriorPinError<.3,`Interior terrain pins drifted ${maxInteriorPinError} px`);
for(const [pixel,expected,label]of [
 [[130,1100],0,'Unmatched western downstream tail'],
 [[1240,820],0,'Unmatched eastern photo meander'],
 [[610,234],1,'Yubileiny photo core'],
 [[680,1090],1,'Matched central river']
])near(correction.sample(...toUv(pixel)).confidence,expected,1e-12,label);

// Independently decode the asset to inspect its continuous piecewise-bilinear
// inverse map. Add the clamped half-texel border strips to the grid, so the proof
// covers the whole [0,1]^2 footprint, not just the interior texel centres.
const cols=width+2,rows=height+2;
const us=Float64Array.from({length:cols},(_,x)=>x===0?0:x===cols-1?1:(x-.5)/width);
const vs=Float64Array.from({length:rows},(_,y)=>y===0?0:y===rows-1?1:(y-.5)/height);
const mappedU=new Float64Array(cols*rows),mappedV=new Float64Array(cols*rows);
let maxDisplacement=0,confidenceSum=0,excluded=0;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const i=(y*width+x)*4;
 assert.ok(bytes[i]>=1&&bytes[i+1]>=1,'Byte zero exceeds the declared signed offset range');
 assert.equal(bytes[i+3],255,'The reserved alpha channel must remain opaque');
 maxDisplacement=Math.max(maxDisplacement,Math.hypot((bytes[i]-128)/127*maxOffset[0]*imageWidth,
  (bytes[i+1]-128)/127*maxOffset[1]*imageHeight));
 confidenceSum+=bytes[i+2];if(bytes[i+2]===0)excluded++;
}
for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
 const px=Math.max(0,Math.min(width-1,x-1)),py=Math.max(0,Math.min(height-1,y-1));
 const i=(py*width+px)*4,k=y*cols+x;
 mappedU[k]=us[x]+(bytes[i]-128)/127*maxOffset[0];
 mappedV[k]=vs[y]+(bytes[i+1]-128)/127*maxOffset[1];
 // A bilinear scalar reaches its extrema at rectangle corners. All cell
 // vertices inside the source image therefore prove every interpolated sample
 // stays inside, even before applying the confidence and footprint masks.
 assert.ok(mappedU[k]>=-1e-12&&mappedU[k]<=1+1e-12&&mappedV[k]>=-1e-12&&mappedV[k]<=1+1e-12,
  `Source UV escapes at grid boundary ${x},${y}: ${mappedU[k]},${mappedV[k]}`);
}
let minJacobian=Infinity,maxJacobian=-Infinity,checkedCells=0;
const cross=(ax,ay,bx,by)=>ax*by-ay*bx;
for(let y=0;y<rows-1;y++)for(let x=0;x<cols-1;x++){
 const a=y*cols+x,b=a+1,c=a+cols,d=c+1;
 const bottom=[mappedU[b]-mappedU[a],mappedV[b]-mappedV[a]];
 const top=[mappedU[d]-mappedU[c],mappedV[d]-mappedV[c]];
 const left=[mappedU[c]-mappedU[a],mappedV[c]-mappedV[a]];
 const right=[mappedU[d]-mappedU[b],mappedV[d]-mappedV[b]];
 const area=(us[x+1]-us[x])*(vs[y+1]-vs[y]);
 // The determinant of a bilinear 2D map is affine within a cell: its corner
 // values bound the entire cell. This catches folds missed by landmark tests.
 for(const [horizontal,vertical]of [[bottom,left],[bottom,right],[top,left],[top,right]]){
  const determinant=cross(...horizontal,...vertical)/area;
  minJacobian=Math.min(minJacobian,determinant);maxJacobian=Math.max(maxJacobian,determinant);
 }
 checkedCells++;
}
assert.ok(minJacobian>.25,`The inverse image registration is folded or nearly singular: ${minJacobian}`);
assert.ok(maxJacobian<3.25,`The inverse image registration stretches an area excessively: ${maxJacobian}`);
near(minJacobian,metadata.statistics.minJacobian,1e-8,'Manifest minimum Jacobian');
near(maxJacobian,metadata.statistics.maxJacobian,1e-8,'Manifest maximum Jacobian');
near(maxDisplacement,metadata.statistics.maxDisplacementPixels,1e-8,'Manifest maximum displacement');
assert.equal(metadata.statistics.nonPositiveJacobianSamples,0);

// Runtime probes cover every half-grid interval, plus the outer boundary. The
// mathematical bounds above are independent of the helper; these probes check
// that the actual sampler obeys those bounds, row orientation, and confidence.
let runtimeProbes=0,coveredProbes=0;
for(let y=0;y<=2*height;y++)for(let x=0;x<=2*width;x++){
 const u=x/(2*width),v=y/(2*height),sample=correction.sample(u,v);
 assert.ok(Number.isFinite(sample.confidence)&&sample.confidence>=0&&sample.confidence<=1,'Runtime confidence must remain bounded');
 if(sample.confidence>0&&u>0&&u<1&&v>0&&v<1){
  const sourceU=u+sample.offset[0],sourceV=v+sample.offset[1];
  assert.ok(sourceU>=-1e-12&&sourceU<=1+1e-12&&sourceV>=-1e-12&&sourceV<=1+1e-12,
   `Covered runtime sample leaves the photograph at ${u},${v}`);
  coveredProbes++;
 }
 runtimeProbes++;
}
const weightedExclusionPct=(1-confidenceSum/(255*width*height))*100;
near(weightedExclusionPct,metadata.statistics.confidenceWeightedPhotoAreaReductionPct,1e-10,'Manifest feathered confidence exclusion');
near(excluded/(width*height)*100,metadata.statistics.confidenceFullyExcludedAreaPct,1e-10,'Manifest full confidence exclusion');
assert.ok(weightedExclusionPct<6,'Unsupported source reaches must remain a limited exception');
correction.texture.dispose();
console.log('Satellite registration asset checks passed:',JSON.stringify({sha256:hash,bytes:bytes.length,
 riverControls:metadata.controls.length,riverRmsPx:riverRms,riverMaxPx:riverMaxError,
 fixedLandmarks:fixedLandmarks.length,maxInteriorPinErrorPx:maxInteriorPinError,
 checkedCells,minJacobian,maxJacobian,maxDisplacementPx:maxDisplacement,
 runtimeProbes,coveredProbes,weightedExclusionPct}));
