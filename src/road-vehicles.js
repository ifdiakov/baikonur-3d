import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createLightField} from './light-field.js?v=20261031-road-markings-v1';
import {buildHighwayPath, distancePath} from './traffic-paths.js?v=20261102-site2-photo-v3';
import {createRoadFleetVehicle,roadFleetKind} from './road-fleet.js?v=20261108-road-fleet-v1';
import {createSprinterVehicle} from './sprinter-source.js?v=20261105-sprinter-original-logo';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=THREE.MathUtils.clamp;
const fade=(distance,length)=>{const n=clamp(Math.min(distance,length-distance)/80,0,1);return n*n*(3-2*n);};
const EXTENSION=1450;

function nearest(path,point){
 let best={distance:Infinity,along:0,point:null},along=0;
 for(let i=1;i<path.points.length;i++){
  const a=path.points[i-1],b=path.points[i],ab=b.clone().sub(a),length=ab.length();
  const t=clamp(point.clone().sub(a).dot(ab)/(length*length||1),0,1),p=a.clone().addScaledVector(ab,t),distance=p.distanceTo(point);
  if(distance<best.distance)best={distance,along:along+length*t,point:p};along+=length;
 }
 return best;
}
function section(path,from=0,to=path.length,width=path.width){
 const count=Math.max(2,Math.ceil(Math.abs(to-from)/3));
 return Array.from({length:count+1},(_,i)=>({position:path.position(THREE.MathUtils.lerp(from,to,i/count)),width}));
}
function compose(id,label,sections){
 const vertices=[];for(const part of sections)for(const v of part)if(!vertices.length||v.position.distanceTo(vertices.at(-1).position)>1e-6)vertices.push(v);
 const path=distancePath(vertices.map(v=>v.position)),widths=[];let along=0;
 vertices.forEach((v,i)=>{if(i)along+=v.position.distanceTo(vertices[i-1].position);widths.push({along,width:v.width});});
 return {...path,id,label,widthAt(distance){let lo=0,hi=widths.length-1;while(hi-lo>1){const mid=(hi+lo)>>1;if(widths[mid].along>distance)hi=mid;else lo=mid;}
  const a=widths[lo],b=widths[hi];return THREE.MathUtils.lerp(a.width,b.width,clamp((distance-a.along)/(b.along-a.along||1),0,1));}};
}

/** All traffic follows the same sampled pavement used by transport-network.
 * The southern interchange remains the museum's schematic reconstruction. */
export function buildRoadVehicleRoutes(roads){
 if(roads.osmVehiclePlan)return roads.osmVehiclePlan;
 const baseHighway=buildHighwayPath(roads),first=baseHighway.sample(0),last=baseHighway.sample(baseHighway.length);
 const start=first.position.clone().addScaledVector(first.tangent,-EXTENSION),end=last.position.clone().addScaledVector(last.tangent,EXTENSION);
 const highway=compose('highway','Трасса Аральск — Кызылорда',[
  section({...distancePath([start,first.position]),width:baseHighway.width}),section({...baseHighway,width:baseHighway.width}),
  section({...distancePath([last.position,end]),width:baseHighway.width})]);
 highway.width=baseHighway.width;highway.bridgeDistance=baseHighway.bridgeDistance+EXTENSION;highway.routeIds=baseHighway.routeIds;highway.joinGap=baseHighway.joinGap;
 const source=id=>{const road=roads.find(r=>r.id===id);if(!road)throw Error('Missing car road '+id);return {...distancePath(road.points),width:road.width,id};};
 const trunk=source('r-nw-center'),city=source('r-city-photo-access');
 const cityRoute=compose('city-cosmodrome','Город ↔ космодром',[section(city,city.length,0),section(trunk,trunk.length,0)]);
 const routes=[highway,cityRoute];
 const joins=[];
 const outer=source('south-interchange-city'),loop=source('south-interchange-loop-1');
 for(const side of [-1,1]){
  // Westbound and eastbound approaches use the real east-side half-cloverleaf:
  // from the west take the inner return loop; from the east take the outer arm.
  let ramp;
  if(side<0){const onOuter=nearest(outer,loop.points[0]),parts=[section(loop,loop.length,0),section(outer,onOuter.along,0)];parts[0][parts[0].length-1].position.copy(onOuter.point);ramp=compose('south-interchange-loop-1','Внутренняя петля в город',parts);ramp.width=loop.width;}
  else{ramp={...distancePath([...outer.points].reverse()),id:outer.id,width:outer.width};}
  const highwayJoin=nearest(highway,ramp.points[0]),trunkJoin=nearest(trunk,ramp.points.at(-1));
  joins.push({id:ramp.id,highwayGap:highwayJoin.distance,trunkGap:trunkJoin.distance});
  const rampPoints=ramp.points.map(p=>p.clone());rampPoints[0].copy(highwayJoin.point);rampPoints[rampPoints.length-1].copy(trunkJoin.point);
  const onRamp={...distancePath(rampPoints),width:ramp.width};
  const route=compose('highway-city-'+side,side<0?'Аральск ↔ город':'Кызылорда ↔ город',[
   section(highway,side<0?0:highway.length,highwayJoin.along,highway.width),section(onRamp),
   section(trunk,trunkJoin.along,trunk.length),section(city)
  ]);route.rampStart=side<0?highwayJoin.along:highway.length-highwayJoin.along;route.rampEnd=route.rampStart+onRamp.length;routes.push(route);
 }
 return {routes,highway,joins,extensions:[{from:start,to:first.position,width:highway.width},{from:last.position,to:end,width:highway.width}]};
}

export function roadVehiclePose(route,elapsed,vehicle){
 const s=((vehicle.phase*route.length+vehicle.direction*vehicle.speed*elapsed)%route.length+route.length)%route.length;
 const at=route.sample(s,1.5),right=V(-at.tangent.z,0,at.tangent.x).normalize(),width=route.widthAt(s),halfCar=(vehicle.halfWidth||.9)*(route.vehicleScale||1);
 const laneOffset=vehicle.direction*(route.source==='OpenStreetMap'?Math.min(width/4,Math.max(0,width/2-halfCar-.035)):width/4);
 const position=at.position.clone().addScaledVector(right,laneOffset);let tangent=at.tangent;
 if(route.surfaceHeightAt){
  position.y=route.surfaceHeightAt(position);
  // The final joined pavement owns the height at each wheel lane. Sampling
  // ahead and behind in that same lane keeps vehicle pitch with the surface
  // when an oblique local-road centreline merges onto the graded highway.
  const lanePoint=distance=>{const sample=route.sample(distance,.5),normal=V(-sample.tangent.z,0,sample.tangent.x).normalize(),w=route.widthAt(clamp(distance,0,route.length));
   const offset=vehicle.direction*Math.min(w/4,Math.max(0,w/2-halfCar-.035)),p=sample.position.clone().addScaledVector(normal,offset);p.y=route.surfaceHeightAt(p);return p;};
  tangent=lanePoint(s+.75).sub(lanePoint(s-.75)).normalize();
 }
 position.y+=.022;
 return {position,tangent:tangent.multiplyScalar(vehicle.direction),direction:vehicle.direction,speed:vehicle.speed,distance:s,laneOffset,opacity:fade(s,route.length),phase:vehicle.phase,routeId:route.id,routeLength:route.length};
}

const material=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.54,metalness:.32,...options});
function piece(group,w,h,d,x,y,z,mat,name){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.name=name;group.add(m);return m;}
function batch(group){
 const sets=new Map();for(const child of [...group.children]){if(!child.isMesh)continue;child.updateMatrix();const geometry=child.geometry.clone().applyMatrix4(child.matrix);
  if(!sets.has(child.material))sets.set(child.material,[]);sets.get(child.material).push(geometry);group.remove(child);child.geometry.dispose();}
 for(const [mat,geometries]of sets){const mesh=new THREE.Mesh(mergeGeometries(geometries,false),mat);mesh.name='Автомобиль · детали кузова';group.add(mesh);geometries.forEach(g=>g.dispose());}
}
// No generic vehicle geometry, including while source models are loading.
function createSprinterAnchor(parent){
 const root=new THREE.Group();root.visible=false;root.userData.pickable=false;root.userData.museumComponent='moving-road-vehicle';parent.add(root);
 return {root,wheels:[],update(pose){root.position.copy(pose.position);root.visible=false;}};
}

function extendRoad(parent,extensions){
 const group=new THREE.Group();group.name='Трасса · продолжение за территорией музея';parent.add(group);const poles=[];
 const asphalt=material(0x555550,{roughness:.96,metalness:0}),shoulder=material(0xa99c83,{roughness:1,metalness:0}),paint=new THREE.MeshBasicMaterial({color:0xc4bba4,transparent:true,opacity:.56});
 extensions.forEach(({from,to,width})=>{
  const d=to.clone().sub(from),length=d.length(),right=V(-d.z,0,d.x).normalize(),mid=from.clone().lerp(to,.5),heading=Math.atan2(d.x,d.z);
  const apron=piece(group,width+3.1,.06,length,mid.x,.66,mid.z,shoulder,'highway-extension-shoulder');apron.rotation.y=heading;
  const road=piece(group,width,.024,length,mid.x,.708,mid.z,asphalt,'highway-extension-pavement');road.rotation.y=heading;road.userData.groundSurface=true;
  for(let along=4;along<length-4;along+=15){const p=from.clone().addScaledVector(d,along/length);const dash=piece(group,.14,.012,5,p.x,.737,p.z,paint,'highway-extension-centerline');dash.rotation.y=heading;}
  for(let along=45;along<length-25;along+=110)for(const side of [-1,1]){const p=from.clone().addScaledVector(d,along/length).addScaledVector(right,side*(width/2+1.2));poles.push({x:p.x,y:.72,z:p.z,height:6.8,color:0xffd797,size:6.8,radius:8.5});}
 });
 batch(group);const lights=createLightField(group,poles,{poles:true,pools:true,name:'Огни дальней трассы',minPixels:2.9});
 return {setEvening:value=>lights.setStrength(value?1:.035),length:EXTENSION*2,poles:poles.length};
}

export function createRoadVehicles({parent,roads,camera,controls}){
 const plan=buildRoadVehicleRoutes(roads),extension=plan.source==='OpenStreetMap'?{setEvening(){},length:0,poles:0}:extendRoad(parent,plan.extensions),configs=[];
 plan.routes.forEach((route,routeIndex)=>{
  const perDirection=routeIndex<2?4:1;
  for(const direction of [1,-1])for(let i=0;i<perDirection;i++){
   let phase=(i/perDirection+(direction===1?.04:.14))%1;
   if(routeIndex===0&&i===0&&direction===1)phase=(route.bridgeDistance+42)/route.length;
   if(routeIndex===1&&i===0)phase=direction===1?.13:.19;
   if(routeIndex>1)phase=(direction===1?route.rampStart+24:route.rampEnd-30)/route.length;
   configs.push({route,phase,direction,speed:routeIndex===0?16:routeIndex===1?13:10});
  }
 });
 let fleetIndex=0;
 const cars=configs.map((_,i)=>i%6===2?createSprinterVehicle(createSprinterAnchor(parent)):createRoadFleetVehicle(parent,roadFleetKind(fleetIndex++))),states=[];let night=true;
 cars.forEach((car,i)=>{configs[i].halfWidth=car.halfWidth||.9;});
 cars.forEach((car,i)=>car.root.scale.setScalar(configs[i].route.vehicleScale||1));
 const museumBounds=new THREE.Box3().setFromPoints(roads.flatMap(r=>r.points)).expandByScalar(15),junction=plan.highway.position(plan.highway.bridgeDistance);
 function update(elapsed){configs.forEach((config,i)=>{config.halfWidth=cars[i].halfWidth||.9;const state=roadVehiclePose(config.route,elapsed,config);states[i]=state;cars[i].update(state,night);});}
 let pending=null;const loadSprinters=()=>pending||(pending=Promise.all(cars.filter(c=>c.type==='sprinter').map(c=>c.loadDetail())).then(results=>results.every(Boolean)).finally(()=>{pending=null;}));
 let fleetPending=null;const loadRoadFleet=()=>fleetPending||(fleetPending=Promise.all(cars.filter(c=>c.type!=='sprinter').map(c=>c.loadDetail())).then(results=>results.every(Boolean)).finally(()=>{fleetPending=null;}));
 if(typeof window!=='undefined'){
  const startup=globalThis.__MUSEUM_STARTUP;
  if(startup?.defer){startup.defer(loadSprinters,{key:'sprinter',priority:3});startup.defer(loadRoadFleet,{key:'road-fleet',priority:3});}
  else{Promise.resolve().then(loadSprinters);Promise.resolve().then(loadRoadFleet);}
 }
 function focus(index=null){
  if(index===null){let nearest=Infinity;index=0;cars.forEach((car,i)=>{if(!museumBounds.containsPoint(car.root.position)||states[i]?.opacity<.95)return;const distance=car.root.position.distanceToSquared(junction);if(distance<nearest){nearest=distance;index=i;}});}
  globalThis.__MUSEUM_STARTUP?.promote?.('road-fleet',100);if(typeof window!=='undefined')loadRoadFleet();
  const car=cars[clamp(index,0,cars.length-1)],target=car.root.position.clone().add(V(0,.65,0));controls.target.copy(target);camera.position.copy(target).add(V(16,14,21));controls.update();
  // The existing mobile sidebar occupies the left half of the canvas. Keep
  // the selected car in the free area, without changing global camera bounds.
  if(globalThis.innerWidth<700){camera.updateMatrixWorld();const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),halfWidth=camera.position.distanceTo(target)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect;camera.position.addScaledVector(right,-halfWidth*.62);controls.target.addScaledVector(right,-halfWidth*.62);controls.update();}
 }
 function focusSprinter(){
  const candidates=cars.map((car,i)=>({car,i})).filter(({car})=>car.type==='sprinter');
  const selected=candidates.find(({i})=>configs[i].route.id!=='highway'&&states[i]?.opacity>.95)||candidates[0];if(!selected)return null;
  const {car,i}=selected,target=car.root.position.clone().add(V(0,1.2*car.root.scale.x,0));controls.target.copy(target);camera.position.copy(target).add(V(8,5,10).multiplyScalar(car.root.scale.x*Math.max(1,.85/camera.aspect)));controls.update();
  if(globalThis.innerWidth<700){camera.updateMatrixWorld();const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),halfWidth=camera.position.distanceTo(target)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect;camera.position.addScaledVector(right,-halfWidth*.35);controls.target.addScaledVector(right,-halfWidth*.35);controls.update();}
  globalThis.__MUSEUM_STARTUP?.promote?.('sprinter',100);return i;
 }
 return {update,focus,focusSprinter,loadSprinters,loadRoadFleet,setEvening(value){night=!!value;extension.setEvening(night);},cars,highway:plan.highway,
  stats:()=>({version:'road-vehicles-v3',cars:cars.length,routeCount:plan.routes.length,extensionLength:extension.length,extensionLamps:extension.poles,joins:plan.joins,
   routes:plan.routes.map(r=>({id:r.id,label:r.label,length:r.length,rampStart:r.rampStart,rampEnd:r.rampEnd})),
   fleet:cars.flatMap((car,index)=>car.type!=='sprinter'?[{index,...car.sourceState}]:[]),
   sprinters:cars.flatMap((car,index)=>car.type==='sprinter'?[{index,...car.sourceState}]:[]),
   carStates:states.map((s,i)=>({...s,position:s.position.toArray(),tangent:s.tangent.toArray(),index:i,type:cars[i].type,lightCount:4,wheelRotation:cars[i].wheels[0]?.rotation.x??0,scale:cars[i].root.scale.x}))})};
}
