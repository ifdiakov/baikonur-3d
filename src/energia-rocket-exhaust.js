import * as THREE from 'three';
import {nozzleFlameMaterial} from './energia-plasma-shader.js?v=20261103-plasma-v2';

export const ENERGIA_ROCKET_EXHAUST_VERSION='energia-rocket-exhaust-20261114-stable-light-v2';

// The eight visual exits retain the approved UKSS calibration. They represent
// four core engines and four booster engines, not individual RD-170 chambers.
// Coordinates are in the displayed rocket holder's local metre frame.
export const ENERGIA_NOZZLE_ANCHORS=Object.freeze([
 ...[[-1.85,-2.0],[1.85,-2.0],[-1.85,1.7],[1.85,1.7]].map(([x,z])=>
  Object.freeze({type:'core',position:Object.freeze([x,-.42,z])})),
 ...[[-6.5,-4.0],[6.5,-4.0],[-6.5,3.2],[6.5,3.2]].map(([x,z])=>
  Object.freeze({type:'booster',position:Object.freeze([x,-.42,z])}))
]);

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const powerValue=value=>Math.max(0,Math.min(1,Number(value)||0));

/** The original UKSS flame geometry, shader, colours and flicker, shared by
 * both Energia launches. Engine timing belongs to the calling scenario.
 * This factory owns only its effects, never the rocket GLB's resources. */
export function createEnergiaRocketExhaust({rocket,anchors=ENERGIA_NOZZLE_ANCHORS,
 stableLight=false,lightIntensity=1650,lightDistance=210,singlePass=false}){
 if(!rocket?.isObject3D)throw new TypeError('Energia exhaust requires a rocket holder');
 if(!Array.isArray(anchors)||!anchors.length||anchors.some(anchor=>
  !['core','booster'].includes(anchor.type)||!Array.isArray(anchor.position)||
  anchor.position.length!==3||anchor.position.some(value=>!Number.isFinite(value)))){
  throw new TypeError('Energia nozzle anchors require a type and finite local XYZ');
 }
 const flameRoot=new THREE.Group();flameRoot.name='Реактивные факелы';
 flameRoot.visible=false;flameRoot.userData.pickable=false;rocket.add(flameRoot);
 const glowCanvas=document.createElement('canvas');
 glowCanvas.width=glowCanvas.height=128;
 const ctx=glowCanvas.getContext('2d');
 const gradient=ctx.createRadialGradient(64,64,0,64,64,64);
 gradient.addColorStop(0,'rgba(255,255,255,.98)');
 gradient.addColorStop(.16,'rgba(255,255,255,.74)');
 gradient.addColorStop(.46,'rgba(255,255,255,.17)');
 gradient.addColorStop(.79,'rgba(255,255,255,.02)');
 gradient.addColorStop(1,'rgba(255,255,255,0)');
 ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
 const nozzleGlowTexture=new THREE.CanvasTexture(glowCanvas);
 nozzleGlowTexture.colorSpace=THREE.SRGBColorSpace;
 nozzleGlowTexture.minFilter=THREE.LinearMipmapLinearFilter;
 nozzleGlowTexture.magFilter=THREE.LinearFilter;
 nozzleGlowTexture.generateMipmaps=true;nozzleGlowTexture.needsUpdate=true;
 const haloMaterial=color=>new THREE.SpriteMaterial({map:nozzleGlowTexture,color,
  transparent:true,opacity:0,depthWrite:false,depthTest:true,
  blending:THREE.AdditiveBlending,toneMapped:false});
 const coreHaloMaterial=haloMaterial(0xbceaff),boosterHaloMaterial=haloMaterial(0xffb769);
 const rocketNozzleMaterials={
  core:nozzleFlameMaterial(0x8fdcff),coreGlow:nozzleFlameMaterial(0x36a7ff),coreWhite:nozzleFlameMaterial(0xffffff),
  booster:nozzleFlameMaterial(0xffcc72),boosterGlow:nozzleFlameMaterial(0xff6a12),boosterWhite:nozzleFlameMaterial(0xfffdf4)
 };
 // Additive colour is order-independent. Drawing both faces in one pass
 // preserves the approved flame while avoiding a second draw per shell.
 if(singlePass)for(const material of Object.values(rocketNozzleMaterials))material.forceSinglePass=true;
 const engineJets=[];
 const geometries=new Map();
 const buildEngineJet=(x,y,z,type,index)=>{
  const core=type==='core',length=core?112:166,radius=core?2.0:2.9;
  const entries=[
   [core?rocketNozzleMaterials.coreGlow:rocketNozzleMaterials.boosterGlow,radius*4.1,radius*.44,0,1.08],
   [core?rocketNozzleMaterials.core:rocketNozzleMaterials.booster,radius*2.35,radius*.20,1,.96],
   [core?rocketNozzleMaterials.coreWhite:rocketNozzleMaterials.boosterWhite,radius*1.05,radius*.08,2,.78],
   [core?rocketNozzleMaterials.coreWhite:rocketNozzleMaterials.boosterWhite,radius*.45,radius*.02,3,.54]
  ];
  const meshes=[];
  for(const [material,top,tip,layer,relativeLength]of entries){
   const layerLength=length*relativeLength;
   const topRadius=top*(layer===0?.59:.71);
   const bottomRadius=Math.max(tip,top*(layer===0?.36:.27));
   const geometryKey=[topRadius,bottomRadius,layerLength].join(':');
   if(!geometries.has(geometryKey))geometries.set(geometryKey,
    new THREE.CylinderGeometry(topRadius,bottomRadius,layerLength,36,18,true));
   const cone=new THREE.Mesh(geometries.get(geometryKey),material);
   cone.position.set(x,y-layerLength/2,z);
   cone.userData.nozzleFlameLength=layerLength;
   cone.userData.nozzleFlameAnchorY=y;
   cone.renderOrder=33+layer;cone.frustumCulled=false;cone.userData.pickable=false;
   cone.name=(core?'РД-0120':'РД-170')+' · рваный реактивный факел '+(index+1)+(layer?' · ядро':' · оболочка');
   flameRoot.add(cone);meshes.push(cone);
  }
  const halo=new THREE.Sprite(core?coreHaloMaterial:boosterHaloMaterial);
  halo.name=(core?'РД-0120':'РД-170')+' · локальное свечение под соплом '+(index+1);
  halo.position.set(x,y-4.98,z);
  halo.scale.set(radius*3.4,radius*3.4,1);
  halo.renderOrder=38;halo.frustumCulled=false;halo.userData.pickable=false;
  halo.visible=false;flameRoot.add(halo);
  engineJets.push({x,y,z,type,index,length,meshes,halo,haloSize:radius*3.4});
 };
 const typeIndex={core:0,booster:0};
 for(const {position,type}of anchors)buildEngineJet(...position,type,typeIndex[type]++);
 const movingFlameLight=new THREE.PointLight(0xffd6a0,0,170,1.5);
 movingFlameLight.position.set(0,-7,0);
 // Keep the optional UKSS light outside the hidden flame group. Changing
 // light counts at ignition otherwise recompiles every lit scene material.
 (stableLight?rocket:flameRoot).add(movingFlameLight);
 movingFlameLight.castShadow=false;
 let disposed=false;

 function stats({diagnostics=true}={}){
  const attached=!disposed&&flameRoot.parent===rocket;
  const visible=attached&&flameRoot.visible;
  let upperLimit=-Infinity,haloUpperLimit=-Infinity,visibleGlows=0;
  for(const jet of engineJets){
   for(const mesh of jet.meshes)upperLimit=Math.max(upperLimit,
    mesh.position.y+mesh.userData.nozzleFlameLength*mesh.scale.y/2);
   haloUpperLimit=Math.max(haloUpperLimit,jet.halo.position.y+jet.haloSize/2);
   if(jet.halo.visible)visibleGlows++;
  }
  const state={
   version:ENERGIA_ROCKET_EXHAUST_VERSION,visible,disposed,
   engineCorePower:rocketNozzleMaterials.core.uniforms.uPower.value,
   engineBoosterPower:rocketNozzleMaterials.booster.uniforms.uPower.value,
   engineJetCount:disposed?0:engineJets.length,
   engineMeshCount:disposed?0:engineJets.length*4,
   engineGeometryCount:disposed?0:geometries.size,
   engineSinglePass:singlePass,
   enginePlasmaRibbonCount:0,
   engineNozzleGlowCount:disposed?0:engineJets.length,
   engineNozzleGlowVisible:visible?visibleGlows:0,
   engineNozzleGlowOpacity:{core:coreHaloMaterial.opacity,boosters:boosterHaloMaterial.opacity},
   engineUpperFlameLimitY:upperLimit,
   engineHaloUpperLimitY:haloUpperLimit,
   engineFlameAttached:attached,
   engineFlameDepthCompatible:rocketNozzleMaterials.core.vertexShader.includes('logdepthbuf_vertex')
    &&rocketNozzleMaterials.core.fragmentShader.includes('logdepthbuf_fragment'),
   engineFlameDepthTest:rocketNozzleMaterials.core.depthTest,
   movingLightIntensity:visible?movingFlameLight.intensity:0,
   movingLightDistance:movingFlameLight.distance,
   stableLightLayout:stableLight,
   rocketExhaustOffset:rocket.position.toArray()
  };
  // World-space anchor diagnostics are for inspection, not the animation
  // hot path: localToWorld repeatedly walks the rocket and site's ancestors.
  if(!diagnostics)return state;
  flameRoot.updateWorldMatrix(true,true);
  state.rocketNozzleWorld=disposed?null:rocket.localToWorld(V()).toArray();
  state.nozzleAnchorsWorld=disposed?[]:engineJets.map(jet=>({type:jet.type,index:jet.index,
    localPosition:[jet.x,jet.y,jet.z],worldPosition:flameRoot.localToWorld(V(jet.x,jet.y,jet.z)).toArray(),
    worldDirection:V(0,-1,0).transformDirection(flameRoot.matrixWorld).toArray(),
    visible:visible&&jet.meshes.some(mesh=>mesh.visible)}));
  return state;
 }
 function seek({time,core=0,boosters=0,diagnostics=true}){
  if(disposed)return stats({diagnostics});
  const t=Number.isFinite(Number(time))?Number(time):0;
  const enginePower={core:powerValue(core),boosters:powerValue(boosters)};
  for(const kind of ['core','booster']){
   const power=enginePower[kind==='core'?'core':'boosters'];
   for(const suffix of [kind,kind+'Glow',kind+'White']){
    rocketNozzleMaterials[suffix].uniforms.uPower.value=power*(suffix.endsWith('Glow')?.72:1);
    rocketNozzleMaterials[suffix].uniforms.uTime.value=t;
   }
  }
  for(const jet of engineJets){
   const power=jet.type==='core'?enginePower.core:enginePower.boosters;
   const flicker=.96+.09*Math.sin(t*10.7+jet.index*1.7)+.055*Math.sin(t*21-jet.index*.7);
   jet.meshes.forEach((mesh,i)=>{
    const radialPulse=1+.08*Math.sin(t*7.5+jet.index*1.3+i*.8)+.04*Math.sin(t*15-jet.index*.7+i*1.6);
    const axialPulse=(.92+.42*power)*flicker*(1+.04*Math.sin(t*4+jet.index+i));
    mesh.scale.set(radialPulse,axialPulse,radialPulse*(.98+.05*Math.cos(t*11+jet.index+i)));
    mesh.position.y=mesh.userData.nozzleFlameAnchorY-mesh.userData.nozzleFlameLength*axialPulse/2;
    mesh.visible=power>.003;
   });
   jet.halo.visible=power>.003;
   const shimmer=.94+.06*Math.sin(t*9.7+jet.index*2.1);
   jet.halo.scale.set(jet.haloSize*shimmer,jet.haloSize*shimmer,1);
  }
  coreHaloMaterial.opacity=.52*enginePower.core*(.94+.06*Math.sin(t*9.3));
  boosterHaloMaterial.opacity=.58*enginePower.boosters*(.94+.06*Math.sin(t*8.1));
  movingFlameLight.intensity=lightIntensity*Math.max(enginePower.core*.92,enginePower.boosters);
  movingFlameLight.distance=lightDistance;
  if(stableLight){
   movingFlameLight.visible=true;
   if(movingFlameLight.parent!==rocket)rocket.add(movingFlameLight);
  }
  flameRoot.visible=enginePower.core>.003||enginePower.boosters>.003;
  // A GLB reload may clear the holder. Reattach without a second flame copy.
  if(flameRoot.parent!==rocket)rocket.add(flameRoot);
  flameRoot.position.set(0,0,0);flameRoot.quaternion.identity();flameRoot.scale.set(1,1,1);
  return stats({diagnostics});
 }
 function hide(){flameRoot.visible=false;movingFlameLight.intensity=0;if(stableLight)movingFlameLight.visible=false;}
 function dispose(){
  if(disposed)return;
  hide();flameRoot.removeFromParent();
  if(stableLight)movingFlameLight.removeFromParent();
  for(const geometry of geometries.values())geometry.dispose();
  geometries.clear();
  for(const material of Object.values(rocketNozzleMaterials))material.dispose();
  nozzleGlowTexture.dispose();coreHaloMaterial.dispose();boosterHaloMaterial.dispose();
  // Sprite geometry is shared by Three.js; it is not owned by this factory.
  flameRoot.clear();disposed=true;
 }
 return {root:flameRoot,seek,hide,stats,dispose};
}
