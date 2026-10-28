import { buildSaturnIP5 as buildStructures } from './saturn-structures.js';
import { saturnTerrainHeight, addSaturnNorthwestGate } from './saturn-access.js';

// Antennas, buildings and their instancedFrameBatches remain in the unchanged
// structure module. Access and terrain share one northwest-entry definition.
export function buildSaturnIP5(root,terrain={}) {
  const info=buildStructures(root,terrain);
  root.traverse(mesh=>{
    if(mesh.userData.museumComponent!=='murguduk-hill')return;
    const positions=mesh.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++)positions.setY(i,saturnTerrainHeight(positions.getX(i),positions.getZ(i)));
    positions.needsUpdate=true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
  });
  info.access=addSaturnNorthwestGate(root);
  info.access.preservedVerticalRaise=100;
  info.version='1.5-northwest-access';
  info.featureCounts['northwest-gate-pavement']=1;
  info.featureCounts['northwest-gate-shoulder']=1;
  info.meshCount+=2;info.primitiveCount+=2;
  root.userData.saturnModel=info;
  return info;
}
