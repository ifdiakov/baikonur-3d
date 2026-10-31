import {RAIL_METRES} from './rail-profile.js?v=20261031-facilities-rails-lighting-v1';
import {SITE110_PORTS} from './site110-ports.js?v=20261031-facilities-rails-lighting-v1';

// Pure model-local port data. Component centres/axes match the existing
// OSM-registered MZK/SDI model; no building or site transform moves here.
export const MZK_SDI_RAIL_FRAMES=Object.freeze({
 mzk:Object.freeze({center:Object.freeze([34.07968287,-113.15655949]),yaw:.15541375,width:140.6}),
 sdi:Object.freeze({center:Object.freeze([-34.07968287,113.15655949]),yaw:.00466302,width:52})
});
const transformed=(frame,[x,y,z])=>[frame.center[0]+x*Math.cos(frame.yaw)+z*Math.sin(frame.yaw),y,frame.center[1]-x*Math.sin(frame.yaw)+z*Math.cos(frame.yaw)];
const direction=(frame,[x,y,z])=>[x*Math.cos(frame.yaw)+z*Math.sin(frame.yaw),y,-x*Math.sin(frame.yaw)+z*Math.cos(frame.yaw)];
const rows=[
 {id:'mzk-through',component:'mzk',trackAxis:10,sleeperY:.22,points:[[-71.3,10],[-98.3,10]],outward:[-1,0,0],sourceNodeId:'6336523428',sourceWayId:'172571055'},
 {id:'mzk-side',component:'mzk',trackAxis:-10,sleeperY:.22,points:[[-71.3,-10],[-98.3,-10]],outward:[-1,0,0],sourceNodeId:'1834612260',sourceWayId:'172571305'},
 {id:'sdi-west',component:'sdi',trackAxis:-10,sleeperY:.27,points:[[-10,24],[-10,66]],outward:[0,0,1],sourceNodeId:'2529010043',sourceWayId:'245771019'},
 {id:'sdi-east',component:'sdi',trackAxis:10,sleeperY:.27,points:[[10,24],[10,66]],outward:[0,0,1],sourceNodeId:'2529010042',sourceWayId:'245771018'}
];

export const MZK_SDI_RAIL_STUBS=Object.freeze(rows.map(row=>Object.freeze({...row,
 points:Object.freeze(row.points.map(point=>Object.freeze([...point]))),outward:Object.freeze([...row.outward]),
 headY:row.sleeperY+RAIL_METRES.sleeperHeight/2+RAIL_METRES.railHeight
})));
export const MZK_SDI_RAIL_PORTS=Object.freeze(MZK_SDI_RAIL_STUBS.map(stub=>{
 const frame=MZK_SDI_RAIL_FRAMES[stub.component],[x,z]=stub.points.at(-1),componentPosition=[x,stub.headY,z];
 return Object.freeze({id:stub.id,destination:stub.component,sourceRouteId:stub.id,sourceNodeId:stub.sourceNodeId,sourceWayId:stub.sourceWayId,
  componentPosition:Object.freeze(componentPosition),position:Object.freeze(transformed(frame,componentPosition)),
  outward:Object.freeze(direction(frame,stub.outward)),physicalGauge:RAIL_METRES.gauge,headWidth:RAIL_METRES.headWidth});
}));

export const SITE110_RAIL_DESTINATIONS=Object.freeze([
 {portIndex:0,id:'site110-left-west',sourceWayId:'172571285',sourceNodeId:'1834613559'},
 {portIndex:1,id:'site110-left-east',sourceWayId:'172571238',sourceNodeId:'1834613553'},
 {portIndex:2,id:'site110-right-west',sourceWayId:'172571232',sourceNodeId:'1834613467'},
 {portIndex:3,id:'site110-right-east',sourceWayId:'172571233',sourceNodeId:'1834613464'}
].map(row=>Object.freeze({...row,sourceRouteId:row.id,position:Object.freeze([...SITE110_PORTS.rail[row.portIndex]]),outward:Object.freeze([0,0,1])})));
