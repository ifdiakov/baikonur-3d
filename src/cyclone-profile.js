import {MUSEUM_METRE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';
// OSM compound centroid is the map anchor. Local pad origins are inferred from
// the two source rail termini, scaled through the map projection, not spaced
// by multiplying geographical distances by the enlarged exhibit metre.
export const CYCLONE_YAW=-2.96;
export const CYCLONE_PAD_ORIGINS=[[-9.5,47.9],[-88.1,-40.1]];
export const CYCLONE_MOUNTS=CYCLONE_PAD_ORIGINS.map(([x,z])=>({position:[x,1.38,z],rotation:[0,0,0]}));
export const CYCLONE_VIEWS={all:{target:[-45,5,40],eye:[160,170,240]},rocket:{target:[-9.5,21,47.9],eye:[-69.5,55,-17.1]},table:{target:[-9.5,.8,47.9],eye:[-24.5,10,29.9]},erector:{target:[-9.5,19,52.9],eye:[15.5,33,14.9]},top:{target:[-45,0,40],eye:[-45,230,40.01]}};
export const CYCLONE_PORTS={scale:MUSEUM_METRE,elevation:-2.72,yaw:CYCLONE_YAW,road:[-48,.05,170],roadOutward:[0,0,1],roadWidth:6,railConnections:CYCLONE_PAD_ORIGINS.map(([x,z],i)=>({id:'pad-90-rail-'+i,position:[x,.42,z+115],outward:[0,0,1],sourceWayId:i?'172571160':'172571256',sourceTarget:i?[-100,0,-95]:[55,0,-27],approach:i?[[-145,0,-80],[-145,0,120],[-88.1,0,120]]:[[60,0,0],[60,0,210],[-9.5,0,210]]})),physicalRailGauge:1.52};
export const CYCLONE_SOURCE={compound:172967751,origin:[62.9320772,46.080522],railTermini:[{way:172571378,lonLat:[62.9321009,46.081697]},{way:172571036,lonLat:[62.9353295,46.0799552]}],placement:'Rail-terminal inference, not surveyed launch-table coordinates'};
