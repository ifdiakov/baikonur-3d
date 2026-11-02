import * as THREE from 'three';

// Historical event boundaries are from Buran.ru. Interpolated values below
// are ILLUSTRATIVE telemetry, not downloaded flight-recorder measurements.
export const ENERGIA_LAUNCH_VERSION='energia-polyus-1987-v2-realtime';
export const ENERGIA_LAUNCH_START=-90;
export const ENERGIA_LAUNCH_END=600;
export const ENERGIA_LAUNCH_EVENTS=Object.freeze([
 {at:-90,title:'ПРЕДСТАРТОВАЯ ГОТОВНОСТЬ',status:'УКСС · пл. 250 · 15 мая 1987',fact:'Первый старт «Энергии» состоялся в 21:30:02 по московскому времени. Комплекс простоял на УКСС несколько месяцев, пережив морозы, жару и пылевые бури.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:-80,title:'ПЕРЕХОД НА БОРТОВОЕ ПИТАНИЕ',status:'Бортовые системы контроля',fact:'За 80 секунд до контакта подъёма система управления перешла на бортовое электропитание.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:-65,title:'ПРЕДСТАРТОВЫЙ НАДДУВ',status:'Кислород и водород · блок Ц',fact:'Криогенные компоненты требовали точного управления более чем четырьмя тысячами исполнительных органов. При заправке водородный бак укорачивался примерно на 250 мм.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:-50,title:'ОТВОД ПЛОЩАДОК ОБСЛУЖИВАНИЯ',status:'Наземная механизация · реконструкция',fact:'Огромный комплекс «Энергия — Полюс» вывезли на УКСС в феврале 1987 года; подготовка к историческому пуску шла несколько месяцев.',source:'https://www.buran.ru/htm/cargo.htm'},
 {at:-40,title:'РАСКРУТКА НАСОСОВ РД-0120',status:'Блок Ц · предстартовая циклограмма',fact:'За сорок секунд до пуска началась раскрутка бустерного насоса кислородно-водородных двигателей.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:-22,title:'СИСТЕМА ДОЖИГАНИЯ ВОДОРОДА',status:'Предупреждение накопления водорода',fact:'Перед запуском двигателей включались зажигательные устройства системы дожигания неотреагировавшего водорода.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:-10,title:'ВОДЯНАЯ СИСТЕМА ПЕРВОГО ЯРУСА',status:'Орошение · газоотводный канал',fact:'За десять секунд до старта началась подача воды первого яруса. В нашей сцене пар и факелы показаны художественно.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:-9.4,title:'ЗАПУСК ДВИГАТЕЛЕЙ БЛОКА Ц',status:'РД-0120 · кислород / водород',fact:'В опубликованной циклограмме первый запуск четырёх РД-0120 начинается на отметке T−9,4 секунды.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:-5.4,title:'РД-0120 · ПРЕДВАРИТЕЛЬНАЯ ТЯГА',status:'Контроль устойчивой работы двигателя',fact:'Центральные двигатели вышли на предварительную ступень тяги за 5,4 секунды до подъёма.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:-3.2,title:'ЗАПУСК ДВИГАТЕЛЕЙ БЛОКОВ А',status:'4 × РД-170 · основная тяга',fact:'За 3,2 секунды до старта запускаются РД-170 боковых блоков. Их включение превращает УКСС в ослепительно освещённую стартовую сцену.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:-1,title:'КОНТРОЛЬ ТУРБОНАСОСОВ',status:'Блокировка и аварийная защита',fact:'В финальную секунду проверяются обороты турбонасосных агрегатов и работа системы аварийной защиты.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:0,title:'КОНТАКТ ПОДЪЁМА',status:'21:30:02 МСК · 15 мая 1987',fact:'Ракета-носитель №6СЛ стартует с универсального комплекса стенд-старт 17П31. С этого момента часы идут в реальном времени 1:1.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:3,title:'АВТОМАТ СТАБИЛИЗАЦИИ',status:'Штатный наклон в сторону полезного груза',fact:'Сразу после отрыва заметен характерный наклон ракеты; затем включается автомат стабилизации и корректирует движение.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:5,title:'ПРОГРАММНЫЙ РАЗВОРОТ ПО ТАНГАЖУ',status:'Начало программного манёвра',fact:'Через пять секунд после старта начинается программный разворот в плоскости тангажа.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:6,title:'ПРОГРАММНЫЙ РАЗВОРОТ ПО КРЕНУ',status:'Контролируемый набор высоты',fact:'На шестой секунде начинается программный разворот по крену.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:30,title:'ДРОССЕЛИРОВАНИЕ БЛОКА Ц',status:'Ограничение нагрузок',fact:'На 30-й секунде тяга центральных двигателей переводилась на дросселированный режим. После этой отметки стартовая площадка считалась вне угрозы падения ракеты.',source:'https://www.buran.ru/htm/35-3.htm'},
 {at:39,title:'РЕГУЛИРОВАНИЕ ТЯГИ БЛОКОВ А',status:'Снижение перегрузок',fact:'С 39-й секунды регулируют тягу боковых блоков для снижения аэродинамического скоростного напора.',source:'https://www.buran.ru/htm/35-3.htm'},
 {at:144,title:'ВЫКЛЮЧЕНИЕ ДВИГАТЕЛЕЙ БЛОКОВ А',status:'Боковые блоки · завершение работы',fact:'Двигатели 10А и 30А выключились около 144-й секунды, через долю секунды — двигатели блоков 20А и 40А.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:145.9,title:'ОТДЕЛЕНИЕ ЧЕТЫРЁХ БЛОКОВ А',status:'Блоки первой ступени отделились',fact:'Отделение боковых блоков произошло приблизительно на 145,9-й секунде.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:467.6,title:'ВЫКЛЮЧЕНИЕ РД-0120',status:'Центральный блок Ц · окончание тяги',fact:'Кислородно-водородные двигатели выключились около T+467,6 секунды. Ракета выполнила программу выведения.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:480,title:'ОТДЕЛЕНИЕ «ПОЛЮСА»',status:'Около 110 км · момент указан приблизительно',fact:'«Полюс» отделился от носителя примерно на высоте 110 км. Время разделения здесь оценочное, а не точная архивная секундная отметка.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:511,title:'ПОПЫТКА РАЗВОРОТА «ПОЛЮСА»',status:'Автономный этап · время условное',fact:'Аппарату предстояло развернуться на 180° для довыведения на орбиту. Из-за ошибки в системе управления вращение не остановилось штатно.',source:'https://www.buran.ru/other/skif.pdf'},
 {at:600,title:'ИСТОРИЧЕСКИЙ ИТОГ МИССИИ',status:'«Энергия» — успешно · «Полюс» — орбита не достигнута',fact:'«Энергия» отработала штатно. Впоследствии «Скиф-ДМ» не достиг расчётной орбиты и приводнился в Тихом океане. T+600 — конец музейного показа, а не время падения.',source:'https://www.buran.ru/other/skif.pdf'}
]);
const MODEL_POINTS=[
 // Illustrated flight path. Early metres follow a heavy, accelerating lift;
 // the archive documents event times, not a full time-series telemetry log.
 [0,0,0,0],[1,.001,.003,0],[3,.012,.009,.001],[5,.033,.016,.003],
 [10,.128,.026,.008],[15,.27,.040,.035],[20,.48,.055,.090],
 [30,1.12,.083,.34],[39,2.08,.116,.95],[90,14.8,.70,20],
 [150,46,1.75,73],[212,78,3.1,143],[241,91,4.08,187],
 [340,105,6.1,308],[467.6,110,7.45,482],[480,110,7.5,496],
 [511,121,7.3,538],[600,145,7.0,600]
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
 const ignition=clamp(smooth(-9.4,-5.4,t)*.34+smooth(-3.2,0,t)*.66,0,1);
 const exhaust=t<0?ignition:t<467.6?1:t<477?1-smooth(467.6,477,t):0;
 const nosePitch=t<0?0:t<3?4*Math.sin(Math.PI*clamp(t/6,0,1)):t<7?4+3*smooth(3,7,t):Math.min(38,4+(t-7)*.10);
 const rollDegrees=t<6?0:Math.min(7,(t-6)*.045);
 return {time:t,phase,phaseTitle:ENERGIA_LAUNCH_EVENTS[phase].title,altitudeKm,speedKmS,downrangeKm,
  pitchDegrees:nosePitch,rollDegrees,ignition,exhaust,prepared:t>=-50,release:t>=0,
  engines:{rd0120:t< -9.4?'ОЖИДАНИЕ':t< -5.4?'ЗАПУСК':t<467.6?'РАБОТА':'ВЫКЛ',rd170:t< -3.2?'ОЖИДАНИЕ':t<0?'ВЫХОД НА ТЯГУ':t<144.2?'РАБОТА':'ВЫКЛ'},
  ground:{umbilicals:t<0?'ПОДКЛЮЧЕНЫ':'РАССТЫКОВАНЫ',water:t< -10?'ГОТОВНОСТЬ':t<38?'ПОДАЧА':'ЗАВЕРШЕНА'},
  payloadSeparated:t>=480,payloadTurn:t>=511,failedOrbit:t>=600};
}

// Before T=0 preparation can run faster. Any remaining wall-clock fraction
// after crossing zero is always applied at flightRate (default 1:1).
export function advanceEnergiaClock(time,elapsedSeconds,prelaunchRate=8,flightRate=1){
 const t=clamp(Number(time)||0,ENERGIA_LAUNCH_START,ENERGIA_LAUNCH_END);
 const elapsed=Math.max(0,Number(elapsedSeconds)||0);
 const before=Math.max(.05,Number(prelaunchRate)||8),after=Math.max(.05,Number(flightRate)||1);
 if(t>=0)return Math.min(ENERGIA_LAUNCH_END,t+elapsed*after);
 const countdownWall=-t/before;
 if(elapsed<=countdownWall)return Math.min(0,t+elapsed*before);
 return Math.min(ENERGIA_LAUNCH_END,(elapsed-countdownWall)*after);
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
 const mesh=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,8),new THREE.MeshStandardMaterial({
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
 const ductJetMaterial=flameMaterial(0xff6920);
 const ductJetRoot=new THREE.Group();ductJetRoot.name='Газоход · направленный поток горячих газов';
 root.add(ductJetRoot);
 const ductJets=[];
 for(let i=0;i<7;i++){
  // The UKSS model has ONE petal-shaped channel toward local +X,
  // so the jet follows that open trench rather than fictional branches.
  const length=40+i*9,width=4.1+(i*.62);
  const jet=new THREE.Mesh(new THREE.CylinderGeometry(width*.55,width,length,18,3,true),ductJetMaterial);
  jet.position.set(23+i*33,-24+i*2.5,Math.sin(i*1.4)*2.4);
  jet.rotation.z=-Math.PI/2;
  jet.name='Газоход · огненный факел '+(i+1);
  jet.userData.pickable=false;
  ductJetRoot.add(jet);ductJets.push(jet);
 }

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
  ductJetMaterial.uniforms.uPower.value=exhaustAtGround*.9;
  ductJetMaterial.uniforms.uTime.value=t;
  ductJetRoot.visible=exhaustAtGround>.005;
  for(const [i,jet] of ductJets.entries())jet.scale.set(1,1+.12*Math.sin(t*11+i*1.8),1+.06*Math.sin(t*5+i));
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
  flameRoot.position.set(s.downrangeKm*.42/.14,6+visualHeight(s.altitudeKm)/.14,-s.downrangeKm*.28/.14);
  flameRoot.scale.y=1+.15*Math.sin(t*14);
  return {smoke:after,lightIntensity:lights.map(l=>l.intensity),armsReopen:platformRetreat,
   ductPower:exhaustAtGround,flamePower:fire,ductJetVisible:ductJetRoot.visible,
   mobileTowerArms:arms.map(a=>a.rotation.y),rocketExhaustOffset:flameRoot.position.toArray()};
 }
 function dispose(){
  root.traverse(o=>{if(o.isMesh){o.geometry?.dispose();o.material?.dispose();}});
  root.removeFromParent();
 }
 return {root,pose,dispose};
}
export function energiaVisualHeight(altKm){
 // In the first seconds 1 physical metre = 0.14 world units, matching the
 // rocket/UKSS model. Only the distant flight view compresses altitude.
 return altKm<=1.12?Math.max(0,altKm)*140:156.8+85*Math.log1p((altKm-1.12)*.32);
}
function visualHeight(altKm){return energiaVisualHeight(altKm);}

export function createEnergiaPolyusLaunch({scene,camera,controls,siteRoot,getEntry,onStart=()=>null,onStop=()=>{}}){
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('./energia-polyus-launch.css?v=20261102-energia-polyus-v2',import.meta.url);document.head.append(stylesheet);
 const panel=document.createElement('section');panel.id='energiaLaunchPanel';panel.hidden=true;panel.setAttribute('aria-label','Энергия — Полюс: реконструкция запуска 15 мая 1987 года');
 panel.innerHTML=[
  '<header class="energia-event-head"><div><span class="energia-kicker">15 МАЯ 1987 · УКСС · ПЛ. 250</span><h2>ЭНЕРГИЯ — ПОЛЮС</h2><span class="energia-tag">ИСТОРИЧЕСКАЯ РЕКОНСТРУКЦИЯ</span></div><button type="button" id="energiaClose" title="Закрыть сценарий" aria-label="Закрыть сценарий">×</button></header>',
  '<div class="energia-primary"><div><span class="energia-small">ПРОШЕДШЕЕ ВРЕМЯ</span><strong id="energiaClock">T−090 c</strong></div><div><span class="energia-small">СТАДИЯ</span><strong id="energiaStage">ПРЕДСТАРТОВАЯ ГОТОВНОСТЬ</strong></div></div>',
  '<div class="energia-telemetry"><div><span>ВЫСОТА</span><strong id="energiaAltitude">0,0 <em>км</em></strong></div><div><span>СКОРОСТЬ</span><strong id="energiaVelocity">0,00 <em>км/с</em></strong></div><div><span>УДАЛЕНИЕ</span><strong id="energiaRange">0,0 <em>км</em></strong></div><div><span>ТАНГАЖ</span><strong id="energiaPitch">0,0 <em>°</em></strong></div></div>',
  '<div class="energia-systems"><div><span>РД-0120</span><strong id="energiaRd0120">ОЖИДАНИЕ</strong></div><div><span>РД-170</span><strong id="energiaRd170">ОЖИДАНИЕ</strong></div><div><span>КРЕН</span><strong id="energiaRoll">0,0°</strong></div><div><span>ВОДА / ГАЗОХОД</span><strong id="energiaWater">ГОТОВНОСТЬ</strong></div><div><span>СВЯЗИ С ЗЕМЛЁЙ</span><strong id="energiaUmbilicals">ПОДКЛЮЧЕНЫ</strong></div><div><span>ПОЛЮС</span><strong id="energiaPayload">НА НОСИТЕЛЕ</strong></div></div>',
  '<div class="energia-status"><span class="energia-status-dot"></span><span id="energiaStatus">ПОДГОТОВКА СТАРТА</span></div>',
  '<div class="energia-fact"><div class="energia-fact-label">ИЗ АРХИВА</div><h3 id="energiaFactTitle">Первый полёт сверхтяжёлой ракеты</h3><p id="energiaFactText"></p><a id="energiaFactSource" href="https://www.buran.ru/htm/cargo.htm" target="_blank" rel="noopener noreferrer">Источник: Buran.ru</a></div>',
  '<div class="energia-timeline"><div class="energia-timeline-caption"><span>ЦИКЛОГРАММА</span><output id="energiaPosition">T−090 / T+600 c</output></div><input id="energiaSeek" type="range" min="-90" max="600" step="0.1" value="-90" aria-label="Перемотка исторической реконструкции"><div class="energia-ticks"><span>Т−90</span><span>СТАРТ</span><span>+146</span><span>+480</span><span>+600</span></div></div>',
  '<div class="energia-actions"><button id="energiaPlay" type="button">ПАУЗА</button><button id="energiaRestart" type="button">СНАЧАЛА</button><label>ТЕМП <select id="energiaSpeed"><option value="1">×1</option><option value="4">×4</option><option value="8" selected>×8</option><option value="20">×20</option></select></label></div>',
  '<p class="energia-rate" id="energiaTimeRate" aria-live="off">ПОДГОТОВКА ×8 · ПОСЛЕ ОТРЫВА — РЕАЛЬНОЕ ВРЕМЯ 1:1</p>',
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
   const offset=s.altitudeKm>3?V(27,19,35):V(19,16,26);
   target=worldPos.clone().add(V(0,4,0));
   eye=target.clone().add(offset);
  }
  return {eye,target};
 }
 const updateCamera=s=>{
  const key=mode==='auto'?(s.time<15?'pad':'follow'):mode;
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
  $('energiaRoll').textContent=fmt(s.rollDegrees,1)+'°';
  $('energiaRd0120').textContent=s.engines.rd0120;
  $('energiaRd170').textContent=s.engines.rd170;
  $('energiaWater').textContent=s.ground.water;
  $('energiaUmbilicals').textContent=s.ground.umbilicals;
  $('energiaPayload').textContent=s.failedOrbit?'ОРБИТА НЕ ДОСТИГНУТА':s.payloadSeparated?'АВТОНОМНЫЙ ПОЛЁТ':'НА НОСИТЕЛЕ';
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
  $('energiaTimeRate').textContent=seconds>=0?'ПОЛЁТ · ×'+speed+' · '+(speed===1?'РЕАЛЬНОЕ ВРЕМЯ 1:1':'РУЧНОЕ УСКОРЕНИЕ'):'ПОДГОТОВКА ×'+speed+' · ПОСЛЕ T=0 АВТОМАТИЧЕСКИ ×1';
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
  seconds=ENERGIA_LAUNCH_START;paused=false;speed=8;$('energiaSpeed').value='8';lastNow=null;lastPhase=-1;mode='auto';
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
 function play(){if(seconds>=ENERGIA_LAUNCH_END){seconds=ENERGIA_LAUNCH_START;speed=8;$('energiaSpeed').value='8';}paused=false;lastNow=null;render();}
 function seek(value){if(!active&&!start())return false;seconds=clamp(Number(value)||0,ENERGIA_LAUNCH_START,ENERGIA_LAUNCH_END);if(seconds>=0){speed=1;$('energiaSpeed').value='1';}pause();return true;}
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
   modelReady,clockMode:seconds>=0?'flight':'prelaunch',flightRate:speed,rocketAtMount:!active,rocketVerticalWorld:visualHeight(sampleEnergiaLaunch(seconds).altitudeKm),effects:effects?{visible:effects.root.visible,gasChannel:'single +X petal',instancedSmokeCount:730,ductJetCount:7,ductJetVisible:lastFrame?.ductJetVisible,gasPower:lastFrame?.ductPower,flamePower:lastFrame?.flamePower,mobileTowerArms:lastFrame?.mobileTowerArms,rocketExhaustOffset:lastFrame?.rocketExhaustOffset,lightIntensity:lastFrame?.lightIntensity}:null}),
  update(now){
   if(!active)return;
   if(lastNow!==null&&!paused&&!document.hidden){
    const previous=seconds;
    seconds=advanceEnergiaClock(seconds,Math.min(.25,Math.max(0,(now-lastNow)/1000)),speed,speed);
    if(previous<0&&seconds>=0){speed=1;$('energiaSpeed').value='1';}
   }
   lastNow=now;if(seconds>=ENERGIA_LAUNCH_END)paused=true;
   const s=sampleEnergiaLaunch(seconds);
   render();updateCamera(s);
  }};
}
