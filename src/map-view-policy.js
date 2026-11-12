// Altitudes are H from the museum HUD, not metres or raw Three.js Y.
export const MAP_LABEL_HEIGHTS=Object.freeze({numbers:300,details:130});
export const KRAYNIY_CAMERA_MARGIN=120;
export function siteLabelVisibility(height){
 if(!Number.isFinite(height))return {siteAlpha:0,detailAlpha:0};
 return {siteAlpha:height<=MAP_LABEL_HEIGHTS.numbers&&height>MAP_LABEL_HEIGHTS.details?1:0,
  detailAlpha:height<=MAP_LABEL_HEIGHTS.details?1:0};
}
// The airport lies outside the flank polygon. Its whole transformed footprint,
// including both runway ends and the terminal/apron, must remain inspectable.
// This expands free-navigation limits, not the decorative flank boundaries.
export function includeKrayniyCameraArea(bounds,box,margin=KRAYNIY_CAMERA_MARGIN){
 const keys=['minX','maxX','minZ','maxZ'];
 if(!bounds||!keys.every(k=>Number.isFinite(bounds[k]))||bounds.minX>=bounds.maxX||bounds.minZ>=bounds.maxZ)throw new TypeError('Invalid flank bounds');
 if(!box?.min||!box?.max||![box.min.x,box.min.z,box.max.x,box.max.z,margin].every(Number.isFinite)||box.min.x>box.max.x||box.min.z>box.max.z||margin<0)throw new TypeError('Invalid airport footprint');
 return {minX:Math.min(bounds.minX,box.min.x-margin),maxX:Math.max(bounds.maxX,box.max.x+margin),
  minZ:Math.min(bounds.minZ,box.min.z-margin),maxZ:Math.max(bounds.maxZ,box.max.z+margin)};
}
