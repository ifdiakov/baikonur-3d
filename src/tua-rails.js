import * as THREE from 'three';
import {RAIL_METRES} from './rail-profile.js?v=20261031-facilities-rails-lighting-v1';

// Original wheel/axle geometry stays intact. The common .20 m rail head fully
// supports the source's .08 m wheel tread on a uniform 1.52 m track gauge.
// Only the four track CENTRE axes ease into the two source vehicle placements.
const NETWORK_GAUGE=RAIL_METRES.gauge;
const RUNNING_GAUGE=RAIL_METRES.gauge;
const STATION_Z=Object.freeze([-258.5,-238,-218,-148,-128,-5.5]);
const AXIS_BLEND=Object.freeze([0,0,1,1,0,0]);
export const TUA_RAIL_PROFILE=Object.freeze({
 version:'tua-uniform-running-rails-v3',networkGauge:NETWORK_GAUGE,runningGauge:RUNNING_GAUGE,
 railHeadY:4.305,railHeight:RAIL_METRES.railHeight,railHeadWidth:RAIL_METRES.headWidth,
 trackCenters:Object.freeze([-81,-61,-29,-9]),
 entryTrackCenters:Object.freeze([-82.4,-59.6,-30.4,-7.6]),
 stations:Object.freeze(STATION_Z.map(z=>Object.freeze([z,RAIL_METRES.gauge]))),
 axisBlend:AXIS_BLEND,
 transitionStep:1,sleeperSpacing:2.4,sleeperHeight:RAIL_METRES.sleeperHeight,sleeperWidth:RAIL_METRES.sleeperWidth,
 sleeperEndMargin:1.5,sleeperCenterY:4.305-RAIL_METRES.railHeight-RAIL_METRES.sleeperHeight/2,
 sleeperLengthRatio:RAIL_METRES.sleeperLength/RAIL_METRES.gauge
});

const finite=(value,name)=>{
 if(!Number.isFinite(value))throw new Error(`Invalid TUA rail ${name}`);
 return value;
};
const near=(a,b)=>Math.abs(a-b)<1e-9;
const ease=t=>t*t*(3-2*t);

/** Centre-to-centre gauge at MIK-local Z; constant beyond either endpoint. */
export function gaugeAt(z,profile=TUA_RAIL_PROFILE){
 finite(z,'Z');
 const stations=profile.stations;
 if(z<=stations[0][0])return stations[0][1];
 for(let i=1;i<stations.length;i++){
  const [end,gauge]=stations[i], [start,previous]=stations[i-1];
  if(z<=end)return previous+(gauge-previous)*ease((z-start)/(end-start));
 }
 return stations[stations.length-1][1];
}

/** Blend the museum-network ports into the physically spaced vehicle tracks. */
export function trackAxisAt(trackCenterX,z,profile=TUA_RAIL_PROFILE){
 const index=profile.trackCenters.findIndex(x=>near(x,trackCenterX));
 if(index<0)throw new Error('Unknown TUA running-track axis');
 const entry=profile.entryTrackCenters[index];
 const stations=profile.stations,values=profile.axisBlend??AXIS_BLEND;
 let blend=values.at(-1);
 if(z<=stations[0][0])blend=values[0];
 else for(let i=1;i<stations.length;i++)if(z<=stations[i][0]){
  const t=clamp01((z-stations[i-1][0])/(stations[i][0]-stations[i-1][0]));
  blend=values[i-1]+(values[i]-values[i-1])*ease(t);break;
 }
 return entry+(trackCenterX-entry)*blend;
}
const clamp01=t=>Math.max(0,Math.min(1,t));

/** Accept the published manifest or the original calibration's field names. */
export function resolveTuaRailProfile(manifest={}){
 const source=manifest.railAdaptation??manifest.railAdaptationRecommendation??{};
 // The archival manifest records the previous display calibration. Preserve
 // its source coordinates, while the current shared rail profile owns gauge.
 const networkGauge=NETWORK_GAUGE,runningGauge=RUNNING_GAUGE;
 const railHeadY=finite(source.railHeadY??source.railHeadYMikLocal??TUA_RAIL_PROFILE.railHeadY,'head height');
 const trackCenters=[...(source.trackCenters??source.trackCentreAxesMikLocalX??TUA_RAIL_PROFILE.trackCenters)];
 const entryTrackCenters=[...(source.entryTrackCenters??source.entryTrackCentreAxesMikLocalX??TUA_RAIL_PROFILE.entryTrackCenters)];
 const stations=STATION_Z.map(z=>[z,RAIL_METRES.gauge]);
 if(!near(railHeadY,TUA_RAIL_PROFILE.railHeadY))throw new Error('TUA rail adaptation must retain the actual source wheel contact height');
 if(trackCenters.length!==4||trackCenters.some((x,i)=>!Number.isFinite(x)||!near(x,TUA_RAIL_PROFILE.trackCenters[i])))
  throw new Error('TUA running tracks must match the source double-track axes');
 if(entryTrackCenters.length!==4||entryTrackCenters.some((x,i)=>!Number.isFinite(x)||!near(x,TUA_RAIL_PROFILE.entryTrackCenters[i])))
  throw new Error('TUA rail adaptation must preserve all four external entry axes');
 return {...TUA_RAIL_PROFILE,networkGauge,runningGauge,railHeadY,trackCenters,entryTrackCenters,stations};
}

function sampleStations(profile){
 const samples=[profile.stations[0][0]];
 for(let i=1;i<profile.stations.length;i++){
  const [start,fromGauge]=profile.stations[i-1], [end,toGauge]=profile.stations[i];
  const count=fromGauge===toGauge&&profile.axisBlend[i-1]===profile.axisBlend[i]?1:Math.ceil((end-start)/profile.transitionStep);
  for(let j=1;j<=count;j++)samples.push(start+(end-start)*j/count);
 }
 return samples;
}

/** One closed, continuous rail loft. Top is horizontal at railHeadY everywhere. */
export function createTuaRailGeometry(trackCenterX,side,profile=TUA_RAIL_PROFILE){
 finite(trackCenterX,'track centre');
 if(side!==-1&&side!==1)throw new Error('TUA rail side must be -1 or +1');
 const samples=sampleStations(profile),positions=[],indices=[];
 const top=profile.railHeadY,bottom=top-profile.railHeight,halfWidth=profile.railHeadWidth/2;
 const centers=samples.map(z=>[trackAxisAt(trackCenterX,z,profile)+side*gaugeAt(z,profile)/2,z]);
 // Separate face strips keep sharp rectangular edges while the side normals
 // vary smoothly along the two eased bends. There are no stepped rail pieces.
 const strips=[
  [[-halfWidth,top],[halfWidth,top]],
  [[halfWidth,bottom],[-halfWidth,bottom]],
  [[-halfWidth,bottom],[-halfWidth,top]],
  [[halfWidth,top],[halfWidth,bottom]]
 ];
 for(const strip of strips){
  const base=positions.length/3;
  for(const [x,z]of centers)for(const [dx,y]of strip)positions.push(x+dx,y,z);
  for(let i=0;i<centers.length-1;i++){
   const a=base+2*i;indices.push(a,a+2,a+1,a+1,a+2,a+3);
  }
 }
 for(const [sample,isEnd]of [[centers[0],false],[centers[centers.length-1],true]]){
  const [x,z]=sample,base=positions.length/3;
  positions.push(x-halfWidth,bottom,z,x+halfWidth,bottom,z,x-halfWidth,top,z,x+halfWidth,top,z);
  if(isEnd)indices.push(base,base+1,base+2,base+1,base+3,base+2);
  else indices.push(base,base+2,base+1,base+1,base+2,base+3);
 }
 if(!positions.every(Number.isFinite))throw new Error('Non-finite TUA rail geometry');
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 geometry.userData={museumComponent:'transporter-running-rail',trackCenterX,railSide:side,
  railHeadY:top,sampledStations:samples};
 return geometry;
}

function findMaterial(group,component,materialName){
 let byComponent=null,byName=null;
 group.traverse(object=>{
  if(!object.isMesh)return;
  const materials=Array.isArray(object.material)?object.material:[object.material];
  for(const material of materials){
   if(!material)continue;
   if(!byComponent&&object.userData.museumComponent===component)byComponent=material;
   if(!byName&&material.name===materialName)byName=material;
  }
 });
 return byComponent??byName;
}

const installed=new WeakMap();

/** Replace only the exposed TUA rail group, after the entire replacement is ready.
 * No shared geometry or material is disposed. Building, aprons, low-hall rails,
 * transporter placements and external rail-entry vectors are left untouched.
 */
export function adaptTuaRails(mikExhibit,manifest={}){
 const group=mikExhibit?.transporterRails;
 if(!group?.isObject3D)throw new Error('MIK transporterRails group is required');
 const profile=resolveTuaRailProfile(manifest),signature=JSON.stringify(profile);
 const previous=installed.get(group);
 if(previous?.signature===signature&&previous.children.length===group.children.length&&
    previous.children.every((object,i)=>group.children[i]===object))return previous.metadata;
 const railMaterial=findMaterial(group,'transporter-running-rail','museum / rail');
 const sleeperMaterial=findMaterial(group,'rail-sleeper','museum / seam');
 if(!railMaterial||!sleeperMaterial)throw new Error('Existing MIK rail and sleeper materials are required');

 const children=[],endpoints=[],segments=profile.stations.slice(1).map(([toZ,toGauge],i)=>({
  fromZ:profile.stations[i][0],toZ,fromGauge:profile.stations[i][1],toGauge,
  curve:profile.axisBlend[i]===profile.axisBlend[i+1]?'constant':'smoothstep',
  axisBlend:[profile.axisBlend[i],profile.axisBlend[i+1]]
 }));
 const startZ=profile.stations[0][0],endZ=profile.stations[profile.stations.length-1][0];
 for(const [trackIndex,trackCenterX]of profile.trackCenters.entries())for(const side of [-1,1]){
  const rail=new THREE.Mesh(createTuaRailGeometry(trackCenterX,side,profile),railMaterial);
  rail.name=`ТУА · непрерывный рельс ${trackIndex+1} ${side<0?'левый':'правый'}`;
  rail.userData={museumComponent:'transporter-running-rail',trackIndex,trackCenterX,railSide:side};
  rail.receiveShadow=true;children.push(rail);
  endpoints.push({trackIndex,trackCenterX,side,
   start:[trackAxisAt(trackCenterX,startZ,profile)+side*profile.networkGauge/2,profile.railHeadY,startZ],
   end:[trackAxisAt(trackCenterX,endZ,profile)+side*profile.networkGauge/2,profile.railHeadY,endZ]});
 }
 const rows=Math.floor((endZ-startZ-2*profile.sleeperEndMargin)/profile.sleeperSpacing)+1;
 const sleeperCount=rows*profile.trackCenters.length;
 const sleepers=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),sleeperMaterial,sleeperCount);
 const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
 let instance=0;
 for(const trackCenterX of profile.trackCenters)for(let row=0;row<rows;row++){
  const z=startZ+profile.sleeperEndMargin+row*profile.sleeperSpacing;
  position.set(trackAxisAt(trackCenterX,z,profile),profile.sleeperCenterY,z);
  scale.set(gaugeAt(z,profile)*profile.sleeperLengthRatio,profile.sleeperHeight,profile.sleeperWidth);
  matrix.compose(position,rotation,scale);sleepers.setMatrixAt(instance++,matrix);
 }
 sleepers.name='ТУА · шпалы единой колеи';sleepers.userData={museumComponent:'rail-sleeper',sleeperCount};
 sleepers.instanceMatrix.needsUpdate=true;sleepers.computeBoundingBox();sleepers.computeBoundingSphere();
 sleepers.receiveShadow=true;children.push(sleepers);
 const metadata={version:profile.version,status:'ready',group,railCount:8,sleeperCount,
  networkGauge:profile.networkGauge,runningGauge:profile.runningGauge,railHeadY:profile.railHeadY,
  railHeight:profile.railHeight,railHeadWidth:profile.railHeadWidth,trackCenters:[...profile.trackCenters],
  entryTrackCenters:[...profile.entryTrackCenters],physicalUnits:'metres',
  stations:profile.stations.map(row=>[...row]),segments,endpoints,
  sleeperLengthRatio:profile.sleeperLengthRatio,sleeperSpacing:profile.sleeperSpacing,
  preservedRailEntries:(mikExhibit.railEntries??[]).map(point=>Array.isArray(point)?[...point]:point.toArray()),
  source:'Uniform 1.52 m museum gauge and .20 m heads; unmodified TUA wheels; existing external entry axes retained'};

 // Commit the complete replacement only after both rail buffers and instances
 // have valid bounds. Old resources belong to other shared scene batches too.
 group.clear();group.add(...children);
 installed.set(group,{signature,children,metadata});
 if(typeof mikExhibit.setRailAdaptation==='function')mikExhibit.setRailAdaptation(metadata);
 else if(typeof mikExhibit.refreshStats==='function')mikExhibit.refreshStats();
 return metadata;
}
