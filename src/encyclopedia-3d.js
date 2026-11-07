import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

// The encyclopaedia uses one WebGL context for its currently selected article.
// Small list images are rendered from real THREE geometry by a temporary shared
// renderer; they never spin up one WebGL context per card.
export const ENCYCLOPEDIA_3D_VERSION = 'encyclopedia-card-models-v1';
const C = {
 cream: 0xe4e6df, light: 0xc3c9ca, dark: 0x283b48,
 metal: 0x82929a, black: 0x17232c, orange: 0xc96d3e,
 teal: 0x315a67, blue: 0x355883, panel: 0x182d59
};
const material = (color, metallic = 0) => new THREE.MeshStandardMaterial({
 color,metalness:metallic,roughness:metallic ? 0.52 : 0.77,
 side:THREE.DoubleSide
});
function place(root,geometry,color,x=0,y=0,z=0,rx=0,ry=0,rz=0) {
 const mesh = new THREE.Mesh(geometry,material(color,.12));
 mesh.position.set(x,y,z);mesh.rotation.set(rx,ry,rz);root.add(mesh);return mesh;
}
const cyl = (root,r1,r2,h,color,x=0,y=0,z=0) =>
 place(root,new THREE.CylinderGeometry(r1,r2,h,12),color,x,y,z);
const cone = (root,r,h,color,x=0,y=0,z=0) =>
 place(root,new THREE.ConeGeometry(r,h,12),color,x,y,z);
function rocketCore(root,{height=22,radius=1.1,body=C.light,tip=3}={}) {
 cyl(root,radius,radius,height,body,0,height/2,0);
 cone(root,radius,tip,C.cream,0,height+tip/2,0);
 cyl(root,radius*1.03,radius*1.03,.42,C.dark,0,height*.12,0);
}
function booster(root,x,z,h=17,body=C.metal) {
 const stem=cyl(root,.69,.96,h,body,x,h/2,z);
 stem.rotation.z=-x*.016;stem.rotation.x=z*.016;
 cone(root,.68,2.2,C.cream,x,h+1.1,z);
 cyl(root,.53,.60,1.2,C.orange,x,.7,z);
}
function makeR7(root,modern=false){
 rocketCore(root,{height:modern?25:22,radius:1.0,body:modern?C.cream:C.light,tip:modern?4.8:2.1});
 for(const [x,z] of [[1.53,0],[-1.53,0],[0,1.53],[0,-1.53]])
  booster(root,x,z,modern?19:18,modern?C.cream:C.metal);
 if(modern){cyl(root,1.07,1.07,1.2,C.orange,0,18.2,0);cyl(root,1.07,1.07,.58,C.dark,0,13.3,0);}
 else cyl(root,1.07,1.07,.58,C.dark,0,16,0);
}
function makeProton(root){
 cyl(root,1.45,1.45,26,C.cream,0,13,0);
 cyl(root,1.32,1.32,2.7,C.dark,0,14,0);
 cone(root,1.45,5.5,C.cream,0,28.75,0);
 for(let i=0;i<6;i++){
  const angle=i*Math.PI/3,x=2*Math.cos(angle),z=2*Math.sin(angle);
  cyl(root,.7,.76,15.5,C.cream,x,7.75,z);
  cone(root,.7,1.2,C.light,x,16.1,z);
  cyl(root,.6,.63,.9,C.dark,x,.45,z);
 }
}
function makeEnergia(root){
 cyl(root,1.9,1.9,30,C.cream,0,15,0);
 cone(root,1.88,4,C.cream,0,32,0);
 cyl(root,1.94,1.94,1.1,C.orange,0,5.5,0);
 for(let i=0;i<4;i++){
  const a=i*Math.PI/2+.785,x=2.85*Math.cos(a),z=2.85*Math.sin(a);
  cyl(root,1.0,1.14,23,C.orange,x,11.5,z);
  cone(root,1.0,2.8,C.cream,x,24.4,z);
  cyl(root,.9,.95,.6,C.metal,x,.3,z);
 }
}
function makeSoyuzCraft(root){
 // Spacecraft, not the similarly named R-7-derived launch vehicle.
 cyl(root,1.15,1.15,3.5,C.light,0,-2.0,0);
 cyl(root,1.27,1.36,.8,C.black,0,-.1,0);
 place(root,new THREE.ConeGeometry(1.45,3.0,24),C.cream,0,1.55,0);
 place(root,new THREE.SphereGeometry(1.65,18,12),C.light,0,4.20,0);
 cyl(root,.88,.92,.5,C.dark,0,5.75,0);
 for(const side of [-1,1]){
  place(root,new THREE.BoxGeometry(6.1,.09,2.0),C.panel,side*4.35,-2.2,0);
  for(let i=0;i<7;i++){
   place(root,new THREE.BoxGeometry(.025,.1,1.96),C.light,side*(1.55+i*.88),-2.14,0);
  }
  cyl(root,.13,.13,1.7,C.metal,side*1.15,-2,0);
 }
}
function makeBuran(root){
 const fuselage=cyl(root,.95,1.2,12,C.cream,0,0,0);
 fuselage.rotation.x=Math.PI/2;
 cone(root,.98,4,C.cream,0,0,7.7,Math.PI/2);
 // Wide delta wings with black leading edges.
 for(const side of [-1,1]){
  const geometry=new THREE.BufferGeometry(),sign=side;
  const points=[0,0,3.9, 7.0*sign,0,-3.1, 6.0*sign,0,-5.1, 0,0,-4.8];
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();
  place(root,geometry,C.cream);
  const edge=place(root,new THREE.BoxGeometry(5.4,.10,.38),C.black,3.1*side,.02,-1.1);
  edge.rotation.y=side*.68;
 }
 place(root,new THREE.BoxGeometry(.26,3.0,4.0),C.cream,0,1.3,-4.6);
 place(root,new THREE.BoxGeometry(1.3,.28,2.8),C.black,0,.89,4.0);
 for(const side of [-1,1])cyl(root,.36,.44,1.6,C.dark,side*.63,-.12,-5.3,Math.PI/2);
 root.rotation.y=.30;root.rotation.x=.07;
}
function modelFor(id){
 const root=new THREE.Group();root.name='Энциклопедия · '+id;
 if(id==='r7')makeR7(root,false);
 else if(id==='soyuz')makeR7(root,true);
 else if(id==='soyuzcraft')makeSoyuzCraft(root);
 else if(id==='proton')makeProton(root);
 else if(id==='energia')makeEnergia(root);
 else if(id==='buran')makeBuran(root);
 else return null;
 return root;
}
function lights(scene){
 scene.add(new THREE.HemisphereLight(0xe6f0ff,0x343d47,2.4));
 const a=new THREE.DirectionalLight(0xfff5e7,3.0);a.position.set(25,45,28);scene.add(a);
 const b=new THREE.DirectionalLight(0x9bd3f2,1.8);b.position.set(-22,12,-28);scene.add(b);
}
function fit(camera,controls,root,margin=1.4){
 root.updateMatrixWorld(true,true);
 const bounds=new THREE.Box3().setFromObject(root);
 const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
 const radius=Math.max(3,size.length()*.52);
 const distance=radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*margin;
 camera.position.copy(center).add(new THREE.Vector3(distance*.64,distance*.26,distance*.77));
 controls.target.copy(center);camera.near=.01;camera.far=Math.max(1000,distance*7);
 camera.updateProjectionMatrix();controls.minDistance=Math.max(.2,radius*.9);
 controls.maxDistance=Math.max(60,distance*5);
 controls.update();
}
const nextTurn=()=>new Promise(resolve=>
  ('requestIdleCallback' in window?window.requestIdleCallback(()=>resolve(),{timeout:350}):setTimeout(resolve,32)));
export function createEncyclopedia3D(){
 let active=null,disposed=false;
 const previewCache=new Map();
 async function renderThumbnails(ids,ready){
  let renderer;
  try{
   renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
   renderer.setPixelRatio(1);renderer.setSize(430,215,false);
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   renderer.setClearColor(0x0b1d2d,0);
   const scene=new THREE.Scene();lights(scene);
   const camera=new THREE.PerspectiveCamera(33,2,.01,1000);
   const controls={target:new THREE.Vector3(),update(){}};
   for(const id of ids){
    if(disposed)return;
    if(!previewCache.has(id)){
     const root=modelFor(id);
     if(!root)continue;
     scene.add(root);fit(camera,controls,root,1.22);
     renderer.render(scene,camera);
     previewCache.set(id,renderer.domElement.toDataURL('image/webp',.84));
     scene.remove(root);
    }
    ready(id,previewCache.get(id));
    await nextTurn();
   }
  }catch(error){console.warn('Энциклопедия · предпросмотр 3D:',error.message);}
  finally{renderer?.dispose();renderer?.forceContextLoss();}
 }
 function destroy(){
  if(!active)return;
  const a=active;active=null;a.abort.abort();a.observer?.disconnect();
  cancelAnimationFrame(a.frame);
  a.controls.dispose();
  a.exact?.dispose();
  a.renderer.dispose();a.renderer.forceContextLoss();
  a.container.replaceChildren();
 }
 function mount(container,id,exactId=null){
  destroy();if(disposed||!container)return;
  const root=modelFor(id);
  if(!root)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x112234);lights(scene);scene.add(root);
  let renderer,controls;
  try{
   renderer=new THREE.WebGLRenderer({antialias:true});
   renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   renderer.toneMapping=THREE.ACESFilmicToneMapping;
   renderer.toneMappingExposure=1.15;
   renderer.domElement.setAttribute('aria-label','Вращайте трёхмерный макет мышью или пальцем');
   renderer.domElement.tabIndex=0;
   container.replaceChildren(renderer.domElement);
   const camera=new THREE.PerspectiveCamera(38,1,.01,2000);
   controls=new OrbitControls(camera,renderer.domElement);
   controls.enableDamping=true;controls.autoRotate=true;controls.autoRotateSpeed=.62;
   fit(camera,controls,root);
   const abort=new AbortController();
   const state={container,renderer,controls,abort,exact:null,frame:0,scene,camera,root,id,source:'illustrative',observer:null};
   active=state;
   const resize=()=>{
    if(active!==state)return;
    const width=Math.max(160,container.clientWidth||420),height=Math.max(180,container.clientHeight||280);
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    fit(camera,controls,state.root);
   };
   if(typeof ResizeObserver==='function'){state.observer=new ResizeObserver(resize);state.observer.observe(container);}
   else window.addEventListener('resize',resize,{signal:abort.signal});
   resize();
   function draw(){
    if(active!==state)return;
    state.frame=requestAnimationFrame(draw);
    if(document.hidden||!container.isConnected)return;
    controls.update();
    state.exact?.update?.(performance.now(),camera,controls.target);
    renderer.render(scene,camera);
   }
   draw();
   container.dataset.modelStatus='illustrative';
   if(exactId){
    // The real GLB is requested only for the article the visitor opened.
    // R-7 and the Soyuz spacecraft keep their correctly labelled 3D studies
    // rather than silently showing a different historical vehicle.
    (async()=>{
      try{
       const {createInspectionModel}=await import('./inspection-models.js?v=20261107-encyclopedia-card-3d-v1');
       const exact=await createInspectionModel(exactId,{signal:abort.signal});
       if(active!==state||abort.signal.aborted){exact.dispose();return;}
       scene.remove(root);state.root=exact.root;scene.add(exact.root);state.exact=exact;
       state.source='museum-asset';container.dataset.modelStatus='museum-asset';
       fit(camera,controls,exact.root);
      }catch(error){
       if(!abort.signal.aborted&&active===state)container.dataset.modelStatus='illustrative-fallback';
       console.warn('Энциклопедия · 3D-экспонат:',error.message);
      }
    })();
   }
  }catch(error){
   renderer?.dispose();renderer?.forceContextLoss();controls?.dispose();
   container.textContent='3D-просмотр недоступен: '+String(error.message||error);
   console.warn('Энциклопедия · WebGL:',error);
  }
 }
 return {
  mount,destroy,dispose(){disposed=true;destroy();},
  renderThumbnails,
  stats:()=>({version:ENCYCLOPEDIA_3D_VERSION,activeId:active?.id||null,
    mode:active?.source||null,previewCount:previewCache.size,hasStage:Boolean(active)})
 };
}
