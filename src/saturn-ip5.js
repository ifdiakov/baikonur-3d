import { buildSaturnIP5 as buildStructures } from './saturn-structures.js?v=20261028-hill20';
import { SATURN_ACCESS, addSaturnNorthwestGate } from './saturn-access.js?v=20261028-hill20';

// Antennas, buildings and their instancedFrameBatches remain in the unchanged
// structure module. Access and terrain share one northwest-entry definition.
export function buildSaturnIP5(root,terrain={}) {
  const info=buildStructures(root,terrain);
  info.access=addSaturnNorthwestGate(root);
  info.access.preservedVerticalRaise=SATURN_ACCESS.verticalRaise;
  info.version='1.6-gentle-hill20';
  info.featureCounts['northwest-gate-pavement']=1;
  info.featureCounts['northwest-gate-shoulder']=1;
  info.meshCount+=2;info.primitiveCount+=2;
  root.userData.saturnModel=info;
  return info;
}
