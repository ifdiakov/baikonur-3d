// Owner-directed exhibit adjustment, not a change to archived OSM coordinates.
export const SITE92_VERSION='20261111-photo-facade-clearance-v1';
export const SITE92_YAW=Math.atan2(260,198);
export const SITE92_SHIFT=Object.freeze([-Math.sin(SITE92_YAW)*60,-Math.cos(SITE92_YAW)*60]);
export const SITE92_HALLS=Object.freeze([
 [708,378,82,393,31],[635,469,78,393,31],[485,420,27,105,8],
 [600,515,46,122,11],[700,590,27,105,8],[270,747,88,192,13],
 [508,626,64,116,6],[215,182,38,135,7],[958,134,47,68,5],[850,128,30,53,5]
]);
export const site92Point=([x,z])=>[(x-680)*.60,(z-450)*.60];
export function site92HallPosition(i){const p=site92Point(SITE92_HALLS[i]);return i<5?[p[0]+SITE92_SHIFT[0],p[1]+SITE92_SHIFT[1]]:p;}
