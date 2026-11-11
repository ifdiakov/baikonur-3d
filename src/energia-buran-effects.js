import * as THREE from 'three';
import {createEnergiaRocketExhaust} from './energia-rocket-exhaust.js?v=20261111-v1';
import {nozzleFlameMaterial} from './energia-plasma-shader.js?v=20261103-plasma-v2';

export const ENERGIA_BURAN_EFFECTS_VERSION='energia-buran-effects-20261111-v1';
const clamp=(value,a=0,b=1)=>Math.max(a,Math.min(b,value));
const smooth=(a,b,value)=>{const u=clamp((value-a)/(b-a));return u*u*(3-2*u);};
const mix=(a,b,u)=>a+(b-a)*u;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const fract=value=>value-Math.floor(value);
const seed=(index,salt)=>fract(Math.sin(index*127.1+salt*311.7)*43758.5453123);
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

/** The documented 1988 engine events use lift-off contact as T=0. Water's
 * T-16 onset and the visual power ramps are museum interpretations. The
 * episode ends at +75 s, before any engine cutoff or booster separation. */
export function sampleEnergiaBuranEffects(time,{altitudeMetres=0}={}){
 const t=clamp(finite(time,-90),-90,75),altitude=Math.max(0,finite(altitudeMetres));
 const core=smooth(-11.15,-1.75,t),boosters=smooth(-4.95,-1.75,t);
 const enginePower=core*.34+boosters*.66;
 const fireFade=1-smooth(100,360,altitude),smokeFade=1-smooth(100,800,altitude);
 const water=smooth(-16,-12,t)*(1-smooth(18,42,t))*smokeFade;
 return {time:t,altitudeMetres:altitude,engine:{core,boosters},ground:{
  steam:smooth(-84,-12,t)*(1-smooth(5,36,t))*.58*smokeFade,
  water,gas:enginePower*fireFade,
  smoke:clamp(enginePower*.72+water*.28)*smokeFade,
  light:enginePower*fireFade,
  plume:enginePower*smooth(18,85,altitude)
 }};
}

function smokeTexture(){
 const size=128,data=new Uint8Array(size*size*4);
 const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453123);
 function noise(x,y){
  const ix=Math.floor(x),iy=Math.floor(y),fx=fract(x),fy=fract(y);
  const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  return mix(mix(hash(ix,iy),hash(ix+1,iy),u),mix(hash(ix,iy+1),hash(ix+1,iy+1),u),v);
 }
 function fbm(x,y){
  let density=0,amplitude=.54;
  for(let octave=0;octave<5;octave++){density+=amplitude*noise(x,y);x*=2.13;y*=2.13;amplitude*=.48;}
  return density;
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const nx=(x+.5-size/2)/(size/2),ny=(y+.5-size/2)/(size/2);
  const wx=nx+(fbm(nx*3+7,ny*3-6)-.46)*.20;
  const wy=ny+(fbm(nx*3-4,ny*3+8)-.46)*.18;
  const edge=Math.max(0,1-Math.hypot(wx,wy));
  const density=clamp(.22+fbm(wx*4+19,wy*4-7)*1.1,.05,1);
  const index=(y*size+x)*4;
  data[index]=data[index+1]=data[index+2]=255;
  data[index+3]=Math.round(236*Math.pow(edge,1.65)*density);
 }
 const texture=new THREE.DataTexture(data,size,size);
 texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;
 texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
 return texture;
}

function normaliseChannels(channels){
 if(!Array.isArray(channels)||channels.length!==3)throw new TypeError('Site 110 requires its three real gas channels');
 return channels.map((channel,index)=>{
  if(!['throat','outlet'].every(key=>Array.isArray(channel[key])&&channel[key].length===3&&
   channel[key].every(Number.isFinite))||!Number.isFinite(channel.width)||channel.width<=0){
   throw new TypeError('Gas channels require root-local throat/outlet XYZ and a positive width');
  }
  const throat=V(...channel.throat),outlet=V(...channel.outlet),delta=outlet.clone().sub(throat);
  if(delta.length()<1)throw new TypeError('A gas channel needs a non-zero length');
  const direction=delta.clone().normalize(),horizontal=V(delta.x,0,delta.z).normalize();
  if(horizontal.lengthSq()<.5)throw new TypeError('A gas channel must run along the ground');
  return {id:channel.id??`channel-${index+1}`,throat,outlet,width:channel.width,
   length:delta.length(),direction,horizontal,side:V(-horizontal.z,0,horizontal.x),emitters:[]};
 });
}

function treeVisible(object){
 for(let node=object;node;node=node.parent)if(!node.visible)return false;
 return true;
}

/** Ground streams are anchored to the real root-local ramps, while the
 * extracted UKSS nozzle system travels with the existing rocket holder.
 * seek() is deterministic; there is no extra animation loop or scene state. */
export function createEnergiaBuranEffects({root,rocket,camera,channels}){
 if(!root?.isObject3D||!rocket?.isObject3D||!camera?.isCamera){
  throw new TypeError('Buran effects require the site root, rocket holder and camera');
 }
 const ducts=normaliseChannels(channels);
 const groundRoot=new THREE.Group();groundRoot.name='Энергия — Буран · три газоотвода и пар';
 groundRoot.userData={pickable:false,museumComponent:'buran-launch-ground-effects'};
 groundRoot.visible=false;root.add(groundRoot);
 const exhaust=createEnergiaRocketExhaust({rocket});
 const rocketLight=exhaust.root.children.find(child=>child.isPointLight);
 const gasMaterial=nozzleFlameMaterial(0xffb15b);
 // The shader's turbulence is measured in local metres. A full-length shared
 // cylinder avoids magnifying its tail deformation by scaling a unit tube.
 const gasGeometry=new THREE.CylinderGeometry(.92,1.72,26,18,8,true);
 const gasAxis=V(0,-1,0);
 for(const [channelIndex,channel]of ducts.entries()){
  for(let index=0;index<5;index++){
   const jet=new THREE.Mesh(gasGeometry,gasMaterial);
   jet.name=`Газоотвод ${channelIndex+1} · горячий поток ${index+1}`;
   jet.userData={pickable:false,channelId:channel.id,segment:index};
   jet.position.copy(channel.throat).lerp(channel.outlet,(index+.5)/5);jet.position.y+=2.7;
   jet.quaternion.setFromUnitVectors(gasAxis,channel.direction);
   jet.scale.set(1,channel.length/5/26*1.06,1);
   jet.visible=false;jet.frustumCulled=false;jet.renderOrder=31;
   groundRoot.add(jet);channel.emitters.push(jet);
  }
 }
 const lights=ducts.map((channel,index)=>{
  const light=new THREE.PointLight(0xffad68,0,30,2);
  light.name=`Газоотвод ${index+1} · отражённый свет`;
  light.position.copy(channel.throat).lerp(channel.outlet,.80);light.position.y+=9;
  light.castShadow=false;groundRoot.add(light);return light;
 });

 const texture=smokeTexture(),geometry=new THREE.PlaneGeometry(1,1);
 const groups=[['steam',96],['water',96],['duct',192],['outlet',216],['plume',144]];
 const descriptors=groups.flatMap(([kind,count])=>Array.from({length:count},(_,index)=>({kind,index,count})));
 const density=new THREE.InstancedBufferAttribute(new Float32Array(descriptors.length),1);
 geometry.setAttribute('aSmokeDensity',density);
 const material=new THREE.MeshBasicMaterial({map:texture,color:0xffffff,transparent:true,opacity:.70,
  depthTest:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>',
   '#include <common>\nattribute float aSmokeDensity;\nvarying float vSmokeDensity;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
   '#include <begin_vertex>\nvSmokeDensity=aSmokeDensity;');
  // Camera-facing projection happens on the GPU. Pausing the timeline and
  // orbiting the camera therefore cannot turn the smoke into flat edge-on cards.
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',[
   'vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);',
   'vec2 particleOffset=(instanceMatrix*vec4(transformed.xy,0.,0.)).xy;',
   'vec2 siteScale=vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));',
   'mvPosition.xy+=particleOffset*siteScale;',
   'gl_Position=projectionMatrix*mvPosition;'
  ].join('\n'));
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
   '#include <common>\nvarying float vSmokeDensity;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',
   '#include <alphamap_fragment>\ndiffuseColor.a*=vSmokeDensity;');
 };
 material.customProgramCacheKey=()=> 'energia-buran-billboards-v1';
 const smoke=new THREE.InstancedMesh(geometry,material,descriptors.length);
 smoke.name='Три газоотвода · мягкий пар и дым';smoke.frustumCulled=false;smoke.renderOrder=29;
 smoke.userData={pickable:false,softSmoke:true,museumComponent:'buran-launch-smoke'};
 smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);density.setUsage(THREE.DynamicDrawUsage);
 groundRoot.add(smoke);

 const centre=ducts.reduce((sum,channel)=>sum.add(channel.throat),V()).multiplyScalar(1/ducts.length);
 const surfaceY=ducts.reduce((sum,channel)=>sum+channel.outlet.y,0)/ducts.length;
 const position=V(),scale=V(),twist=new THREE.Quaternion(),matrix=new THREE.Matrix4(),Z=V(0,0,1);
 const color=new THREE.Color(),cold=new THREE.Color(0xdbe3e7),neutral=new THREE.Color(0xb9b9b5),warm=new THREE.Color(0xe4cbb0);
 let disposed=false,lastSample=sampleEnergiaBuranEffects(-90);

 function writeSmoke(sample){
  const t=sample.time,power=sample.ground;
  root.updateWorldMatrix(true,false);rocket.updateWorldMatrix(true,false);
  for(let slot=0;slot<descriptors.length;slot++){
   const {kind,index}=descriptors[slot],channel=ducts[index%ducts.length];
   const r1=seed(slot+1,1),r2=seed(slot+1,2),r3=seed(slot+1,3);
   const age=fract(t*(kind==='duct'?.23:kind==='water'?.18:kind==='plume'?.075:.045)+r1);
   let radius=1,alpha=0;
   if(kind==='steam'){
    const angle=r2*Math.PI*2,spread=5+age*(16+12*r3);
    position.set(centre.x+Math.cos(angle)*spread+Math.sin(t*.24+r1*12)*2,
     surfaceY+.7+age*(1.8+r3*4),centre.z+Math.sin(angle)*spread);
    radius=1.5+age*7;alpha=power.steam*.27*Math.sin(Math.PI*age);
    color.copy(cold);
   }else if(kind==='water'){
    position.copy(channel.throat).lerp(channel.outlet,age);
    position.addScaledVector(channel.side,(r2-.5)*channel.width*.35);
    position.y+=1.7+Math.sin(age*Math.PI)*(1.4+r3*2.5);
    radius=1.2+age*2.6;alpha=power.water*.44*Math.sin(Math.PI*age);
    color.copy(cold);
   }else if(kind==='duct'){
    position.copy(channel.throat).lerp(channel.outlet,age);
    position.addScaledVector(channel.side,Math.sin(t*1.6+r2*9)*channel.width*.10);
    position.y+=2.2+r3*1.6;
    radius=1.3+age*3.1;alpha=clamp(power.gas*.58+power.water*.18)*Math.sin(Math.PI*age);
    color.copy(cold).lerp(warm,power.gas*(1-age)*.60);
   }else if(kind==='outlet'){
    position.copy(channel.outlet).addScaledVector(channel.horizontal,age*(90+r1*55));
    position.addScaledVector(channel.side,(r2-.5)*(5+age*48));
    position.y+=2.5+age*(11+r3*16)+Math.sin(age*Math.PI)*4;
    radius=3+age*20.5;
    alpha=power.smoke*.46*(1-smooth(.42,1,age))*smooth(0,.06,age);
    color.copy(neutral).lerp(cold,r3*.40).lerp(warm,power.gas*(1-age)*.15);
   }else{
    position.set((r2-.5)*(3+age*19),-(18+age*280),(r3-.5)*(3+age*19));
    rocket.localToWorld(position);root.worldToLocal(position);
    radius=3.5+age*14;
    alpha=power.plume*.34*(1-smooth(.40,1,age))*smooth(surfaceY+1,surfaceY+45,position.y);
    color.copy(cold).lerp(neutral,age*.40);
   }
   density.setX(slot,clamp(alpha));
   radius=Math.max(.01,radius);
   scale.set(radius*2*(.82+r2*.38),radius*2*(.9+r3*.35),1);
   twist.setFromAxisAngle(Z,r2*Math.PI*2+age*.65);
   matrix.compose(position,twist,scale);smoke.setMatrixAt(slot,matrix);smoke.setColorAt(slot,color);
  }
  smoke.instanceMatrix.needsUpdate=true;smoke.instanceColor.needsUpdate=true;density.needsUpdate=true;
 }

 function stats(){
  groundRoot.updateWorldMatrix(true,true);
  const visible=!disposed&&groundRoot.parent===root&&treeVisible(groundRoot);
  const channelStats=ducts.map(channel=>{
   const emitters=channel.emitters.filter(jet=>jet.parent===groundRoot).map(jet=>({
    localPosition:jet.position.toArray(),worldPosition:jet.getWorldPosition(V()).toArray(),
    worldDirection:gasAxis.clone().transformDirection(jet.matrixWorld).toArray(),
    worldStart:jet.localToWorld(V(0,gasGeometry.parameters.height/2,0)).toArray(),
    worldEnd:jet.localToWorld(V(0,-gasGeometry.parameters.height/2,0)).toArray(),
    visible:visible&&jet.visible&&jet.material.uniforms.uPower.value>.003,
    power:jet.material.uniforms.uPower.value,depthTest:jet.material.depthTest
   }));
   return {id:channel.id,throat:channel.throat.toArray(),outlet:channel.outlet.toArray(),width:channel.width,
    worldThroat:root.localToWorld(channel.throat.clone()).toArray(),worldOutlet:root.localToWorld(channel.outlet.clone()).toArray(),
    worldDirection:channel.direction.clone().transformDirection(root.matrixWorld).toArray(),
    emitterCount:emitters.length,visibleEmitters:emitters.filter(jet=>jet.visible).length,emitters};
  });
  return {version:ENERGIA_BURAN_EFFECTS_VERSION,visible,disposed,sample:lastSample,
   engine:exhaust.stats(),channels:channelStats,
   smokeInstances:disposed?0:smoke.count,
   visibleSmokeInstances:visible?Array.from(density.array).filter(value=>value>.001).length:0,
   smokeDepthTest:material.depthTest,smokeDepthWrite:material.depthWrite,
   groundGasPower:gasMaterial.uniforms.uPower.value,
   lightIntensities:lights.map(light=>visible?light.intensity:0)};
 }
 function seek(sample){
  if(disposed)return stats();
  const input=sample||sampleEnergiaBuranEffects(-90);
  lastSample={time:finite(input.time,-90),altitudeMetres:Math.max(0,finite(input.altitudeMetres)),
   engine:{core:clamp(finite(input.engine?.core)),boosters:clamp(finite(input.engine?.boosters))},
   ground:Object.fromEntries(['steam','water','gas','smoke','light','plume'].map(key=>[key,clamp(finite(input.ground?.[key]))]))};
  groundRoot.visible=true;
  exhaust.seek({time:lastSample.time,...lastSample.engine});
  // This concrete pad needs less reflected light to retain the three ramp
  // edges and the transparent steam. The shared UKSS flame stays calibrated.
  rocketLight.intensity*=.10;
  gasMaterial.uniforms.uPower.value=lastSample.ground.gas*.88;
  gasMaterial.uniforms.uTime.value=lastSample.time;
  for(const [channelIndex,channel]of ducts.entries())for(const [index,jet]of channel.emitters.entries()){
   jet.visible=lastSample.ground.gas>.005;
   const pulse=1+.045*Math.sin(lastSample.time*7+index*1.8+channelIndex*2.1);
   jet.scale.set(pulse,channel.length/5/26*1.06,pulse);
  }
  lights.forEach((light,index)=>{light.intensity=5.5*lastSample.ground.light*(.94+.06*Math.sin(lastSample.time*7+index*1.7));});
  writeSmoke(lastSample);
  return stats();
 }
 function hide(){
  groundRoot.visible=false;gasMaterial.uniforms.uPower.value=0;
  lights.forEach(light=>{light.intensity=0;});exhaust.hide();
 }
 function dispose(){
  if(disposed)return;
  hide();exhaust.dispose();groundRoot.removeFromParent();groundRoot.clear();
  // InstancedMesh owns GPU instanceMatrix/instanceColor buffers separately
  // from its geometry. Three.js releases them on the mesh's dispose event.
  smoke.dispose();
  gasGeometry.dispose();gasMaterial.dispose();geometry.dispose();material.dispose();texture.dispose();disposed=true;
 }
 return {root:groundRoot,seek,hide,stats,dispose};
}
