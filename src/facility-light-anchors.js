// Explicit anchors belong to the same local frame as the existing structure.
// This module deliberately has no scene/model imports, so geometry builders
// can register their real fixtures without a rendering dependency or cycle.
export const FACILITY_LIGHT_ANCHOR_VERSION='facility-light-anchors-v1';
const point=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
function registry(root){
 if(!root?.userData)throw new TypeError('Facility light anchors require a scene object');
 return root.userData.facilityLighting??=( {version:FACILITY_LIGHT_ANCHOR_VERSION,boards:[],beacons:[]} );
}
export function registerFacilityFloodlights(root,{id,lamps,target,beacon=null,source='existing-fixture-geometry'}){
 if(!id||!point(target)||!Array.isArray(lamps)||!lamps.length)throw new TypeError('Invalid floodlight board anchor');
 const data=registry(root);if(data.boards.some(board=>board.id===id))return;
 const fixtures=lamps.map(lamp=>{
  if(!point(lamp.position)||!point(lamp.normal)||!Array.isArray(lamp.size)||lamp.size.length!==2||!lamp.size.every(n=>Number.isFinite(n)&&n>0))throw new TypeError('Invalid floodlight lens anchor');
  return {position:[...lamp.position],normal:[...lamp.normal],size:[...lamp.size]};
 });
 data.boards.push({id,lamps:fixtures,target:[...target],source});
 if(beacon)registerFacilityBeacon(root,{id:id+'-beacon',position:beacon,kind:'light-mast',source});
}
export function registerFacilityBeacon(root,{id,position,kind='tower',source='existing-structure-geometry'}){
 if(!id||!point(position))throw new TypeError('Invalid tower beacon anchor');
 const data=registry(root);if(data.beacons.some(beacon=>beacon.id===id))return;
 data.beacons.push({id,position:[...position],kind,source});
}
