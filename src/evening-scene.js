import * as THREE from 'three';
import {createLightField} from './light-field.js?v=20261031-highway-lighting-v4';
import {buildRoadLightRecords,filterRoadLightStations,createRoadLightField,roadLightLayoutStats} from './road-lighting.js?v=20261031-highway-lighting-v4';
import {SATURN_ACCESS,saturnTerrainHeight} from './saturn-access.js?v=20261030-river-roads-signs-v1';
import {buildAirportLightRecords,AIRPORT_LIGHT_LAYOUT_VERSION} from './airport-light-layout.js?v=20261031-rocket-exhibits-v1';

export function buildEveningScene({scene,camera,renderer,sun,layers,objects,roads,airfield,groundMeshes,button,onModeChange,isLightAllowed=()=>true,isPoleAllowed=()=>true,isLightPowered=()=>true,bankRule='north-of-syr-darya-v1'}){
 const hemisphere=scene.children.find(o=>o.isHemisphereLight),fields=[],originals=new Map();
 let evening=true,lastSync=-1;
 const excludedByBank={road:0,site:0,city:0,runway:0,apron:0,flood:0};
 const permitted=light=>isLightAllowed(light.x,light.z)&&isLightAllowed(light.poolX??light.x,light.poolZ??light.z);
 const excludedByClearance={road:0,site:0,city:0,apron:0};
 function filterBank(records,kind){const permittedByBank=records.filter(permitted);excludedByBank[kind]+=records.length-permittedByBank.length;
  const kept=kind==='runway'?permittedByBank:permittedByBank.filter(light=>isPoleAllowed(light.x,light.z));
  if(kind in excludedByClearance)excludedByClearance[kind]+=permittedByBank.length-kept.length;
  for(const light of kept)light.powered=isLightPowered(light.x,light.z)&&isLightPowered(light.poolX??light.x,light.poolZ??light.z);records.splice(0,records.length,...kept);}
 const saturn=objects.find(o=>o.record.id==='pad-23');
 scene.updateMatrixWorld(true);
 function saturnGround(x,z){
  const local=saturn.g.worldToLocal(new THREE.Vector3(x,0,z));
  return saturn.g.localToWorld(new THREE.Vector3(local.x,saturnTerrainHeight(local.x,local.z),local.z)).y;
 }
 // Basic terrain materials ignore scene lighting; tint every shared surface
 // equally, including Saturn's world-UV hill, so their joins remain invisible.
 scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
  if(m?.isMeshBasicMaterial&&m.color&&!m.userData.keepBrightness&&!originals.has(m))originals.set(m,m.color.clone());
 }});
 const sky=new THREE.Mesh(new THREE.SphereGeometry(35000,48,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
  uniforms:{night:{value:1}},vertexShader:`varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec3 direction;uniform float night;
   void main(){vec3 d=normalize(direction);float h=clamp(d.y,0.,1.);float west=pow(max(0.,-d.x*.86+d.z*.5),5.);
    vec3 low=mix(vec3(.16,.20,.33),vec3(.62,.31,.22),west*.8);vec3 c=mix(low,vec3(.025,.047,.115),smoothstep(0.,.65,h));
    float band=exp(-pow((d.y-.025)*13.,2.))*west;c+=band*vec3(.14,.045,.012);
    gl_FragColor=vec4(c,1.);
    #include <colorspace_fragment>
   }`}));
 sky.name='Вечернее небо';sky.userData.pickable=false;sky.renderOrder=-100;sky.frustumCulled=false;scene.add(sky);
 const roadLayout=filterRoadLightStations(buildRoadLightRecords(roads,{
  baseHeightAt:(road,p)=>road.id===SATURN_ACCESS.routeId&&saturn?saturnGround(p.x,p.z)+.035:p.y-.055,
  terrainAt:road=>road.id===SATURN_ACCESS.routeId&&saturn?'saturn':'road'
 }),{isLightAllowed,isPoleAllowed,isLightPowered});
 const roadLights=roadLayout.records;
 excludedByBank.road=roadLayout.excludedByBank;excludedByClearance.road=roadLayout.excludedByClearance;
 const roadField=createRoadLightField(layers.roads,roadLights,{name:'Дороги · современные и винтажные фонари',minPixels:2.8});fields.push(roadField);
 const siteLights=[],cityLights=[];
 scene.updateMatrixWorld(true);
 const down=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
 function baseAt(x,z,meshes,ceiling){down.ray.origin.set(x,1000,z);return down.intersectObjects(meshes,false).find(h=>h.point.y<=ceiling)?.point.y??-2.755;}
 for(const o of objects){
  if(o.type==='air')continue;
  const center=o.g.getWorldPosition(new THREE.Vector3()),id=o.record.id;
  const radius=id==='pad-1'?19:id==='pad-250'?36:id==='pad-112'?25:id==='pad-23'?53:o.type==='city'?23:10;
  const height=id==='pad-1'?2:1.2;
  const surfaces=[...groundMeshes];o.g.traverse(m=>{if(m.isMesh)surfaces.push(m);});
  const count=o.type==='city'?12:4;
  for(let j=0;j<count;j++){const angle=(j+.5)*Math.PI*2/count;
   // Site 31's traced bowl is wider than the former generic light circle.
   // Keep its poles and pools on the solid service yards, not above the void.
   const site31Local=[[-86,.10,-40],[80,.10,-40],[-83,.10,118],[94,.10,117]];
   const site31Base=id==='pad-31'?o.g.localToWorld(new THREE.Vector3(...site31Local[j])):null;
   const x=site31Base?.x??center.x+Math.cos(angle)*radius,z=site31Base?.z??center.z+Math.sin(angle)*radius;
   // Saturn's summit is above the former raycast ceiling. Sample its actual
   // height field, so bases and light pools cannot drop to the flat map below.
   const y=(site31Base?site31Base.y:id==='pad-23'?saturnGround(x,z):baseAt(x,z,surfaces,height))+.02;
   (o.type==='city'?cityLights:siteLights).push({x,y,z,
    height:id==='pad-1'?1.8:id==='pad-250'?3.6:2.6,radius:site31Base?4:10,owner:o.g,color:j%3?0xffcf94:0xd6e8ff});
  }
 }
 filterBank(siteLights,'site');filterBank(cityLights,'city');
 fields.push(createLightField(layers.sites,siteLights,{poles:true,pools:true,name:'Вечер · свет площадок'}));
 fields.push(createLightField(layers.city,cityLights,{poles:true,pools:true,name:'Вечер · город'}));
 // Airport lights use the same displayed length and transform as the runway.
 const runway=[],apron=[];
 for(const airport of objects.filter(o=>o.g.userData.airport)){
  const layout=buildAirportLightRecords(airport.g);runway.push(...layout.runway);apron.push(...layout.apron);
 }
 filterBank(runway,'runway');filterBank(apron,'apron');
 fields.push(createLightField(layers.city,runway,{name:'Аэродромы · ВПП, глиссада и рулёжные огни',minPixels:1.8}));
 fields.push(createLightField(layers.city,apron,{poles:true,pools:true,name:'Аэродромы · перроны'}));
 const floods=[];
 for(const id of ['pad-1','pad-250','pad-112','pad-23']){const o=objects.find(o=>o.record.id===id);if(!o)continue;
  const c=o.g.getWorldPosition(new THREE.Vector3()),light=new THREE.PointLight(0xffc48a,100,75,1.4);
  light.position.set(c.x-9,(id==='pad-23'?saturnGround(c.x-9,c.z+8):0)+13,c.z+8);
  if(!isLightAllowed(light.position.x,light.position.z)||!isLightPowered(light.position.x,light.position.z)){excludedByBank.flood++;continue;}
  scene.add(light);floods.push({light,owner:o.g});
 }
 function setEvening(value){evening=!!value;sky.visible=evening;
  scene.background.set(evening?0x172844:0xb7b5a4);scene.fog.color.set(evening?0x202c46:0xb7b5a4);scene.fog.density=evening?.00007:.000085;
  hemisphere.color.set(evening?0x9ab5ee:0xbdd7f2);hemisphere.groundColor.set(evening?0x29344b:0x62533d);hemisphere.intensity=evening?.82:2;
  sun.color.set(evening?0xffb488:0xffdfb4);sun.intensity=evening?.5:2.2;sun.position.set(-700,evening?180:1200,500);
  for(const [m,c] of originals){m.color.copy(c);if(evening)m.color.multiply(new THREE.Color(0x53647f));}
  for(const field of fields){if(field.setEvening)field.setEvening(evening);else{field.root.visible=evening;field.setStrength(evening?1:0);}}
  for(const f of floods)f.light.visible=evening&&f.owner.visible;
  if(button){button.textContent=evening?'Вечер · огни':'День';button.setAttribute('aria-pressed',String(evening));}
  if(button)button.title=evening?'Переключить на дневной свет':'Включить вечерний свет';onModeChange?.(evening);
 }
 button?.addEventListener('click',()=>setEvening(!evening));setEvening(true);
 const stationaryLights=[...roadLights,...siteLights,...cityLights,...runway,...apron];
 const outsideBankCount=stationaryLights.filter(l=>!permitted(l)).length;
 return {setEvening,lightPositions:({poweredOnly=false}={})=>stationaryLights.filter(l=>!poweredOnly||l.powered!==false).map(l=>[l.x,l.y,l.z]),
  airportLightPositions:key=>[...runway,...apron].filter(l=>!key||l.airport===key).map(l=>({airport:l.airport,kind:l.kind,position:[l.x,l.y,l.z],radius:l.radius||0,local:l.local})),
  get evening(){return evening;},update(now){sky.position.copy(camera.position);if(now-lastSync>300){lastSync=now;for(const f of fields)f.sync();for(const f of floods)f.light.visible=evening&&f.owner.visible&&f.owner.parent.visible;}},
  roadLightRecords:()=>roadLights.map(r=>({style:r.style,roadId:r.roadId,stationId:r.stationId,side:r.side,position:[r.x,r.y,r.z],center:r.center,color:r.color,height:r.height,powered:r.powered,brightness:r.brightness,poolRadiusX:r.poolRadiusX,poolRadiusY:r.poolRadiusY})),
  stats:()=>({version:'evening-road-lighting-v4',evening,roadLights:roadLights.length,roadLighting:roadLightLayoutStats(roadLights),roadFixtures:roadField.stats(),siteLights:siteLights.length,runwayLights:runway.length,
   powerFilter:{disabled:stationaryLights.filter(l=>l.powered===false).length,disabledRoads:roadLights.filter(l=>l.powered===false).length,litSiteIds:[...new Set(siteLights.filter(l=>l.powered!==false).map(l=>objects.find(o=>o.g===l.owner)?.record.id))]},
   airportLighting:{version:AIRPORT_LIGHT_LAYOUT_VERSION,airports:objects.filter(o=>o.g.userData.airport).map(o=>({key:o.g.userData.airport.key,length:o.g.userData.airport.length,approachLength:o.g.userData.airport.approachLength??480,
    runwayLights:runway.filter(l=>l.owner===o.g).length,apronLights:apron.filter(l=>l.owner===o.g).length}))},
   bankFilter:{rule:bankRule,excludedByBank:{...excludedByBank},remaining:stationaryLights.length,outsideBankCount},clearanceFilter:{...excludedByClearance},
   saturnLights:siteLights.filter(l=>l.owner===saturn?.g).map(l=>({x:l.x,y:l.y,z:l.z,height:l.height,terrainY:saturnGround(l.x,l.z)})),
   saturnRoadLights:roadLights.filter(l=>l.terrain==='saturn').map(l=>({x:l.x,y:l.y,z:l.z,height:l.height,terrainY:saturnGround(l.x,l.z)})),
   lightBatches:fields.reduce((n,f)=>n+f.stats().drawCalls,0),dynamicLights:floods.length,terrainMaterials:originals.size})};
}
