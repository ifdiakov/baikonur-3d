import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createZenitRocket,ZENIT_VERSION} from './zenit-rocket.js?v=20261101-zenit-v1';

const container=document.getElementById('modelView'),status=document.getElementById('modelStatus');
try{
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;container.append(renderer.domElement);
 renderer.domElement.setAttribute('aria-label','Зенит-3SL: перетащите для вращения, используйте колесо для приближения');renderer.domElement.tabIndex=0;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#dce1e3');
 const camera=new THREE.PerspectiveCamera(35,1,.03,1000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=2.5;controls.maxDistance=220;controls.autoRotateSpeed=.65;
 const ambient=new THREE.HemisphereLight('#e9f4ff','#7c8793',2.3);scene.add(ambient);
 const key=new THREE.DirectionalLight('#fff7e6',3.6);key.position.set(24,50,55);scene.add(key);
 const rim=new THREE.DirectionalLight('#b8daff',2.9);rim.position.set(-30,15,-30);scene.add(rim);
 const fill=new THREE.DirectionalLight('#ffffff',1.1);fill.position.set(15,-25,10);scene.add(fill);
 const model=createZenitRocket();const pivot=new THREE.Group();pivot.rotation.z=-Math.PI/3;scene.add(pivot);model.root.position.y=-29.8;pivot.add(model.root);
 let current='full',dark=false,exploded=false,disposed=false;
 const descriptions={
  full:['01 / 04','Ракета целиком','Белая окраска Sea Launch, красные пояса и наружные коммуникации — по восьми предоставленным ракурсам.'],
  engine:['02 / 04','Четыре камеры РД-171','В основании — один двигатель семейства РД-171 с четырьмя соплами. У модели открыты внутренние поверхности сопел, видны обвязка и элементы хвостового отсека.'],
  interstage:['03 / 04','Открытая межступенчатая ферма','За диагональными раскосами видны центральное сопло второй ступени и четыре небольшие рулевые камеры. Ферма остаётся сквозной при любом ракурсе.'],
  fairing:['04 / 04','Головной обтекатель','Плавный носовой профиль, продольный шов створок и эмблема Sea Launch. Диаметр обтекателя — 4,15 м.']
 };
 function world(y){pivot.updateMatrixWorld(true);return model.root.localToWorld(new THREE.Vector3(0,y,0));}
 function fit(){
  const box=new THREE.Box3().setFromObject(model.root),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
  const vfov=THREE.MathUtils.degToRad(camera.fov),distance=Math.max(size.y/2/Math.tan(vfov/2),size.x/2/Math.tan(vfov/2)/camera.aspect)*1.24+size.z/2;
  controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(.13,.07,1).normalize().multiplyScalar(distance));
 }
 function inspect(id){
  if(!descriptions[id])return false;current=id;controls.enableDamping=false;controls.update();
  if(id==='full')fit();else{
   const stageOffset=(id==='interstage'?6:id==='fairing'?18:0)*(exploded?1:0);
   const y={engine:1.7,interstage:31.8,fairing:54.2}[id]+stageOffset,target=world(y);
   const offset=({engine:[5.6,-4.4,7.4],interstage:[6.3,1.0,7.1],fairing:[9,3.5,14]})[id];
   const distanceScale=Math.max(1,1/camera.aspect*.85);
   const vector=new THREE.Vector3(...offset).multiplyScalar(distanceScale).applyQuaternion(pivot.quaternion);controls.target.copy(target);camera.position.copy(target).add(vector);
  }
  controls.update();controls.enableDamping=true;camera.updateMatrixWorld(true);
  const [index,title,text]=descriptions[id];document.getElementById('detailIndex').textContent=index;document.getElementById('detailTitle').textContent=title;document.getElementById('detailText').textContent=text;
  for(const button of document.querySelectorAll('[data-view]')){const active=button.dataset.view===id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
  return true;
 }
 const resize=()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;pivot.rotation.z=innerWidth<=700?-Math.PI/8:-Math.PI/3;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();inspect(current);};
 const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);resize();
 for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>inspect(button.dataset.view));
 document.getElementById('rotate').addEventListener('click',event=>{controls.autoRotate=!controls.autoRotate;event.currentTarget.setAttribute('aria-pressed',String(controls.autoRotate));});
 document.getElementById('explode').addEventListener('click',event=>{exploded=!exploded;model.setExploded(exploded?1:0);event.currentTarget.setAttribute('aria-pressed',String(exploded));event.currentTarget.textContent=exploded?'Собрать ракету':'Разнести ступени';inspect('full');});
 document.getElementById('light').addEventListener('click',event=>{dark=!dark;scene.background.set(dark?'#0e1923':'#dce1e3');event.currentTarget.setAttribute('aria-pressed',String(dark));event.currentTarget.textContent=dark?'Светлый фон':'Тёмный фон';document.body.classList.toggle('dark-stage',dark);});
 renderer.domElement.addEventListener('keydown',event=>{if(event.key==='Home'){event.preventDefault();inspect('full');}});
 window.__ZENIT_QA={version:ZENIT_VERSION,inspect,stats:()=>({...model.stats(),view:current,dark,autoRotate:controls.autoRotate,drawCalls:renderer.info.render.calls,renderTriangles:renderer.info.render.triangles,camera:camera.position.toArray(),target:controls.target.toArray(),bounds:new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3()).toArray(),viewport:[container.clientWidth,container.clientHeight]}),
  asset:()=>{const clone=model.root.clone(true);clone.position.set(0,0,0);clone.children.forEach(stage=>stage.position.set(0,0,0));clone.userData.exploded=0;clone.updateMatrixWorld(true);return clone;}};
 status.hidden=true;
 function animate(){if(disposed)return;requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}animate();
 window.addEventListener('pagehide',event=>{if(event.persisted)return;disposed=true;resizeObserver.disconnect();controls.dispose();model.dispose();renderer.dispose();},{once:true});
}catch(error){status.hidden=false;status.textContent='Не удалось открыть модель. Обновите страницу или включите WebGL в браузере.';console.error(error);}
