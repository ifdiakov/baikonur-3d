import * as THREE from 'three';
import {SITE31_YAW} from './site31-trench-profile.js?v=20261028-museum4-osm-live-v2';
// Gate points come from the model's visible aprons and internal rails.
// Site centres remain anchored to the user's historical plan.
export const FACILITY_PORTS={
 'pad-110':{scale:.33,yaw:0,road:[-144.48,.13,195.72],rail:[[-161.7,.48,198.24],[-113.82,.48,213.36]]},
 'pad-250':{scale:.21,elevation:-2.755,yaw:-.56,road:[-40,.2,225],rail:[[-18,1.55,227],[18,1.55,227]]},
 'pad-251':{scale:.28,yaw:1.948,road:[-410,1.78,170]},
 'pad-112a':{scale:.14,yaw:-Math.PI/4,road:[160,.15,130]},
 'pad-31':{scale:.28,yaw:SITE31_YAW,road:[60,.1,133],rail:[[0,.48,174]]},
 'pad-42':{scale:.28,yaw:0,road:[78,.1,32],roadOutward:[1,0,0]},
 'pad-45':{scale:.28,yaw:0,road:[78,.1,128],rail:[[0,.48,145]]},
 'pad-92':{scale:.14,yaw:0,road:[184.2,.16,184.8]},
};
export function portWorld(spec,local,site,point){return new THREE.Vector3(...local).multiplyScalar(spec.scale).applyAxisAngle(new THREE.Vector3(0,1,0),spec.yaw).add(point(site.x,site.y,spec.elevation??-2.72));}
