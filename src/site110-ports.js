// Pure data: transport topology imports these without loading Three geometry.
// All coordinates are physical metres in the zero-yaw site110 root.
export const SITE110_PORTS=Object.freeze({
 road:[-350,.12,415],roadOutward:[-110/Math.hypot(110,150),0,150/Math.hypot(110,150)],roadWidth:8,
 rail:[[-420,.63,485],[-400,.63,485],[0,.63,485],[20,.63,485]],
 railOutward:[0,0,1],physicalRailGauge:1.52
});
