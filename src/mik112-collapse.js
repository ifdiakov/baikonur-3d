import * as THREE from 'three';
import {MIK112_COLLAPSE_VERSION as VERSION,COLLAPSE_DURATION as DURATION,COLLAPSE_SOURCE as SOURCE,COLLAPSE_NOTICE as NOTICE,COLLAPSE_PHASES,collapsePhase,roofSectionPose,smooth} from './mik112-collapse-sequence.js?v=20261110-v1';
const V=(...a)=>new THREE.Vector3(...a),clamp=THREE.MathUtils.clamp;

function addStyle(){
 if(document.getElementById('mikCollapseStyle'))return;
 const style=document.createElement('style');style.id='mikCollapseStyle';style.textContent=`
 body.mik112-collapse-active #labelLayer,body.mik112-collapse-active #info,body.mik112-collapse-active #museumLeftStack,body.mik112-collapse-active #museumRightStack,body.mik112-collapse-active #timeDock,body.mik112-collapse-active #hero,body.mik112-collapse-active #workshopPanel,body.mik112-collapse-active #navigationGuide{display:none!important}
 #mikCollapsePanel{position:fixed;z-index:150;bottom:16px;left:50%;transform:translateX(-50%);box-sizing:border-box;width:min(740px,calc(100vw - 24px));max-height:45dvh;overflow:auto;background:#10242af5;border:1px solid #b39c7866;border-radius:12px;padding:15px 18px;color:#e7e8df;box-shadow:0 10px 35px #0008;font:12px/1.5 Arial,sans-serif}
 #mikCollapsePanel[hidden]{display:none!important}#mikCollapsePanel header{display:flex;gap:10px;align-items:center;justify-content:space-between}#mikCollapsePanel h2{font-size:18px;margin:0;color:#efdbc1}#mikCollapsePanel p{margin:7px 0}#mikCollapsePanel button,#mikCollapsePanel select{padding:8px 11px;border:1px solid #7791947a;border-radius:5px;background:#263e44;color:#fff;font:600 12px Arial;cursor:pointer;min-height:34px}#mikCollapsePanel button:focus-visible,#mikCollapsePanel input:focus-visible,#mikCollapsePanel select:focus-visible{outline:2px solid #efc28a;outline-offset:2px}#mikCollapsePanel button[aria-pressed=true]{background:#5b5140;border-color:#c8a477}#mikCollapsePanel nav{display:flex;gap:6px;align-items:center;flex-wrap:wrap}#mikCollapseProgress{width:100%;accent-color:#d1b68e;margin:5px 0}#mikCollapsePanel details{font-size:11px;color:#b5c6c7;margin-top:6px}#mikCollapsePanel summary{cursor:pointer}#mikCollapsePanel a{color:#d8c29b}#mikCollapsePanel time{font:12px monospace;color:#c4c9bf;white-space:nowrap}#mikCollapseDate{position:fixed;top:18px;left:20px;z-index:140;font:600 12px Arial;color:#efdfc7;background:#172b30d9;border:1px solid #a6b2b64d;padding:9px 12px;border-radius:7px;pointer-events:none}#mikCollapseDate[hidden]{display:none}#mikCollapseLoading{font-size:11px}
 @media(max-width:650px){#mikCollapsePanel{bottom:8px;padding:10px 12px;max-height:48dvh}#mikCollapsePanel h2{font-size:16px}#mikCollapsePanel p{font-size:11px}#mikCollapseDate{top:10px;left:10px;font-size:10px}#mikCollapsePanel nav{gap:5px}#mikCollapsePanel button,#mikCollapsePanel select{font-size:11px;padding:7px 8px}}
 `;document.head.append(style);
}

// Geometry is built once, only when the visitor requests the scene. All roof
// members are instanced in three draw batches; source asset buffers are shared.
export function createMik112Collapse({root,exhibit,camera,controls,renderer,sourceModel,onStart=()=>{},onStop=()=>{}}){
 if(!root||!exhibit||!sourceModel)throw new Error('МИК или историческая модель ещё не загружены');
 addStyle();
 const historical=root.getObjectByName('МИК · историческая кровля'),modernRuins=root.getObjectByName('МИК · раскрытые разрушенные пролёты');
 if(!historical||!modernRuins)throw new Error('Не найдены группы кровли МИК‑112');
 const group=new THREE.Group();group.name='МИК‑112 · Гибель Бурана · реконструкция';group.visible=false;group.userData.pickable=false;root.add(group);
 const cube=new THREE.BoxGeometry(1,1,1),beamM=new THREE.MeshStandardMaterial({color:0x818b88,roughness:.88,metalness:.2}),roofM=new THREE.MeshStandardMaterial({color:0x75868a,roughness:.95}),debrisM=new THREE.MeshStandardMaterial({color:0xaaa69a,roughness:1});
 const roof=new THREE.InstancedMesh(cube,roofM,36*4),steel=new THREE.InstancedMesh(cube,beamM,36*16),debris=new THREE.InstancedMesh(cube,debrisM,120);
 roof.name='Падающие кровельные плиты · 3 пролёта';steel.name='Падающие стропильные фермы';debris.name='Завал · условное расположение фрагментов';group.add(roof,steel,debris);
 for(const obj of [roof,steel,debris]){obj.frustumCulled=false;obj.receiveShadow=true;obj.castShadow=true;obj.userData.pickable=false;}
 const model=new THREE.Group();model.name='Исторический комплекс · только в реконструкции';
 const mount=exhibit.rocketMounts().hall;model.position.fromArray(mount.position);model.rotation.set(...mount.rotation);model.add(sourceModel.clone(true));group.add(model);
 model.traverse(o=>{delete o.userData.idx;delete o.userData.rocketExhibitKey;o.userData.pickable=false;});
 const cradles=exhibit.reconstructionCradles||null;
 const unitQ=new THREE.Quaternion(),dummy=new THREE.Object3D(),sectionMatrix=new THREE.Matrix4(),local=new THREE.Matrix4();
 const member=(a,b,w)=>{const p=V(...a),d=V(...b).sub(p),l=d.length();return new THREE.Matrix4().compose(p.addScaledVector(d,.5),new THREE.Quaternion().setFromUnitVectors(V(0,1,0),d.normalize()),V(w,l,w));};
 const members=[member([-19,-2.6,0],[19,-2.6,0],.46),member([-19,.2,0],[19,.2,0],.46)];
 for(let i=0;i<7;i++){const x=-19+i*38/6;members.push(member([x,-2.6,0],[x,.2,0],.25));if(i<6)members.push(member([x,i%2?.2:-2.6,0],[x+38/6,i%2?-2.6:.2,0],.25));}
 members.push(member([0,-2.6,-9.8],[0,-2.6,9.8],.28));
 if(members.length!==16)throw new Error('Invalid roof section mesh count');
 for(let i=0;i<120;i++){
  const bay=i%3,j=Math.floor(i/3),x=-93+bay*40+(j*17.13%36),z=-114+(j*53.7+bay*29)%228;
  dummy.position.set(x,4+(j%6)*.7,z);dummy.rotation.set((j%5-2)*.13,j*1.73,(j%7-3)*.12);dummy.scale.set(4+(j%5),.4+(j%3)*.21,3+j%8);dummy.updateMatrix();debris.setMatrixAt(i,dummy.matrix);
 }
 debris.instanceMatrix.needsUpdate=true;
 // A single noisy alpha texture, depth-tested dust (never visible through walls).
 const dustCanvas=document.createElement('canvas');dustCanvas.width=dustCanvas.height=64;const ctx=dustCanvas.getContext('2d'),image=ctx.createImageData(64,64);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4,r=Math.hypot((x-31.5)/31.5,(y-31.5)/31.5),n=.68+.18*Math.sin(x*.63+y*.39)+.14*Math.sin(x*.27-y*.81);image.data.set([170,160,139,Math.round(Math.max(0,1-r*r)**2*clamp(n,0,1)*180)],i);}
 ctx.putImageData(image,0,0);const dustTexture=new THREE.CanvasTexture(dustCanvas);dustTexture.colorSpace=THREE.SRGBColorSpace;
 const dust=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:dustTexture,transparent:true,opacity:.48,depthWrite:false,depthTest:true,side:THREE.DoubleSide}),84);dust.name='Строительная пыль';dust.frustumCulled=false;dust.renderOrder=5;group.add(dust);
 const inverseRootQ=new THREE.Quaternion(),billboardQ=new THREE.Quaternion();
 const panel=document.createElement('section');panel.id='mikCollapsePanel';panel.hidden=true;panel.setAttribute('aria-label','Реконструкция гибели Бурана');
 panel.innerHTML=`<header><h2>Гибель Бурана</h2><time id="mikCollapseClock">0 / ${DURATION} с</time><button id="mikCollapseClose" type="button" aria-label="Закрыть реконструкцию">К карте ×</button></header><p><strong id="mikCollapsePhase"></strong> <span id="mikCollapseFact"></span></p><input id="mikCollapseProgress" aria-label="Момент реконструкции" type="range" min="0" max="${DURATION}" step="0.1" value="0"><nav><button id="mikCollapsePlay" type="button">Пауза</button><button id="mikCollapseRestart" type="button">Сначала</button><button id="mikCollapseTop" type="button">Сверху</button><button id="mikCollapseView" type="button">Общий вид</button><button id="mikCollapseCutaway" type="button" aria-pressed="false">Разрез</button><label>Темп <select id="mikCollapseSpeed" aria-label="Скорость реконструкции"><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label></nav><details><summary>Что известно и что реконструировано</summary><p></p><a target="_blank" rel="noopener noreferrer">Материалы buran.ru ↗</a></details>`;
 panel.querySelector('details p').textContent=NOTICE+' Точная расстановка обломков условна. Используется существующая музейная модель комплекса, а не точная модель состава 11Ф36‑МД. Фотографии источника не копируются.';
 panel.querySelector('a').href=SOURCE;document.body.append(panel);
 const date=document.createElement('div');date.id='mikCollapseDate';date.hidden=true;date.textContent='МИК‑112 · 12 мая 2002 · Визуальная реконструкция';document.body.append(date);
 const el=id=>panel.querySelector('#'+id);let active=false,paused=true,time=0,rate=1,last=null,saved=null,cutaway=false,view='all',lastPaint=-Infinity;
 function draw(t){
  time=clamp(Number(t)||0,0,DURATION);
  let panels=0,beams=0;
  for(let bay=0;bay<3;bay++)for(let j=0;j<12;j++){
   const p=roofSectionPose(bay,j,time);dummy.position.fromArray(p.position);dummy.rotation.set(...p.rotation);dummy.scale.setScalar(1);dummy.updateMatrix();sectionMatrix.copy(dummy.matrix);
   for(let k=0;k<4;k++){local.compose(V(-14.85+k*9.9,.4,0),unitQ,V(9.76,.7,19.6));roof.setMatrixAt(panels++,local.premultiply(sectionMatrix));}
   for(const m of members)steel.setMatrixAt(beams++,local.copy(m).premultiply(sectionMatrix));
  }
  roof.instanceMatrix.needsUpdate=true;steel.instanceMatrix.needsUpdate=true;roof.visible=!cutaway;model.visible=time<11.1;debris.visible=time>=10.4;
  if(cradles)cradles.visible=active;
  root.getWorldQuaternion(inverseRootQ).invert();billboardQ.copy(inverseRootQ).multiply(camera.quaternion);
  let opacityPeak=0;
  for(let i=0;i<84;i++){
   const bay=i%3,j=Math.floor(i/3),born=8.0+(j%12)*.39+bay*.46,age=time-born,life=10+(j%5),p=clamp(age/life,0,1),alpha=age>0&&age<life?smooth(p*6)*(1-smooth((p-.45)/.55)):0;opacityPeak=Math.max(opacityPeak,alpha);
   const s=alpha>0?12+26*Math.sin(Math.PI*p*.6):0;
   dummy.position.set(-85+bay*40+(j*19%32)+(j%2?1:-1)*p*5,7+p*(36+j%19),-108+(j*47%216));dummy.quaternion.copy(billboardQ);dummy.scale.set(s,s*(.7+j%4*.12),1);dummy.updateMatrix();dust.setMatrixAt(i,dummy.matrix);
  }
  dust.visible=opacityPeak>0;dust.material.opacity=.46*opacityPeak;dust.instanceMatrix.needsUpdate=true;
  const phase=collapsePhase(time);el('mikCollapsePhase').textContent=phase.title+'.';el('mikCollapseFact').textContent=phase.text;el('mikCollapseClock').textContent=Math.floor(time)+' / '+DURATION+' с';el('mikCollapseProgress').value=String(time);
  el('mikCollapsePlay').textContent=time===DURATION?'Повторить':paused?'Продолжить':'Пауза';
 }
 function frame(which='all'){
  view=which;const bounds=new THREE.Box3().setFromPoints([V(-100,0,-125),V(100,61,125)]),corners=[];
  root.updateWorldMatrix(true,true);for(const x of [bounds.min.x,bounds.max.x])for(const y of [0,61])for(const z of [bounds.min.z,bounds.max.z])corners.push(root.localToWorld(V(x,y,z)));
  const center=root.localToWorld(V(-10,24,0)),dir=(which==='top'?V(0,1,-.03):V(235,260,-340).normalize()).transformDirection(root.matrixWorld),right=V().crossVectors(dir,V(0,1,0)).normalize(),up=V().crossVectors(right,dir).normalize();
  const width=innerWidth,height=innerHeight,rect={left:18,right:width-18,top:55,bottom:Math.max(140,panel.getBoundingClientRect().top-18)},tv=Math.tan(camera.fov*Math.PI/360),th=tv*width/height,L=2*rect.left/width-1,R=2*rect.right/width-1,B=1-2*rect.bottom/height,T=1-2*rect.top/height;
  let a=-Infinity,b=Infinity,c=-Infinity,d=Infinity,dist=10;
  for(const p of corners){const v=p.clone().sub(center),x=v.dot(right),y=v.dot(up),z=v.dot(dir);a=Math.max(a,x/th+R*z);b=Math.min(b,x/th+L*z);c=Math.max(c,y/tv+T*z);d=Math.min(d,y/tv+B*z);dist=Math.max(dist,z+2);}
  dist=Math.max(dist,(a-b)/(R-L),(c-d)/(T-B))*1.12;
  const target=center.clone().addScaledVector(right,th*(a+b-(R+L)*dist)/2).addScaledVector(up,tv*(c+d-(T+B)*dist)/2);
  controls.enableDamping=false;controls.target.copy(target);camera.position.copy(target).addScaledVector(dir,dist);controls.update();camera.updateMatrixWorld(true);return which;
 }
 function start(){
  if(active){seek(0);play();return true;}onStart();
  saved={camera:camera.position.clone(),target:controls.target.clone(),enabled:controls.enabled,damping:controls.enableDamping,yearDisabled:document.getElementById('year').disabled,visibility:[historical,modernRuins,exhibit.transportersGroup,...root.children.filter(c=>c.userData?.rocketExhibit?.key?.startsWith('tua-'))].map(o=>[o,o.visible])};
  active=true;paused=matchMedia('(prefers-reduced-motion: reduce)').matches;last=null;cutaway=false;el('mikCollapseCutaway').setAttribute('aria-pressed','false');
  for(const [o]of saved.visibility)o.visible=false;document.getElementById('year').disabled=true;group.visible=true;panel.hidden=false;date.hidden=false;document.body.classList.add('mik112-collapse-active');
  controls.enabled=true;draw(0);frame();el('mikCollapsePlay').focus({preventScroll:true});return true;
 }
 function stop({restoreCamera=true}={}){
  if(!active)return false;active=false;paused=true;last=null;group.visible=false;if(cradles)cradles.visible=false;panel.hidden=true;date.hidden=true;document.body.classList.remove('mik112-collapse-active');
  for(const [o,visible]of saved.visibility)o.visible=visible;document.getElementById('year').disabled=saved.yearDisabled;
  controls.enableDamping=false;if(restoreCamera){camera.position.copy(saved.camera);controls.target.copy(saved.target);}controls.update();controls.enableDamping=saved.damping;controls.enabled=saved.enabled;camera.updateMatrixWorld(true);saved=null;onStop();document.getElementById('mik112Collapse')?.focus({preventScroll:true});return true;
 }
 function seek(t){if(!Number.isFinite(Number(t)))return time;paused=true;last=null;draw(t);return time;}
 function play(){if(!active)return false;if(time>=DURATION)draw(0);paused=false;last=null;draw(time);return true;}
 function pause(){paused=true;last=null;draw(time);}
 function update(now=performance.now()){
  if(!active)return;if(last===null)last=now;const dt=clamp((now-last)/1000,0,.12);last=now;
  if(!paused){time=Math.min(DURATION,time+dt*rate);if(time===DURATION)paused=true;}
  if(now-lastPaint>=30||!paused){draw(time);lastPaint=now;}
 }
 el('mikCollapseClose').onclick=()=>stop();el('mikCollapsePlay').onclick=()=>paused?play():pause();el('mikCollapseRestart').onclick=()=>{seek(0);play();};el('mikCollapseTop').onclick=()=>frame('top');el('mikCollapseView').onclick=()=>frame('all');
 el('mikCollapseProgress').oninput=e=>seek(e.target.value);el('mikCollapseSpeed').onchange=e=>{rate=clamp(Number(e.target.value),.5,2);};el('mikCollapseCutaway').onclick=()=>{cutaway=!cutaway;el('mikCollapseCutaway').setAttribute('aria-pressed',String(cutaway));draw(time);frame('top');};
 window.addEventListener('resize',()=>{if(active)frame(view);});document.addEventListener('visibilitychange',()=>{if(active&&document.hidden)pause();});document.addEventListener('keydown',e=>{if(active&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();stop();}},true);
 const stats=()=>({version:VERSION,active,paused,time,duration:DURATION,phase:collapsePhase(time).title,cutaway,roofSections:36,roofInstances:roof.count,steelInstances:steel.count,dustInstances:dust.count,modelVisible:group.visible&&model.visible,defaultExhibitRemoved:true,source:SOURCE,historicalYear:2002,interpretive:true,groupCount:root.children.filter(c=>c===group).length,extraDrawBatches:4,modelsShared:true});
 return {start,stop,seek,play,pause,update,frame,isActive:()=>active,stats};
}
