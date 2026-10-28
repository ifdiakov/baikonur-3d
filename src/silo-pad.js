import * as THREE from 'three';
import {archiveKit} from './archive-kit.js';

// Exterior museum interpretation of the owner's R-36M references, not a surveyed
// reconstruction or a working launch mechanism. Only the visible upper cavity is modelled.
export const SILO_VERSION='r36m-museum-silo-v1';
export const SILO_REFERENCE=Object.freeze({
 sources:['https://rvsn.ruzhany.info/kbu_002_03_2.html','https://habr.com/ru/articles/87341/'],
 interpretation:'Photo-guided exterior; layout, lid animation and white vapour are museum effects.',
 siteId:'pad-109',openingRadius:3.2,openDistance:32,closeDistance:43,openSeconds:3.2
});
const controllers=new WeakMap(),V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
function visible(root){for(let o=root;o;o=o.parent)if(!o.visible)return false;return true;}
function ringShape(outer,inner){const s=new THREE.Shape();s.absarc(0,0,outer,0,Math.PI*2,false);const h=new THREE.Path();h.absarc(0,0,inner,0,Math.PI*2,true);s.holes.push(h);return s;}
function clippedShape(w,d,c){const s=new THREE.Shape(),pts=[[-w/2+c,-d/2],[w/2-c,-d/2],[w/2,-d/2+c],[w/2,d/2-c],[w/2-c,d/2],[-w/2+c,d/2],[-w/2,d/2-c],[-w/2,-d/2+c]];pts.forEach(([x,z],i)=>i?s.lineTo(x,z):s.moveTo(x,z));s.closePath();return s;}
function slab(kit,shape,depth,y,material,name){const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:64});g.rotateX(-Math.PI/2);g.translate(0,y,0);return kit.direct(g,material,name);}
function collar(kit,r,y,material='steel',tube=.08,name='shaft-ring'){const m=kit.direct(new THREE.TorusGeometry(r,tube,8,96),material,name);m.rotation.x=Math.PI/2;m.position.y=y;return m;}

function createVapour(root){
 const count=36,positions=new Float32Array(count*3),sizes=new Float32Array(count),opacities=new Float32Array(count);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('particleSize',new THREE.BufferAttribute(sizes,1).setUsage(THREE.DynamicDrawUsage));g.setAttribute('particleOpacity',new THREE.BufferAttribute(opacities,1).setUsage(THREE.DynamicDrawUsage));
 const size=64,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=u*u+v*v;
  const feather=Math.pow(Math.max(0,1-r),2.7),grain=.96+.04*Math.sin(x*.31+y*.17)*Math.sin(y*.23-x*.11);
  const n=(y*size+x)*4;data.set([246,249,252,Math.round(feather*grain*255)],n);
 }
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
  uniforms:{cloud:{value:texture},viewportHeight:{value:1000},pixelRatio:{value:1},fovScale:{value:1}},
  vertexShader:`attribute float particleSize;attribute float particleOpacity;varying float cloudOpacity;
  uniform float viewportHeight;uniform float pixelRatio;uniform float fovScale;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main(){cloudOpacity=particleOpacity;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
  float scale=length(modelMatrix[0].xyz);gl_PointSize=clamp(particleSize*scale*viewportHeight*pixelRatio*fovScale/max(.1,-mvPosition.z),1.,210.);
  #include <logdepthbuf_vertex>
  }`,
  fragmentShader:`uniform sampler2D cloud;varying float cloudOpacity;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main(){
  #include <logdepthbuf_fragment>
  vec4 puff=texture2D(cloud,gl_PointCoord);float a=puff.a*cloudOpacity;if(a<.003)discard;gl_FragColor=vec4(puff.rgb,a);
  }`
 });
 const points=new THREE.Points(g,material);points.name='ШПУ · белый пар';points.userData.pickable=false;points.frustumCulled=false;points.visible=false;points.renderOrder=4;root.add(points);
 points.onBeforeRender=(renderer,scene,camera)=>{material.uniforms.viewportHeight.value=renderer.getSize(new THREE.Vector2()).y;material.uniforms.pixelRatio.value=renderer.getPixelRatio();material.uniforms.fovScale.value=.5/Math.tan(THREE.MathUtils.degToRad(camera.fov/2));};
 function update(time,amount){
  points.visible=amount>.005;if(!points.visible)return;
  for(let i=0;i<count;i++){
   const t=(time*.155+i/count)%1,a=i*2.39996,r=2.16+.35*Math.sin(i*8.3),rise=6.2*t;
   positions[i*3]=Math.cos(a)*r+1.7*t+.35*Math.sin(t*5+i);
   positions[i*3+1]=.3+rise;positions[i*3+2]=Math.sin(a)*r+.65*t+.3*Math.cos(t*7+i);
   sizes[i]=1.0+2.2*t;opacities[i]=Math.sin(t*Math.PI)*.32*amount;
  }
  g.attributes.position.needsUpdate=true;g.attributes.particleSize.needsUpdate=true;g.attributes.particleOpacity.needsUpdate=true;
 }
 return {points,update,count};
}

export function buildSiloPad(root){
 const k=archiveKit(root);root.name='Площадка 109 · шахтная пусковая установка';
 k.mat.green.color.setHex(0x50664a);k.mat.concrete.color.setHex(0xaaa89a);k.mat.dark.color.setHex(0x242b28);
 // Concrete apron has a real central opening; the map terrain uses the same void.
 const apron=clippedShape(24,25,2);const hole=new THREE.Path();hole.absarc(0,0,3.2,0,Math.PI*2,true);apron.holes.push(hole);
 slab(k,apron,.28,0,'concrete','perforated-apron');
 slab(k,ringShape(4.7,3.2),.43,.28,'concrete','raised-concrete-collar');
 slab(k,ringShape(3.65,3.2),.16,.71,'steel','shaft-lip');
 const wall=k.direct(new THREE.CylinderGeometry(3.2,3.2,7.2,96,1,true),'dark','visible-shaft-wall');wall.position.y=-3.6;
 k.cyl(3.18,.10,0,-7.2,0,'dark','cavity-bottom');
 for(const y of [-.7,-2.6,-5.1])collar(k,3.16,y,'steel',.055,'inner-lining-joint');
 collar(k,3.46,.89,'dark',.055,'lid-seal');
 for(let i=0;i<28;i++){const a=i*Math.PI*2/28;k.cyl(.07,.06,3.47*Math.cos(a),.92,3.47*Math.sin(a),'steel','rim-fastener');}
 // Visible nose only, held below the rim; opening the lid does not raise the missile.
 const rocket=new THREE.Group();rocket.name='ШПУ · видимая носовая часть ракеты';root.add(rocket);
 const olive=new THREE.MeshStandardMaterial({color:0x475b3a,roughness:.52,metalness:.24}),silver=new THREE.MeshStandardMaterial({color:0xadae9e,roughness:.43,metalness:.52});
 const points=[new THREE.Vector2(1.42,-3.4),new THREE.Vector2(1.42,-2.9),new THREE.Vector2(1.27,-2.1),new THREE.Vector2(.98,-1.15),new THREE.Vector2(.60,-.25),new THREE.Vector2(.21,.47),new THREE.Vector2(0,.70)];
 const nose=new THREE.Mesh(new THREE.LatheGeometry(points,72),olive);nose.name='Ракета · обтекатель';nose.userData.museumComponent='silo-rocket-nose';rocket.add(nose);
 const body=new THREE.Mesh(new THREE.CylinderGeometry(1.42,1.42,2.4,72),silver);body.position.y=-4.6;body.name='Ракета · видимый пояс';rocket.add(body);
 for(const y of [-3.4,-3.65]){const b=new THREE.Mesh(new THREE.TorusGeometry(1.425,.028,6,72),silver);b.rotation.x=Math.PI/2;b.position.y=y;rocket.add(b);}
 // Thick clipped-corner lid, with round underside seal and external surface ribs.
 const hinge=new THREE.Group();hinge.position.set(0,.98,-5.5);hinge.name='ШПУ · шарнир крышки';root.add(hinge);
 const lid=new THREE.Group();lid.position.z=5.5;hinge.add(lid);const lk=archiveKit(lid);lk.mat.green.color.setHex(0x526749);
 slab(lk,clippedShape(8.9,9.8,1.7),1.12,0,'green','armoured-lid');
 const underside=lk.direct(new THREE.CylinderGeometry(3.55,3.55,.15,80),'green','lid-underside-panel');underside.position.y=-.025;
 collar(lk,3.48,-.12,'dark',.075,'lid-gasket');
 for(const z of [-1.55,1.55])lk.box(5.4,.11,.15,0,-.14,z,'steel','lid-underside-rib');
 for(const x of [-1.55,1.55])lk.box(.15,.11,5.4,x,-.14,0,'steel','lid-underside-rib');
 slab(lk,clippedShape(7.8,8.7,1.35),.10,1.12,'green','lid-top-panel');
 for(const x of [-2.7,0,2.7])lk.box(.12,.14,6.7,x,1.29,0,'steel','lid-longitudinal-rib');
 for(const z of [-3.3,0,3.3])lk.box(6.1,.14,.12,0,1.29,z,'steel','lid-cross-rib');
 for(const x of [-3.95,3.95])for(const z of [-2.5,0,2.5]){lk.box(.42,.22,.55,x,.5,z,'green','lid-lug');lk.cyl(.085,.1,x,1.23,z,'steel','lid-fastener');}
 for(const x of [-2.5,2.5]){lk.rod([x,1.25,-3.35],[x,1.55,-3.35],.10,'steel','lifting-eye');lk.rod([x,1.55,-3.35],[x,1.55,-2.8],.10,'steel','lifting-eye');lk.rod([x,1.55,-2.8],[x,1.25,-2.8],.10,'steel','lifting-eye');}
 const lidFeatures=lk.finish();
 for(const x of [-3.8,3.8]){k.box(1.7,1.0,2.3,x,.5,-5.5,'concrete','hinge-pedestal');k.rod([x-.7,.98,-5.5],[x+.7,.98,-5.5],.34,'steel','hinge-bearing');}
 // External actuator props follow the lid; the motion is illustrative.
 const struts=[];for(const x of [-4.0,4.0]){
  const shell=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,1,12),k.mat.green),piston=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,1,12),k.mat.steel);
  shell.name='Крышка · привод';piston.name='Крышка · шток';root.add(shell,piston);struts.push({base:V(x,.4,-7.7),anchor:V(x,0,2.3),shell,piston});
 }
 // Slab seams are kept outside the opening and avoid coplanar flicker.
 for(const x of [-8,-4,4,8])k.box(.025,.012,23,x,.291,0,'dark','apron-joint');
 for(const z of [-8,-4,4,8])for(const side of [-1,1])k.box(7.0,.012,.025,side*7.75,.292,z,'dark','apron-joint');
 k.path([[0,12],[0,25]],6.5,.08,'asphalt','service-entry');
 for(const side of [-1,1])k.path([[side*3.45,13],[side*3.45,24]],.45,.1,'concrete','entry-curb');
 k.hall({x:18,z:13,w:7,d:8,h:3.1,gates:1,windows:false,roof:'roof',tag:'service-building'});
 for(const z of [11,14])k.box(.08,1.1,1.5,14.45,1.8,z,'glass','service-window');
 for(const x of [14.4,21.6])k.box(.12,.18,8.5,x,3.5,13,'steel','roof-edge');
 for(const z of [-6,-2]){k.cyl(.5,2.0,12,1.0,z,'steel','vent-stack');k.cyl(.7,.20,12,2.1,z,'roof','vent-cap');}
 k.box(4.0,.3,3.3,-12,.15,-10,'concrete','service-hatch-pad');k.box(2.2,.18,1.8,-12,.39,-10,'green','service-hatch');
 // A modest perimeter and entrance keep the site legible at the common museum scale.
 const fence=[];for(const x of [-26,26])fence.push([[x,-22],[x,25]]);fence.push([[-26,-22],[26,-22]],[[-26,25],[-4,25]],[[4,25],[26,25]]);
 for(const [a,b]of fence){const d=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(d/4);for(let i=0;i<=n;i++){const t=i/n,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;k.rod([x,0,z],[x,2.4,z],.065,'steel','fence-post');}
  for(const y of [.35,1.25,2.20])k.rod([a[0],y,a[1]],[b[0],y,b[1]],.025,'steel','fence-wire');
  for(let t=1;t<d;t+=1){const x=a[0]+(b[0]-a[0])*t/d,z=a[1]+(b[1]-a[1])*t/d;k.rod([x,.35,z],[x,2.2,z],.012,'steel','fence-mesh');}
 }
 for(const x of [-4,4])k.box(.28,2.8,.28,x,1.4,25,'concrete','gate-post');
 for(const side of [-1,1]){k.box(3.8,1.3,.09,side*5.8,1.0,25,'green','folded-gate');k.box(.24,3.2,.24,side*8,1.6,21,'steel','site-light-pole');k.box(.8,.17,.45,side*8,3.2,21,'white','site-lamp');}
 k.cutouts.push({x:0,z:0,rx:3.24,rz:3.24,shape:'ellipse'});
 const features=k.finish(),vapour=createVapour(root),localCamera=V(),localTarget=V(),a=V(),b=V(),direction=V(),up=V(0,1,0);
 let progress=0,wanted=false,lastTime=null,distance=Infinity,aimDistance=Infinity,vapourAmount=0;
 function pose(){
  const eased=smooth(progress);hinge.rotation.x=-THREE.MathUtils.degToRad(108)*eased;
  hinge.updateMatrix();
  for(const s of struts){a.copy(s.base);b.copy(s.anchor).applyMatrix4(hinge.matrix);direction.copy(b).sub(a);const length=direction.length(),q=new THREE.Quaternion().setFromUnitVectors(up,direction.clone().normalize());
   s.shell.position.copy(a).lerp(b,.28);s.shell.quaternion.copy(q);s.shell.scale.y=length*.56;
   s.piston.position.copy(a).lerp(b,.76);s.piston.quaternion.copy(q);s.piston.scale.y=length*.48;
  }
 }
 const api={
  update(now,camera,target){
   root.updateWorldMatrix(true,false);localCamera.copy(camera.position);root.worldToLocal(localCamera);localTarget.copy(target);root.worldToLocal(localTarget);
   distance=localCamera.distanceTo(V(0,.8,0));aimDistance=Math.hypot(localTarget.x,localTarget.z);
   const shown=visible(root),dt=lastTime===null?0:THREE.MathUtils.clamp((now-lastTime)/1000,0,.12);lastTime=now;
   if(!shown){wanted=false;progress=0;}else if(!wanted&&distance<SILO_REFERENCE.openDistance&&aimDistance<12)wanted=true;else if(wanted&&(distance>SILO_REFERENCE.closeDistance||aimDistance>18))wanted=false;
   const step=dt/SILO_REFERENCE.openSeconds;progress=THREE.MathUtils.clamp(progress+(wanted?step:-step),0,1);pose();
   vapourAmount=shown?smooth((progress-.12)/.60):0;vapour.update(now/1000,vapourAmount);
  },
  inspect(view,camera,controls){root.updateWorldMatrix(true,false);const near=view==='close';controls.target.copy(root.localToWorld(V(0,near?.8:1,0)));camera.position.copy(root.localToWorld(near?V(9,19,18):V(66,74,82)));controls.update();},
  stats(){return {version:SILO_VERSION,siteId:SILO_REFERENCE.siteId,progress,open:wanted,state:progress===0?'closed':progress===1?'open':wanted?'opening':'closing',lidAngleDeg:108*smooth(progress),cameraDistance:distance,aimDistance,steamVisible:vapour.points.visible,steamParticles:vapour.points.visible?vapour.count:0,noseTipY:.70,rimY:.87,openingRadius:3.2,visible:visible(root),features:{...features.features,...lidFeatures.features}};}
 };
 pose();controllers.set(root,api);root.userData.siloExhibit={version:SILO_VERSION,reference:SILO_REFERENCE};
 return {...features,meshCount:features.meshCount+lidFeatures.meshCount+9,primitiveCount:features.primitiveCount+lidFeatures.primitiveCount,features:{...features.features,...lidFeatures.features},version:SILO_VERSION};
}
export function siloController(root){return controllers.get(root);}
