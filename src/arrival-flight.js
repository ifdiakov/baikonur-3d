import * as THREE from 'three';
import {createLightField} from './light-field.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z),clamp=THREE.MathUtils.clamp;
const smooth=(a,b,t)=>{const u=clamp((t-a)/(b-a),0,1);return u*u*(3-2*u);};
export const FLIGHT_DURATION=120,TOUCHDOWN_TIME=108;

// Position and velocity share the same Hermite segments. The final segment
// runs exactly on the existing runway centreline and ends with zero velocity.
export function createArrivalPath(airfield){
 airfield.updateWorldMatrix(true,false);
 const runwayY=airfield.localToWorld(V(0,1.75,0)).y,clearance=1.76;
 const center=airfield.getWorldPosition(V(0,0,0)),axis=airfield.localToWorld(V(0,0,1)).sub(center).normalize();axis.y=0;axis.normalize();
 const threshold=airfield.localToWorld(V(0,1.75,535)),touchdown=airfield.localToWorld(V(0,1.75,330));touchdown.y=runwayY+clearance;
 const near=(distance,y)=>touchdown.clone().addScaledVector(axis,distance).setY(y);
 const along=(speed,vertical=0)=>axis.clone().multiplyScalar(-speed).setY(vertical);
 const nodes=[
  {t:0,p:V(-1590,510,-1300),v:V(32,-.6,12)},
  {t:38,p:V(-280,420,-520),v:V(34,-3,37)},
  {t:72,p:near(650,130),v:along(23,-4.4)},
  {t:96,p:near(160,29),v:along(16,-2.8)},
  {t:108,p:touchdown,v:along(10,0)},
  {t:120,p:near(-60,touchdown.y),v:V(0,0,0)}
 ];
 function sample(seconds){
  const t=clamp(seconds,0,FLIGHT_DURATION);let i=0;while(i<nodes.length-2&&t>nodes[i+1].t)i++;
  const a=nodes[i],b=nodes[i+1],span=b.t-a.t,u=(t-a.t)/span,u2=u*u,u3=u2*u;
  const p=a.p.clone().multiplyScalar(2*u3-3*u2+1).addScaledVector(a.v,(u3-2*u2+u)*span)
   .addScaledVector(b.p,-2*u3+3*u2).addScaledVector(b.v,(u3-u2)*span);
  const velocity=a.p.clone().multiplyScalar((6*u2-6*u)/span).addScaledVector(a.v,3*u2-4*u+1)
   .addScaledVector(b.p,(-6*u2+6*u)/span).addScaledVector(b.v,3*u2-2*u);
  if(t>=TOUCHDOWN_TIME)p.y=touchdown.y;
  const heading=velocity.lengthSq()>.001?velocity.clone().normalize():axis.clone().negate();
  return {position:p,velocity,heading,phase:t>=120?'parked':t>=108?'rollout':t>=96?'flare':t>=58?'approach':'overflight',
   gear:smooth(76,94,t),onGround:t>=108};
 }
 return {sample,axis,center,threshold,touchdown,runwayY,clearance,duration:FLIGHT_DURATION};
}

function buildAircraft(parent){
 const model=new THREE.Group();model.name='Самолёт · прибытие на Крайний';model.scale.setScalar(.55);parent.add(model);
 const bodyMat=new THREE.MeshStandardMaterial({color:0xe1e6e8,metalness:.35,roughness:.44});
 const blue=new THREE.MeshStandardMaterial({color:0x234766,metalness:.35,roughness:.48});
 const dark=new THREE.MeshStandardMaterial({color:0x172534,metalness:.1,roughness:.7});
 const glass=new THREE.MeshStandardMaterial({color:0x324f69,emissive:0x22374c,emissiveIntensity:.2,metalness:.65,roughness:.2});
 function mesh(geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);model.add(m);return m;}
 const profile=[[-20,.12],[-17,.7],[-11,1.65],[-3,2],[10,2],[15,1.7],[18.5,.9],[20,.03]].map(([z,r])=>new THREE.Vector2(r,z));
 const fuselage=mesh(new THREE.LatheGeometry(profile,24),bodyMat);fuselage.rotation.x=Math.PI/2;
 const stripe=mesh(new THREE.CylinderGeometry(2.01,2.01,24,24,1,true),blue,0,-.1,0);stripe.rotation.x=Math.PI/2;stripe.scale.x=.97;stripe.scale.z=.35;
 function wing(points,y,mat){const s=new THREE.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,z):s.moveTo(x,z));s.closePath();
  const m=mesh(new THREE.ExtrudeGeometry(s,{depth:.25,bevelEnabled:false}),mat,0,y,0);m.rotation.x=Math.PI/2;return m;}
 wing([[0,5],[17.5,-4],[17.5,-7],[3,-3],[-3,-3],[-17.5,-7],[-17.5,-4]],-.35,bodyMat);
 wing([[0,-11],[7,-17],[7,-18.7],[0,-16.5],[-7,-18.7],[-7,-17]],.8,bodyMat);
 const fin=wing([[0,-10.8],[7.4,-18],[7.4,-20],[0,-17.3]],0,blue);fin.rotation.set(0,Math.PI/2,Math.PI/2);
 const cockpit=mesh(new THREE.SphereGeometry(1,16,10),glass,0,.85,16.1);cockpit.scale.set(1.48,.74,1.6);
 const windows=new THREE.InstancedMesh(new THREE.SphereGeometry(.24,8,6),glass,32),dummy=new THREE.Object3D();
 for(let i=0;i<32;i++){dummy.position.set(i%2?1.97:-1.97,.6,-10+Math.floor(i/2)*1.5);dummy.scale.set(.12,1,1.3);dummy.updateMatrix();windows.setMatrixAt(i,dummy.matrix);}model.add(windows);
 for(const side of [-1,1]){
  const engine=mesh(new THREE.CylinderGeometry(.9,1.05,5.5,16),bodyMat,side*6,-1.65,-.5);engine.rotation.x=Math.PI/2;
  const intake=mesh(new THREE.CircleGeometry(.76,18),dark,side*6,-1.65,2.27);intake.rotation.y=0;
 }
 const gear=new THREE.Group();gear.name='Выпускаемое шасси';model.add(gear);
 for(const [x,z] of [[0,12],[-3,-3],[3,-3]]){
  const strut=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,1.8,6),bodyMat);strut.position.set(x,-2.2,z);gear.add(strut);
  for(const side of [-1,1]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.27,10),dark);wheel.rotation.z=Math.PI/2;wheel.position.set(x+side*.26,-2.72,z);gear.add(wheel);}
 }
 const nav=createLightField(model,[{x:-17.5,y:0,z:-5.4,height:0,color:0xff3548,size:6},{x:17.5,y:0,z:-5.4,height:0,color:0x58ffb1,size:6},{x:0,y:1,z:-20,height:0,color:0xfff6e4,size:5}],{name:'Самолёт · БАНО',minPixels:4});
 const strobes=createLightField(model,[{x:-17.6,y:.2,z:-5.3,height:0,color:0xffffff,size:13},{x:17.6,y:.2,z:-5.3,height:0,color:0xffffff,size:13}],{name:'Самолёт · стробоскопы',minPixels:8});
 const beacon=createLightField(model,[{x:0,y:2.2,z:-2,height:0,color:0xff3f31,size:10},{x:0,y:-2.2,z:1,height:0,color:0xff4d38,size:8}],{name:'Самолёт · проблесковый маяк',minPixels:6});
 const landing=createLightField(model,[{x:-2.8,y:-.6,z:3,height:0,color:0xffedc9,size:12},{x:2.8,y:-.6,z:3,height:0,color:0xffedc9,size:12}],{name:'Самолёт · посадочные фары',minPixels:6});
 return {model,gear,nav,strobes,beacon,landing};
}

function buildContrails(parent,path){
 const count=144,geometry=new THREE.BufferGeometry(),positions=new Float32Array(count*4*3),alphas=new Float32Array(count*4),uvs=new Float32Array(count*4*2),indices=[];
 for(let lane=0;lane<2;lane++)for(let i=0;i<count;i++){
  const k=(lane*count+i)*2;uvs.set([0,i/(count-1),1,i/(count-1)],k*2);
  if(i<count-1)indices.push(k,k+1,k+2,k+1,k+3,k+2);
 }
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('opacity',new THREE.BufferAttribute(alphas,1));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setIndex(indices);
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
  vertexShader:`attribute float opacity;varying float alpha;varying vec2 vUv;
   #include <common>
   #include <logdepthbuf_pars_vertex>
   void main(){alpha=opacity;vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
    #include <logdepthbuf_vertex>
   }`,
  fragmentShader:`varying float alpha;varying vec2 vUv;
   #include <common>
   #include <logdepthbuf_pars_fragment>
   void main(){
    #include <logdepthbuf_fragment>
    float soft=pow(max(0.,sin(vUv.x*3.14159)),1.8);gl_FragColor=vec4(.67,.71,.79,soft*alpha);
    #include <colorspace_fragment>
   }`});
 // The terrain overlays render at order 2 without writing depth. Airborne
 // translucent effects must follow those overlays, while still depth testing
 // against opaque buildings and the aircraft itself.
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Два рассеивающихся инверсионных следа';mesh.renderOrder=7;mesh.frustumCulled=false;mesh.userData.pickable=false;parent.add(mesh);
 let visibleSamples=0;
 function update(time,camera){visibleSamples=0;
  for(let lane=0;lane<2;lane++)for(let i=0;i<count;i++){
   const age=i/(count-1)*38,emitted=time-age,state=path.sample(Math.max(0,emitted)),p=state.position.clone();
   const enabled=emitted>=0&&emitted<78&&state.position.y>90;
   const right=new THREE.Vector3().crossVectors(state.heading,V(0,1,0)).normalize();
   p.addScaledVector(right,lane?3.3:-3.3).addScaledVector(state.heading,-3.5);
   p.x+=Math.sin(emitted*.4+lane)*age*.055;p.y+=age*.07;
   const across=new THREE.Vector3().crossVectors(state.heading,camera.position.clone().sub(p).normalize()).normalize();
   const width=.42+age*.14,opacity=enabled?.82*(1-age/38)*smooth(0,.3,age):0;
   if(opacity>.001)visibleSamples++;
   for(let side=0;side<2;side++){const n=(lane*count+i)*2+side,q=p.clone().addScaledVector(across,(side?1:-1)*width);positions.set(q.toArray(),n*3);alphas[n]=opacity;}
  }
  geometry.attributes.position.needsUpdate=true;geometry.attributes.opacity.needsUpdate=true;mesh.visible=visibleSamples>0;
 }
 return {mesh,update,stats:()=>({visibleSamples,maxAge:38,emissionEnds:78})};
}

export function createArrivalFlight({scene,camera,controls,canvas,airfield,container,onFollow}){
 const path=createArrivalPath(airfield),root=new THREE.Group();root.name='Прибытие · Крайний';root.userData.pickable=false;scene.add(root);
 const craft=buildAircraft(root),trail=buildContrails(scene,path);
 let elapsed=0,following=false,paused=false,lastNow=null,uiSecond=-1,lastTrail=-1,state=path.sample(0),forced=null;
 container.innerHTML='<div class="arrival-title"><span class="arrival-dot"></span><span>КРАЙНИЙ · ПРИБЫТИЕ</span><time id="arrivalClock">02:00</time></div><div class="arrival-bottom"><span id="arrivalPhase">Над космодромом</span><button id="arrivalFollow" type="button" aria-pressed="false">Следить</button><button id="arrivalReplay" type="button" aria-label="Повторить двухминутный заход самолёта" title="Повторить заход">↺</button></div>';
 const follow=container.querySelector('#arrivalFollow'),replay=container.querySelector('#arrivalReplay'),clock=container.querySelector('#arrivalClock'),label=container.querySelector('#arrivalPhase');
 const labels={overflight:'Над космодромом',approach:'Заход на посадку',flare:'Над полосой',rollout:'Пробег по ВПП',parked:'Посадка завершена'};
 function stopFollowing(){following=false;document.body.classList.remove('following-arrival');follow.textContent='Следить';follow.setAttribute('aria-pressed','false');}
 follow.onclick=()=>{if(following){stopFollowing();return;}following=true;document.body.classList.add('following-arrival');follow.textContent='Свободно';follow.setAttribute('aria-pressed','true');onFollow?.();};
 function restart(){elapsed=0;forced=null;lastNow=null;lastTrail=-1;uiSecond=-1;render(0);}
 replay.onclick=restart;
 canvas.addEventListener('pointerdown',stopFollowing,{passive:true});canvas.addEventListener('wheel',stopFollowing,{passive:true});
 document.addEventListener('keydown',e=>{if(!e.target.matches('input,textarea,select')&&['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))stopFollowing();});
 document.addEventListener('visibilitychange',()=>{paused=document.hidden;lastNow=null;});
 const direction=V(0,0,1),rot=new THREE.Quaternion(),bankQ=new THREE.Quaternion();
 function render(t){state=path.sample(t);craft.model.position.copy(state.position);
  const ahead=path.sample(Math.min(120,t+.2)).heading,turn=new THREE.Vector3().crossVectors(state.heading,ahead).y;
  const bank=t<96?clamp(-turn*12,-.32,.32):0;
  rot.setFromUnitVectors(direction,state.heading);bankQ.setFromAxisAngle(direction,bank);craft.model.quaternion.copy(rot).multiply(bankQ);
  craft.gear.visible=state.gear>.01;craft.gear.rotation.x=(1-state.gear)*Math.PI*.48;
  craft.strobes.root.visible=t<120&&(t%1.2<.075||(t%1.2>.17&&t%1.2<.245));
  craft.beacon.root.visible=Math.sin(t*2*Math.PI/1.4)>.65;
  craft.landing.root.visible=t>=72&&t<119;
  if(Math.abs(t-lastTrail)>.1||lastTrail<0){trail.update(t,camera);lastTrail=t;}
  if(following){const target=state.position.clone();controls.target.copy(target);camera.position.copy(target).add(V(52,47,65));controls.update();}
  const sec=Math.ceil(120-t);if(sec!==uiSecond){uiSecond=sec;clock.textContent=t>=120?'✓':String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');label.textContent=labels[state.phase];}
 }
 render(0);
 return {path,stopFollowing,restart,seek(seconds){elapsed=clamp(seconds,0,120);forced=elapsed;render(elapsed);},resume(){forced=null;lastNow=null;},
  update(now){if(lastNow===null)lastNow=now;if(!paused&&forced===null)elapsed=Math.min(120,elapsed+(now-lastNow)/1000);lastNow=now;render(elapsed);},
  stats:()=>({version:'krayniy-arrival-v1',duration:120,elapsed,phase:state.phase,following,position:state.position.toArray(),velocity:state.velocity.toArray(),
   gear:state.gear,onGround:state.onGround,runwayY:path.runwayY,touchdown:path.touchdown.toArray(),axis:path.axis.toArray(),
   strobeVisible:craft.strobes.root.visible,beaconVisible:craft.beacon.root.visible,trail:trail.stats()})};
}
