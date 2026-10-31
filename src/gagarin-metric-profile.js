// Normalize the earlier schematic architecture at half a metre per drawing
// unit. This is a photographic calibration, not an engineering survey. The
// conversion is isotropic and does not change the photographed silhouette.
export const GAGARIN_LEGACY_METRE=.5;
export const GAGARIN_LEGACY_RIM_Y=18.1;
export const GAGARIN_RIM_Y=0;
export const GAGARIN_RAIL_PORT=Object.freeze([0,.7453333333333333,85.5]);
export const GAGARIN_PHYSICAL_RAIL_GAUGE=1.52;
export const GAGARIN_ROCKET_MOUNT=Object.freeze({
 position:[0,0,0],rotation:[0,Math.PI/4,0],axis:'y',baseY:0,
 vehicle:'soyuz',heightMetres:49.51161217689514
});
export const gagarinLegacyPoint=([x,y,z])=>[x*GAGARIN_LEGACY_METRE,(y-GAGARIN_LEGACY_RIM_Y)*GAGARIN_LEGACY_METRE,z*GAGARIN_LEGACY_METRE];
