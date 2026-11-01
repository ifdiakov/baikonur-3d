// One shared frame for the hotel, its gate, road mask and camera views.
// Keep the map anchor fixed. R(v - 2*pivot) rotates the asymmetric
// courtyard 180° around its own centre, preserving the fenced footprint.
export const SEVEN_WINDS_VERSION='seven-winds-courtyard-v2';
export const SEVEN_WINDS_LAYOUT=Object.freeze({
 scale:.28,yaw:Math.PI,elevation:-2.72,
 pivot:[.5,0,16],modelOffset:[-1,0,-32],
 road:[-37,.085,-12],roadOutward:[-1,0,0],roadWidth:4.8,
 entrance:[2,0,10.2],
 gazebos:[{x:2,z:31,r:3.25},{x:28,z:35.5,r:2.65}],
 courtyard:{minX:-33,maxX:34,minZ:-10,maxZ:42},
 views:{all:{target:[0,3,13],eye:[-64,61,92]},front:{target:[0,6,4],eye:[-40,48,62]},garden:{target:[12,1.5,30],eye:[42,28,64]},sign:{target:[-24,8,4],eye:[-49,31,24]},access:{target:[-18,0,20],eye:[-70,55,50]},top:{target:[0,0,15],eye:[0,95,15.01]}}
});
