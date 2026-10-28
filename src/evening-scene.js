import * as THREE from 'three';
import {createLightField} from './light-field.js';
import {SATURN_ACCESS,saturnTerrainHeight} from './saturn-access.js';

export function buildEveningScene({scene,camera,renderer,sun,layers,objects,roads,airfield,groundMeshes,button,onModeChange}){
 const hemisphere=scene.children.find(o=>o.isHemisphereLight),fields=[],originals=new Map();
 let evening=true,lastSync=-1;
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
 const roadLights=[],occupied=new Set();
 for(const road of roads){let covered=0,next=24;
  for(let j=1;j<road.points.length;j++){
   const a=road.points[j-1],b=road.points[j],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.01)continue;
   while(next<=covered+len){const t=(next-covered)/len;
    for(const side of [-1,1]){const nx=-dz/len*side,nz=dx/len*side,offset=road.width/2+1.1;
     const x=a.x+dx*t+nx*offset,z=a.z+dz*t+nz*offset,key=Math.round(x/10)+':'+Math.round(z/10);
     if(!occupied.has(key)){occupied.add(key);const surface=a.y+(b.y-a.y)*t;
      const onSaturn=road.id===SATURN_ACCESS.routeId&&saturn;
      roadLights.push({x,y:onSaturn?saturnGround(x,z)+.035:surface-.055,z,height:2.8,yaw:Math.atan2(-nx,-nz),
      poolY:surface+.015,poolX:x-nx*offset*.72,poolZ:z-nz*offset*.72,radius:9,color:0xffbd70,terrain:onSaturn?'saturn':'road'});}
    }next+=58;
   }covered+=len;
  }
 }
 fields.push(createLightField(layers.roads,roadLights,{poles:true,pools:true,name:'Вечер · фонари дорог',minPixels:3.5}));
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
   const x=center.x+Math.cos(angle)*radius,z=center.z+Math.sin(angle)*radius;
   // Saturn's summit is above the former raycast ceiling. Sample its actual
   // height field, so bases and light pools cannot drop to the flat map below.
   const y=(id==='pad-23'?saturnGround(x,z):baseAt(x,z,surfaces,height))+.02;
   (o.type==='city'?cityLights:siteLights).push({x,y,z,
    height:id==='pad-1'?1.8:id==='pad-250'?3.6:2.6,radius:10,owner:o.g,color:j%3?0xffcf94:0xd6e8ff});
  }
 }
 fields.push(createLightField(layers.sites,siteLights,{poles:true,pools:true,name:'Вечер · свет площадок'}));
 fields.push(createLightField(layers.city,cityLights,{poles:true,pools:true,name:'Вечер · город'}));
 // Exact transforms of the existing airport geometry, not a second runway.
 const runway=[];airfield.updateWorldMatrix(true,false);
 function runwayLight(x,z,color,size=3){const p=airfield.localToWorld(new THREE.Vector3(x,2.2,z));runway.push({x:p.x,y:p.y,z:p.z,height:0,color,size,owner:airfield});}
 for(let z=-530;z<=530;z+=38)for(const x of [-45,45])runwayLight(x,z,0xffefc5);
 for(let x=-38;x<=38;x+=9.5){runwayLight(x,535,0x64ffbc,4);runwayLight(x,-535,0xff4c42,4);}
 for(let z=-530;z<=535;z+=50)runwayLight(0,z,z< -350?0xffb76b:0xf4f3dd,2.4);
 for(let z=-320;z<130;z+=40)runwayLight(82,z,0x68aaff,3.5);
 for(let z=580;z<850;z+=50)runwayLight(0,z,0xffeac0,3);
 fields.push(createLightField(layers.city,runway,{name:'Крайний · огни ВПП',minPixels:2.3}));
 const apron=[];for(const [x,z] of [[60,-350],[235,-350],[235,-190],[60,-190]]){
  const p=airfield.localToWorld(new THREE.Vector3(x,1.6,z));apron.push({x:p.x,y:p.y,z:p.z,height:4,radius:15,color:0xffdba4,owner:airfield});
 }
 fields.push(createLightField(layers.city,apron,{poles:true,pools:true,name:'Крайний · перрон'}));
 const floods=[];
 for(const id of ['pad-1','pad-250','pad-112','pad-23']){const o=objects.find(o=>o.record.id===id);if(!o)continue;
  const c=o.g.getWorldPosition(new THREE.Vector3()),light=new THREE.PointLight(0xffc48a,100,75,1.4);
  light.position.set(c.x-9,(id==='pad-23'?saturnGround(c.x-9,c.z+8):0)+13,c.z+8);scene.add(light);floods.push({light,owner:o.g});
 }
 function setEvening(value){evening=!!value;sky.visible=evening;
  scene.background.set(evening?0x172844:0xb7b5a4);scene.fog.color.set(evening?0x202c46:0xb7b5a4);scene.fog.density=evening?.00007:.000085;
  hemisphere.color.set(evening?0x9ab5ee:0xbdd7f2);hemisphere.groundColor.set(evening?0x29344b:0x62533d);hemisphere.intensity=evening?.82:2;
  sun.color.set(evening?0xffb488:0xffdfb4);sun.intensity=evening?.5:2.2;sun.position.set(-700,evening?180:1200,500);
  for(const [m,c] of originals){m.color.copy(c);if(evening)m.color.multiply(new THREE.Color(0x53647f));}
  for(const field of fields){field.root.visible=evening;field.setStrength(evening?1:0);}
  for(const f of floods)f.light.visible=evening&&f.owner.visible;
  button.textContent=evening?'Вечер · огни':'День';button.setAttribute('aria-pressed',String(evening));
  button.title=evening?'Переключить на дневной свет':'Включить вечерний свет';onModeChange?.(evening);
 }
 button.addEventListener('click',()=>setEvening(!evening));setEvening(true);
 return {setEvening,get evening(){return evening;},update(now){sky.position.copy(camera.position);if(now-lastSync>300){lastSync=now;for(const f of fields)f.sync();for(const f of floods)f.light.visible=evening&&f.owner.visible&&f.owner.parent.visible;}},
  stats:()=>({version:'evening-baikonur-v1',evening,roadLights:roadLights.length,siteLights:siteLights.length,runwayLights:runway.length,
   saturnLights:siteLights.filter(l=>l.owner===saturn?.g).map(l=>({x:l.x,y:l.y,z:l.z,height:l.height,terrainY:saturnGround(l.x,l.z)})),
   saturnRoadLights:roadLights.filter(l=>l.terrain==='saturn').map(l=>({x:l.x,y:l.y,z:l.z,height:l.height,terrainY:saturnGround(l.x,l.z)})),
   lightBatches:fields.reduce((n,f)=>n+f.stats().drawCalls,0),dynamicLights:floods.length,terrainMaterials:originals.size})};
}
