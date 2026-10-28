import { buildSaturnIP5 as buildStructures } from './saturn-structures.js?v=20261028-museum4-osm-live-v1';
import { SATURN_ACCESS, addSaturnNorthwestGate } from './saturn-access.js?v=20261028-museum4-osm-live-v1';

// Antennas, buildings and their instancedFrameBatches remain in the unchanged
// structure module. Access and terrain share one northwest-entry definition.
export function buildSaturnIP5(root,terrain={}) {
  const info=buildStructures(root,terrain);
  info.access=addSaturnNorthwestGate(root);
  info.access.preservedVerticalRaise=SATURN_ACCESS.verticalRaise;
  info.version='1.7-readable-relief-lighting';
  root.traverse(mesh=>{
    if(mesh.userData.museumComponent==='murguduk-hill')
      info.terrain={style:mesh.userData.surfaceStyle,material:mesh.material.type,
        sharedMap:mesh.material.map===terrain.terrainTexture,
        relief:mesh.userData.reliefStyle,depthWrite:mesh.material.depthWrite};
  });
  info.featureCounts['northwest-gate-pavement']=1;
  info.featureCounts['northwest-gate-shoulder']=1;
  info.meshCount+=2;info.primitiveCount+=2;
  root.userData.saturnModel=info;
  return info;
}
