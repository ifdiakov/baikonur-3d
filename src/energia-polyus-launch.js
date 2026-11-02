import * as THREE from 'three';

// Historical event boundaries are from Buran.ru. Interpolated values below
// are ILLUSTRATIVE telemetry, not downloaded flight-recorder measurements.
export const ENERGIA_LAUNCH_VERSION='energia-polyus-1987-v1';
export const ENERGIA_LAUNCH_START=-90;
export const ENERGIA_LAUNCH_END=600;
export const ENERGIA_LAUNCH_EVENTS=Object.freeze([
 {at:-90,title:'ПРЕДСТАРТОВАЯ ГОТОВНОСТЬ',status:'УКСС · 250-я площадка',fact:'15 мая 1987 года старт ракеты был задержан из-за неполадок с наземными и бортовыми системами.',source:'https://www.buran.ru/htm/gud%2021.htm'},
 {at:-55,title:'ОТВОД ПЕРЕХОДНЫХ СИСТЕМ',status:'Наземные коммуникации',fact:'Переходные связи и площадки обслуживания освобождали ракету по предстартовой циклограмме. Визуальная механика реконструирована.',source:'https://www.buran.ru/htm/cargo.htm'},
 {at:-50,title:'ОТВОД ПЛОЩАДКИ ОБСЛУЖИВАНИЯ',status:'2 ЗДМ · по архивной циклограмме',fact:'За 50 секунд до старта начала отходить площадка обслуживания 2 ЗДМ.',source:'https://www.buran.ru/htm/cargo.htm'},
 {at:-45,title:'ДОЖИГАНИЕ НА СТАРТЕ',status:'Газоотводный тракт',fact:'За 45 секунд до старта включили систему дожигания стартового комплекса. Подача воды в газоотвод работала с затруднениями.',source:'https://www.buran.ru/htm/cargo.htm'},
 {at:-14.4,title:'ЗАПУСК ДВИГАТЕЛЕЙ БЛОКА Ц',status:'4 двигателя РД-0120',fact:'Кислородно-водородные двигатели центрального блока начали работать за 14,4 секунды до отрыва.',source:'https://www.buran.ru/htm/cargo.htm'},
 {at:-3.2,title:'ЗАПУСК ДВИГАТЕЛЕЙ БЛОКОВ А',status:'4 двигателя РД-170',fact:'За 3,2 секунды до старта включились двигатели боковых блоков; суммарная тяга на старте — около 3550 тонн-сил.',source:'https://www.buran.ru/htm/rocrt.htm'},
 {at:0,title:'КОНТАКТ ПОДЪЁМА',status:'21:30 МСК · 15 мая 1987',fact:'В 21:30 «Энергия» №6СЛ стартовала с УКСС, неся на борту экспериментальный аппарат «Полюс» («Скиф-ДМ»).',source:'https://www.buran.ru/htm/newsold15.htm'},
 {at:3,title:'ПЕРВЫЕ СЕКУНДЫ ПОЛЁТА',status:'Кратковременный кивок ракеты',fact:'Сразу после отрыва был заметен необычный наклон в плоскости тангажа. Он был связан с алгоритмом управления и затем прекратился.',source:'https://www.buran.ru/htm/gud%2021.htm'},
 {at:30,title:'ДРОССЕЛИРОВАНИЕ БЛОКА Ц',status:'Режим первой минуты',fact:'По воспоминаниям Б. И. Губанова, на 30-й секунде центральные двигатели переводились на дросселированный режим.',source:'https://www.buran.ru/htm/35-3.htm'},
 {at:39,title:'РЕГУЛИРОВАНИЕ ТЯГИ БОКОВЫХ БЛОКОВ',status:'Ограничение перегрузок',fact:'С 39-й секунды регулировалась тяга боковых блоков для ограничения скоростного напора и продольной перегрузки.',source:'https://www.buran.ru/htm/35-3.htm'},
 {at:241,title:'СБРОС ГОЛОВНОГО ОБТЕКАТЕЛЯ',status:'Исторический этап, без точной визуальной модели',fact:'Согласно опубликованной программе полёта «Полюса», сброс защитного обтекателя приходился примерно на Т+241 с.',source:'https://www.buran-energia.com/polious/polious-desc.php'},
 {at:460,title:'ОТДЕЛЕНИЕ «ПОЛЮСА»',status:'Высота 110 км · архивная отметка',fact:'«Энергия» успешно выполнила свою программу. «Полюс» отделился приблизительно на высоте 110 км, но это ещё не означало выхода на орбиту.',source:'https://www.buran.ru/htm/cargo.htm'},
 {at:511,title:'РАЗВОРОТ «ПОЛЮСА»',status:'Манёвр для торможения вращения и коррекции',fact:'Аппарат начал разворот на 180° после отделения. Из-за ошибки системы управления вращение не было своевременно остановлено.',source:'https://www.buran.ru/htm/cargo.htm'},
 {at:568,title:'ОРБИТА НЕ ДОСТИГНУТА',status:'«Полюс» перешёл на баллистическую траекторию',fact:'Разгонный импульс не обеспечил запланированную орбиту: аппарат впоследствии вошёл в атмосферу и упал в Тихом океане.',source:'https://www.buran.ru/htm/str163.htm'},
 {at:600,title:'ИСПЫТАНИЕ «ЭНЕРГИИ» УСПЕШНО',status:'Носитель отработал; экспериментальная нагрузка потеряна',fact:'Первый пуск подтвердил работоспособность сверхтяжёлой «Энергии». Её второй и последний пуск состоялся 15 ноября 1988 года с «Бураном».',source:'https://www.buran-energia.com/blog/2012/05/15/25th-anniversary-of-the-energias-flight/lang/en/'}
]);
const MODEL_POINTS=[
 [0,0,0,0],[3,.08,.03,.02],[15,.8,.26,.2],[30,3.5,.58,1.4],[39,7.3,.85,3.8],
 [90,25,1.8,24],[150,56,2.7,74],[212,90,4.25,145],[241,95,4.9,184],
 [340,104,6.5,302],[460,110,7.45,482],[511,124,7.3,542],[568,142,7.1,608],[600,155,6.9,635]
];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const fmt=(v,d=1)=>Number(v).toLocaleString('ru-RU',{maximumFractionDigits:d,minimumFractionDigits:d});
const clock=t=>(t<0?'T−':'T+')+String(Math.abs(Math.floor(t))).padStart(3,'0')+' c';
function pointAt(t){
 if(t<=0)return [0,0,0];
 for(let i=1;i<MODEL_POINTS.length;i++)if(t<=MODEL_POINTS[i][0]){
  const a=MODEL_POINTS[i-1],b=MODEL_POINTS[i],u=(t-a[0])/(b[0]-a[0]);
  return [mix(a[1],b[1],u),mix(a[2],b[2],u),mix(a[3],b[3],u)];
 }
 return MODEL_POINTS.at(-1).slice(1);
}
export function sampleEnergiaLaunch(time){
 const t=clamp(Number(time)||0,ENERGIA_LAUNCH_START,ENERGIA_LAUNCH_END);
 const phase=Math.max(0,ENERGIA_LAUNCH_EVENTS.findLastIndex(e=>t>=e.at));
 const [altitudeKm,speedKmS,downrangeKm]=pointAt(t);
 const ignition=clamp(smooth(-14.4,-9.0,t)*.28+smooth(-3.2,0,t)*.72,0,1);
 const exhaust=t<0?ignition:t<460?1:t<468?1-smooth(460,468,t):0;
 const nosePitch=t<0?0:t<7?9*Math.sin(Math.PI*clamp(t/7,0,1)):Math.min(38,3+(t-7)*.17);
 return {time:t,phase,phaseTitle:ENERGIA_LAUNCH_EVENTS[phase].title,altitudeKm,speedKmS,downrangeKm,
  pitchDegrees:nosePitch,ignition,exhaust,prepared:t>=-50,release:t>=0,
  payloadSeparated:t>=460,payloadTurn:t>=511,failedOrbit:t>=568};
}

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function simpleRod(a,b,r,color,name,parent){
 const start=V(...a),end=V(...b),delta=end.clone().sub(start);
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),9),new THREE.MeshStandardMaterial({color,metalness:.58,roughness:.44}));
 mesh.position.copy(start).add(end).multiplyScalar(.5);
 mesh.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());mesh.name=name;mesh.castShadow=false;parent.add(mesh);
 return mesh;
}
function makeBillow(parent,count,color,opacity,name){
 const mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({
  color,roughness:1,metalness:0,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide
 }),count);
 mesh.name=name;mesh.count=count;mesh.frustumCulled=false;mesh.renderOrder=28;mesh.userData.pickable=false;parent.add(mesh);
 const tint=new THREE.Color();
 for(let i=0;i<count;i++){const shade=.7+((i*47%127)/127)*.52;tint.setRGB(shade,shade,shade);mesh.setColorAt(i,tint);}
 mesh.instanceColor.needsUpdate=true;
 return mesh;
}
function makeGlow(width,depth,material){
 const disk=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),material);disk.rotation.x=-Math.PI/2;
 disk.renderOrder=32;disk.userData.pickable=false;return disk;
}
function flameMaterial(color){
 return new THREE.ShaderMaterial({
  uniforms:{uPower:{value:0},uTime:{value:0},uTint:{value:new THREE.Color(color)}},
  vertexShader:['varying vec2 vUv;','void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'].join('\n'),
  fragmentShader:['uniform float uPower;','uniform float uTime;','uniform vec3 uTint;','varying vec2 vUv;',
   'void main(){float n=sin(vUv.x*43.0+uTime*10.0)*sin(vUv.y*32.0-uTime*7.0);',
   'float flicker=.78+.22*n;float edge=1.0-smoothstep(.80,1.0,vUv.y);',
   'vec3 core=mix(uTint,vec3(1.0,.98,.72),pow(vUv.y,.9));',
   'float alpha=uPower*flicker*edge*(.60+.26*sin(uTime*2.5+vUv.x*13.0));',
   'gl_FragColor=vec4(core*1.6,clamp(alpha,0.0,.86));}'].join('\n'),
  transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false
 });
}
function glowMaterial(color){
 return new THREE.ShaderMaterial({
  uniforms:{uPower:{value:0},uTint:{value:new THREE.Color(color)}},
  vertexShader:['varying vec2 vUv;','void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'].join('\n'),
  fragmentShader:['uniform float uPower;uniform vec3 uTint;varying vec2 vUv;',
   'void main(){float r=length((vUv-.5)*2.0);float falloff=pow(max(0.0,1.0-r),2.2);',
   'gl_FragColor=vec4(uTint*1.8,uPower*falloff*.67);}'].join('\n'),
  transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide
 });
}
function addEffectSystem(siteRoot){
 const root=new THREE.Group();root.name='Энергия — Полюс · огонь, дым и газоход';root.visible=false;root.userData.pickable=false;siteRoot.add(root);
 const glow=glowMaterial(0xff721d),pitGlow=makeGlow(240,220,glow);pitGlow.position.set(5,5.95,0);root.add(pitGlow);
 const trenchMat=glowMaterial(0xff5b18),trenchGlow=makeGlow(340,85,trenchMat);trenchGlow.position.set(130,.6,0);root.add(trenchGlow);
 const outerMat=glowMaterial(0xf15a24),outerGlow=makeGlow(550,400,outerMat);outerGlow.position.set(15,.2,10);root.add(outerGlow);
 const innerSmoke=makeBillow(root,175,0xd7d1c5,.48,'Белый пар · холодные магистрали');
 const ductSmoke=makeBillow(root,260,0x787980,.55,'Газоход · турбулентная дымовая масса');
 const fieldSmoke=makeBillow(root,200,0x696765,.42,'Площадка · стелющийся дым');
 const sparks=makeBillow(root,95,0xffa744,.9,'Огневой выброс · светящиеся частицы');
 sparks.material.emissive=new THREE.Color(0xff6c16);sparks.material.emissiveIntensity=3.3;
 const flameRoot=new THREE.Group();flameRoot.name='Реактивные факелы';root.add(flameRoot);
 const coreMat=flameMaterial(0xffb240),fireMat=flameMaterial(0xff470d);
 for(let i=0;i<8;i++){
  const x=i<4?[-5,-2,2,5][i]:[-6,-2,2,6][i-4],z=i<4?0:[-5,-5,5,5][i-4];
  const m=new THREE.Mesh(new THREE.CylinderGeometry(i<4?1.0:1.3,i<4?3.5:5.1,i<4?29:37,16,3,true),i<4?coreMat:fireMat);
  m.position.set(x,-17-(i>=4?3:0),z);m.rotation.z=(i%2?-.035:.035);m.userData.pickable=false;flameRoot.add(m);
 }
 // Supplementary articulated details are deliberately separate from the
 // imported source model. Their motion is museum interpolation, not CAD data.
 const arms=[];
 for(const [y,z] of [[23,-3],[46,0],[68,3],[84,6]]){
  const pivot=new THREE.Group();pivot.position.set(-32,y,z);root.add(pivot);
  const arm=new THREE.Mesh(new THREE.BoxGeometry(29,1.2,2),new THREE.MeshStandardMaterial({color:0x8e9b85,metalness:.72,roughness:.3}));
  arm.position.x=14.5;arm.name='Дополнительная механизация · отвод фермы';pivot.add(arm);
  simpleRod([0,0,-1],[29,0,-1],.19,0xc7b995,'Поручень',pivot);
  arms.push(pivot);
 }
 const support=[];
 for(const [x,z,sign]of[[-11,-10,-1],[11,-10,1],[-11,10,-1],[11,10,1]]){
  const pivot=new THREE.Group();pivot.position.set(x,5.5,z);root.add(pivot);
  const strut=new THREE.Mesh(new THREE.BoxGeometry(6,.85,2.5),new THREE.MeshStandardMaterial({color:0x9d8f63,metalness:.62,roughness:.33}));
  strut.position.x=sign*2.5;pivot.add(strut);support.push({pivot,sign});
 }
 const lights=[
  [0,20,0,0xfff2b3,0,300], [45,-2,0,0xff9c30,0,280],[175,6,0,0xff6519,0,420],
  [-60,20,-90,0xffa965,0,370],[60,14,90,0xffa965,0,370]
 ].map(([x,y,z,color,intensity,distance])=>{const light=new THREE.PointLight(color,intensity,distance,1.1);light.position.set(x,y,z);root.add(light);return light;});
 const mtx=new THREE.Matrix4(),pos=V(),scale=V(),q=new THREE.Quaternion();
 const write=(mesh,seconds,kind,amount)=>{
  const count=mesh.count;
  for(let i=0;i<count;i++){
   const r1=(i*37%211)/211,r2=(i*97%257)/257,r3=(i*23%199)/199;
   const cycle=kind==='steam'?5.8:kind==='duct'?7.2:kind==='field'?12:2.3;
   const start=kind==='steam'?-90:kind==='sparks'?-3.2:-14.4;
   const life=Math.max(0,seconds-start),u=((life/cycle)*(kind==='steam'?.31:kind==='sparks'?1.35:.55)+r1)%1;
   const swirl=Math.sin(u*18+i*.91)*.5+Math.cos(u*8+i*.23)*.5;
   let x=0,y=0,z=0,size=.01;
   if(kind==='steam'){
    x=-46+Math.sin(i*1.73)*11;y=5+u*55;z=-19+(i*83%73)/2;
    size=(2.2+u*8)*(1+.2*r2);
   }else if(kind==='duct'){
    x=15+Math.pow(u,1.12)*272;
    const width=13+35*u;z=(r2*2-1)*width+swirl*6;
    y=-23+u*37+Math.sin(i*.7)*4;
    size=(3+u*20)*(1+.4*r3);
   }else if(kind==='field'){
    const ang=2*Math.PI*r2,u2=Math.pow(u,.8);
    x=Math.cos(ang)*(18+u2*140)+(u2*35);
    z=Math.sin(ang)*(19+u2*115);
    y=3+u2*21+Math.sin(i*.81+u*9)*3;
    size=(4+u2*25)*(1+.32*r3);
   }else{
    x=18+u*210+Math.sin(i*.31)*19;z=(r2*2-1)*(8+u*27);y=-21+u*30;
    size=(.65+1.25*r3)*(1-u*.8);
   }
   size*=amount>0?1:.001;
   pos.set(x,y,z);scale.set(size,size*(kind==='duct'?1.2:1),size);mtx.compose(pos,q,scale);mesh.setMatrixAt(i,mtx);
  }
  mesh.instanceMatrix.needsUpdate=true;
 };
 function pose(s){
  const t=s.time;
  const fire=s.exhaust;root.visible=true;
  const exhaustAtGround=fire*(1-smooth(22,75,t));
  const after=smooth(-3,2,t)*(1-smooth(35,175,t));
  glow.uniforms.uPower.value=exhaustAtGround*.98;
  trenchMat.uniforms.uPower.value=exhaustAtGround*.95;
  outerMat.uniforms.uPower.value=exhaustAtGround*.55;
  coreMat.uniforms.uPower.value=fire;
  fireMat.uniforms.uPower.value=fire*.85;
  coreMat.uniforms.uTime.value=t;fireMat.uniforms.uTime.value=t;
  const platformRetreat=smooth(-53,-37,t),clampRelease=smooth(-3,1.5,t);
  arms.forEach((arm,i)=>{arm.rotation.y=-platformRetreat*(.8+i*.065);arm.visible=t<15;});
  for(const item of support)item.pivot.rotation.z=item.sign*clampRelease*.65;
  const vapor=(1-smooth(-4,27,t))*(.35+.65*smooth(-90,-60,t));
  write(innerSmoke,t,'steam',vapor);
  write(ductSmoke,t,'duct',exhaustAtGround+after*.4);
  write(fieldSmoke,t,'field',after);
  write(sparks,t,'sparks',exhaustAtGround);
  for(const [i,light]of lights.entries()){
   const wobble=.94+.06*Math.sin(t*13+i*1.7);
   light.intensity=(i<2?140:90)*(i===0?fire:i===1?exhaustAtGround:i===2?after:exhaustAtGround*.8)*wobble;
  }
  flameRoot.visible=fire>0.005;
  flameRoot.position.y=6+visualHeight(s.altitudeKm)/.14;
  flameRoot.scale.y=1+.15*Math.sin(t*14);
  return {smoke:after,lightIntensity:lights.map(l=>l.intensity),armsReopen:platformRetreat,ductPower:exhaustAtGround,flamePower:fire};
 }
 function dispose(){
  root.traverse(o=>{if(o.isMesh){o.geometry?.dispose();o.material?.dispose();}});
  root.removeFromParent();
 }
 return {root,pose,dispose};
}
function visualHeight(altKm){
 return altKm<1?altKm*140:140+Math.log1p(altKm-1)*265;
}

export function createEnergiaPolyusLaunch({scene,camera,controls,siteRoot,getEntry,onStart=()=>null,onStop=()=>{}}){
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('./energia-polyus-launch.css?v=20261102-energia-polyus-v1',import.meta.url);document.head.append(stylesheet);
 const panel=document.createElement('section');panel.id='energiaLaunchPanel';panel.hidden=true;panel.setAttribute('aria-label','Энергия — Полюс: реконструкция запуска 15 мая 1987 года');
 panel.innerHTML=[
  '<header class="energia-event-head"><div><span class="energia-kicker">15 МАЯ 1987 · УКСС · ПЛ. 250</span><h2>ЭНЕРГИЯ — ПОЛЮС</h2><span class="energia-tag">ИСТОРИЧЕСКАЯ РЕКОНСТРУКЦИЯ</span></div><button type="button" id="energiaClose" title="Закрыть сценарий" aria-label="Закрыть сценарий">×</button></header>',
  '<div class="energia-primary"><div><span class="energia-small">ПРОШЕДШЕЕ ВРЕМЯ</span><strong id="energiaClock">T−090 c</strong></div><div><span class="energia-small">СТАДИЯ</span><strong id="energiaStage">ПРЕДСТАРТОВАЯ ГОТОВНОСТЬ</strong></div></div>',
  '<div class="energia-telemetry"><div><span>ВЫСОТА</span><strong id="energiaAltitude">0,0 <em>км</em></strong></div><div><span>СКОРОСТЬ</span><strong id="energiaVelocity">0,00 <em>км/с</em></strong></div><div><span>УДАЛЕНИЕ</span><strong id="energiaRange">0,0 <em>км</em></strong></div><div><span>ТАНГАЖ</span><strong id="energiaPitch">0,0 <em>°</em></strong></div></div>',
  '<div class="energia-status"><span class="energia-status-dot"></span><span id="energiaStatus">ПОДГОТОВКА СТАРТА</span></div>',
  '<div class="energia-fact"><div class="energia-fact-label">ИЗ АРХИВА</div><h3 id="energiaFactTitle">Первый полёт сверхтяжёлой ракеты</h3><p id="energiaFactText"></p><a id="energiaFactSource" href="https://www.buran.ru/htm/cargo.htm" target="_blank" rel="noopener noreferrer">Источник: Buran.ru</a></div>',
  '<div class="energia-timeline"><div class="energia-timeline-caption"><span>ЦИКЛОГРАММА</span><output id="energiaPosition">T−090 / T+600 c</output></div><input id="energiaSeek" type="range" min="-90" max="600" step="0.1" value="-90" aria-label="Перемотка исторической реконструкции"><div class="energia-ticks"><span>Т−90</span><span>СТАРТ</span><span>+241</span><span>+460</span><span>+600</span></div></div>',
  '<div class="energia-actions"><button id="energiaPlay" type="button">ПАУЗА</button><button id="energiaRestart" type="button">СНАЧАЛА</button><label>СКОРОСТЬ <select id="energiaSpeed"><option value="1">×1</option><option value="4">×4</option><option value="8" selected>×8</option><option value="20">×20</option></select></label></div>',
  '<div class="energia-cameras" role="group" aria-label="Выбор ракурса"><button data-energia-camera="auto" aria-pressed="true">АВТО</button><button data-energia-camera="pad">УКСС</button><button data-energia-camera="duct">ГАЗОХОД</button><button data-energia-camera="follow">ЗА РАКЕТОЙ</button></div>',
  '<details class="energia-disclaimer"><summary>О точности реконструкции и источниках</summary><p>Дата, время старта и документированные события подтверждены архивом. Высота 110 км в T+460 c — архивная отметка. Промежуточные значения скорости, высоты, удаления и тангажа — демонстрационная интерполяция, не реальная телеметрия. Геометрия факелов, дым, работа механизмов и камера — художественно-техническая реконструкция по фотографиям УКСС. Визуальный масштаб полёта сжат относительно земной поверхности.</p><p>Источники: <a href="https://www.buran.ru/htm/cargo.htm" target="_blank" rel="noopener noreferrer">Buran.ru — «Полюс»</a> · <a href="https://www.buran.ru/htm/gud%2021.htm" target="_blank" rel="noopener noreferrer">В. Е. Гудилин</a> · <a href="https://www.buran.ru/htm/rocrt.htm" target="_blank" rel="noopener noreferrer">РД-170 / РД-0120</a>.</p></details>'
 ].join('');
 document.body.append(panel);
 const $=id=>panel.querySelector('#'+id);
 let active=false,paused=false,speed=8,seconds=ENERGIA_LAUNCH_START,lastNow=null,mode='auto',saved=null,sceneRestore=null;
 let effects=null,lastPhase=-1,originalRocket=null,lastFrame=null,modelReady=false,preview=null;
 const source=()=>getEntry?.();
 function ensure(){
  const entry=source();if(!entry||entry.status!=='ready')return false;
  if(!effects)effects=addEffectSystem(siteRoot);
  modelReady=true;return true;
 }
 const poseRocket=(sample)=>{
  const entry=source();if(!entry||!originalRocket)return;
  const origin=originalRocket.position,world=visualHeight(sample.altitudeKm);
  const sideways=sample.downrangeKm*.42,fore=-sample.downrangeKm*.28;
  entry.holder.position.set(origin.x+sideways/.14,origin.y+world/.14,origin.z+fore/.14);
  entry.holder.rotation.set(originalRocket.rotation.x+sample.pitchDegrees*Math.PI/180,originalRocket.rotation.y,originalRocket.rotation.z);
  entry.holder.visible=sample.time<470;
 };
 function scenePose(modeName,s){
  const worldPos=source().holder.getWorldPosition(V()),base=siteRoot.localToWorld(V(0,20,0));
  let target,eye;
  if(modeName==='duct'){
   target=siteRoot.localToWorld(V(95,-12,0));
   eye=siteRoot.localToWorld(V(230,95,215));
  }else if(modeName==='pad'){
   target=siteRoot.localToWorld(V(0,25,0));
   eye=siteRoot.localToWorld(V(255,145,325));
  }else {
   const offset=s.altitudeKm>3?V(33,22,44):V(52,40,74);
   target=worldPos.clone().add(V(0,4,0));
   eye=target.clone().add(offset);
  }
  return {eye,target};
 }
 const updateCamera=s=>{
  const key=mode==='auto'?(s.time<0?'pad':s.time<7?'duct':'follow'):mode;
  const p=scenePose(key,s),blend=mode==='auto'?.085:.22;
  camera.position.lerp(p.eye,blend);
  controls.target.lerp(p.target,blend);
  controls.update();
 };
 function visualPayload(sample){
  if(!preview)return;
  preview.visible=sample.payloadSeparated;
  if(!preview.visible)return;
  const entry=source(),position=entry.holder.getWorldPosition(V());
  preview.position.copy(siteRoot.worldToLocal(position.clone().add(V(12,3,0))));
  preview.rotation.x=sample.payloadTurn?(sample.time-511)*Math.PI/100:0;
 }
 function render(){
  if(!active)return;
  const s=sampleEnergiaLaunch(seconds);
  poseRocket(s);
  if(effects)lastFrame=effects.pose(s);
  visualPayload(s);
  const event=ENERGIA_LAUNCH_EVENTS[s.phase];
  $('energiaClock').textContent=clock(seconds);
  $('energiaStage').textContent=event.title;
  $('energiaAltitude').innerHTML=fmt(s.altitudeKm,1)+' <em>км</em>';
  $('energiaVelocity').innerHTML=fmt(s.speedKmS,2)+' <em>км/с</em>';
  $('energiaRange').innerHTML=fmt(s.downrangeKm,1)+' <em>км</em>';
  $('energiaPitch').innerHTML=fmt(s.pitchDegrees,1)+' <em>°</em>';
  $('energiaStatus').textContent=event.status;
  if(s.phase!==lastPhase){
   lastPhase=s.phase;$('energiaFactTitle').textContent=event.title;
   $('energiaFactText').textContent=event.fact;
   $('energiaFactSource').href=event.source;
   $('energiaFactSource').textContent=event.source.includes('buran-energia')?'Источник: Buran-Energia':'Источник: Buran.ru';
  }
  $('energiaSeek').value=String(seconds);
  $('energiaSeek').style.setProperty('--energia-progress',((seconds-ENERGIA_LAUNCH_START)/(ENERGIA_LAUNCH_END-ENERGIA_LAUNCH_START)*100).toFixed(3)+'%');
  $('energiaPosition').textContent=clock(seconds)+' / T+600 с';
  $('energiaPlay').textContent=seconds>=600?'ПОВТОРИТЬ':paused?'ПРОДОЛЖИТЬ':'ПАУЗА';
  for(const b of panel.querySelectorAll('[data-energia-camera]'))b.setAttribute('aria-pressed',String(b.dataset.energiaCamera===mode));
 }
 function createPayloadProxy(){
  if(preview)return;
  preview=new THREE.Group();preview.name='Полюс · схема отделения';siteRoot.add(preview);
  const body=new THREE.Mesh(new THREE.CylinderGeometry(2.05,2.05,30,20),new THREE.MeshStandardMaterial({color:0x252930,metalness:.56,roughness:.55}));
  body.rotation.z=Math.PI/2;preview.add(body);
  const cap=new THREE.Mesh(new THREE.ConeGeometry(2.05,6,20),new THREE.MeshStandardMaterial({color:0xd9d9d5,metalness:.35,roughness:.56}));
  cap.rotation.z=-Math.PI/2;cap.position.x=-17;preview.add(cap);
  preview.visible=false;preview.userData.pickable=false;
 }
 function start(){
  if(!ensure())return false;
  const entry=source();
  if(!active){
   saved={camera:camera.position.clone(),target:controls.target.clone(),enabled:controls.enabled,damping:controls.enableDamping,rocketVisible:entry.holder.visible};
   originalRocket={position:entry.holder.position.clone(),rotation:entry.holder.rotation.clone()};
   sceneRestore=onStart?.()||null;
   active=true;panel.hidden=false;document.body.classList.add('energia-launch-active');effects.root.visible=true;
   controls.enableDamping=false;controls.enabled=false;createPayloadProxy();
  }
  seconds=ENERGIA_LAUNCH_START;paused=false;speed=Number($('energiaSpeed').value)||8;lastNow=null;lastPhase=-1;mode='auto';
  render();const frame=scenePose('pad',sampleEnergiaLaunch(seconds));camera.position.copy(frame.eye);controls.target.copy(frame.target);controls.update();
  return true;
 }
 function stop({releaseCamera=true}={}){
  if(!active)return false;
  active=false;paused=false;lastNow=null;panel.hidden=true;document.body.classList.remove('energia-launch-active');
  const entry=source();
  if(originalRocket&&entry){
   entry.holder.position.copy(originalRocket.position);
   entry.holder.rotation.copy(originalRocket.rotation);
   entry.holder.visible=saved.rocketVisible;
  }
  if(effects)effects.root.visible=false;
  if(preview)preview.visible=false;
  sceneRestore?.();sceneRestore=null;
  if(saved){
   controls.enabled=saved.enabled;controls.enableDamping=false;controls.update();
   if(releaseCamera){camera.position.copy(saved.camera);controls.target.copy(saved.target);controls.update();}
   controls.enableDamping=saved.damping;
  }
  onStop?.();saved=null;originalRocket=null;lastPhase=-1;return true;
 }
 function pause(){paused=true;lastNow=null;render();}
 function play(){if(seconds>=ENERGIA_LAUNCH_END)seconds=ENERGIA_LAUNCH_START;paused=false;lastNow=null;render();}
 function seek(value){if(!active&&!start())return false;seconds=clamp(Number(value)||0,ENERGIA_LAUNCH_START,ENERGIA_LAUNCH_END);pause();return true;}
 $('energiaClose').onclick=()=>stop();
 $('energiaPlay').onclick=()=>seconds>=ENERGIA_LAUNCH_END?start():paused?play():pause();
 $('energiaRestart').onclick=()=>start();
 $('energiaSpeed').onchange=e=>{speed=Number(e.target.value)||8;lastNow=null;};
 $('energiaSeek').oninput=e=>seek(e.target.value);
 for(const button of panel.querySelectorAll('[data-energia-camera]'))button.onclick=()=>{
  mode=button.dataset.energiaCamera;render();const p=scenePose(mode==='auto'?'pad':mode,sampleEnergiaLaunch(seconds));camera.position.copy(p.eye);controls.target.copy(p.target);controls.update();
 };
 const leave=e=>{if(active&&e.target.closest('button,a,input,select,summary')&&!e.target.closest('#energiaLaunchPanel,#energiaLaunchStart,#modelInspector'))stop({releaseCamera:false});};
 document.addEventListener('pointerdown',leave,{capture:true});
 document.addEventListener('keydown',e=>{
  if(!active||/input|textarea|select/i.test(e.target?.tagName||''))return;
  if(e.key==='Escape'){e.preventDefault();stop();}
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)&&mode==='auto')mode='pad';
 });
 window.addEventListener('resize',()=>{lastNow=null;});
 document.addEventListener('visibilitychange',()=>{lastNow=null;});
 return {start,stop,pause,play,seek,isActive:()=>active,stats:()=>({version:ENERGIA_LAUNCH_VERSION,active,paused,speed,time:seconds,mode,phase:lastPhase,telemetry:sampleEnergiaLaunch(seconds),
   modelReady,rocketAtMount:!active,effects:effects?{visible:effects.root.visible,gasChannel:'single +X petal',instancedSmokeCount:635,gasPower:lastFrame?.ductPower,flamePower:lastFrame?.flamePower,lightIntensity:lastFrame?.lightIntensity}:null}),
  update(now){
   if(!active)return;
   if(lastNow!==null&&!paused&&!document.hidden)seconds=Math.min(ENERGIA_LAUNCH_END,seconds+Math.max(0,(now-lastNow)/1000)*speed);
   lastNow=now;if(seconds>=ENERGIA_LAUNCH_END)paused=true;
   const s=sampleEnergiaLaunch(seconds);
   render();updateCamera(s);
  }};
}
