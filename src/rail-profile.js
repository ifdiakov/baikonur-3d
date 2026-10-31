import {MUSEUM_METRE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';

// One rendered cross-section for the source network, museum approaches and
// metric exhibits. Track-pair spacing is separate from an individual gauge.
// headY is the TOP of the running surface, never its centre.
export const RAIL_METRES=Object.freeze({
 version:'uniform-metric-rail-v1',gauge:1.52,headWidth:.20,railHeight:.27,
 headY:.55,sleeperLength:2.6,sleeperHeight:.16,sleeperWidth:.32,
 sleeperY:.20,sleeperStep:.75,ballastWidth:3.2,ballastY:.12
});
export const RAIL_PROFILE=Object.freeze({
 version:RAIL_METRES.version,scale:MUSEUM_METRE,
 ...Object.fromEntries(Object.entries(RAIL_METRES).filter(([,v])=>typeof v==='number').map(([k,v])=>[k,v*MUSEUM_METRE])),
 bodyWidth:RAIL_METRES.headWidth*MUSEUM_METRE,
 bodyY:(RAIL_METRES.headY-RAIL_METRES.railHeight/2)*MUSEUM_METRE,
 // Retained for callers measuring clearance; a round cap is not added to headY.
 headRadius:RAIL_METRES.headWidth*MUSEUM_METRE/2
});

/** Coordinates of a shared profile in a model's local coordinate system. */
export function railProfileAtScale(scale=MUSEUM_METRE){
 if(!(scale>0&&Number.isFinite(scale)))throw new Error('A positive model scale is required for railway geometry');
 return Object.fromEntries(Object.entries(RAIL_PROFILE).map(([key,value])=>[key,typeof value==='number'&&key!=='scale'?value/scale:value]));
}
