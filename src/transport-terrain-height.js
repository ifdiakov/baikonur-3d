import {TRANSPORT_GROUND_Y} from './transport-ground-profile.js?v=20261114-ground-contact-v1';
import {createSharedSiloHillField} from './shared-silo-hill.js?v=20261103-shared-silo-hill-v1';
import {SATURN_ACCESS,SATURN_TERRAIN_BOUNDS,saturnTerrainMeshHeight} from './saturn-access.js?v=20261114-ground-contact-v1';

// DEM transport corridors use a common flat datum. Two separately rendered
// hills sit on top of it. Full transport, cached overview strips and their
// height profiles must sample those same fields, including each flat skirt.
export function createTransportTerrainHeight({siteRecords=[],point}){
 const saturnSite=siteRecords.find(s=>s.id==='pad-23'),saturnCenter=saturnSite?point(saturnSite.x,saturnSite.y,0):null;
 const hillSites=['pad-106','pad-109'].map(id=>siteRecords.find(s=>s.id===id));
 const siloHill=hillSites.every(Boolean)?createSharedSiloHillField(hillSites.map(s=>point(s.x,s.y,0)),()=>TRANSPORT_GROUND_Y):null;
 const inside=(b,x,z)=>!!b&&x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;
 const onSiloHill=(x,z)=>inside(siloHill?.bounds,x,z);
 const b=SATURN_TERRAIN_BOUNDS,scale=SATURN_ACCESS.scale;
 const saturnBounds=saturnCenter?{minX:saturnCenter.x+b.minX*scale,maxX:saturnCenter.x+b.maxX*scale,
  minZ:saturnCenter.z+b.minZ*scale,maxZ:saturnCenter.z+b.maxZ*scale}:null;
 const localBounds=[siloHill?.bounds,saturnBounds].filter(Boolean);
 const containsLocalTerrain=(x,z)=>localBounds.some(b=>inside(b,x,z));
 function heightAt(x,z){
  let height=onSiloHill(x,z)?siloHill.heightAt(x,z):TRANSPORT_GROUND_Y;
  if(inside(saturnBounds,x,z)){
   const localX=(x-saturnCenter.x)/scale,localZ=(z-saturnCenter.z)/scale;
   // Sample the continuous physical field through its transparent skirt.
   // The foot is exactly at ground; opacity must not introduce a height step.
   height=Math.max(height,SATURN_ACCESS.elevation+scale*saturnTerrainMeshHeight(localX,localZ));
  }
  return height;
 }
 return {heightAt,containsLocalTerrain,siloHill,saturnCenter,onSiloHill,localBounds};
}
