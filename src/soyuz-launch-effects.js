import * as THREE from 'three';
import {nozzleFlameMaterial} from './energia-plasma-shader.js?v=20261103-plasma-v2';

/** No SphereGeometry or IcosahedronGeometry clouds. Instanced, irregular,
 * multi-octave alpha sheets with independent low smoke and ground-hugging steam.
 */
export const SOYUZ_EXHAUST_VERSION='soyuz-plasma-fbm-ground-gas-v2';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,t)=>{const q=clamp((t-a)/(b-a));return q*q*(3-2*q);};
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function cloudMaterial(color,opacity){
 return new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0},uAlpha:{value:0},uTint:{value:new THREE.Color(color)},uOpacity:{value:opacity}},
  vertexShader:[
'#include <common>',
'#include <logdepthbuf_pars_vertex>',
'attribute float aSeed;',
'varying vec2 vUv;',
'varying float vSeed;',
'void main(){',
' vUv=uv;vSeed=aSeed;',
' vec4 p=vec4(position,1.0);',
' #ifdef USE_INSTANCING',
' p=instanceMatrix*p;',
' #endif',
' gl_Position=projectionMatrix*modelViewMatrix*p;',
' #include <logdepthbuf_vertex>',
'}'].join('\n'),
  fragmentShader:[
'#include <common>',
'#include <logdepthbuf_pars_fragment>',
'uniform float uTime,uAlpha,uOpacity;',
'uniform vec3 uTint;',
'varying vec2 vUv;',
'varying float vSeed;',
'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
' return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}',
'float fb(vec2 p){return .54*n(p)+.25*n(p*2.03)+.14*n(p*4.17)+.07*n(p*8.2);}',
'void main(){',
' #include <logdepthbuf_fragment>',
' vec2 p=vUv*2.-1.,flow=vec2(uTime*.032+vSeed*8.1,-uTime*.021+vSeed*14.5);',
' float large=fb(p*2.10+flow),fine=fb(p*5.40-flow*.74),thread=fb(p*11.7+flow*1.3);',
' vec2 warped=p+vec2(large-.5,fine-.5)*.72;',
' float radius=length(warped*vec2(.92,1.12));',
' float edge=1.-smoothstep(.41,.98,radius+(.5-fine)*.23);',
' float billows=smoothstep(.21,.73,large*.72+fine*.44+thread*.14);',
' float cavities=.58+.42*smoothstep(.28,.82,fb(p*3.9-flow*.62));',
' float alpha=uAlpha*uOpacity*edge*(.23+.77*billows)*cavities;',
' if(alpha<.012)discard;',
' gl_FragColor=vec4(uTint*(.8+.22*fine),alpha);',
'}'].join('\n'),
  side:THREE.DoubleSide,transparent:true,depthWrite:false,depthTest:true,
  blending:THREE.NormalBlending,toneMapped:false
 });
}
function makeCloud(group,count,color,opacity){
 const geo=new THREE.PlaneGeometry(2,2);
 const seeds=new Float32Array(count);
 for(let i=0;i<count;i++)seeds[i]=(i*.6180339887)%1;
 geo.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds,1));
 const mat=cloudMaterial(color,opacity);
 const mesh=new THREE.InstancedMesh(geo,mat,count);
 mesh.frustumCulled=false;mesh.userData.pickable=false;
 mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);
 return {mesh,mat,count};
}
export function createSoyuzExhaust({holder,siteRoot,camera}){
 // Exact rocket-relative attachment — the hot engine jet never stays behind.
 const flame=new THREE.Group();
 flame.name='Союз · плазма непосредственно под двигателями';
 holder.add(flame);flame.userData.pickable=false;
 const outer=nozzleFlameMaterial(0xff883c);
 const hot=nozzleFlameMaterial(0xffead7);
 const blue=nozzleFlameMaterial(0xb5d7ff);
 const geomOuter=new THREE.CylinderGeometry(.36,2.35,1,32,26,true);
 const geomInner=new THREE.CylinderGeometry(.29,1.24,1,28,22,true);
 const components=[];
 for(const [x,z,rad] of [[0,0,1.15],[-2.35,-2.35,.79],[2.35,-2.35,.79],[-2.35,2.35,.79],[2.35,2.35,.79]]){
  for(const [geometry,material,factor]of [[geomOuter,outer,1],[geomInner,hot,.67],[geomInner,blue,.48]]){
   const mesh=new THREE.Mesh(geometry,material);
   mesh.position.set(x,-.45,z);
   mesh.scale.set(rad,.01,rad);
   mesh.frustumCulled=false;mesh.userData.pickable=false;flame.add(mesh);
   components.push({mesh,x,z,factor,rad});
  }
 }
 const flash=new THREE.PointLight(0xfff1d1,0,160,2);flash.position.set(0,-4,0);flame.add(flash);
 const ductLight=new THREE.PointLight(0xffbe73,0,180,2);
 ductLight.position.set(0,-3,-8);siteRoot.add(ductLight);
 const duct=new THREE.Group();duct.name='Союз · факел в газоотводном лотке';
 siteRoot.add(duct);duct.userData.pickable=false;
 const jetMat=nozzleFlameMaterial(0xffab6d);
 const jetGeo=new THREE.CylinderGeometry(.5,2.6,1,32,20,true);
 const jets=[];
 for(const j of [-1,0,1]){
  const mesh=new THREE.Mesh(jetGeo,jetMat);
  mesh.position.set(j*1.8,-7,-20);
  mesh.rotation.x=Math.PI/2;
  mesh.frustumCulled=false;mesh.userData.pickable=false;duct.add(mesh);jets.push(mesh);
 }
 const clouds=new THREE.Group();clouds.name='Союз · неоднородный стелющийся газ';
 clouds.userData.pickable=false;siteRoot.add(clouds);
 const steam=makeCloud(clouds,116,0xd8e1de,.23);
 const dust=makeCloud(clouds,178,0xb9a995,.28);
 const soot=makeCloud(clouds,132,0x827f73,.25);
 const tmp=new THREE.Matrix4(),p=V(),scale=V(),quat=new THREE.Quaternion();
 const qWorld=new THREE.Quaternion(),qLocal=new THREE.Quaternion(),twist=new THREE.Quaternion();
 const axisZ=V(0,0,1);
 function updateCloud(item,sample,mode){
  const t=sample.time,itemPower=mode==='steam'?sample.venting:mode==='dust'?sample.smoke:smooth(0,15,t)*(1-smooth(56,86,t));
  item.mat.uniforms.uTime.value=t;
  item.mat.uniforms.uAlpha.value=itemPower;
  clouds.getWorldQuaternion(qWorld);
  qLocal.copy(qWorld).invert().multiply(camera.quaternion);
  for(let i=0;i<item.count;i++){
   const spacing=mode==='steam'?.44:mode==='dust'?.28:.43;
   const age=mode==='steam'?t+46-i*spacing:t-i*spacing;
   const duration=mode==='steam'?47:mode==='dust'?63:72;
   const live=age>=0&&age<duration;
   const power=itemPower*(live?1-smooth(duration*.77,duration,age):0);
   const spread=mode==='steam'?1+age*.33:2.3+age*(mode==='soot'?.64:.81);
   const lobe=1.2+.5*Math.sin(i*5.11);
   const radius=Math.max(0,power)*spread*lobe;
   const side=i%2?-1:1;
   const x=side*(mode==='steam'?2.5+age*.48:age*.72)
       +Math.sin(i*2.73+age*.095)*(mode==='steam'?3.2:6.5);
   const z=mode==='steam'?(i%5-2)*2.9-age*.34:-3.2-age*(mode==='dust'?1.72:1.95)+Math.cos(i*1.99+age*.04)*6.0;
   const y=mode==='steam'?.95+Math.min(3.3,Math.max(0,age)*.08)
            :.75+Math.min(11,Math.max(0,age)*.22)+Math.sin(i*2.2)*.65;
   p.set(x,y,z);
   scale.set(Math.max(.0001,radius*2.35),Math.max(.0001,radius*(mode==='steam'?.73:.92)),1);
   twist.setFromAxisAngle(axisZ,i*2.399963+age*.01);
   quat.copy(qLocal).multiply(twist);
   tmp.compose(p,quat,scale);
   item.mesh.setMatrixAt(i,tmp);
  }
  item.mesh.instanceMatrix.needsUpdate=true;
  item.mesh.visible=itemPower>.001;
 }
 function render(sample){
  const power=sample.enginePower;
  flame.visible=power>.003;
  const wave=1+.035*Math.sin(sample.time*17.4)+.028*Math.sin(sample.time*31.2);
  for(const {mesh,x,z,factor,rad}of components){
   const len=(7+20*power)*factor*wave;
   mesh.visible=power>.01;
   mesh.position.set(x,-.35-len/2,z);
   mesh.scale.set(rad,len,rad);
  }
  for(const m of [outer,hot,blue,jetMat]){m.uniforms.uPower.value=Math.min(1.35,power*1.12);m.uniforms.uTime.value=sample.time;}
  flash.intensity=power*15.5;
  ductLight.intensity=power*10.5*(1-smooth(12,46,sample.time));
  duct.visible=power>.025&&sample.altitudeMetres<400;
  jets.forEach((jet,i)=>{
   const size=(1.25+power*1.25)*(1-.1*Math.abs(i-1));
   jet.scale.set(size,Math.max(1,9+power*19),size);
   jet.position.z=-16-(9+power*19)/2;
  });
  updateCloud(steam,sample,'steam');
  updateCloud(dust,sample,'dust');
  updateCloud(soot,sample,'soot');
 }
 function stop(){
  for(const root of [flame,duct,clouds]){
   root.parent?.remove(root);
   root.traverse(o=>{if(o.geometry&&o.geometry!==geomOuter&&o.geometry!==geomInner&&o.geometry!==jetGeo)o.geometry.dispose();
      if(o.material&&o.material!==outer&&o.material!==hot&&o.material!==blue&&o.material!==jetMat)o.material.dispose();});
  }
  geomOuter.dispose();geomInner.dispose();jetGeo.dispose();
  outer.dispose();hot.dispose();blue.dispose();jetMat.dispose();
  ductLight.parent?.remove(ductLight);
 }
 return {flame,duct,clouds,render,stop,stats:()=>({mode:SOYUZ_EXHAUST_VERSION,cloudSprites:steam.count+dust.count+soot.count,engineJets:components.length,ductJets:jets.length,flameAttachedToRocket:flame.parent===holder})};
}
