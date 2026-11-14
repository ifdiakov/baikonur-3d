// The satellite surface and the protected DEM corridors share this datum.
// Keep pavement, cached routes, railway crossings and editor replacements
// on the same ground; clearance is only the small visible surface offset.
export const TRANSPORT_GROUND_VERSION='transport-ground-contact-v1';
export const TRANSPORT_GROUND_Y=-2.755;
export const ROAD_SURFACE_CLEARANCE=.025;
export const ROAD_SURFACE_Y=TRANSPORT_GROUND_Y+ROAD_SURFACE_CLEARANCE;
export const ROAD_SHOULDER_DROP=.015;
