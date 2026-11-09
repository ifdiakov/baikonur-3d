import * as THREE from 'three';
import {buildOsmTransportNetwork} from './osm-transport.js?v=20261108-owner19-detail-v9';
import {createMuseumGeography} from './osm-geography.js';
import {createCheckpoint7RoadGrade} from './checkpoint7-road-grade.js';
import {createSite113RoadGrade} from './site113-road-grade.js';
import {createSite95RoadGrade} from './site95-road-grade.js';
import {planRailStations} from './rail-stations.js';
import {makeRoadSurfaceCutIndex,physicallyCutRoadGeometry} from './road-geometry-cut.js?v=20261103-source-matched-pavement-v7';
import {packGeometry,unpackGeometry,packTransportLayers} from './transport-detail-codec.js';
export function buildTransportDetail(input){
 const {data,legacyData,catalog,matches,siteRecords,checkpointAnchor,mik112,stations}=input;
 const geography=createMuseumGeography({catalog,matches}),point=(x,y,z=0)=>new THREE.Vector3((x-650)*3.4,z,(y-522.5)*3.4);
 const town=id=>{const s=siteRecords.find(s=>s.id===id);return{x:(s.x-650)*3.4,z:(s.y-522.5)*3.4};};
 const grade=createSite95RoadGrade(town('pad-95')).compose(createSite113RoadGrade(town('pad-113')).withCheckpoint(createCheckpoint7RoadGrade(checkpointAnchor)));
 const layers={roads:new THREE.Group(),rails:new THREE.Group()};
 const detail=buildOsmTransportNetwork({data,legacyData,geography,point,layers,siteRecords,checkpoint7RoadGrade:grade});
 if(mik112){const root=new THREE.Group();root.matrix.fromArray(mik112.matrix);root.matrix.decompose(root.position,root.quaternion,root.scale);root.userData.mik112Model=mik112.model;detail.connectMik112(root);}
 detail.setBridgeEvening(true);
 const paths=detail.terrainPaths(),stationPlans=stations?planRailStations(stations.map(s=>({...s,group:{position:new THREE.Vector3(...s.position)}})),paths.rails,paths.roads):null;
 return {packet:packTransportLayers(layers),stationPlans,stats:detail.stats()};
}
export function cutTransportGeometry({rows,hidden,joinedPaths,sourceRoads}){
 const index=makeRoadSurfaceCutIndex(hidden,joinedPaths,{sourceRoads});
 const totals={clipped:0,removed:0,examined:0,triangles:0,clipPolygons:index.clips,sourceCuts:index.sourceCuts,replacementCuts:index.replacementCuts,skippedOffRoad:index.skippedOffRoad,restoredCrossings:index.restoredCrossings,protectedClipParts:index.protectedClipParts};
 const result=rows.map(({name,geometry})=>{const original=unpackGeometry(geometry);if(!index.clips)return null;
  const cut=physicallyCutRoadGeometry(original,index,{gradeTolerance:1.05,surfaceName:name});
  totals.clipped+=cut.stats.clipped;totals.removed+=cut.stats.removed;totals.examined+=cut.stats.examined;totals.triangles+=cut.stats.outputTriangles;return packGeometry(cut.geometry);
 });return{rows:result,stats:totals};
}
