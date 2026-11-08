import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';
import {MUSEUM_MAP_SCALE} from './museum-scale.js?v=20261102-silo-height-v1';

// Exterior museum interpretation of the owner's R-36M references, not a surveyed
// reconstruction or a working launch mechanism. Only the visible upper cavity is modelled.
export const SILO_VERSION='museum-silos-v3-round-preview';
export const SILO_REFERENCE=Object.freeze({
 sources:['https://drive.google.com/drive/folders/1X33Y7KDFvnPKl01FUkUUyRePqCYnhI7P','https://rvsn.ruzhany.info/kbu_002_03_2.html','https://habr.com/ru/articles/87341/'],
 interpretation:'Exterior study from owner-supplied November 3 renders; dimensions and lid motion are illustrative museum effects.',
 siteId:'pad-109',openingRadius:3.2,openSeconds:3.2,
 // H and horizontal proximity use map units, independent of exhibit scale.
 openHeight:8,closeHeight:9,openPlanDistance:32,closePlanDistance:43,overviewHeight:10,
 // The standalone model viewer has no map-height gauge and keeps local zoom.
 openDistance:32,closeDistance:43,
 physical:{units:'metres',localScale:1,apronMetres:[24,25],openingDiameterMetres:6.4,
  visibleNoseDiameterMetres:2.84,lidMetres:[11.2,11.2,.65],dimensionsSurveyed:false,
  interpretation:'Dimensions of the shared museum exterior, not measured dimensions of each catalogued silo or a complete underground launcher.'}
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

export function buildSiloPad(root,{siteId='pad-109',title='Шахтная пусковая установка · пл.'+siteId.slice(4),activation='distance'}={}){
 const k=archiveKit(root);root.name=title;
 k.mat.green.color.setHex(0x50664a);k.mat.concrete.color.setHex(0xaaa89a);k.mat.dark.color.setHex(0x242b28);
 // Concrete apron has a real central opening; the map terrain uses the same void.
 const apron=clippedShape(24,25,2);const hole=new THREE.Path();hole.absarc(0,0,3.2,0,Math.PI*2,true);apron.holes.push(hole);
 slab(k,apron,.28,0,'concrete','perforated-apron');
 // Recessed olive annulus, layered rim and silver radial grating from the new renders.
 slab(k,ringShape(5.65,3.2),.32,.28,'concrete','raised-concrete-collar');
 slab(k,ringShape(5.5,3.2),.16,.60,'green','recessed-annular-deck');
 slab(k,ringShape(5.55,5.15),.48,.76,'green','outer-drum');
 slab(k,ringShape(5.68,5.12),.12,1.24,'green','shaft-lip');
 collar(k,5.48,1.39,'steel',.045,'rim-edge');
 collar(k,5.27,1.37,'dark',.055,'lid-seal');
 const wall=k.direct(new THREE.CylinderGeometry(3.2,3.2,7.2,64,1,true),'dark','visible-shaft-wall');wall.position.y=-3.6;
 k.cyl(3.18,.10,0,-7.2,0,'dark','cavity-bottom');
 for(const y of [-.35,-.9,-1.6,-2.6,-5.1])collar(k,3.16,y,'steel',.045,'inner-lining-joint');
 for(let i=0;i<32;i++){
  const a=i*Math.PI*2/32,c=Math.cos(a),z=Math.sin(a);
  k.rod([3.22*c,.80,3.22*z],[4.35*c,.80,4.35*z],.035,'steel','grating-radial-frame');
  k.rod([3.15*c,-2.6,3.15*z],[3.15*c,.78,3.15*z],.035,'steel','shaft-lining-rib');
  k.rod([5.13*c,.78,5.13*z],[5.13*c,1.23,5.13*z],.045,'green','outer-ring-rib');
  k.cyl(.055,.05,5.42*c,1.43,5.42*z,'steel','rim-fastener');
  for(let j=1;j<5;j++){
   const b=a+j*Math.PI*2/(32*5),cb=Math.cos(b),sb=Math.sin(b);
   k.rod([3.25*cb,.79,3.25*sb],[4.31*cb,.79,4.31*sb],.018,'steel','grating-bar');
  }
 }
 for(const r of [3.25,3.52,3.80,4.08,4.34])collar(k,r,.79,'steel',.025,'grating-circumferential-frame');
 for(const a of [.2,2.3,3.8]){
  const c=Math.cos(a),z=Math.sin(a);
  k.box(.65,.12,1.0,4.72*c,.85,4.72*z,'green','rim-lock-base',-a);
  k.rod([4.8*c-.5*z,.99,4.8*z+.5*c],[4.8*c+.5*z,.99,4.8*z-.5*c],.09,'green','rim-lock-link');
 }
 // Low perimeter domes seen around the reference's upper assembly.
 for(const a of [.20,2.35,4.3])k.sphere(.65,6.45*Math.cos(a),.32,6.45*Math.sin(a),'dark','perimeter-dome',[1,.68,1]);
 // Visible nose only, held below the rim; opening the lid does not raise the missile.
 const rocket=new THREE.Group();rocket.name='ШПУ · видимая носовая часть ракеты';root.add(rocket);
 const olive=new THREE.MeshStandardMaterial({color:0x475b3a,roughness:.52,metalness:.24}),silver=new THREE.MeshStandardMaterial({color:0xadae9e,roughness:.43,metalness:.52});
 const points=[new THREE.Vector2(1.42,-3.4),new THREE.Vector2(1.42,-2.9),new THREE.Vector2(1.27,-2.1),new THREE.Vector2(.98,-1.15),new THREE.Vector2(.60,-.25),new THREE.Vector2(.21,.47),new THREE.Vector2(0,.70)];
 const nose=new THREE.Mesh(new THREE.LatheGeometry(points,72),olive);nose.name='Ракета · обтекатель';nose.userData.museumComponent='silo-rocket-nose';rocket.add(nose);
 const body=new THREE.Mesh(new THREE.CylinderGeometry(1.42,1.42,2.4,72),silver);body.position.y=-4.6;body.name='Ракета · видимый пояс';rocket.add(body);
 for(const y of [-3.4,-3.65]){const b=new THREE.Mesh(new THREE.TorusGeometry(1.425,.028,6,72),silver);b.rotation.x=Math.PI/2;b.position.y=y;rocket.add(b);}
 // A shallow circular cover with a narrow rectangular hinge extension.
 // This is an exterior visualization, not a dimensional mechanism model.
 const hinge=new THREE.Group();hinge.position.set(0,1.44,-5.45);hinge.name='ШПУ · шарнир крышки';root.add(hinge);
 const lid=new THREE.Group();lid.position.z=5.45;hinge.add(lid);const lk=archiveKit(lid);lk.mat.green.color.setHex(0x61684b);lk.mat.steel.color.setHex(0x8b9389);
 const lidProfile=[[0,.64],[4.95,.64],[5.35,.52],[5.60,.38],[5.60,.12],[5.42,.04],[0,.04]].map(p=>new THREE.Vector2(...p));
 lk.direct(new THREE.LatheGeometry(lidProfile,80),'green','round-armoured-lid');
 for(const [r,y,t,m]of [[5.57,.13,.045,'steel'],[5.56,.37,.035,'green'],[5.15,-.08,.055,'dark'],[4.75,-.17,.045,'steel']])collar(lk,r,y,m,t,'layered-lid-ring');
 const underside=lk.direct(new THREE.CylinderGeometry(4.78,4.78,.18,64),'green','lid-underside-panel');underside.position.y=-.06;
 lk.box(2.55,.40,1.65,0,.25,-5.30,'green','lid-hinge-tail');
 lk.box(2.75,.10,1.65,0,.48,-5.30,'steel','lid-tail-edge');
 // Underside grid is clipped to the circular plate, leaving the top smooth.
 for(const offset of [-3,-1.5,0,1.5,3]){
  const length=2*Math.sqrt(4.5*4.5-offset*offset);
  lk.box(.085,.08,length,offset,-.19,0,'green','lid-underside-rib');
  lk.box(length,.08,.085,0,-.19,offset,'green','lid-underside-rib');
 }
 for(let i=0;i<24;i++){
  const angle=i*Math.PI*2/24,c=Math.cos(angle),z=Math.sin(angle);
  lk.box(.23,.08,.23,4.25*c,-.20,4.25*z,'green','lid-inner-fastener',-angle);
  lk.box(.24,.12,.48,5.02*c,-.06,5.02*z,'green','lid-lock-lug',-angle);
 }
 const port=collar(lk,.48,-.22,'green',.065,'lid-inner-inspection-port');port.position.z=-3.3;
 const innerPort=collar(lk,.34,-.23,'steel',.03,'lid-inner-inspection-port');innerPort.position.z=-3.3;
 for(const x of [-.85,.85])for(const z of [-4.3,-3.2]){
  lk.cyl(.16,.08,x,.70,z,'steel','lid-top-fitting');
  if(z===-4.3){lk.rod([x-.10,.73,z],[x-.10,.89,z],.035,'dark','lid-lifting-eye');lk.rod([x-.10,.89,z],[x+.10,.89,z],.035,'dark','lid-lifting-eye');lk.rod([x+.10,.89,z],[x+.10,.73,z],.035,'dark','lid-lifting-eye');}
 }
 for(const x of [-1.05,1.05]){
  lk.box(.28,.5,2.4,x,-.13,-4.65,'green','hinge-moving-cheek');
  lk.rod([x-.18,-.18,-4.55],[x+.18,-.18,-4.55],.25,'green','hinge-upper-bearing');
 }
 const lidFeatures=lk.finish();
 for(const x of [-1.05,1.05]){
  k.box(.65,.75,2.1,x,.65,-5.4,'green','hinge-pedestal');
  k.rod([x-.42,1.44,-5.45],[x+.42,1.44,-5.45],.29,'steel','hinge-bearing');
  k.rod([x,.72,-4.8],[x,1.44,-5.45],.15,'green','hinge-fixed-cheek');
 }
 k.rod([-1.55,1.44,-5.45],[1.55,1.44,-5.45],.16,'steel','hinge-cross-shaft');
 // Small offset rectangular service tray matches the exterior reference.
 k.box(2.1,.18,1.05,-2.5,1.43,-5.35,'green','hinge-service-tray');
 k.box(1.8,.035,.78,-2.5,1.54,-5.35,'rust','hinge-service-tray-inset');
 for(const x of [-3.5,-1.5])k.box(.06,.12,1.05,x,1.54,-5.35,'steel','hinge-tray-edge');
 for(const z of [-5.85,-4.85])k.box(2.05,.12,.06,-2.5,1.54,z,'steel','hinge-tray-edge');
 // Decorative telescoping props follow the museum animation.
 const struts=[];for(const x of [-.46,.46]){
  const shell=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,1,12),k.mat.green),piston=new THREE.Mesh(new THREE.CylinderGeometry(.085,.085,1,12),k.mat.steel);
  shell.name='Крышка · привод';piston.name='Крышка · шток';root.add(shell,piston);struts.push({base:V(x,.72,-4.35),anchor:V(x,-.22,2.2),shell,piston});
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
 k.cutouts.push({x:0,z:0,rx:3.24,rz:3.24,shape:'ellipse',compactCircle:true});
 const features=k.finish(),vapour=createVapour(root),localCamera=V(),localTarget=V(),worldCenter=V(),a=V(),b=V(),direction=V(),up=V(0,1,0);
 let progress=0,wanted=false,lastTime=null,distance=Infinity,aimDistance=Infinity,cameraHeight=Infinity,planDistance=Infinity,vapourAmount=0;
 function pose(){
  const eased=smooth(progress);hinge.rotation.x=-THREE.MathUtils.degToRad(108)*eased;
  hinge.updateMatrix();
  for(const s of struts){a.copy(s.base);b.copy(s.anchor).applyMatrix4(hinge.matrix);direction.copy(b).sub(a);const length=direction.length(),q=new THREE.Quaternion().setFromUnitVectors(up,direction.clone().normalize());
   s.shell.position.copy(a).lerp(b,.28);s.shell.quaternion.copy(q);s.shell.scale.y=length*.56;
   s.piston.position.copy(a).lerp(b,.76);s.piston.quaternion.copy(q);s.piston.scale.y=length*.48;
  }
 }
 const api={siteId,
  update(now,camera,target){
   root.updateWorldMatrix(true,false);localCamera.copy(camera.position);root.worldToLocal(localCamera);localTarget.copy(target);root.worldToLocal(localTarget);
   distance=localCamera.distanceTo(V(0,.8,0));aimDistance=Math.hypot(localTarget.x,localTarget.z);
   cameraHeight=camera.position.y/MUSEUM_MAP_SCALE;worldCenter.setFromMatrixPosition(root.matrixWorld);
   planDistance=Math.hypot(camera.position.x-worldCenter.x,camera.position.z-worldCenter.z)/MUSEUM_MAP_SCALE;
   const shown=visible(root),dt=lastTime===null?0:THREE.MathUtils.clamp((now-lastTime)/1000,0,.12);lastTime=now;
   const previous=progress;
   if(!shown){wanted=false;progress=0;}
   else if(!wanted&&aimDistance<12&&(activation==='height'
    ?cameraHeight<=SILO_REFERENCE.openHeight+1e-9&&planDistance<SILO_REFERENCE.openPlanDistance
    :distance<SILO_REFERENCE.openDistance))wanted=true;
   else if(wanted&&(aimDistance>18||(activation==='height'
    ?cameraHeight>SILO_REFERENCE.closeHeight+1e-9||planDistance>SILO_REFERENCE.closePlanDistance
    :distance>SILO_REFERENCE.closeDistance)))wanted=false;
   const step=dt/SILO_REFERENCE.openSeconds;progress=THREE.MathUtils.clamp(progress+(wanted?step:-step),0,1);
   // An opening/closing lid must never be hidden behind the closed far proxy.
   if(wanted||progress>0)detail.visible=true;
   else if(detail.visible&&distance>300)detail.visible=false;
   else if(!detail.visible&&distance<260)detail.visible=true;
   proxy.visible=!detail.visible;
   if(progress!==previous)pose();
   vapourAmount=shown?smooth((progress-.12)/.60):0;vapour.update(now/1000,vapourAmount);
  },
  inspect(view,camera,controls){
   root.updateWorldMatrix(true,false);const near=view==='close';controls.target.copy(root.localToWorld(V(0,near?.8:1,0)));
   camera.position.copy(root.localToWorld(near?V(9,19,18):V(66,74,82)));
   if(activation==='height'&&!near&&camera.position.y<SILO_REFERENCE.overviewHeight*MUSEUM_MAP_SCALE){
    direction.copy(camera.position).sub(controls.target);
    camera.position.copy(controls.target).addScaledVector(direction,(SILO_REFERENCE.overviewHeight*MUSEUM_MAP_SCALE-controls.target.y)/direction.y);
   }
   controls.update();
  },
  stats(){return {version:SILO_VERSION,siteId,activation,detailVisible:detail.visible,progress,open:wanted,state:progress===0?'closed':progress===1?'open':wanted?'opening':'closing',lidAngleDeg:108*smooth(progress),cameraDistance:distance,cameraHeight,planDistance,aimDistance,steamVisible:vapour.points.visible,steamParticles:vapour.points.visible?vapour.count:0,noseTipY:.70,rimY:1.36,openingRadius:3.2,visible:visible(root),features:{...features.features,...lidFeatures.features}};}
 };
 const detail=new THREE.Group();detail.name='ШПУ · подробная модель';for(const child of [...root.children])detail.add(child);root.add(detail);shareGeometry(detail);
 const proxy=createFarSilo();root.add(proxy);detail.visible=false;proxy.visible=true;
 pose();controllers.set(root,api);root.userData.siloExhibit={version:SILO_VERSION,siteId,reference:SILO_REFERENCE};root.userData.physicalUnits=SILO_REFERENCE.physical;
 return {...features,meshCount:features.meshCount+lidFeatures.meshCount+9,primitiveCount:features.primitiveCount+lidFeatures.primitiveCount,features:{...features.features,...lidFeatures.features},version:SILO_VERSION,physical:SILO_REFERENCE.physical};
}
export function siloController(root){return controllers.get(root);}

const geometryPool=new Map();
function shareGeometry(root){
 root.traverse(mesh=>{if(!mesh.isMesh)return;const g=mesh.geometry;let h=2166136261,key='';
  const arrays=[...Object.entries(g.attributes).sort(([a],[b])=>a.localeCompare(b)),...(g.index?[['index',g.index]]:[])];
  for(const [name,a]of arrays){key+=name+':'+a.itemSize+':'+a.count+':'+a.normalized+';';const bytes=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength);for(const b of bytes)h=Math.imul(h^b,16777619);}
  key+=h>>>0;const cached=geometryPool.get(key);
  // Verify bytes on a hash hit; never substitute a merely similar geometry.
  const equal=cached&&arrays.every(([name,a])=>{const b=name==='index'?cached.index:cached.attributes[name];return b&&a.array.length===b.array.length&&a.array.every((v,i)=>v===b.array[i]);});
  if(equal&&cached!==g){mesh.geometry=cached;g.dispose();}else if(!cached)geometryPool.set(key,g);
 });
}
let farGeometry,farMaterial;
function createFarSilo(){
 if(!farGeometry){const parts=[];
  const box=(w,h,d,x,y,z,color)=>{const g=new THREE.BoxGeometry(w,h,d).toNonIndexed();g.translate(x,y,z);const c=new THREE.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3)c.toArray(a,i);g.setAttribute('color',new THREE.BufferAttribute(a,3));parts.push(g);};
  box(24,.28,25,0,.14,0,0xaaa89a);const disc=new THREE.CylinderGeometry(5.6,5.6,.65,24).toNonIndexed();disc.translate(0,1.76,0);const discColors=new Float32Array(disc.attributes.position.count*3),discColor=new THREE.Color(0x61684b);for(let i=0;i<discColors.length;i+=3)discColor.toArray(discColors,i);disc.setAttribute('color',new THREE.BufferAttribute(discColors,3));parts.push(disc);box(7,3.1,8,18,1.55,13,0xc9c7bd);box(7.4,.3,8.4,18,3.25,13,0x7f9295);box(6.5,.08,13,0,.04,18.5,0x686a63);
  for(const x of [-26,26])box(.08,1.4,47,x,.7,1.5,0x6c7b76);box(52,1.4,.08,0,.7,-22,0x6c7b76);for(const x of [-15,15])box(22,1.4,.08,x,.7,25,0x6c7b76);
  farGeometry=mergeGeometries(parts,false);for(const g of parts)g.dispose();farMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9});
 }
 const mesh=new THREE.Mesh(farGeometry,farMaterial);mesh.name='ШПУ · общий план';mesh.userData.museumComponent='silo-overview';return mesh;
}
