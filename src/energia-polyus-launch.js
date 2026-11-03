import * as THREE from 'three';
import {MUSEUM_MAP_SCALE} from './museum-scale.js?v=20261103-energia-camera-v1';
import {nozzleFlameMaterial} from './energia-plasma-shader.js?v=20261103-plasma-v2';

// Historical event boundaries are from Buran.ru. Interpolated values below
// are ILLUSTRATIVE telemetry, not downloaded flight-recorder measurements.
export const ENERGIA_LAUNCH_VERSION='energia-polyus-1987-v12-original-view-camera';
export const ENERGIA_LAUNCH_START=-90;
export const ENERGIA_LAUNCH_END=600;
export const ENERGIA_CAMERA_DETACH_UNITS=100;
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

/** Source-timed engine exhaust, distinct from the shared launch exhaust field. */
export function sampleEnergiaEnginePlumes(time){
 const t=Number.isFinite(Number(time))?Number(time):ENERGIA_LAUNCH_START;
 const core=smooth(-9.4,-5.4,t)*(1-smooth(467.6,469.2,t));
 const boosters=smooth(-3.2,0,t)*(1-smooth(144,146,t));
 return {core:clamp(core,0,1),boosters:clamp(boosters,0,1),
  nozzleCount:8,coreNozzles:4,boosterNozzles:4};
}

// Height-dependent natural dissipation of the cloud left behind at UKSS.
// This is independent of the engine jets travelling WITH the ascending rocket.
// The requested 100 m threshold refers to physical launch altitude, not
// the scene's logarithmically compressed camera/visual ascent.
// Pre-launch vents expand into irregular banks of semi-transparent steam.
export function sampleEnergiaSteamSpread(time){
 const t=Number.isFinite(Number(time))?Number(time):ENERGIA_LAUNCH_START;
 const stage=smooth(-90,0,t),late=smooth(-38,-1,t);
 // T-90 begins without a cloud. Thin vent steam gradually crawls outward.
 const presence=smooth(-84,-12,t);
 return {stage,late,presence,radius:mix(17,62,stage),drift:mix(2.3,10.5,stage),
  rise:mix(17,23,stage),puffScale:mix(.75,1.04,late),
  transparency:mix(.55,.35,stage),groundBias:2.3};
}
// The older, lower tail of the plume dissolves in broken layers.
export function sampleEnergiaPlumeBottomFade(age,groundHeight,seed=0){
 const wave=.55*Math.sin(seed*1.83)+.45*Math.cos(seed*3.11);
 return clamp((1-smooth(.57+.13*wave,.99,age))*smooth(-24+21*wave,72+32*wave,groundHeight),0,1);
}
export function sampleEnergiaPadDissipation(altitudeMetres){
 const metres=Math.max(0,Number(altitudeMetres)||0);
 return {fire:1-smooth(100,360,metres),smoke:1-smooth(100,800,metres)};
}

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function simpleRod(a,b,r,color,name,parent){
 const start=V(...a),end=V(...b),delta=end.clone().sub(start);
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),9),new THREE.MeshStandardMaterial({color,metalness:.58,roughness:.44}));
 mesh.position.copy(start).add(end).multiplyScalar(.5);
 mesh.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());mesh.name=name;mesh.castShadow=false;parent.add(mesh);
 return mesh;
}

function makeSmokeTexture(){
 // Fractional Brownian noise with a warped, feathered perimeter. The texture
 // is generated once on demand, independently of web resources and frame rate.
 const size=128,canvas=document.createElement('canvas');
 canvas.width=canvas.height=size;
 const context=canvas.getContext('2d'),image=context.createImageData(size,size);
 const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453123;return n-Math.floor(n);};
 function noise(x,y){
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  return mix(mix(hash(ix,iy),hash(ix+1,iy),u),
    mix(hash(ix,iy+1),hash(ix+1,iy+1),u),v);
 }
 function fbm(x,y){
  let signal=0,strength=.55,frequency=1;
  for(let octave=0;octave<5;octave++){
   signal+=strength*noise(x*frequency,y*frequency);
   frequency*=2.1;strength*=.48;
  }
  return signal;
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const nx=(x+.5-size/2)/(size/2),ny=(y+.5-size/2)/(size/2);
  const bend=fbm(nx*3.1+7.3,ny*3.1-6.2)-.46;
  const wx=nx+bend*.19,wy=ny+(fbm(nx*2.9-4.1,ny*2.9+8.5)-.45)*.16;
  const radius=Math.hypot(wx*.97,wy*1.04);
  const edge=Math.max(0,1-radius*(.95+.12*(fbm(wx*3.2+3,wy*3.2+2)-.45)));
  const cloud=fbm(wx*3.6+19,wy*3.6-7);
  const fine=fbm(wx*8.6-17,wy*8.6+13);
  const density=clamp(.20+1.2*cloud+.40*(fine-.46),.05,1);
  const alpha=Math.round(238*Math.pow(edge,1.65)*density);
  const index=(y*size+x)*4;
  image.data[index]=255;image.data[index+1]=255;
  image.data[index+2]=255;image.data[index+3]=alpha;
 }
 context.putImageData(image,0,0);
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.minFilter=THREE.LinearMipmapLinearFilter;
 texture.magFilter=THREE.LinearFilter;
 texture.generateMipmaps=true;texture.needsUpdate=true;
 return texture;
}

function makeBillow(parent,count,color,opacity,name,texture){
 // GPU instanced camera-facing quads use two triangles per particle instead
 // of solid sphere meshes; the feathered alpha makes overlapping, flowing
 // banks of smoke rather than opaque "popcorn" blobs.
 const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),
  new THREE.MeshBasicMaterial({color,map:texture,transparent:true,opacity,depthWrite:false,depthTest:true,
   side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}),count);
 // A single float per instance fades individual puffs without losing the atlas
 // alpha. This removes the hard lower edge of the rocket's smoke column.
 const densityAttribute=new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1),1);
 densityAttribute.setUsage(THREE.DynamicDrawUsage);
 mesh.geometry.setAttribute('aSmokeDensity',densityAttribute);
 mesh.material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>',
   '#include <common>\nattribute float aSmokeDensity;\nvarying float vSmokeDensity;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
   '#include <begin_vertex>\nvSmokeDensity=aSmokeDensity;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
   '#include <common>\nvarying float vSmokeDensity;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',
   '#include <alphamap_fragment>\ndiffuseColor.a*=vSmokeDensity;');
 };
 mesh.material.customProgramCacheKey=()=> 'energia-smoke-density-v2';
 mesh.name=name;mesh.frustumCulled=false;mesh.renderOrder=28;
 mesh.userData={pickable:false,softSmoke:true,baseOpacity:opacity,densityAttribute};
 parent.add(mesh);
 const colorAttr=new THREE.Color();
 for(let i=0;i<count;i++){
  const shade=.81+(i*47%127)/127*.21;colorAttr.setRGB(shade,shade,shade);mesh.setColorAt(i,colorAttr);
 }
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
function addEffectSystem(siteRoot,camera,renderer,objects=[]){
 const root=new THREE.Group();root.name='Энергия — Полюс · огонь, дым и газоход';root.visible=false;root.userData.pickable=false;siteRoot.add(root);
 const smokeTexture=makeSmokeTexture();
 const glow=glowMaterial(0xffb456),pitGlow=makeGlow(240,220,glow);pitGlow.position.set(5,5.95,0);root.add(pitGlow);
 const trenchMat=glowMaterial(0xff5b18),trenchGlow=makeGlow(340,85,trenchMat);trenchGlow.position.set(130,.6,0);root.add(trenchGlow);
 const outerMat=glowMaterial(0xf15a24),outerGlow=makeGlow(550,400,outerMat);outerGlow.position.set(15,.2,10);root.add(outerGlow);
 const waterMat=glowMaterial(0xc7e4f0),waterGlow=makeGlow(290,125,waterMat);waterGlow.position.set(25,.7,0);root.add(waterGlow);
 const farDuctMat=glowMaterial(0xffa347),farDuctGlow=makeGlow(220,85,farDuctMat);farDuctGlow.position.set(220,.4,0);root.add(farDuctGlow);

 const innerSmoke=makeBillow(root,420,0xe4e9eb,.38,'Холодный криогенный пар · мягкие облака',smokeTexture);
 const waterSpray=makeBillow(root,320,0xeaf3f3,.78,'Водяная завеса · испарение',smokeTexture);
 const ductSmoke=makeBillow(root,1050,0xaeb1b1,.76,'Газоход · турбулентный плотный пар',smokeTexture);
 const fieldSmoke=makeBillow(root,820,0x8d8d8d,.69,'Степь · стелющиеся клубы дыма',smokeTexture);
 const ascentPlume=makeBillow(root,630,0xe6e4df,.67,'Энергия · хвост дыма при наборе высоты',smokeTexture);
 const sparks=makeBillow(root,95,0xffb45c,.87,'Огневые частицы и отражения',smokeTexture);
 sparks.material.toneMapped=false;

 const flameRoot=new THREE.Group();flameRoot.name='Реактивные факелы';root.add(flameRoot);
 function attachExhaustToRocket(holder){
  if(!holder)return;
  // A rocket model reload can clear() the exhibit holder. Reattach if needed.
  if(flameRoot.parent!==holder)holder.add(flameRoot);
  flameRoot.position.set(0,0,0);
  flameRoot.quaternion.identity();
 }
 const coreMat=flameMaterial(0x8edfff),fireMat=flameMaterial(0xff6a19);
 const ductJetMaterial=flameMaterial(0xff9e39);
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

 // Two physically separate groups of vertical, nozzle-anchored flames.
 // The installed Energia-Polyus GLB has x ±8.85 m and z −8.58…+5.47 m;
 // these model-local exits are museum approximations inside its footprint.
 // Compact diffuse glows sit entirely BELOW the nozzle plane, with
 // logarithmic depth-testing inherited from Three's built-in SpriteMaterial.
 // Replaces all 24 upward-looking crossing sheets and their visible rays.
 const glowCanvas=document.createElement('canvas');
 glowCanvas.width=glowCanvas.height=128;
 const ctx=glowCanvas.getContext('2d');
 const gradient=ctx.createRadialGradient(64,64,0,64,64,64);
 gradient.addColorStop(0,'rgba(255,255,255,.98)');
 gradient.addColorStop(.16,'rgba(255,255,255,.74)');
 gradient.addColorStop(.46,'rgba(255,255,255,.17)');
 gradient.addColorStop(.79,'rgba(255,255,255,.02)');
 gradient.addColorStop(1,'rgba(255,255,255,0)');
 ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
 const nozzleGlowTexture=new THREE.CanvasTexture(glowCanvas);
 nozzleGlowTexture.colorSpace=THREE.SRGBColorSpace;
 nozzleGlowTexture.minFilter=THREE.LinearMipmapLinearFilter;
 nozzleGlowTexture.magFilter=THREE.LinearFilter;
 nozzleGlowTexture.generateMipmaps=true;nozzleGlowTexture.needsUpdate=true;
 const haloMaterial=(color)=>new THREE.SpriteMaterial({map:nozzleGlowTexture,color,
  transparent:true,opacity:0,depthWrite:false,depthTest:true,
  blending:THREE.AdditiveBlending,toneMapped:false});
 const coreHaloMaterial=haloMaterial(0xbceaff),boosterHaloMaterial=haloMaterial(0xffb769);
 const rocketNozzleMaterials={
  core:nozzleFlameMaterial(0x8fdcff),coreGlow:nozzleFlameMaterial(0x36a7ff),coreWhite:nozzleFlameMaterial(0xffffff),
  booster:nozzleFlameMaterial(0xffcc72),boosterGlow:nozzleFlameMaterial(0xff6a12),boosterWhite:nozzleFlameMaterial(0xfffdf4)
 };
 const engineJets=[];
 const buildEngineJet=(x,z,type,index)=>{
  const core=type==='core',length=core?112:166,radius=core?2.0:2.9;
  const entries=[
   [core?rocketNozzleMaterials.coreGlow:rocketNozzleMaterials.boosterGlow,radius*4.1,radius*.44,0,1.08],
   [core?rocketNozzleMaterials.core:rocketNozzleMaterials.booster,radius*2.35,radius*.20,1,.96],
   [core?rocketNozzleMaterials.coreWhite:rocketNozzleMaterials.boosterWhite,radius*1.05,radius*.08,2,.78],
   [core?rocketNozzleMaterials.coreWhite:rocketNozzleMaterials.boosterWhite,radius*.45,radius*.02,3,.54]
  ];
  const meshes=[];
  for(const [material,top,tip,layer,relativeLength]of entries){
   const layerLength=length*relativeLength;
   // Constrain the collar inside the rocket footprint; the downstream
   // shoulder is irregularly broken by the exhaust shader.
   const topRadius=top*(layer===0?.59:.71);
   const bottomRadius=Math.max(tip,top*(layer===0?.36:.27));
   const cone=new THREE.Mesh(new THREE.CylinderGeometry(topRadius,bottomRadius,layerLength,36,18,true),material);
   cone.position.set(x,-layerLength/2-.42,z);
   // A scaled cone must still begin BELOW its actual nozzle. Scaling a
   // cylinder about its centre used to send its top 20-40 units into the
   // rocket at high engine power (the previous upward "fire rays").
   cone.userData.nozzleFlameLength=layerLength;
   cone.userData.nozzleFlameAnchorY=-.42;
   cone.renderOrder=33+layer;cone.frustumCulled=false;cone.userData.pickable=false;
   cone.name=(core?'РД-0120':'РД-170')+' · рваный реактивный факел '+(index+1)+(layer?' · ядро':' · оболочка');
   flameRoot.add(cone);meshes.push(cone);
  }
  const halo=new THREE.Sprite(core?coreHaloMaterial:boosterHaloMaterial);
  halo.name=(core?'РД-0120':'РД-170')+' · локальное свечение под соплом '+(index+1);
  halo.position.set(x,-5.4,z);
  halo.scale.set(radius*3.4,radius*3.4,1);
  halo.renderOrder=38;halo.frustumCulled=false;halo.userData.pickable=false;
  halo.visible=false;flameRoot.add(halo);
  engineJets.push({x,z,type,index,length,meshes,halo,haloSize:radius*3.4});
 };
 // Compact core cluster and four peripheral first-stage exhaust exits.
 [[-1.85,-2.0],[1.85,-2.0],[-1.85,1.7],[1.85,1.7]].forEach(([x,z],i)=>buildEngineJet(x,z,'core',i));
 [[-6.5,-4.0],[6.5,-4.0],[-6.5,3.2],[6.5,3.2]].forEach(([x,z],i)=>buildEngineJet(x,z,'booster',i));
 const movingFlameLight=new THREE.PointLight(0xffd6a0,0,170,1.5);
 movingFlameLight.position.set(0,-7,0);flameRoot.add(movingFlameLight);
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
 // Service umbilicals and hydraulic braces give a readable, staged release.
 // The imported UKSS CAD is not destructively modified.
 const umbilicals=[];
 for(const [x,y,z,dir]of[[-37,17,-10,1],[-37,37,7,1],[31,29,-9,-1]]){
  const pivot=new THREE.Group();pivot.position.set(x,y,z);root.add(pivot);
  simpleRod([0,0,0],[dir*18,-2,0],.55,0x9fb5ae,'Пневмолиния · отводное колено',pivot);
  simpleRod([dir*18,-2,0],[dir*22,-7,0],.27,0xc6ba9a,'Трос и шланг',pivot);
  umbilicals.push({pivot,dir});
 }
 // Edge fixtures glow behind the white-hot exhaust, adding reflections on
 // trench banks, latticework and terrain instead of only a flat flame sprite.
 const lightSpecs=[
  [0,20,0,0xffe3a6,1900,320], [45,-12,0,0xffad51,1200,260],
  [185,-3,0,0xff722a,1450,370],[-60,28,-80,0xffb37b,550,330],
  [62,24,88,0xffd09d,550,330],[260,8,-58,0xff9b49,450,320],
  [-100,7,105,0xffb76a,360,300]
 ];
 const lights=lightSpecs.map(([x,y,z,color,,distance])=>{
  const light=new THREE.PointLight(color,0,distance,1.2);
  light.position.set(x,y,z);root.add(light);return light;
 });

 const smokeTwist=new THREE.Quaternion(),smokeAxis=V(0,0,1);

 // A single low-cost PCF shadow map projects real silhouettes from the UKSS
 // lattice and nearby buildings onto the concrete and surrounding steppe.
 // Only the launch enables it; the museum's previous renderer state is saved.
 const shadowReceivers=[],shadowMaterial=new THREE.ShadowMaterial({color:0x0b111b,opacity:.71,depthWrite:false});
 for(const [x,z,width,depth]of [
  [-220,-90,310,180],[-220,115,310,180],
  [105,-160,380,190],[105,158,380,190],
  [-345,0,160,420],[355,0,100,250]
 ]){
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),shadowMaterial);
  plane.rotation.x=-Math.PI/2;plane.position.set(x,.52,z);
  plane.receiveShadow=true;plane.castShadow=false;plane.renderOrder=16;
  plane.userData={pickable:false,museumComponent:'launch-shadow-receiver'};
  root.add(plane);shadowReceivers.push(plane);
 }
 const shadowSpot=new THREE.SpotLight(0xffbd76,0,145,1.11,.58,1.25);
 shadowSpot.name='РД-170 · направленный стартовый свет с динамическими тенями';
 shadowSpot.position.set(0,28,0);
 const shadowTarget=new THREE.Object3D();shadowTarget.position.set(165,.5,35);
 root.add(shadowTarget,shadowSpot);shadowSpot.target=shadowTarget;
 shadowSpot.castShadow=true;
 const mobileShadow=typeof window!=='undefined'&&window.matchMedia?.('(max-width:760px)')?.matches;
 const shadowResolution=mobileShadow?512:1024;
 shadowSpot.shadow.mapSize.set(shadowResolution,shadowResolution);
 shadowSpot.shadow.camera.near=.45;shadowSpot.shadow.camera.far=145;
 shadowSpot.shadow.bias=-.00011;shadowSpot.shadow.normalBias=.018;
 shadowSpot.shadow.radius=2.7;
 shadowSpot.visible=false;
 const shadowToggles=[];let shadowSettings=null,lastShadowTime=-Infinity;
 function enableShadows(){
  if(!renderer?.shadowMap||shadowSettings)return;
  shadowSettings={enabled:renderer.shadowMap.enabled,type:renderer.shadowMap.type,
   autoUpdate:renderer.shadowMap.autoUpdate};
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  renderer.shadowMap.needsUpdate=true;
  // Restrict extra casters to neighbouring museum sites. Structural UKSS
  // imported meshes already contain castShadow/receiveShadow attributes.
  const anchor=siteRoot.getWorldPosition(V()),near=V();let candidateCount=0;
  for(const exhibit of objects){
   if(!exhibit?.g||exhibit.g===siteRoot)continue;
   exhibit.g.getWorldPosition(near);
   if(Math.hypot(anchor.x-near.x,anchor.z-near.z)>170)continue;
   exhibit.g.traverse(mesh=>{
    if(!mesh.isMesh||candidateCount>=90)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(!materials.some(material=>material?.isMeshStandardMaterial))return;
    const triangles=(mesh.geometry?.index?.count??mesh.geometry?.attributes?.position?.count??0)/3;
    if(triangles>12000)return;
    shadowToggles.push({mesh,cast:mesh.castShadow,receive:mesh.receiveShadow});
    mesh.castShadow=true;mesh.receiveShadow=true;candidateCount++;
   });
  }
 }
 function disableShadows(){
  shadowSpot.visible=false;shadowSpot.intensity=0;
  for(const previous of shadowToggles){
   previous.mesh.castShadow=previous.cast;previous.mesh.receiveShadow=previous.receive;
  }
  shadowToggles.length=0;
  if(shadowSettings&&renderer?.shadowMap){
   renderer.shadowMap.enabled=shadowSettings.enabled;
   renderer.shadowMap.type=shadowSettings.type;
   renderer.shadowMap.autoUpdate=shadowSettings.autoUpdate;
   renderer.shadowMap.needsUpdate=true;
  }
  shadowSettings=null;lastShadowTime=-Infinity;
 }
 function setShadowPose(t,power,rocketHolder){
  const intensity=clamp(power,0,1)*(1-smooth(28,90,t));
  shadowSpot.visible=Boolean(shadowSettings)&&intensity>.025;
  shadowSpot.intensity=3300*Math.max(0,intensity)*(.92+.08*Math.sin(t*5.7));
  if(rocketHolder){
   shadowSpot.position.copy(rocketHolder.position);
   shadowSpot.position.y+=20;
   shadowSpot.position.x+=5;
  }
  // A held PCF shadow map updates at 8 Hz during launch: cinematic soft
  // shadows, without multiplying the cost of every 60 Hz animation frame.
  if(shadowSpot.visible&&renderer?.shadowMap&&Math.abs(t-lastShadowTime)>=.125){
   renderer.shadowMap.needsUpdate=true;lastShadowTime=t;
  }
 }

 const mtx=new THREE.Matrix4(),pos=V(),scale=V(),cameraWorldQ=new THREE.Quaternion(),
  localWorldQ=new THREE.Quaternion(),billboardQ=new THREE.Quaternion();
 const smokeBase=[
  [innerSmoke,0xe4e9eb,0xffe9c2],[waterSpray,0xeaf3f3,0xffeed9],
  [ductSmoke,0xaeb1b1,0xffc78d],[fieldSmoke,0x8d8d8d,0xe8a36c],
  [ascentPlume,0xe6e4df,0xffc99c],[sparks,0xffb45c,0xffeeaa]
 ].map(([mesh,cold,warm])=>({mesh,cold:new THREE.Color(cold),warm:new THREE.Color(warm)}));
 const write=(mesh,time,kind,amount,s)=>{
  const density=clamp(amount,0,1);
  mesh.visible=density>.002;
  mesh.material.opacity=mesh.userData.baseOpacity*density;
  if(!mesh.visible)return;
  const count=mesh.count;
  const height=visualHeight(s.altitudeKm)/.14;
  const xShift=s.downrangeKm*.42/.14,zShift=-s.downrangeKm*.28/.14;
  const steamState=kind==='steam'?sampleEnergiaSteamSpread(time):null;
  const particleAlpha=mesh.userData.densityAttribute;
  for(let i=0;i<count;i++){
   const r1=(i*37%211)/211,r2=(i*97%257)/257,r3=(i*23%199)/199;
   const cycle=kind==='steam'?9.2:kind==='duct'?10.5:kind==='field'?17.5:kind==='water'?5.2:kind==='plume'?5.8:2.4;
   const born=kind==='steam'?-90:kind==='water'?-10:kind==='plume'?0:kind==='sparks'?-3.2:-9.4;
   const life=Math.max(0,time-born),u=((life/cycle)*(kind==='steam'?.24:kind==='sparks'?1.15:.52)+r1)%1;
   const swirl=Math.sin(u*13+i*.91)*.63+Math.cos(u*6+i*.23)*.48;
   let x=0,y=0,z=0,size=0;
   if(kind==='steam'){
    // Light wisps descend from the lower rocket and spread horizontally
    // along the concrete. Most billows reside near ground level.
    const a=Math.PI*2*r2+.26*Math.sin(time*.048+i*.57);
    const descent=1-Math.pow(1-r1,steamState.groundBias);
    const radial=Math.pow(r3,.74)*steamState.radius*(.12+.88*descent);
    const curl=steamState.drift*(Math.sin(time*.13+i*1.17)+.35*Math.cos(time*.08+i*.53));
    x=-11+Math.cos(a)*radial+Math.sin(a*1.7)*curl*descent;
    z=-4+Math.sin(a)*radial*.79+Math.cos(a*1.2)*curl*descent;
    y=1.3+steamState.rise*Math.pow(1-descent,1.23)
     +1.3*u+Math.sin(i*.93+time*.16)*(.35+1.3*(1-descent));
    size=(6.4+u*15.6)*(1+.32*r2)*steamState.puffScale;
   }else if(kind==='water'){
    x=-25+u*200+Math.sin(i*1.37)*11;
    y=1.4+u*27;
    z=(r2*2-1)*(17+u*20)+swirl*4;
    size=(3.8+u*19)*(1+.42*r3);
   }else if(kind==='duct'){
    x=8+Math.pow(u,1.14)*308;
    z=(r2*2-1)*(11+47*u)+swirl*10;
    y=-24+u*35+Math.sin(i*.7)*4;
    size=(8.2+u*43)*(1+.43*r3);
   }else if(kind==='field'){
    const angle=2*Math.PI*r2,spread=Math.pow(u,.81);
    x=Math.cos(angle)*(18+spread*235)+spread*65;
    z=Math.sin(angle)*(18+spread*202)+swirl*12;
    y=2+spread*20+Math.sin(i*.81+u*9)*2.4;
    size=(8.2+spread*56)*(1+.42*r3);
   }else if(kind==='plume'){
    const tail=u*Math.min(640,Math.max(40,height*2.14));
    x=xShift*(1-u*.18)+swirl*(5+u*18);
    y=6+height-tail;
    z=zShift*(1-u*.18)+(r2*2-1)*(8+u*23);
    size=2*(8.4+u*38)*(1+.29*r3);
   }else{
    x=18+u*210+Math.sin(i*.31)*17;
    z=(r2*2-1)*(8+u*29);
    y=-20+u*34;
    size=(.9+1.9*r3)*(1-u*.78);
   }
   // Age, height, and independent turbulence break up individual smoke edges.
   let puffAlpha=.52+.45*r3;
   if(kind==='steam'){
    const chaos=.76+.18*Math.sin(time*.63+i*.71)+.13*Math.cos(time*1.27+i*1.37);
    // Higher suspended steam must remain much more translucent.
    const nearGround=1-.78*smooth(3.5,26,y);
    puffAlpha*=clamp(chaos,.28,1.05)*steamState.transparency*nearGround;
   }else if(kind==='plume'){
    const fading=sampleEnergiaPlumeBottomFade(u,y,i);
    x+=Math.sin(i*.41+time*.63)*Math.pow(u,1.7)*(10+24*r3);
    z+=Math.cos(i*.63-time*.41)*Math.pow(u,1.5)*(9+23*r2);
    size*=.75+.25*fading;
    puffAlpha*=fading*(.69+.28*Math.sin(i*.92+time*.7)**2);
   }else puffAlpha*=.74+.26*Math.sin(i*.41+time*.22)**2;
   const lifespan=Math.min(1,u*6)*Math.min(1,(1-u)*5);
   puffAlpha*=Math.max(.03,lifespan);
   size*=.55+.45*lifespan;
   size=Math.max(.01,size*(.75+.25*density));
   particleAlpha.setX(i,clamp(puffAlpha,0,1));
   // Rotate each irregular silhouette and vary cloud aspect ratio. The cloud
   // layers stay camera-facing even while the visitor orbits the launch.
   pos.set(x,y,z);
   const aspect=.82+.48*r2,stretch=kind==='duct'?1.25:kind==='plume'?1.20:1;
   scale.set(size*2*aspect,size*2/stretch*(1.1+.35*r3),1);
   smokeTwist.setFromAxisAngle(smokeAxis,Math.PI*2*r2+u*.65+(kind==='duct'?.17:0));
   smokeTwist.premultiply(billboardQ);
   mtx.compose(pos,smokeTwist,scale);mesh.setMatrixAt(i,mtx);
  }
  mesh.instanceMatrix.needsUpdate=true;
  particleAlpha.needsUpdate=true;
 };
 const depthCompatible=rocketNozzleMaterials.core.vertexShader.includes('logdepthbuf_vertex')
  &&rocketNozzleMaterials.core.fragmentShader.includes('logdepthbuf_fragment');
 function pose(s,rocketHolder=null){
  const t=s.time,fire=s.exhaust;
  const padDissipation=sampleEnergiaPadDissipation(s.altitudeKm*1000);
  root.visible=true;
  // All particle quads face the current camera in the UKSS local frame.
  camera.getWorldQuaternion(cameraWorldQ);
  billboardQ.copy(siteRoot.getWorldQuaternion(localWorldQ).invert()).multiply(cameraWorldQ);
  const pilot=smooth(-22,-20,t)*(1-smooth(-10,-8,t))*padDissipation.fire;
  const exhaustAtGround=fire*(1-smooth(30,95,t))*padDissipation.fire;
  const water=(t>=-10?Math.max(.08,smooth(-10,-7,t)):0)*(1-smooth(46,115,t))*padDissipation.smoke;
  const groundCloud=smooth(-9.4,3,t)*(1-smooth(115,290,t))*padDissipation.smoke;
  const ductCloud=clamp((exhaustAtGround*1.10+water*.43)*padDissipation.smoke,0,1);
  const plume=smooth(0,3,t)*(1-smooth(140,245,t));
  const steamEnvelope=sampleEnergiaSteamSpread(t);
  const vapor=(.64+.32*smooth(-90,-24,t))*steamEnvelope.presence
   *(1-smooth(42,153,t))*padDissipation.smoke;
  const heat=clamp(exhaustAtGround*.85+pilot*.13,0,1);
  glow.uniforms.uPower.value=clamp(exhaustAtGround*1.12+pilot*.08,0,1);
  trenchMat.uniforms.uPower.value=clamp(exhaustAtGround*1.12+pilot*.12,0,1);
  outerMat.uniforms.uPower.value=clamp((exhaustAtGround*.86+groundCloud*.2)*padDissipation.fire,0,1);
  waterMat.uniforms.uPower.value=water*.48;
  farDuctMat.uniforms.uPower.value=clamp(exhaustAtGround*.95,0,1);
  const enginePower=sampleEnergiaEnginePlumes(t);
  for(const kind of ['core','booster']){
   const power=enginePower[kind==='core'?'core':'boosters'];
   for(const suffix of [kind,kind+'Glow',kind+'White']){
    rocketNozzleMaterials[suffix].uniforms.uPower.value=power*(suffix.endsWith('Glow')?.72:1);
    rocketNozzleMaterials[suffix].uniforms.uTime.value=t;
   }
  }
  ductJetMaterial.uniforms.uPower.value=exhaustAtGround*.94;
  ductJetMaterial.uniforms.uTime.value=t;
  ductJetRoot.visible=exhaustAtGround>.005;
  ductJets.forEach((jet,i)=>jet.scale.set(1,1+.13*Math.sin(t*8+i*1.8),1+.05*Math.sin(t*5+i)));
  // White-hot nozzle cores flicker without changing the launch clock.
  for(const jet of engineJets){
   const power=jet.type==='core'?enginePower.core:enginePower.boosters;
   const flicker=.96+.09*Math.sin(t*10.7+jet.index*1.7)+.055*Math.sin(t*21-jet.index*.7);
   jet.meshes.forEach((mesh,i)=>{
    const radialPulse=1+.08*Math.sin(t*7.5+jet.index*1.3+i*.8)+.04*Math.sin(t*15-jet.index*.7+i*1.6);
    const axialPulse=(.92+.42*power)*flicker*(1+.04*Math.sin(t*4+jet.index+i));
    mesh.scale.set(radialPulse,axialPulse,radialPulse*(.98+.05*Math.cos(t*11+jet.index+i)));
    // Compensate for Three.js scaling about the mesh midpoint: its TOP stays
    // fixed at the nozzle under every flicker/engine thrust variation.
    mesh.position.y=mesh.userData.nozzleFlameAnchorY-mesh.userData.nozzleFlameLength*axialPulse/2;
    mesh.visible=power>.003;
   });
   jet.halo.visible=power>.003;
   const shimmer=.94+.06*Math.sin(t*9.7+jet.index*2.1);
   jet.halo.scale.set(jet.haloSize*shimmer,jet.haloSize*shimmer,1);
  }
  // Bright but small: the sprites cannot extend above the model's exit plane.
  coreHaloMaterial.opacity=.52*enginePower.core*(.94+.06*Math.sin(t*9.3));
  boosterHaloMaterial.opacity=.58*enginePower.boosters*(.94+.06*Math.sin(t*8.1));
  movingFlameLight.intensity=1650*Math.max(enginePower.core*.92,enginePower.boosters);
  movingFlameLight.distance=210;
  const platformRetreat=smooth(-55,-37,t),clampRelease=smooth(-.5,2,t),umbilicalRelease=smooth(-1,1.5,t);
  arms.forEach((arm,i)=>{arm.rotation.y=-platformRetreat*(.8+i*.065);arm.visible=t<25;});
  for(const item of support)item.pivot.rotation.z=item.sign*clampRelease*.65;
  for(const item of umbilicals)item.pivot.rotation.y=item.dir*umbilicalRelease*1.14;
  setShadowPose(t,Math.max(enginePower.core*.58,enginePower.boosters,exhaustAtGround*.84)*padDissipation.fire,rocketHolder);
  write(innerSmoke,t,'steam',vapor,s);
  write(waterSpray,t,'water',water,s);
  write(ductSmoke,t,'duct',ductCloud,s);
  write(fieldSmoke,t,'field',groundCloud,s);
  write(ascentPlume,t,'plume',plume,s);
  write(sparks,t,'sparks',exhaustAtGround*.8,s);
  for(const {mesh,cold,warm}of smokeBase)mesh.material.color.copy(cold).lerp(warm,heat*(mesh===ductSmoke?.82:mesh===fieldSmoke?.72:.50));
  lights.forEach((light,i)=>{
   const wobble=.94+.06*Math.sin(t*7+i*1.7);
   const power=(i===0?fire:i===1?exhaustAtGround:i===2?ductCloud:
    i>=3&&i<=4?clamp(exhaustAtGround*.85+groundCloud*.30,0,1):
    i===5?ductCloud*.88:groundCloud*.73)*padDissipation.fire;
   light.intensity=lightSpecs[i][4]*power*wobble;
  });
  flameRoot.visible=enginePower.core>.003||enginePower.boosters>.003;
  // Exact parent-local pose of the flying GLB, including its initial mount,
  // program pitch and roll. The plumes follow the nozzles during camera orbit.
  if(rocketHolder){
   attachExhaustToRocket(rocketHolder);
  }
  flameRoot.scale.set(1,1,1);
  return {smoke:groundCloud,water,steam:vapor,steamEnvelope,steamMaterialOpacity:innerSmoke.material.opacity,plume,padFireFade:padDissipation.fire,padSmokeFade:padDissipation.smoke,shadowLightIntensity:shadowSpot.intensity,shadowReceiverCount:shadowReceivers.length,shadowMapEnabled:!!renderer?.shadowMap?.enabled,shadowCasterCount:shadowToggles.length,shadowMapResolution:shadowResolution,engineCorePower:enginePower.core,engineBoosterPower:enginePower.boosters,engineJetCount:engineJets.length,
   enginePlasmaRibbonCount:0,
   engineNozzleGlowCount:engineJets.length,
   engineNozzleGlowVisible:engineJets.filter(jet=>jet.halo.visible).length,
   engineNozzleGlowOpacity:{core:coreHaloMaterial.opacity,boosters:boosterHaloMaterial.opacity},
   engineUpperFlameLimitY:Math.max(...engineJets.flatMap(jet=>jet.meshes.map(mesh=>
    mesh.position.y+mesh.userData.nozzleFlameLength*mesh.scale.y/2))),
   engineHaloUpperLimitY:Math.max(...engineJets.map(jet=>jet.halo.position.y+jet.haloSize/2)),
  engineFlameAttached:!!rocketHolder&&flameRoot.parent===rocketHolder,
  engineFlameDepthCompatible:depthCompatible,
  engineFlameDepthTest:rocketNozzleMaterials.core.depthTest,
  smokeBillboards:innerSmoke.count+waterSpray.count+ductSmoke.count+fieldSmoke.count+ascentPlume.count+sparks.count,
   lightIntensity:lights.map(l=>l.intensity),armsReopen:platformRetreat,umbilicalRelease,
   ductPower:exhaustAtGround,flamePower:fire,ductJetVisible:ductJetRoot.visible,
   mobileTowerArms:arms.map(a=>a.rotation.y),
   rocketExhaustOffset:rocketHolder?rocketHolder.position.toArray():flameRoot.position.toArray(),
   rocketNozzleWorld:rocketHolder?rocketHolder.localToWorld(V(0,0,0)).toArray():null};
 }

 function dispose(){
  disableShadows();
  root.traverse(o=>{if(o.isMesh){o.geometry?.dispose();o.material?.dispose();}});
  smokeTexture.dispose();
  nozzleGlowTexture.dispose();coreHaloMaterial.dispose();boosterHaloMaterial.dispose();
  flameRoot.removeFromParent();
  root.removeFromParent();
 }
 function hideExhaust(){flameRoot.visible=false;movingFlameLight.intensity=0;}
 return {root,pose,dispose,hideExhaust,enableShadows,disableShadows,
  shadowState:()=>({enabled:Boolean(shadowSettings),casters:shadowToggles.length,receivers:shadowReceivers.length,
   lightIntensity:shadowSpot.visible?shadowSpot.intensity:0,mapResolution:shadowResolution})};
}
export function energiaVisualHeight(altKm){
 // In the first seconds 1 physical metre = 0.14 world units, matching the
 // rocket/UKSS model. Only the distant flight view compresses altitude.
 return altKm<=1.12?Math.max(0,altKm)*140:156.8+85*Math.log1p((altKm-1.12)*.32);
}
function visualHeight(altKm){return energiaVisualHeight(altKm);}
// Same H units as the museum's technical altitude ruler; not GLB metres.
export function energiaCameraHeightUnits(altKm){return visualHeight(altKm)/MUSEUM_MAP_SCALE;}
export function shouldDetachEnergiaCamera(altKm){return energiaCameraHeightUnits(altKm)>=ENERGIA_CAMERA_DETACH_UNITS;}

export function createEnergiaPolyusLaunch({scene,camera,controls,siteRoot,renderer,objects=[],getEntry,onStart=()=>null,onStop=()=>{}}){
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('./energia-polyus-launch.css?v=20261103-cinematic-100h-v1',import.meta.url);document.head.append(stylesheet);
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
  '<p class="energia-camera-hint" id="energiaCameraHint">КАМЕРА СЛЕДУЕТ ЗА РАКЕТОЙ · ВРАЩАЙТЕ И ПРИБЛИЖАЙТЕ ВОКРУГ НЕЁ.</p>',
  '<div class="energia-cameras" role="group" aria-label="Выбор ракурса"><button data-energia-camera="follow" aria-pressed="true">ЗА РАКЕТОЙ</button><button data-energia-camera="pad">УКСС</button><button data-energia-camera="duct">ГАЗОХОД</button><button data-energia-camera="auto">АВТО</button></div>',
  '<details class="energia-disclaimer"><summary>О точности реконструкции и источниках</summary><p>Дата, время старта и документированные события подтверждены архивом. Отделение «Полюса» на высоте около 110 км подтверждено архивом; точная секунда не установлена. Промежуточные значения скорости, высоты, удаления и тангажа — демонстрационная интерполяция, не реальная телеметрия. Геометрия факелов, дым, работа механизмов и камера — художественно-техническая реконструкция по фотографиям УКСС. Визуальный масштаб полёта сжат относительно земной поверхности.</p><p>Источники: <a href="https://www.buran.ru/htm/cargo.htm" target="_blank" rel="noopener noreferrer">Buran.ru — «Полюс»</a> · <a href="https://www.buran.ru/htm/gud%2021.htm" target="_blank" rel="noopener noreferrer">В. Е. Гудилин</a> · <a href="https://www.buran.ru/htm/rocrt.htm" target="_blank" rel="noopener noreferrer">РД-170 / РД-0120</a>.</p></details>'
 ].join('');
 document.body.append(panel);
 const $=id=>panel.querySelector('#'+id);
 let active=false,paused=false,speed=8,seconds=ENERGIA_LAUNCH_START,lastNow=null,mode='follow',saved=null,sceneRestore=null;
 let effects=null,lastPhase=-1,originalRocket=null,lastFrame=null,modelReady=false,preview=null;
 let cameraDetached=false,detachedAt=null;
 const followStartingTarget=new THREE.Vector3();
 let initialCameraPose=null;
 const cinematicHiddenSelectors=['.energia-cameras','.energia-camera-hint','.energia-timeline',
  '.energia-actions','.energia-rate','.energia-disclaimer'];
 function resetCinematicPanel(){
  cameraDetached=false;detachedAt=null;
  panel.classList.remove('energia-cinematic-ascent');
  for(const selector of cinematicHiddenSelectors){
   const el=panel.querySelector(selector);if(el)el.hidden=false;
  }
 }
 function setCinematicDetach(detach,s){
  if(cameraDetached===detach)return;
  cameraDetached=detach;
  panel.classList.toggle('energia-cinematic-ascent',detach);
  for(const selector of cinematicHiddenSelectors){
   const el=panel.querySelector(selector);if(el)el.hidden=detach;
  }
  if(detach){
   detachedAt={time:s.time,height:energiaCameraHeightUnits(s.altitudeKm),
    camera:camera.position.toArray(),target:controls.target.toArray()};
   mode='detached';
   controls.enablePan=true;
  }else{
   // Seeking back under the H=100 threshold must never teleport the view.
   detachedAt=null;mode='follow';controls.enablePan=false;
   followStartingTarget.copy(controls.target);
  }
 }
 const source=()=>getEntry?.();
 function ensure(){
  const entry=source();if(!entry||entry.status!=='ready')return false;
  if(!effects)effects=addEffectSystem(siteRoot,camera,renderer,objects);
  modelReady=true;return true;
 }
 const poseRocket=(sample)=>{
  const entry=source();if(!entry||!originalRocket)return;
  const origin=originalRocket.position,world=visualHeight(sample.altitudeKm);
  const sideways=sample.downrangeKm*.42,fore=-sample.downrangeKm*.28;
  entry.holder.position.set(origin.x+sideways/.14,origin.y+world/.14,origin.z+fore/.14);
  entry.holder.rotation.set(originalRocket.rotation.x+sample.pitchDegrees*Math.PI/180,originalRocket.rotation.y,originalRocket.rotation.z);
  entry.holder.visible=sample.time<480;
 };
 // Orbit center is the actual moving rocket, not the stationary UKSS or
 // the old camera pivot. After payload separation follow the visible payload.
 function rocketOrbitTarget(s){
  if(s.payloadSeparated&&preview?.visible){
   preview.updateWorldMatrix(true,false);
   return preview.getWorldPosition(V());
  }
  const holder=source()?.holder;
  if(!holder)return siteRoot.localToWorld(V(0,28,0));
  holder.updateWorldMatrix(true,false);
  return holder.localToWorld(V(0,28,0));
 }
 function alignFollowFromCurrentAngle(s,inputDirection=null){
  const target=rocketOrbitTarget(s);
  // Capture before historical mode toggles can adjust a linked camera.
  const direction=inputDirection?.clone()||camera.position.clone().sub(controls.target);
  if(direction.lengthSq()<1e-8)direction.set(1,.7,1);
  // The launching visitor can start from ANY azimuth/elevation, even in an
  // overview. A gentle bounded zoom gives a legible close-up without swapping
  // to a hard-coded view or rotating their angle.
  const distance=clamp(direction.length(),18,115);
  direction.normalize().multiplyScalar(distance);
  const intendedEye=target.clone().add(direction);
  camera.position.copy(intendedEye);controls.target.copy(target);
  // OrbitControls may still hold a damped delta from the visitor's last drag.
  // First update flushes that pending input; re-applying the preserved eye
  // guarantees the launch starts at the EXACT visible azimuth/elevation.
  controls.update();
  camera.position.copy(intendedEye);controls.target.copy(target);
  controls.update();camera.updateMatrixWorld(true);
 }
 function scenePose(modeName,s){
  const worldPos=source().holder.getWorldPosition(V());
  let target,eye;
  if(modeName==='duct'){
   target=siteRoot.localToWorld(V(95,-12,0));
   eye=siteRoot.localToWorld(V(230,95,215));
  }else if(modeName==='pad'){
   target=siteRoot.localToWorld(V(0,25,0));
   eye=siteRoot.localToWorld(V(255,145,325));
  }else{
   target=rocketOrbitTarget(s);
   eye=target.clone().add(s.altitudeKm>3?V(27,19,35):V(19,16,26));
  }
  return {eye,target};
 }
 const updateCamera=s=>{
  if(cameraDetached||mode==='manual')return;
  if(mode==='follow'){
   // Keep the visitor's EXACT existing eye/target through prelaunch.
   // Starting an animation must not zoom, pan, or change the view angle.
   if(s.time<=0)return;
   // Once airborne, blend the orbit target into the moving rocket over
   // eight flight seconds. Shift eye and target together so rotation and
   // zoom stay user-controlled, with no abrupt camera jump at liftoff.
   const blend=smooth(0,8,s.time);
   const target=followStartingTarget.clone().lerp(rocketOrbitTarget(s),blend);
   const delta=target.clone().sub(controls.target);
   camera.position.add(delta);controls.target.copy(target);controls.update();
   return;
  }
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
  if(effects)lastFrame=effects.pose(s,source()?.holder);
  visualPayload(s);
  setCinematicDetach(shouldDetachEnergiaCamera(s.altitudeKm),s);
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
  $('energiaCameraHint').textContent=mode==='follow'?'ЗА РАКЕТОЙ · ВРАЩАЙТЕ КАМЕРУ ВОКРУГ РАКЕТЫ, ПОЛЁТ НЕ ПРЕРВЁТСЯ.':mode==='manual'?'СВОБОДНАЯ КАМЕРА · ПОЛЁТ ПРОДОЛЖАЕТСЯ. «ЗА РАКЕТОЙ» ВЕРНЁТ СОПРОВОЖДЕНИЕ.':'ВЫБРАННЫЙ РАКУРС · «ЗА РАКЕТОЙ» ВЕРНЁТ СОПРОВОЖДЕНИЕ.';
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
  const launchEye=camera.position.clone(),launchTarget=controls.target.clone();
  if(!active){
    saved={camera:camera.position.clone(),target:controls.target.clone(),
    enabled:controls.enabled,damping:controls.enableDamping,pan:controls.enablePan,
    mouseButtons:{...controls.mouseButtons},touches:{...controls.touches},
    minDistance:controls.minDistance,maxDistance:controls.maxDistance,rocketVisible:entry.holder.visible};
   originalRocket={position:entry.holder.position.clone(),rotation:entry.holder.rotation.clone()};
   sceneRestore=onStart?.()||null;
   active=true;panel.hidden=false;document.body.classList.add('energia-launch-active');effects.root.visible=true;effects.enableShadows();
   controls.enableDamping=false;controls.enabled=true;
   // Follow mode turns any primary drag into an orbit around the rocket.
   // There is no pan escape from the moving focal point.
   controls.enablePan=false;
   controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};
   controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_ROTATE};
   controls.minDistance=12;
   // Existing detailed views can be farther than 300 world units. Do
   // not clamp the visitor's distance when beginning the animation.
   controls.maxDistance=Math.max(300,launchEye.distanceTo(launchTarget)+10);
   createPayloadProxy();
  }
  seconds=ENERGIA_LAUNCH_START;paused=false;speed=8;$('energiaSpeed').value='8';lastNow=null;lastPhase=-1;mode='follow';
  resetCinematicPanel();
  followStartingTarget.copy(launchTarget);
  initialCameraPose={position:launchEye.toArray(),target:launchTarget.toArray()};
  controls.enablePan=false;
  // Flush any damped prelaunch gesture and then restore the exact original
  // shot. No orbit preset or range clamp can change the opening frame.
  controls.enableDamping=false;controls.update();
  camera.position.copy(launchEye);controls.target.copy(launchTarget);
  camera.updateMatrixWorld(true);
  render();
  return true;
 }
 function stop({releaseCamera=true}={}){
  if(!active)return false;
  active=false;paused=false;lastNow=null;panel.hidden=true;document.body.classList.remove('energia-launch-active');
  resetCinematicPanel();
  const entry=source();
  if(originalRocket&&entry){
   entry.holder.position.copy(originalRocket.position);
   entry.holder.rotation.copy(originalRocket.rotation);
   entry.holder.visible=saved.rocketVisible;
  }
  if(effects){effects.hideExhaust();effects.root.visible=false;effects.disableShadows();}
  if(preview)preview.visible=false;
  sceneRestore?.();sceneRestore=null;
  if(saved){
   controls.enabled=saved.enabled;
   controls.enablePan=saved.pan;
   controls.mouseButtons={...saved.mouseButtons};
   controls.touches={...saved.touches};
   controls.minDistance=saved.minDistance;controls.maxDistance=saved.maxDistance;
   controls.enableDamping=false;controls.update();
   if(releaseCamera){camera.position.copy(saved.camera);controls.target.copy(saved.target);controls.update();}
   controls.enableDamping=saved.damping;
  }
  onStop?.();saved=null;originalRocket=null;lastPhase=-1;return true;
 }
 function setManualCamera(){
  if(!active)return false;
  if(cameraDetached)return true;
  if(mode==='follow')return true;
  if(mode!=='manual'){mode='manual';controls.enablePan=true;render();}
  return true;
 }
 // THREE OrbitControls dispatches start only for actual pointer/wheel/touch
 // gestures, not for the programmatic camera animation in updateCamera().
 controls.addEventListener('start',setManualCamera);
 function pause(){paused=true;lastNow=null;render();}
 function play(){if(seconds>=ENERGIA_LAUNCH_END){seconds=ENERGIA_LAUNCH_START;speed=8;$('energiaSpeed').value='8';}paused=false;lastNow=null;render();}
 function seek(value){if(!active&&!start())return false;seconds=clamp(Number(value)||0,ENERGIA_LAUNCH_START,ENERGIA_LAUNCH_END);if(seconds>=0){speed=1;$('energiaSpeed').value='1';}pause();return true;}
 $('energiaClose').onclick=()=>stop();
 $('energiaPlay').onclick=()=>seconds>=ENERGIA_LAUNCH_END?start():paused?play():pause();
 $('energiaRestart').onclick=()=>start();
 $('energiaSpeed').onchange=e=>{speed=Number(e.target.value)||8;lastNow=null;};
 $('energiaSeek').oninput=e=>seek(e.target.value);
 for(const button of panel.querySelectorAll('[data-energia-camera]'))button.onclick=()=>{
  if(cameraDetached)return;
  mode=button.dataset.energiaCamera;
  controls.enablePan=mode!=='follow';
  render();
  if(mode==='follow'){alignFollowFromCurrentAngle(sampleEnergiaLaunch(seconds));}
  else{const p=scenePose(mode==='auto'?'pad':mode,sampleEnergiaLaunch(seconds));
   camera.position.copy(p.eye);controls.target.copy(p.target);controls.update();}
 };
 const leave=e=>{if(active&&e.target.closest('button,a,input,select,summary')&&!e.target.closest('#energiaLaunchPanel,#energiaLaunchStart,#modelInspector'))stop({releaseCamera:false});};
 document.addEventListener('pointerdown',leave,{capture:true});
 document.addEventListener('keydown',e=>{
  if(!active||/input|textarea|select/i.test(e.target?.tagName||''))return;
  if(e.key==='Escape'){e.preventDefault();stop();}
  if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(e.key.toLowerCase()))setManualCamera();
 });
 window.addEventListener('resize',()=>{lastNow=null;});
 document.addEventListener('visibilitychange',()=>{lastNow=null;});
 return {start,stop,pause,play,seek,setManualCamera,isActive:()=>active,stats:()=>({version:ENERGIA_LAUNCH_VERSION,active,paused,speed,time:seconds,mode,phase:lastPhase,telemetry:sampleEnergiaLaunch(seconds),
   modelReady,cameraDetached,initialCameraPose:initialCameraPose?{
    position:[...initialCameraPose.position],target:[...initialCameraPose.target]}:null,
   detachAtHeightH:ENERGIA_CAMERA_DETACH_UNITS,
   visualHeightH:energiaCameraHeightUnits(sampleEnergiaLaunch(seconds).altitudeKm),
   cinematicPanel:panel.classList.contains('energia-cinematic-ascent'),
   detachedAt:detachedAt?{...detachedAt}:null,
   orbitTarget:active?rocketOrbitTarget(sampleEnergiaLaunch(seconds)).toArray():null,clockMode:seconds>=0?'flight':'prelaunch',flightRate:speed,rocketVisible:source()?.holder.visible??false,rocketAtMount:!active,rocketVerticalWorld:visualHeight(sampleEnergiaLaunch(seconds).altitudeKm),effects:effects?{visible:effects.root.visible,gasChannel:'single +X petal',instancedSmokeCount:3335,smokeMode:'multi-octave-feathered-billboards',ductJetCount:7,steam:lastFrame?.steam,steamEnvelope:lastFrame?.steamEnvelope,steamMaterialOpacity:lastFrame?.steamMaterialOpacity,water:lastFrame?.water,plume:lastFrame?.plume,padFireFade:lastFrame?.padFireFade,padSmokeFade:lastFrame?.padSmokeFade,shadowMapEnabled:effects.shadowState().enabled,shadowLightIntensity:effects.shadowState().lightIntensity,shadowReceiverCount:effects.shadowState().receivers,shadowCasterCount:effects.shadowState().casters,shadowMapResolution:effects.shadowState().mapResolution,engineJetCount:lastFrame?.engineJetCount,engineFlameAttached:lastFrame?.engineFlameAttached,
   enginePlasmaRibbonCount:lastFrame?.enginePlasmaRibbonCount,
   engineNozzleGlowCount:lastFrame?.engineNozzleGlowCount,
   engineNozzleGlowVisible:lastFrame?.engineNozzleGlowVisible,
   engineNozzleGlowOpacity:lastFrame?.engineNozzleGlowOpacity,
   engineUpperFlameLimitY:lastFrame?.engineUpperFlameLimitY,
   engineHaloUpperLimitY:lastFrame?.engineHaloUpperLimitY,
   engineFlameDepthCompatible:lastFrame?.engineFlameDepthCompatible,
   engineFlameDepthTest:lastFrame?.engineFlameDepthTest,
   rocketNozzleWorld:lastFrame?.rocketNozzleWorld,
   engineCorePower:lastFrame?.engineCorePower,engineBoosterPower:lastFrame?.engineBoosterPower,umbilicalRelease:lastFrame?.umbilicalRelease,ductJetVisible:lastFrame?.ductJetVisible,gasPower:lastFrame?.ductPower,flamePower:lastFrame?.flamePower,mobileTowerArms:lastFrame?.mobileTowerArms,rocketExhaustOffset:lastFrame?.rocketExhaustOffset,lightIntensity:lastFrame?.lightIntensity}:null}),
  update(now){
   if(!active)return;
   if(lastNow!==null&&!paused&&!document.hidden){
    const previous=seconds;
    seconds=advanceEnergiaClock(seconds,Math.max(0,(now-lastNow)/1000),speed,speed);
    if(previous<0&&seconds>=0){speed=1;$('energiaSpeed').value='1';}
   }
   lastNow=now;if(seconds>=ENERGIA_LAUNCH_END)paused=true;
   const s=sampleEnergiaLaunch(seconds);
   render();updateCamera(s);
  }};
}
