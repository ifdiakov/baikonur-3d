import {SITE254_ACCESS} from './site254-layout.js?v=20261103-site254-se3';
import {SITE2_ACCESS} from './site2-layout.js?v=20261103-site2-main-road-v1';
import {SEVEN_WINDS_LAYOUT} from './seven-winds-layout.js?v=20261101-hotel-v3';
import {CYCLONE_PORTS} from './cyclone-profile.js?v=20261101-cyclone-v1';
import * as THREE from 'three';
import {SILO_SITE_IDS} from './silo-sites.js?v=20261029-all-silos-v2';
import {SITE31_YAW} from './site31-trench-profile.js?v=20261028-museum4-osm-live-v2';
import {MUSEUM_METRE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';
import {SITE110_PORTS} from './site110-ports.js?v=20261031-facilities-rails-lighting-v1';
import {MZK_SDI_RAIL_PORTS,SITE110_RAIL_DESTINATIONS} from './mik112-destination-ports.js?v=20261031-facilities-rails-lighting-v1';
import {SITE41_ACCESS} from './site41-profile.js?v=20261031-facilities-rails-lighting-v1';
// Gate points come from the model's visible aprons and internal rails.
// Site centres remain anchored to the user's historical plan.
export const FACILITY_PORTS={
 'pad-254':SITE254_ACCESS,
 'pad-90':CYCLONE_PORTS,
 'pad-75':{...SEVEN_WINDS_LAYOUT},
 ...Object.fromEntries(SILO_SITE_IDS.map(id=>[id,{scale:MUSEUM_METRE,yaw:0,elevation:-2.72,road:[0,.08,25],roadWidth:6.5,silo:true}])),
 'pad-110':{scale:MUSEUM_METRE,yaw:0,...SITE110_PORTS,railConnections:SITE110_RAIL_DESTINATIONS},
 'pad-2':{...SITE2_ACCESS},
 'pad-3':{scale:.28,elevation:-2.72,yaw:0,road:[-70,.1,54],roadOutward:[-1,0,0],roadWidth:7},
 'pad-250a':{scale:.28,elevation:-2.72,yaw:0,road:[0,.1,38],roadOutward:[0,0,1],roadWidth:7},
 'pad-250':{scale:MUSEUM_METRE,elevation:-2.755,yaw:-.56,road:[-40,.2,225].map(v=>v/.687885342706393),roadWidth:1.8/MUSEUM_METRE,rail:[[-18,1.55,227],[18,1.55,227]].map(p=>p.map(v=>v/.687885342706393)),physicalRailGauge:1.52},
 'pad-251':{scale:.28,yaw:1.948,road:[404.9,1.78,62.9],roadOutward:[1,0,0],roadWidth:7},
 'pad-112a':{scale:.14,yaw:-Math.PI/4,road:[160,.15,130],roadOutward:[1,0,0],roadWidth:6,railConnections:MZK_SDI_RAIL_PORTS,physicalRailGauge:1.52},
 'pad-31':{scale:MUSEUM_METRE,yaw:SITE31_YAW,road:[60,.1,133],roadOutward:[3/Math.hypot(3,177),0,177/Math.hypot(3,177)],roadWidth:6,rail:[[0,.65,174]],physicalRailGauge:1.52},
 'pad-41':{...SITE41_ACCESS,roadWidth:SITE41_ACCESS.roadWidthMetres},
 'pad-42':{scale:.28,yaw:0,road:[78,.1,32],roadOutward:[1,0,0],roadWidth:7},
 // Enter the visible east-facing road end after passing south of the incoming
 // railway. A direct curve cuts through the service building and the tracks.
 'pad-45':{scale:MUSEUM_METRE,yaw:0,road:[78,.1,128],roadOutward:[1,0,0],
  roadApproach:[[-100,.1,185],[110,.1,185],[120,.1,128]],roadWidth:9,rail:[[0,.65,145]],physicalRailGauge:1.52},
 'pad-92':{scale:.14,yaw:0,road:[184.2,.16,184.8],roadOutward:[150.6/Math.hypot(150.6,43.8),0,43.8/Math.hypot(150.6,43.8)],roadWidth:7},
};
export function portWorld(spec,local,site,point){return new THREE.Vector3(...local).multiplyScalar(spec.scale).applyAxisAngle(new THREE.Vector3(0,1,0),spec.yaw).add(point(site.x,site.y,spec.elevation??-2.72));}
