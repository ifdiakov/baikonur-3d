import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createLightField} from './light-field.js?v=20261031-highway-lighting-v3';

export const ROAD_LIGHTING_VERSION='road-lighting-modern-vintage-v3';
export const ROAD_LIGHT_LENS_EMISSION=1.65;
export const ROAD_LIGHT_STYLES=Object.freeze({
 highway:Object.freeze({id:'highway',fixture:'modern-led',height:3.2,spacing:58/1.5,brightness:1.5,density:1.5,poolScale:1.5,color:0xd8e8ff,colorTemperature:4800,
  poleColor:0x344552,armReach:.72,headLength:.62,headWidth:.22,headThickness:.075}),
 cosmodrome:Object.freeze({id:'cosmodrome',fixture:'vintage-industrial',height:2.8,spacing:43.5,brightness:2,density:2/1.5,poolScale:2,color:0xffbf7b,colorTemperature:2700,
  poleColor:0x8c887b,armReach:.61,headLength:.45,headWidth:.28,headThickness:.18})
});
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const fallbackHighway=road=>road.lightingClass==='highway'||road.id==='highway'||/^r-south-(west|east)$/.test(road.id);

// The highway is also exposed as OSM way fragments and two legacy navigation
// aliases. Sample the one complete traffic path once, so each station gets a
// single, symmetric pair rather than two independently staggered lamp rows.
export function roadLightingPaths(roads){
 const highway=roads.osmVehiclePlan?.highway;
 if(!highway)return roads.map(road=>({...road,lightStyle:fallbackHighway(road)?'highway':'cosmodrome'}));
 const sourceWays=new Set(highway.osmWayIds||[]);
 return [{...highway,id:'highway',lightStyle:'highway'},...roads.filter(road=>{
  if(fallbackHighway(road))return false;
  return !(road.source==='OpenStreetMap'&&road.osmWayIds?.length&&road.osmWayIds.every(id=>sourceWays.has(id)));
 }).map(road=>({...road,lightStyle:'cosmodrome'}))];
}

/** Records are grouped by stationId. Filtering must accept or reject an entire
 * highway station, so clearance/river rules cannot silently leave half a pair. */
export function buildRoadLightRecords(roads,{baseHeightAt=(road,p)=>p.y-.055,terrainAt=()=> 'road'}={}){
 const records=[],occupied=new Map(),cellSize=14;
 const key=(x,z)=>Math.floor(x/cellSize)+':'+Math.floor(z/cellSize);
 const occupiedNear=(x,z)=>{
  const gx=Math.floor(x/cellSize),gz=Math.floor(z/cellSize);
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)
   if((occupied.get((gx+i)+':'+(gz+j))||[]).some(p=>Math.hypot(p.x-x,p.z-z)<12))return true;
  return false;
 };
 const remember=p=>{const k=key(p.x,p.z),list=occupied.get(k)||[];list.push(p);occupied.set(k,list);};
 for(const road of roadLightingPaths(roads)){
  const style=ROAD_LIGHT_STYLES[road.lightStyle],paired=style.id==='highway';
  let covered=0,next=24,station=0;
  for(let j=1;j<road.points.length;j++){
   const a=road.points[j-1],b=road.points[j],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.01)continue;
   while(next<=covered+len){
    const t=(next-covered)/len,center=a.clone().lerp(b,t),stationId=road.id+':'+station++,offset=road.width/2+1.1;
    const tangent=b.clone().sub(a).normalize(),group=[];
    for(const side of paired?[-1,1]:[1]){
     const nx=-dz/len*side,nz=dx/len*side,x=center.x+nx*offset,z=center.z+nz*offset;
     const inward=V(-nx,0,-nz),yaw=Math.atan2(-inward.z,inward.x),base=V(x,center.y,z);
     group.push({x,y:baseHeightAt(road,base),z,height:style.height,yaw,style:style.id,brightness:style.brightness,
      roadId:road.id,stationId,side,center:center.toArray(),terrain:terrainAt(road),
      poolY:center.y+.015,poolX:center.x+nx*road.width*.18,poolZ:center.z+nz*road.width*.18,
      poolAxis:tangent.toArray(),poolRadiusX:road.width*.46*style.poolScale,poolRadiusY:8.5*style.poolScale,
      radius:8.5*style.poolScale,color:style.color,size:1.35});
    }
    if(!group.some(p=>occupiedNear(p.x,p.z))){records.push(...group);group.forEach(remember);}
    next+=style.spacing;
   }
   covered+=len;
  }
 }
 return records;
}

export function filterRoadLightStations(records,{isLightAllowed=()=>true,isPoleAllowed=()=>true,isLightPowered=()=>true}={}){
 const groups=new Map(),kept=[];let excludedByBank=0,excludedByClearance=0;
 for(const record of records){const id=record.stationId||record;const group=groups.get(id)||[];group.push(record);groups.set(id,group);}
 for(const group of groups.values()){
  if(!group.every(r=>isLightAllowed(r.x,r.z)&&isLightAllowed(r.poolX??r.x,r.poolZ??r.z))){excludedByBank+=group.length;continue;}
  if(!group.every(r=>isPoleAllowed(r.x,r.z))){excludedByClearance+=group.length;continue;}
  const powered=group.every(r=>isLightPowered(r.x,r.z)&&isLightPowered(r.poolX??r.x,r.poolZ??r.z));
  for(const r of group){r.powered=powered;kept.push(r);}
 }
 return {records:kept,excludedByBank,excludedByClearance};
}

export function roadLightLayoutStats(records){
 const groupCounts=new Map();for(const r of records)groupCounts.set(r.stationId,(groupCounts.get(r.stationId)||0)+1);
 const byStyle=id=>records.filter(r=>r.style===id);
 const highway=byStyle('highway'),cosmodrome=byStyle('cosmodrome');
 const parameters=id=>{const {fixture,colorTemperature,spacing,brightness,density,poolScale}=ROAD_LIGHT_STYLES[id];return {fixture,colorTemperature,spacing,brightness,density,poolScale};};
 return {version:ROAD_LIGHTING_VERSION,highway:{...parameters('highway'),
  lamps:highway.length,stations:new Set(highway.map(r=>r.stationId)).size,
  incompletePairs:[...new Set(highway.filter(r=>groupCounts.get(r.stationId)!==2).map(r=>r.stationId))]},
  cosmodrome:{...parameters('cosmodrome'),lamps:cosmodrome.length,
   stations:new Set(cosmodrome.map(r=>r.stationId)).size,
   extraLamps:[...new Set(cosmodrome.filter(r=>groupCounts.get(r.stationId)!==1).map(r=>r.stationId))]}};
}

/** Local +X is the outreach towards the road; all dimensions are model units. */
export function roadFixtureHead(styleId='highway'){
 const s=ROAD_LIGHT_STYLES[styleId];
 return V(s.armReach,s.height+(styleId==='highway'?.055:-.045),0);
}

// Geometry is shared by instanced road lamps and the batched viaduct lamps.
// Local origin is the foot, +Y is up and +X points from the mast to the road.
export function createRoadFixtureGeometry(styleId='highway'){
 const s=ROAD_LIGHT_STYLES[styleId],pole=[],hardware=[],lens=[];
 const add=(target,g)=>{if(g.index){const nonIndexed=g.toNonIndexed();g.dispose();g=nonIndexed;}g.deleteAttribute('uv');target.push(g);};
 const box=(target,x,y,z,w,h,d)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);add(target,g);};
 const rod=(target,a,b,r1,r2=r1,sides=8)=>{
  const d=b.clone().sub(a),g=new THREE.CylinderGeometry(r2,r1,d.length(),sides);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),d.normalize()));
  const c=a.clone().lerp(b,.5);g.translate(c.x,c.y,c.z);add(target,g);
 };
 const head=roadFixtureHead(styleId);
 if(styleId==='highway'){
  // Tapered graphite mast, swept cantilever and a thin LED blade.
  rod(hardware,V(0,.05,0),V(0,s.height-.20,0),.065,.026);
  box(hardware,0,.035,0,.19,.07,.19);
  const arm=new THREE.CubicBezierCurve3(V(0,s.height-.36,0),V(.04,s.height+.08,0),V(.28,s.height+.055,0),head);
  for(let i=1;i<=6;i++)rod(hardware,arm.getPoint((i-1)/6),arm.getPoint(i/6),.028);
  box(hardware,head.x,head.y,0,s.headLength,s.headThickness,s.headWidth);
  box(hardware,head.x-.12,head.y+.05,0,.19,.025,.14);
  box(lens,head.x+.025,head.y-s.headThickness/2-.006,0,s.headLength-.08,.012,s.headWidth-.05);
 }else{
  // A weathered concrete post with an exposed steel gooseneck and the rounded
  // enamel reflector familiar from Soviet industrial sites.
  rod(pole,V(0,.06,0),V(0,s.height-.18,0),.095,.055);
  box(pole,0,.06,0,.22,.12,.22);
  box(hardware,.065,s.height-.28,0,.14,.09,.12);
  const arm=new THREE.CubicBezierCurve3(V(.04,s.height-.39,0),V(.13,s.height+.23,0),V(.42,s.height+.23,0),head.clone().add(V(0,.04,0)));
  for(let i=1;i<=8;i++)rod(hardware,arm.getPoint((i-1)/8),arm.getPoint(i/8),.032);
  const shade=new THREE.SphereGeometry(1,12,6,0,Math.PI*2,0,Math.PI/2);shade.scale(s.headLength/2,s.headThickness,s.headWidth/2);shade.translate(head.x,head.y-.08,0);add(hardware,shade);
  const rim=new THREE.CylinderGeometry(.5,.5,.025,12);rim.scale(s.headLength,1,s.headWidth);rim.translate(head.x,head.y-.078,0);add(hardware,rim);
  const glass=new THREE.SphereGeometry(1,12,5,0,Math.PI*2,Math.PI/2,Math.PI/2);glass.scale(s.headLength*.42,.055,s.headWidth*.40);glass.translate(head.x,head.y-.09,0);add(lens,glass);
 }
 const merge=parts=>{if(!parts.length)return null;const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());g.computeBoundingSphere();return g;};
 return {pole:merge(pole),hardware:merge(hardware),lens:merge(lens)};
}

export function createRoadFixtureMaterials(styleId='highway',{instancePower=false}={}){
 const style=ROAD_LIGHT_STYLES[styleId],materials={
  pole:new THREE.MeshStandardMaterial({color:style.poleColor,roughness:.94}),
  hardware:new THREE.MeshStandardMaterial({color:styleId==='highway'?style.poleColor:0x50615d,roughness:styleId==='highway'?.48:.82,metalness:.48}),
  lens:new THREE.MeshStandardMaterial({color:0xe8ece8,emissive:style.color,emissiveIntensity:0,roughness:.42})
 };
 // The bridge batches ordinary meshes; only the road instances have vColor
 // and use its binary power mask to extinguish each lens independently.
 if(instancePower){
  materials.lens.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor.rgb;');};
  materials.lens.customProgramCacheKey=()=>ROAD_LIGHTING_VERSION+'-lens-power';
 }
 return materials;
}

/** Separate instanced fixture families keep a whole road network to a few
 * draws. Only halos/pools/emission turn off by day; the poles stay in place. */
export function createRoadLightField(parent,records,{name='Фонари дорог',minPixels=2.8}={}){
 const withHeads=records.map(r=>{
  const style=ROAD_LIGHT_STYLES[r.style||'highway'],head=roadFixtureHead(style.id),heightScale=(r.height??style.height)/style.height;
  head.y*=heightScale;head.applyAxisAngle(V(0,1,0),r.yaw||0);
  return {...r,brightness:r.brightness??style.brightness,lightX:r.x+head.x,lightY:r.y+head.y+.07,lightZ:r.z+head.z};
 });
 const field=createLightField(parent,withHeads,{pools:true,name,minPixels}),fixtures=[],dummy=new THREE.Object3D(),color=new THREE.Color();
 field.root.userData.roadLightingVersion=ROAD_LIGHTING_VERSION;
 for(const id of Object.keys(ROAD_LIGHT_STYLES)){
  const style=ROAD_LIGHT_STYLES[id],items=withHeads.map((r,index)=>({r,index})).filter(({r})=>(r.style||'highway')===id);
  if(!items.length)continue;
  const geometry=createRoadFixtureGeometry(id),mats=createRoadFixtureMaterials(id,{instancePower:true});
  for(const [part,g] of Object.entries(geometry)){
   if(!g)continue;const mesh=new THREE.InstancedMesh(g,mats[part],items.length);
   mesh.name=(id==='highway'?'Трасса · LED':'Космодром · винтаж')+' · '+part;
   mesh.frustumCulled=false;mesh.userData.roadFixture=id;mesh.userData.fixturePart=part;
   items.forEach(({r},i)=>{
    dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(0,r.yaw||0,0);dummy.scale.set(1,(r.height??style.height)/style.height,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    if(part==='lens')mesh.setColorAt(i,color.set(r.powered===false?0x000000:0xffffff));
   });
   mesh.instanceMatrix.needsUpdate=true;field.root.add(mesh);fixtures.push({mesh,items,part});
  }
 }
 let evening=true,previous='';
 function sync(){
  field.sync();const signature=withHeads.map(r=>{let visible=r.visible!==false;for(let o=r.owner;o;o=o.parent)visible=visible&&o.visible;return visible?(r.powered===false?'2':'1'):'0';}).join('');
  if(signature===previous)return;previous=signature;
  for(const {mesh,items,part} of fixtures)items.forEach(({r,index},i)=>{
   mesh.getMatrixAt(i,dummy.matrix);const e=dummy.matrix.elements,hidden=signature[index]==='0';
   if(hidden&&e[13]>-50000)e[13]-=100000;else if(!hidden&&e[13]<-50000)e[13]+=100000;
   mesh.setMatrixAt(i,dummy.matrix);mesh.instanceMatrix.needsUpdate=true;
   if(part==='lens'){mesh.setColorAt(i,color.set(signature[index]==='1'?0xffffff:0x000000));mesh.instanceColor.needsUpdate=true;}
  });
 }
 function setEvening(value){evening=!!value;field.root.visible=true;field.setStrength(evening?1:0);
  for(const {mesh,part} of fixtures)if(part==='lens')mesh.material.emissiveIntensity=evening?ROAD_LIGHT_LENS_EMISSION*ROAD_LIGHT_STYLES[mesh.userData.roadFixture].brightness:0;
 }
 setEvening(true);sync();
 return {...field,records:withHeads,setEvening,sync,stats:()=>({...field.stats(),version:ROAD_LIGHTING_VERSION,
  drawCalls:field.stats().drawCalls+fixtures.length,fixtureDrawCalls:fixtures.length,physicalPoles:records.length,hardwareVisible:field.root.visible,
  poweredLamps:withHeads.filter(r=>r.powered!==false).length,emissiveIntensity:Math.max(0,...fixtures.filter(f=>f.part==='lens').map(f=>f.mesh.material.emissiveIntensity)),
  styles:Object.fromEntries(Object.keys(ROAD_LIGHT_STYLES).map(id=>{const {brightness,density,poolScale,spacing}=ROAD_LIGHT_STYLES[id];return [id,{brightness,density,poolScale,spacing,emissiveIntensity:fixtures.find(f=>f.part==='lens'&&f.mesh.userData.roadFixture===id)?.mesh.material.emissiveIntensity??0}];})),evening})};
}
