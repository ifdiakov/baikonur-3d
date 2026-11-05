// Owner's overhead image is cropped to the housing district, south-west of
// the full OSM compound centroid. Pixel registration follows its street grid.
export const SITE113_VERSION='20261105-site113-town-v1';
export const SITE113_REFERENCE={folder:'1Jjp0M_CU7X0Vw-hb4PDERVwWsV9OXv7k',satellite:'15KPrL5rvBD6Ch5Ru1tL5YhAI4cSr-Ai3',photoCount:26,
 aerial:'1-cqLIU2uZzAqTUfNAQD2Pk5sDkIjmy-r',facade:'1vwM6S0xAhfyP9IaUf3OYJyAKQ1FSMYhK',pipes:'1rp3SIzamckTOaNgz_dxbpPBBhQzdSWtT',stage:'1W9d1HA4jnCCETUZRKFQTP27JMJ3xdTfM',
 registration:'owner satellite street grid / existing OSM compound anchor; approximate footprint and heights',osmCompound:454775162};
// The full compound anchor is outside the centre of this crop. Horizontal
// dimensions use museum drawing metres; store calibration instead of claiming
// a measured architectural survey. The common model scale remains 0.14.
export const SITE113_PIXEL_ORIGIN=[1135,205],SITE113_PIXEL_SCALE=.319;
export const site113Pixel=([u,v])=>[(u-SITE113_PIXEL_ORIGIN[0])*SITE113_PIXEL_SCALE,(v-SITE113_PIXEL_ORIGIN[1])*SITE113_PIXEL_SCALE];
// Small display offsets keep balconies clear of the wider museum roads.
const streetOffsets={"2":[8,-8],"3":[8,-8],"4":[8,-8],"5":[10,-6],"6":[0,-2],"10":[8,10],"12":[-10,-24],"13":[-2,0],"14":[-12,-24],"18":[0,2],"19":[-4,-12],"23":[30,32],"24":[8,8]};
export const SITE113_BUILDINGS=[
 // Centre u/v, long facade pixels, depth pixels, floors, facade family.
 [489,606,110,28,5,'panel'],[494,692,132,28,5,'panel'],[537,736,132,28,5,'panel'],[580,780,132,28,5,'panel'],[622,825,132,28,5,'panel'],
 [604,578,76,27,5,'plain'],[647,622,76,27,5,'plain'],[690,665,76,27,5,'plain'],[733,709,76,27,5,'plain'],[775,752,76,27,5,'plain'],
 [656,453,104,28,5,'plain'],[838,656,113,29,5,'plain'],[791,337,91,29,5,'panel'],[880,231,158,28,5,'panel'],
 [1000,143,94,30,5,'plain'],[1027,173,64,28,5,'plain'],[1119,270,90,28,5,'plain'],[1153,284,49,25,3,'plain'],
 [1056,427,91,29,5,'panel'],[996,408,70,26,3,'plain'],[1054,348,67,25,3,'plain'],[929,494,81,31,2,'civic'],
 [658,819,65,22,2,'civic'],[704,866,59,26,1,'civic']
].map((b,i)=>({id:'site113-block-'+(i+1),pixel:b.slice(0,2),length:b[2]*SITE113_PIXEL_SCALE*(i>=5&&i<=9?.62:1),depth:b[3]*SITE113_PIXEL_SCALE,floors:b[4],family:b[5],yaw:Math.PI/4,displayOffset:streetOffsets[i+1]||[0,0],position:site113Pixel(b.map((v,j)=>j<2?v+(streetOffsets[i+1]?.[j]||0):v))}));
export const SITE113_PATHS=[
 // Footpaths and courts only. Existing OSM streets remain the road source.
 [[578,511],[658,585],[733,659],[809,735]],
 [[758,380],[841,463],[953,564]],
 [[836,285],[911,361],[985,438]],
 [[891,274],[950,333],[1016,394]],
 [[575,740],[660,821],[727,887]],
 [[416,391],[460,429],[525,466]],
];
const view=(pixel,y,offset)=>{const [x,z]=site113Pixel(pixel);return {target:[x,y,z],eye:[x+offset[0],y+offset[1],z+offset[2]]};};
export const SITE113_VIEWS={
 all:view([770,530],4,[185,210,240]),
 blocks:view([582,709],7,[-65,44,84]),
 stage:view([919,340],3,[-32,23,42]),
 utilities:view([647,632],4,[-38,23,49]),
 top:view([770,530],0,[0,350,.01])
};
