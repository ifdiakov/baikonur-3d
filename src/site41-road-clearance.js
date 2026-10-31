import {SITE41_ACCESS} from './site41-profile.js?v=20261031-facilities-rails-lighting-v1';

// Archived way/169401013 from data/osm/facilities.geojson. Tests and fallback
// callers can omit the facilities collection without changing display ownership.
const SOURCE_RING=Object.freeze([[63.6566206,45.9775181],[63.6690397,45.978438],[63.6703813,45.9696898],[63.6579623,45.9687698]]);
const inside=([x,y])=>{let result=false;for(let i=0,j=SOURCE_RING.length-1;i<SOURCE_RING.length;j=i++){
 const a=SOURCE_RING[i],b=SOURCE_RING[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])result=!result;
}return result;};

/** Replace only the former compound's service-road display. The through
 * secondary road and exact original access prefix towards Site42 remain. */
export function createSite41RoadReplacement(graph){
 const removed=new Set(),protectedEdges=new Set(),way=graph.ways.find(way=>way.osmId===SITE41_ACCESS.sourceWayId);
 if(!way)return {removed,protectedEdges,attachmentEdge:null,stats:{sourceCompoundId:SITE41_ACCESS.sourceCompoundId,removedEdges:0}};
 const end=SITE41_ACCESS.sourceAxisNodes.at(-1),boundary=way.segments.findIndex(edge=>String(edge.b.id)===end);
 if(boundary<0)throw new Error('Site41 source access endpoint is missing');
 for(const [i,edge]of way.segments.entries())(i<=boundary?protectedEdges:removed).add(edge);
 for(const candidate of graph.ways){
  if(candidate===way||candidate.tags.highway!=='service')continue;
  // A crossing service connection is retained; only roads wholly owned by
  // the archived compound are replaced by the moved museum model's paths.
  if(candidate.segments.every(edge=>inside(edge.a.coord)&&inside(edge.b.coord)))candidate.segments.forEach(edge=>removed.add(edge));
 }
 return {removed,protectedEdges,attachmentEdge:way.segments[boundary],stats:{version:'site41-source-display-replacement-v1',
  sourceCompoundId:SITE41_ACCESS.sourceCompoundId,sourceAccessWayId:SITE41_ACCESS.sourceWayId,attachmentNodeId:end,
  preservedAccessEdges:protectedEdges.size,removedEdges:removed.size,removedWayIds:[...new Set([...removed].map(edge=>edge.wayId))],
  sourceTopologyPreserved:true}};
}
