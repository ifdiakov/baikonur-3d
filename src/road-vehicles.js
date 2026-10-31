import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createLightField} from './light-field.js?v=20261031-highway-lighting-v3';
import {buildHighwayPath, distancePath} from './traffic-paths.js?v=20261031-rocket-exhibits-v1';

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
 const at=route.sample(s,1.5),right=V(-at.tangent.z,0,at.tangent.x).normalize(),width=route.widthAt(s),halfCar=.9*(route.vehicleScale||1);
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
function createCar(parent,index){
 const root=new THREE.Group();root.name='Автомобиль '+(index+1);root.userData.pickable=false;root.userData.museumComponent='moving-road-vehicle';parent.add(root);
 const type=index%6===2?'van':index%4===1?'suv':'sedan',van=type==='van',suv=type==='suv';
 const colors=[0xd8d7cf,0x568893,0xddd0a9,0xb45f45,0x8c95a2,0x4b7560,0xbd9f76,0x7186a0];
 const paint=material(colors[index%colors.length]),rubber=material(0x1c232b),chrome=material(0xa7b1b2,{metalness:.72}),trim=material(0x33404a);
 const glass=material(0x436079,{metalness:.44,roughness:.21,emissive:0x587183,emissiveIntensity:.24});
 const warm=new THREE.MeshBasicMaterial({color:0xffecc5,toneMapped:false}),red=new THREE.MeshBasicMaterial({color:0xff4034,toneMapped:false}),amber=new THREE.MeshBasicMaterial({color:0xffbd58,toneMapped:false});
 const solids=new THREE.Group();root.add(solids);const rear=van?-2.03:-1.84,front=van?2.03:1.84;
 piece(solids,1.49,.46,front-rear,0,.66,0,paint,'body');piece(solids,1.40,.15,front-rear-.1,0,.32,0,trim,'underbody');
 piece(solids,1.31,van?1.15:suv?.74:.58,van?2.9:2.06,0,van?1.44:suv?1.24:1.13,van?-.44:-.19,paint,'cabin');
 piece(solids,1.36,.10,van?2.93:2.17,0,van?2.055:suv?1.65:1.47,van?-.44:-.2,paint,'roof');
 const glassY=van?1.63:suv?1.37:1.22,glassHeight=van?.49:suv?.44:.35,windZ=van?1.03:.85;
 piece(solids,1.20,glassHeight,.034,0,glassY,windZ,glass,'windshield');piece(solids,1.20,glassHeight,.034,0,glassY,van?-1.905:-1.23,glass,'rear-window');
 for(const side of [-1,1]){
  if(van){piece(solids,.034,.48,.75,side*.675,glassY,.58,glass,'cab-window');piece(solids,.034,.58,1.24,side*.675,glassY,-1.02,glass,'van-side-window');}
  else for(const [z,length]of [[.34,.80],[-.66,.72]])piece(solids,.034,glassHeight,length,side*.674,glassY,z,glass,'side-window');
  piece(solids,.14,.20,.28,side*.82,glassY-.17,.67,paint,'wing-mirror');
  for(const z of [-.68,.43])piece(solids,.042,.044,.20,side*.765,.91,z,chrome,'door-handle');
  piece(solids,.055,.065,3.2,side*.755,.51,0,chrome,'side-sill');
  if(suv)piece(solids,.07,.10,1.67,side*.54,1.74,-.2,trim,'roof-rail');
 }
 for(const z of [rear,front]){piece(solids,1.46,.18,.15,0,.47,z,trim,'bumper');piece(solids,.45,.14,.022,0,.59,z+Math.sign(z)*.09,chrome,'plate');}
 piece(solids,.58,.23,.033,0,.76,front+.07,trim,'grille');for(const x of [-.20,0,.20])piece(solids,.025,.20,.03,x,.76,front+.09,chrome,'grille-bar');
 for(const side of [-1,1]){piece(solids,.31,.18,.05,side*.50,.79,front+.05,warm,'headlight-lens');piece(solids,.27,.23,.05,side*.53,.78,rear-.05,red,'tail-lamp');piece(solids,.08,.16,.052,side*.69,.79,front+.05,amber,'indicator');}
 batch(solids);
 const wheelGeometry=new THREE.CylinderGeometry(.265,.265,.16,16),rimGeometry=new THREE.CylinderGeometry(.152,.152,.168,12),wheels=[];
 for(const z of [van?-1.36:-1.17,van?1.36:1.17])for(const side of [-1,1]){
  const spin=new THREE.Group();spin.position.set(side*.735,.265,z);root.add(spin);wheels.push(spin);
  const tyre=new THREE.Mesh(wheelGeometry,rubber);tyre.rotation.z=Math.PI/2;spin.add(tyre);
  const rim=new THREE.Mesh(rimGeometry,chrome);rim.rotation.z=Math.PI/2;spin.add(rim);
  for(let n=0;n<3;n++){const spoke=piece(spin,.172,.025,.28,0,0,0,trim,'wheel-spoke');spoke.rotation.x=n*Math.PI/3;}batch(spin);
 }
 const lamps=createLightField(root,[-1,1].flatMap(side=>[
  {x:side*.50,y:.79,z:front+.09,height:0,color:0xffedc7,size:5.7},
  {x:side*.53,y:.78,z:rear-.09,height:0,color:0xff382a,size:3.6}
 ]),{name:'Автомобиль · фары и габариты',minPixels:4.3});
 const beamMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{power:{value:1}},
  vertexShader:`varying vec2 vUv;#include <common>\n#include <logdepthbuf_pars_vertex>\nvoid main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;#include <logdepthbuf_vertex>\n}`.replaceAll(';#include',';\n#include'),
  fragmentShader:`varying vec2 vUv;uniform float power;#include <common>\n#include <logdepthbuf_pars_fragment>\nvoid main(){#include <logdepthbuf_fragment>\nfloat distance=1.-vUv.y;float width=.10+distance*.37;float edge=1.-smoothstep(width*.45,width,abs(vUv.x-.5));float a=edge*pow(1.-distance,1.7)*.21*power;gl_FragColor=vec4(1.,.79,.44,a);}`.replaceAll(';#include',';\n#include').replaceAll('{#include','{\n#include')});
 const beam=new THREE.Mesh(new THREE.PlaneGeometry(6.4,11),beamMaterial);beam.rotation.x=-Math.PI/2;beam.position.set(0,.033,front+5.5);beam.renderOrder=5;root.add(beam);
 const fading=[paint,rubber,chrome,trim,glass,warm,red,amber];fading.forEach(m=>{m.transparent=true;});
 return {root,type,wheels,glass,lamps,update(state,night){
  root.position.copy(state.position);root.rotation.set(-Math.asin(clamp(state.tangent.y,-1,1)),Math.atan2(state.tangent.x,state.tangent.z),0,'YXZ');root.visible=state.opacity>.003;
  for(const mat of fading)mat.opacity=state.opacity;glass.emissiveIntensity=night?.24:.035;
  wheels.forEach(w=>w.rotation.x=state.distance*state.direction/.265);lamps.setStrength(state.opacity*(night?1.6:.19));beam.visible=night;beamMaterial.uniforms.power.value=state.opacity;
 }};
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
 const cars=configs.map((_,i)=>createCar(parent,i)),states=[];let night=true;
 cars.forEach((car,i)=>car.root.scale.setScalar(configs[i].route.vehicleScale||1));
 const museumBounds=new THREE.Box3().setFromPoints(roads.flatMap(r=>r.points)).expandByScalar(15),junction=plan.highway.position(plan.highway.bridgeDistance);
 function update(elapsed){configs.forEach((config,i)=>{const state=roadVehiclePose(config.route,elapsed,config);states[i]=state;cars[i].update(state,night);});}
 function focus(index=null){
  if(index===null){let nearest=Infinity;index=0;cars.forEach((car,i)=>{if(!museumBounds.containsPoint(car.root.position)||states[i]?.opacity<.95)return;const distance=car.root.position.distanceToSquared(junction);if(distance<nearest){nearest=distance;index=i;}});}
  const car=cars[clamp(index,0,cars.length-1)],target=car.root.position.clone().add(V(0,.65,0));controls.target.copy(target);camera.position.copy(target).add(V(16,14,21));controls.update();
  // The existing mobile sidebar occupies the left half of the canvas. Keep
  // the selected car in the free area, without changing global camera bounds.
  if(globalThis.innerWidth<700){camera.updateMatrixWorld();const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),halfWidth=camera.position.distanceTo(target)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect;camera.position.addScaledVector(right,-halfWidth*.62);controls.target.addScaledVector(right,-halfWidth*.62);controls.update();}
 }
 return {update,focus,setEvening(value){night=!!value;extension.setEvening(night);},cars,highway:plan.highway,
  stats:()=>({version:'road-vehicles-v2',cars:cars.length,routeCount:plan.routes.length,extensionLength:extension.length,extensionLamps:extension.poles,joins:plan.joins,
   routes:plan.routes.map(r=>({id:r.id,label:r.label,length:r.length,rampStart:r.rampStart,rampEnd:r.rampEnd})),
   carStates:states.map((s,i)=>({...s,position:s.position.toArray(),tangent:s.tangent.toArray(),index:i,type:cars[i].type,lightCount:4,wheelRotation:cars[i].wheels[0].rotation.x}))})};
}
