import * as THREE from 'three';
import {createLightField} from './light-field.js';

const STORAGE_KEY='rockettrip-baikonur-lighting-v1',LIMIT=1500;
export function createLightingEditor({scene,camera,canvas,roads,groundMeshes,button,onActiveChange,isLightAllowed=()=>true}){
  let active=false,mode='single',selected=null,items=[],renderedItems=[],history=[],nextId=1;
  const ray=new THREE.Raycaster(),mouse=new THREE.Vector2(),group=new THREE.Group();
  group.name='Фонари RocketTrip';scene.add(group);
  let evening=true;
  const lightField=createLightField(group,[],{pools:true,maxCount:LIMIT,name:'Пользовательские фонари · свет'});
  const metal=new THREE.MeshStandardMaterial({color:0x657177,metalness:.65,roughness:.52});
  const baseMaterial=new THREE.MeshStandardMaterial({color:0xaaa79e,roughness:.95});
  const lensMaterial=new THREE.MeshStandardMaterial({color:0xfff2d2,emissive:0xffdfa3,emissiveIntensity:.65,roughness:.35});
  const parts=[
    [new THREE.CylinderGeometry(.14,.18,1,8),metal,'pole'],
    [new THREE.BoxGeometry(1.75,.14,.14),metal,'arm'],
    [new THREE.BoxGeometry(.95,.22,.48),metal,'head'],
    [new THREE.BoxGeometry(.79,.045,.38),lensMaterial,'lens'],
    [new THREE.CylinderGeometry(.34,.4,.25,8),baseMaterial,'base']
  ].map(([geometry,material,part])=>{
    const mesh=new THREE.InstancedMesh(geometry,material,LIMIT);mesh.count=0;mesh.name='Фонари · '+part;
    mesh.userData.editorLamp=true;mesh.frustumCulled=false;group.add(mesh);return {mesh,part};
  });
  const marker=new THREE.Mesh(new THREE.RingGeometry(.8,1.15,32),new THREE.MeshBasicMaterial({
    color:0xf28b74,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide}));
  marker.rotation.x=-Math.PI/2;marker.visible=false;marker.renderOrder=12;scene.add(marker);
  const panel=document.createElement('section');panel.id='lightingPanel';panel.hidden=true;
  panel.setAttribute('aria-label','Расстановка фонарей');
  panel.innerHTML=`<div class="lighting-heading"><b>ФОНАРИ</b><button type="button" data-action="close" aria-label="Закрыть редактор фонарей">×</button></div>
  <div class="lighting-modes" role="group" aria-label="Способ расстановки">
  <button type="button" data-mode="single">По одному</button><button type="button" data-mode="road">Вдоль дороги</button>
  <button type="button" data-mode="move">Переместить</button><button type="button" data-mode="remove">Удалить</button></div>
  <div class="lighting-fields"><label>Высота<input id="lampHeight" aria-label="Высота фонаря" type="number" min="3" max="18" step="1" value="8"></label>
  <label>Интервал<input id="lampSpacing" aria-label="Интервал между фонарями" type="number" min="12" max="150" step="2" value="40"></label></div>
  <label class="lighting-side">Сторона дороги<select id="lampSide" aria-label="Сторона дороги"><option value="both">Обе стороны</option><option value="left">Левая</option><option value="right">Правая</option></select></label>
  <p class="lighting-help" id="lightingHelp"></p><div class="lighting-count" id="lightingCount"></div>
  <div class="lighting-actions"><button type="button" data-action="undo">Отменить</button><button type="button" data-action="export">Скачать схему</button><button type="button" data-action="import">Загрузить схему</button><button type="button" data-action="clear">Убрать все</button></div>
  <input id="lampImport" type="file" accept=".json,application/json" hidden>
  <p class="lighting-save">Расстановка сохраняется в этом браузере. Скачайте схему, чтобы передать её для общего макета.</p>
  <p id="lightingStatus" role="status" aria-live="polite"></p>`;
  document.body.append(panel);
  const status=panel.querySelector('#lightingStatus');
  const help={single:'Нажмите на дорогу или землю, чтобы поставить фонарь. Перетаскивание мышью перемещает камеру.',
    road:'Нажмите на дорогу: фонари появятся вдоль неё с выбранным интервалом. Одно «Отменить» уберёт весь ряд.',
    move:'Нажмите на фонарь, затем на его новое место. Esc снимает выбор.',remove:'Нажмите на фонарь, который нужно убрать.'};
  const number=(selector,min,max)=>Math.max(min,Math.min(max,Number(panel.querySelector(selector).value)||min));
  const copy=()=>items.map(x=>({...x}));
  function checkpoint(){history.push(copy());if(history.length>30)history.shift();}
  function render(){
    nextId=Math.max(nextId,...items.map(l=>l.id+1));
    renderedItems=items.filter(l=>isLightAllowed(l.x,l.z)&&isLightAllowed(l.x+Math.cos(l.yaw)*2,l.z-Math.sin(l.yaw)*2));
    const dummy=new THREE.Object3D();
    for(const {mesh,part} of parts){
      mesh.count=renderedItems.length;
      renderedItems.forEach((lamp,i)=>{
        const localX=part==='arm'?.8:part==='head'||part==='lens'?1.55:0;
        const localY=part==='pole'?lamp.height/2:part==='base'?.125:part==='lens'?lamp.height-.105:lamp.height;
        dummy.position.set(lamp.x+Math.cos(lamp.yaw)*localX,lamp.y+localY,lamp.z-Math.sin(lamp.yaw)*localX);
        dummy.rotation.set(0,lamp.yaw,0);dummy.scale.set(1,part==='pole'?lamp.height:1,1);
        dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
    }
    lightField.refresh(renderedItems.map(l=>({x:l.x+Math.cos(l.yaw)*1.55,y:l.y,z:l.z-Math.sin(l.yaw)*1.55,
      height:l.height-.1,poolX:l.x+Math.cos(l.yaw)*2,poolZ:l.z-Math.sin(l.yaw)*2,radius:l.height*1.4,color:0xffcf89})));
    lightField.root.visible=evening;
    const chosen=renderedItems.find(l=>l.id===selected);
    marker.visible=active&&!!chosen;if(chosen)marker.position.set(chosen.x,chosen.y+.035,chosen.z);
    panel.querySelector('#lightingCount').textContent='Фонарей на макете: '+renderedItems.length;
    panel.querySelector('[data-action="undo"]').disabled=!history.length;
    if(button)button.textContent='Фонари'+(items.length?' · '+items.length:'');
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,lamps:items}));}catch{status.textContent='Расстановка видна, но браузер не смог сохранить её. Скачайте схему.';}
  }
  function setMode(value){
    mode=value;selected=null;panel.querySelector('#lightingHelp').textContent=help[mode];
    for(const el of panel.querySelectorAll('[data-mode]'))el.setAttribute('aria-pressed',String(el.dataset.mode===mode));
    panel.querySelector('#lampSpacing').disabled=mode!=='road';panel.querySelector('#lampSide').disabled=mode!=='road';
    status.textContent='';render();
  }
  function setActive(value){active=value;panel.hidden=!active;button?.setAttribute('aria-pressed',String(active));
    canvas.style.cursor=active?'crosshair':'';if(!active){selected=null;marker.visible=false;}
    onActiveChange?.(active);}
  button?.addEventListener('click',()=>setActive(!active));
  function validate(data){
    if(data.version!==1||!Array.isArray(data.lamps)||data.lamps.length>LIMIT)throw Error('Нужна схема фонарей версии 1, не более '+LIMIT+' объектов.');
    return data.lamps.map((l,i)=>{
      if(!['x','y','z','height','yaw'].every(k=>typeof l[k]==='number'&&Number.isFinite(l[k]))||Math.abs(l.x)>60000||Math.abs(l.z)>60000||l.y< -100||l.y>2000||l.height<3||l.height>18)throw Error('В схеме есть некорректные координаты или высоты.');
      return {id:i+1,x:l.x,y:l.y,z:l.z,height:l.height,yaw:l.yaw};
    });
  }
  try{const saved=localStorage.getItem(STORAGE_KEY);if(saved)items=validate(JSON.parse(saved));}catch{status.textContent='Сохранённую схему не удалось прочитать. Можно загрузить её из файла.';}
  nextId=items.length+1;
  function undo(){if(!history.length)return;items=history.pop();selected=null;render();status.textContent='Последнее действие отменено.';}
  panel.addEventListener('click',event=>{
    const el=event.target.closest('button');if(!el)return;
    if(el.dataset.mode){setMode(el.dataset.mode);return;}
    switch(el.dataset.action){
      case 'close':setActive(false);break;
      case 'undo':undo();break;
      case 'clear':if(items.length){checkpoint();items=[];selected=null;render();status.textContent='Фонари убраны. Действие можно отменить.';}break;
      case 'import':panel.querySelector('#lampImport').click();break;
      case 'export':{
        const payload={version:1,coordinateSystem:'baikonur-museum-world',lamps:copy()};
        const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='rockettrip-lighting.json';a.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Схема скачана.';break;
      }
    }
  });
  panel.querySelector('#lampImport').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{if(file.size>2000000)throw Error('Файл слишком большой.');const loaded=validate(JSON.parse(await file.text()));checkpoint();items=loaded;nextId=items.length+1;selected=null;render();status.textContent='Схема загружена: '+items.length+' фонарей.';}
    catch(error){status.textContent='Не удалось загрузить: '+error.message;}
    event.target.value='';
  });
  function cast(x,y){const rect=canvas.getBoundingClientRect();mouse.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);ray.setFromCamera(mouse,camera);}
  function surfaceAt(x,z){
    const down=new THREE.Raycaster(new THREE.Vector3(x,2000,z),new THREE.Vector3(0,-1,0));
    return down.intersectObjects(groundMeshes,false)[0]?.point.y??-2.7;
  }
  function nearestRoad(point){
    let best=null;
    for(const road of roads)for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
      const t=length?THREE.MathUtils.clamp(((point.x-a.x)*dx+(point.z-a.z)*dz)/length,0,1):0;
      const x=a.x+t*dx,z=a.z+t*dz,distance=Math.hypot(point.x-x,point.z-z);
      if(!best||distance<best.distance)best={road,distance};
    }
    return best;
  }
  function addRow(road){
    const step=number('#lampSpacing',12,150),height=number('#lampHeight',3,18),side=panel.querySelector('#lampSide').value;
    const signs=side==='both'?[-1,1]:[side==='left'?1:-1],created=[];
    let covered=0,next=step/2;
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
      if(length<.001)continue;
      while(next<=covered+length){
        const t=(next-covered)/length;
        for(const sign of signs){
          const nx=-dz/length*sign,nz=dx/length*sign;
          const x=a.x+t*dx+nx*(road.width/2+1.4),z=a.z+t*dz+nz*(road.width/2+1.4);
          if(isLightAllowed(x,z)&&!items.some(l=>Math.hypot(l.x-x,l.z-z)<2))created.push({id:nextId++,x,y:surfaceAt(x,z)+.025,z,height,yaw:Math.atan2(nz,-nx)});
        }
        next+=step;
      }
      covered+=length;
    }
    if(!created.length){status.textContent='Здесь уже стоят фонари или участок короче интервала.';return;}
    if(items.length+created.length>LIMIT){status.textContent='Слишком много фонарей. Увеличьте интервал или уберите часть схемы.';return;}
    checkpoint();items.push(...created);render();status.textContent=road.label+': добавлено '+created.length+' фонарей.';
  }
  let down=null;
  canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,button:e.button};});
  canvas.addEventListener('click',event=>{
    if(!active)return;
    event.stopImmediatePropagation();event.preventDefault();
    if(!down||down.button!==0||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;
    cast(event.clientX,event.clientY);
    if(mode==='remove'||mode==='move'&&selected===null){
      const hit=ray.intersectObjects(parts.map(p=>p.mesh),false)[0];
      if(!hit){status.textContent='Нажмите на сам фонарь.';return;}
      const lamp=renderedItems[hit.instanceId];
      if(mode==='remove'){checkpoint();items.splice(items.indexOf(lamp),1);render();status.textContent='Фонарь удалён.';}
      else{selected=lamp.id;render();status.textContent='Теперь нажмите на новое место.';}
      return;
    }
    const hit=ray.intersectObjects(groundMeshes,false)[0];if(!hit){status.textContent='Выберите место на земле.';return;}
    const point=hit.point;
    if(!isLightAllowed(point.x,point.z)){status.textContent='Освещение размещается на стороне космодрома от Сырдарьи.';return;}
    if(mode==='road'){
      const near=nearestRoad(point);
      if(!near||near.distance>Math.max(12,near.road.width*1.5)){status.textContent='Нажмите ближе к выбранной автодороге.';return;}
      addRow(near.road);return;
    }
    if(mode==='single'){
      if(items.length>=LIMIT){status.textContent='Достигнут предел схемы: '+LIMIT+' фонарей.';return;}
      checkpoint();items.push({id:nextId++,x:point.x,y:point.y+.025,z:point.z,height:number('#lampHeight',3,18),yaw:0});
      render();status.textContent='Фонарь установлен.';
    }else if(mode==='move'){
      checkpoint();Object.assign(items.find(l=>l.id===selected),{x:point.x,y:point.y+.025,z:point.z});selected=null;render();status.textContent='Фонарь перемещён.';
    }
  },true);
  document.addEventListener('keydown',event=>{
    if(!active||event.target.matches('input,select,textarea'))return;
    if(event.key==='Escape'){if(selected!==null){selected=null;render();}else setActive(false);}
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo();}
  });
  setMode('single');render();
  return {get active(){return active;},setActive,undo,setEvening(value){evening=!!value;lightField.root.visible=evening;lensMaterial.emissiveIntensity=evening?2.2:.65;},snapshot:()=>({version:1,lamps:copy()}),
    visibleLightPositions:()=>renderedItems.map(l=>[l.x,l.y,l.z]),
    stats:()=>({count:items.length,visibleCount:renderedItems.length,hiddenByBank:items.length-renderedItems.length,active,mode,selected,history:history.length,instancedMeshes:parts.length})};
}
