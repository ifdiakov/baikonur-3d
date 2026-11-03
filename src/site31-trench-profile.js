// Site 31/6: source trace from north-up WorldView-3 imagery, 2025-08-09.
// The displayed rim is straightened and enlarged below, per owner request.
// Local +Z follows the incoming railway towards the south-east; -Z follows
// the flame duct towards the north-west. +X is the north-east side of the pad.
// Plan coordinates below are metres before the museum model's parent scale.
// Heights, the concealed rim under the bridge and the global map anchor are
// separate reconstruction assumptions, not a satellite-derived survey.
export const SITE31_YAW=Math.atan2(245,210);
export const SITE31_DUCT_SCALE=1.2;
export const SITE31_FLOOR_Y=-24*SITE31_DUCT_SCALE;

const frozenPoints=points=>Object.freeze(points.map(point=>Object.freeze(point)));

export const SITE31_REFERENCE=Object.freeze({
 provider:'Esri World Imagery / Vantor Vivid',
 imageryDate:'2025-08-09',
 satellite:'WorldView-3',
 sourceUrl:'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=7075420.9808345605%2C5779324.26454728%2C7076380.9808345605%2C5780124.26454728&bboxSR=3857&imageSR=3857&size=800%2C667&format=jpg&f=pjson',
 metadataUrl:'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/0/query?geometry=63.5639%2C45.9961&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=pjson',
 referenceImageSize:Object.freeze([800,667]),
 extent:Object.freeze({
  xmin:7075420.9808345605,ymin:5779324.064547278,
  xmax:7076380.9808345605,ymax:5780124.464547278,
  spatialReference:Object.freeze({wkid:102100,latestWkid:3857})
 }),
 sourcePixelSizeMetres:.31,
 sourceAccuracyMetres:5,
 groundMetresPerPixel:.8336488,
 originPixel:Object.freeze([411,332]),
 railAxisPixels:frozenPoints([[465,379],[710,589]]),
 ductBearingDegrees:310.6013,
 railBearingDegrees:130.6013,
 angularAccuracyDegrees:2,
 planAccuracyMetres:5,
 heightsVerified:false,
 underBridgeRimInferred:true,
 globalMapAnchorSurveyed:false,
 planBasis:'Manual trace of the visible outer concrete rim, approximately 3–6 image pixels; the table centre is partly obscured by structures and shadow.',
 inferredRimPixelSegment:frozenPoints([[451,325],[435,339],[415,355],[392,368]]),
 heightBasis:'The original approximate 24 m depth is enlarged by 20% to 28.8 m at the owner’s request; the satellite image does not measure heights.',
 displayedPlanBasis:'Straightened symmetric outline, enlarged by 20% in width and length relative to the traced bounds; the satellite compass axis is retained.',
 globalMapAnchorBasis:'The museum diagram anchor and satellite compass orientation are retained; the enlarged displayed outline is an owner adjustment.'
});

// Clockwise around the visible concrete outline in image coordinates.
// Points 11–14 close the shadowed, bridge-covered south-east edge by inference.
export const SITE31_RIM_PIXELS=frozenPoints([
 [275,210],[302,218],[326,230],[349,239],
 [374,232],[389,229],[407,238],[422,251],
 [435,272],[445,293],[452,314],[451,325],
 [435,339],[415,355],[392,368],[373,379],
 [355,380],[336,373],[322,359],[312,341],
 [306,318],[303,291],[298,268],[288,239]
]);

const cosine=Math.cos(SITE31_YAW),sine=Math.sin(SITE31_YAW);
const [originU,originV]=SITE31_REFERENCE.originPixel;
const metresPerPixel=SITE31_REFERENCE.groundMetresPerPixel;

export const SITE31_TRACED_RIM=frozenPoints(SITE31_RIM_PIXELS.map(([u,v])=>{
 const du=u-originU,dv=v-originV;
 return [(du*cosine-dv*sine)*metresPerPixel,(du*sine+dv*cosine)*metresPerPixel];
}));

// Keep the trace as provenance. The displayed basin is deliberately straight
// and symmetric, with exactly 1.2 times its original width and length.
const traceMinZ=Math.min(...SITE31_TRACED_RIM.map(p=>p[1]));
const traceMaxZ=Math.max(...SITE31_TRACED_RIM.map(p=>p[1]));
const traceWidth=Math.max(...SITE31_TRACED_RIM.map(p=>p[0]))-Math.min(...SITE31_TRACED_RIM.map(p=>p[0]));
const mouthZ=traceMinZ*SITE31_DUCT_SCALE,rearZ=traceMaxZ*SITE31_DUCT_SCALE;
const peak=1.4/2.15,normalization=peak**1.4*(1-peak)**.75;
const samples=[0,.03,.06,.10,.14,.19,.24,.29,.34,.40,.46,.52,.58,.64,peak,.70,.76,.82,.87,.91,.94,.965,.985,1];
const side=samples.map(t=>[traceWidth*SITE31_DUCT_SCALE*.5*t**1.4*(1-t)**.75/normalization,mouthZ+(rearZ-mouthZ)*t]);
export const SITE31_RIM=frozenPoints([...side,...side.slice(1,-1).reverse().map(([x,z])=>[-x,z])]);

export const SITE31_PIT=Object.freeze({
 polygon:SITE31_RIM,
 shape:'polygon',
 rimY:0,
 source:'WV03 compass axis; owner-requested straightening and 20% enlargement'
});

const minZ=Math.min(...SITE31_RIM.map(point=>point[1]));
const maxZ=Math.max(...SITE31_RIM.map(point=>point[1]));
const tolerance=1e-9;

// Inclusive intersection with a local constant-Z line. At either extreme
// vertex the result is [x,x], so a tip can be built without NaN or a gap.
// The symmetric rim has one interval at each Z; return null outside its extent.
export function site31RimAt(z){
 if(!Number.isFinite(z)||z<minZ-tolerance||z>maxZ+tolerance)return null;
 const sampleZ=Math.max(minZ,Math.min(maxZ,z)),hits=[];
 for(let i=0;i<SITE31_RIM.length;i++){
  const a=SITE31_RIM[i],b=SITE31_RIM[(i+1)%SITE31_RIM.length];
  const low=Math.min(a[1],b[1]),high=Math.max(a[1],b[1]);
  if(sampleZ<low-tolerance||sampleZ>high+tolerance)continue;
  const dz=b[1]-a[1];
  if(Math.abs(dz)<=tolerance){
   if(Math.abs(sampleZ-a[1])<=tolerance)hits.push(a[0],b[0]);
   continue;
  }
  const t=Math.max(0,Math.min(1,(sampleZ-a[1])/dz));
  hits.push(a[0]+(b[0]-a[0])*t);
 }
 return hits.length?[Math.min(...hits),Math.max(...hits)]:null;
}
