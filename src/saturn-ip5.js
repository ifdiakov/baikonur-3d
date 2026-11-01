import { buildSaturnIP5 as buildStructures } from './saturn-structures.js?v=20261101-saturn-terrain-v5';
import { SATURN_ACCESS, addSaturnNorthwestGate } from './saturn-access.js?v=20261101-saturn-terrain-v5';

// Photo-based structures retain the shared northwest entrance and hill datum.
export function buildSaturnIP5(root,terrain={}) {
  const info=buildStructures(root,terrain);
  info.access=addSaturnNorthwestGate(root);
  info.access.preservedVerticalRaise=SATURN_ACCESS.verticalRaise;
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
