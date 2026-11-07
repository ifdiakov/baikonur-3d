import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {MODEL_CATALOG,MODEL_VIEWER_VERSION,resolveModelId} from './model-catalog.js?v=20261108-proton-source-v1';
import {createInspectionModel,inspectionBounds} from './inspection-models.js?v=20261108-proton-source-v1';
import {renderModelFacts} from './model-facts-view.js?v=20261108-proton-source-v1';
const params=new URLSearchParams(location.search),embedded=params.has('embed')&&parent!==window;
if(embedded){document.body.classList.add('embedded');document.getElementById('back').textContent='← К ОБЪЕКТУ';}
const close=()=>parent.postMessage({type:'museum-model-close'},location.origin);
if(embedded){document.querySelectorAll('.back,.brand').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();close();}));document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});}
const container=document.getElementById('modelView'),status=document.getElementById('modelStatus'),statusText=document.getElementById('statusText'),select=document.getElementById('modelSelect');
const choices=(params.get('models')||Object.keys(MODEL_CATALOG).join(',')).split(',').map(resolveModelId).filter((x,i,a)=>MODEL_CATALOG[x]&&a.indexOf(x)===i);
if(!choices.length)choices.push('soyuz');for(const id of choices){const option=document.createElement('option');option.value=id;option.textContent=MODEL_CATALOG[id].title;select.append(option);}
let current=choices.includes(resolveModelId(params.get('model')))?resolveModelId(params.get('model')):choices[0],model=null,renderer=null,observer=null,request=null,generation=0,raf=0,disposed=false;
try{
 renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;container.append(renderer.domElement);renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Вращайте модель мышью или касанием');
 const darkBackground=getComputedStyle(document.documentElement).backgroundColor;
 const scene=new THREE.Scene();scene.background=new THREE.Color(darkBackground);const camera=new THREE.PerspectiveCamera(35,1,.01,5000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.10;controls.autoRotateSpeed=.65;
 scene.add(new THREE.HemisphereLight('#e9f4ff','#6c7782',2.1));for(const [color,power,position]of [['#fff7eb',3.2,[30,60,65]],['#b9daff',2.3,[-40,20,-45]],['#fff',.8,[0,-20,20]]]){const light=new THREE.DirectionalLight(color,power);light.position.set(...position);scene.add(light);}
 let view='full',dark=true,exploded=false,gear=true,vehicleVisible=true;
 const box=()=>inspectionBounds(model.root);
 function fit(direction){
  const bounds=box(),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  const dir=new THREE.Vector3(...direction).normalize(),right=new THREE.Vector3(0,1,0).cross(dir).normalize(),up=dir.clone().cross(right),tan=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5));let distance=0;
  for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){const v=new THREE.Vector3(size.x*x,size.y*y,size.z*z);distance=Math.max(distance,v.dot(dir)+Math.abs(v.dot(up))/tan,v.dot(dir)+Math.abs(v.dot(right))/(tan*camera.aspect));}
  if(['mig25','n1','proton','tu204','soyuz5'].includes(current)){
   distance=0;const point=new THREE.Vector3();model.root.traverseVisible(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).sub(center);distance=Math.max(distance,point.dot(dir)+Math.abs(point.dot(up))/tan,point.dot(dir)+Math.abs(point.dot(right))/(tan*camera.aspect));}});
  }distance*=1.17;
  controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));controls.minDistance=Math.max(.2,size.length()*.015);controls.maxDistance=Math.max(300,size.length()*8);camera.near=Math.max(.02,size.length()/300);camera.far=Math.max(300,distance*8);camera.updateProjectionMatrix();
 }
 function inspect(id){if(!model)return false;view=id;controls.enableDamping=false;controls.update();
  const rocket=model.spec.kind==='rocket';
  const preset=model.spec.views?.[id];
  if(preset){
   const target=new THREE.Vector3(...preset.target);if(exploded&&current==='proton')target.y+=id==='top'?15:id==='side'?5:0;model.root.localToWorld(target);controls.target.copy(target);camera.position.copy(target).add(new THREE.Vector3(...preset.offset).multiplyScalar(Math.max(1,.9/camera.aspect)).applyQuaternion(model.root.quaternion));
  }else if(rocket&&['front','side','top'].includes(id)&&current.startsWith('zenit-')){
   const y={front:1.7,side:31.8+(exploded?6:0),top:54.2+(exploded?18:0)}[id],target=new THREE.Vector3(0,y,0);model.root.localToWorld(target);controls.target.copy(target);
   const offset=({front:[5.6,-4.4,7.4],side:[6.3,1,7.1],top:[9,3.5,14]})[id];camera.position.copy(target).add(new THREE.Vector3(...offset).multiplyScalar(Math.max(1,.85/camera.aspect)).applyQuaternion(model.root.quaternion));
  }else fit(({full:rocket?[1.5,.35,2.8]:[1.1,.70,1.4],front:[0,.06,1],side:[1,.09,0],top:[0,1,.001],bottom:[0,-1,.001]})[id]||[1,1,1]);
  controls.update();controls.enableDamping=true;camera.updateMatrixWorld(true);for(const b of document.querySelectorAll('[data-view]')){b.classList.toggle('active',b.dataset.view===id);b.setAttribute('aria-pressed',String(b.dataset.view===id));}return true;
 }
 function renderFrame(time=performance.now()){if(disposed)return;controls.update();model?.update?.(time,camera,controls.target);renderer.render(scene,camera);}
 async function load(id){
  id=resolveModelId(id);if(!MODEL_CATALOG[id])return;
  const token=++generation;request?.abort();request=new AbortController();const controller=request,timer=setTimeout(()=>controller.abort(),45000);
  current=id;select.value=id;status.hidden=false;statusText.textContent='Загружаем модель…';document.getElementById('retry').hidden=true;model?.root.removeFromParent();model?.dispose();model=null;
  const spec=MODEL_CATALOG[id];document.title=spec.title+' · RocketTrip';document.getElementById('modelTitle').textContent=spec.title;document.getElementById('modelSubtitle').textContent=spec.subtitle;renderModelFacts(spec,document.getElementById('modelFacts'),document.getElementById('modelFactSources'));document.querySelector('.intro').scrollTop=0;document.getElementById('modelSources').open=false;
  document.getElementById('siteRocket').hidden=true;document.getElementById('siteRocket').setAttribute('aria-pressed','true');document.getElementById('siteRocket').textContent='Убрать ракету';vehicleVisible=true;
  document.getElementById('gear').hidden=true;document.getElementById('gear').setAttribute('aria-pressed','true');document.getElementById('gear').textContent='Убрать шасси';gear=true;
  const source=document.getElementById('modelSource');source.hidden=!spec.source;if(spec.source)source.href=spec.source;source.textContent=spec.credit?'3D-модель: '+spec.credit+' ↗':(spec.sourceLabel||'Материалы модели ↗');
  document.getElementById('explode').hidden=true;document.getElementById('explode').setAttribute('aria-pressed','false');document.getElementById('explode').textContent='Разнести ступени';exploded=false;
  try{
   const result=await createInspectionModel(id,{signal:request.signal});if(token!==generation||disposed){result.dispose();return;}
   model=result;document.getElementById('siteRocket').hidden=!model.setVehicleVisible;if(model.spec.kind==='rocket')model.root.rotation.z=innerWidth<=700?-Math.PI/10:-Math.PI/3;scene.add(model.root);model.root.updateMatrixWorld(true);document.getElementById('explode').hidden=!model.setExploded;document.getElementById('gear').hidden=!model.setGear;gear=model.initialGear>0;document.getElementById('gear').setAttribute('aria-pressed',String(gear));document.getElementById('gear').textContent=gear?'Убрать шасси':'Выпустить шасси';for(const button of document.querySelectorAll('[data-proton-view]'))button.hidden=id!=='proton-pad';for(const button of document.querySelectorAll('[data-mig-view]'))button.hidden=id!=='mig25';
   for(const [key,label]of [['front',(id.startsWith('zenit-')||id==='proton')?'Двигатели':'Спереди'],['side',(id.startsWith('zenit-')||id==='proton')?'Ферма':'Сбоку'],['top',(id.startsWith('zenit-')||id==='proton')?'Обтекатель':'Сверху']])document.querySelector(`[data-view="${key}"]`).textContent=spec.viewLabels?.[key]||label;
   inspect('full');if(spec.initialView)inspect(spec.initialView);renderFrame();status.hidden=true;if(embedded)parent.postMessage({type:'museum-model-ready',model:id},location.origin);
  }catch(error){if(token!==generation||disposed)return;statusText.textContent='Не удалось загрузить модель. Попробуйте ещё раз.';document.getElementById('retry').hidden=false;console.error('Model viewer:',error.message);}
  finally{clearTimeout(timer);}
 }
 const resize=()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(model){if(model.spec.kind==='rocket')model.root.rotation.z=innerWidth<=700?-Math.PI/10:-Math.PI/3;inspect(view);renderFrame();}};observer=new ResizeObserver(resize);observer.observe(container);resize();
 select.addEventListener('change',()=>load(select.value));document.getElementById('retry').onclick=()=>load(current);
 for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>inspect(b.dataset.view);
 document.getElementById('rotate').onclick=e=>{controls.autoRotate=!controls.autoRotate;e.currentTarget.setAttribute('aria-pressed',String(controls.autoRotate));};
 document.getElementById('light').onclick=e=>{dark=!dark;scene.background.set(dark?darkBackground:'#dce1e3');document.body.classList.toggle('dark-stage',dark);e.currentTarget.setAttribute('aria-pressed',String(dark));e.currentTarget.textContent=dark?'Светлый фон':'Тёмный фон';};
 document.getElementById('siteRocket').onclick=e=>{if(!model?.setVehicleVisible)return;vehicleVisible=!vehicleVisible;model.setVehicleVisible(vehicleVisible);e.currentTarget.setAttribute('aria-pressed',String(vehicleVisible));e.currentTarget.textContent=vehicleVisible?'Убрать ракету':'Показать ракету';renderFrame();};
 document.getElementById('gear').onclick=e=>{if(!model?.setGear)return;gear=!gear;model.setGear(gear?1:0);e.currentTarget.setAttribute('aria-pressed',String(gear));e.currentTarget.textContent=gear?'Убрать шасси':'Выпустить шасси';inspect(view);renderFrame();};
 document.getElementById('explode').onclick=e=>{if(!model?.setExploded)return;exploded=!exploded;model.setExploded(exploded?1:0);e.currentTarget.setAttribute('aria-pressed',String(exploded));e.currentTarget.textContent=exploded?'Собрать ракету':'Разнести ступени';inspect('full');};
 renderer.domElement.addEventListener('keydown',e=>{if(e.key==='Home'){e.preventDefault();inspect('full');}});
 window.__MODEL_VIEWER_QA={version:MODEL_VIEWER_VERSION,load,inspect,frame:renderFrame,stats:()=>({modelId:current,ready:!!model,choices,view,dark,exploded,gear,vehicleVisible,autoRotate:controls.autoRotate,camera:camera.position.toArray(),target:controls.target.toArray(),size:model?box().getSize(new THREE.Vector3()).toArray():null,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,viewport:[container.clientWidth,container.clientHeight]})};
 function animateModel(time){raf=requestAnimationFrame(animateModel);renderFrame(time);}raf=requestAnimationFrame(animateModel);load(current);
 window.addEventListener('pagehide',()=>{disposed=true;generation++;request?.abort();cancelAnimationFrame(raf);observer.disconnect();controls.dispose();model?.dispose();renderer.dispose();renderer.forceContextLoss();},{once:true});
}catch(error){status.hidden=false;statusText.textContent='Для просмотра модели нужен WebGL. Обновите страницу или включите аппаратное ускорение.';console.error(error);}
