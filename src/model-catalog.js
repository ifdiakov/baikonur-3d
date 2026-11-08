import {SILO_SITE_IDS} from './silo-sites.js?v=20261029-all-silos-v2';
import {MODEL_FACTS,MODEL_FACTS_VERSION} from './model-facts.js?v=20261108-rd180-v1';
export const MODEL_VIEWER_VERSION=MODEL_FACTS_VERSION;
const definitions={
 rd180:{title:'РД-180',subtitle:'НПО «Энергомаш» · двигатель Atlas',kind:'engine',asset:'rd180/model-v1.glb',assetRevision:'rd180-20261108-v1',source:'https://sketchfab.com/3d-models/180-acf0e1b46a2e48158e64015335f9fb5e',credit:'viktor_durov · CC BY 4.0 · материалы и адаптация RocketTrip',viewLabels:{front:'Сопла',side:'Трубопроводы',top:'Агрегаты'},views:{front:{target:[0,.65,0],offset:[0,-1.4,6]},side:{target:[0,2.25,0],offset:[3.7,1,3.6]},top:{target:[0,2.7,0],offset:[2.3,2.8,2.8]}}},
 soyuz5:{title:'Союз-5',subtitle:'Байтерек · площадка №45',kind:'rocket',asset:'rockets/soyuz5.glb',yaw:Math.PI,assetRevision:'soyuz5-20261108-v1',source:'https://github.com/ifdiakov/baikonur-3d/blob/main/docs/soyuz5-source-model.md',sourceLabel:'Источники модели ↗',viewLabels:{front:'Двигатели',side:'Стык ступеней',top:'Обтекатель'},views:{front:{target:[0,2,0],offset:[6,-5,-9]},side:{target:[0,38.5,0],offset:[8,1.8,-12]},top:{target:[0,55,0],offset:[12,3,-18]}}},
 'pua-100':{title:'ПУА-100',subtitle:'Юбилейный · погрузочный агрегат',kind:'site',source:'https://github.com/ifdiakov/baikonur-3d/blob/main/docs/pua-100-reference.md',sourceLabel:'Источники реконструкции ↗',views:{front:{target:[0,25,20],offset:[68,15,75]},side:{target:[0,26,9],offset:[60,8,-8]}}},
 'cyclone-2':{title:'Циклон-2',subtitle:'Площадка №90 · Байконур',kind:'rocket',asset:'rockets/cyclone-2.glb'},
 'cyclone-3':{title:'Циклон-3',subtitle:'Коллекция моделей · Плесецк',kind:'rocket',asset:'rockets/cyclone-3.glb'},
 'cyclone-pad':{title:'Старт Циклона',subtitle:'Площадка №90 · историческая реконструкция',kind:'site',source:'https://github.com/ifdiakov/baikonur-3d/blob/main/docs/cyclone-reference.md',sourceLabel:'Источники реконструкции ↗',viewLabels:{front:'Стартовый стол',side:'Установщик',top:'Сверху'},views:{front:{target:[0,1.5,0],offset:[-11,7,-13]},side:{target:[0,18,4],offset:[26,12,-35]}}},
 soyuz:{title:'Союз',subtitle:'Ракета-экспонат',kind:'rocket',asset:'rockets/soyuz.glb',assetRevision:'soyuz-surface-20261108-v1'},
 'energia-polyus':{title:'Энергия — Полюс',subtitle:'Ракета и полезная нагрузка',kind:'rocket',asset:'rockets/energia-polyus.glb'},
 'energia-buran':{title:'Энергия — Буран',subtitle:'Ракетно-космический комплекс',kind:'rocket',asset:'rockets/energia-buran.glb',assetRevision:'buran-paint-20261102-v1'},
 energia:{title:'Энергия',subtitle:'Ракета-носитель',kind:'rocket',asset:'rockets/energia.glb'},
 'energia-m':{title:'Энергия-М',subtitle:'Проект двухблочной ракеты',kind:'rocket',asset:'rockets/energia-m.glb'},
 'zenit-land':{title:'Зенит-3SLБ',subtitle:'Наземный старт · площадка №45',kind:'rocket',source:'https://yuzhmash.com/en/products/launch-vehicles/zenit-3slb/'},
 'zenit-sea':{title:'Зенит-3SL',subtitle:'Морской старт · Sea Launch',kind:'rocket',source:'https://yuzhmash.com/en/products/launch-vehicles/zenit-3sl-launch-vehicle/'},
 tua:{title:'Кузнечики',subtitle:'Транспортно-установочный агрегат',kind:'vehicle',asset:'tua/model-v2.glb'},
 buran:{title:'Буран',subtitle:'Орбитальный корабль · посадочная конфигурация',kind:'aircraft'},
 'mig25':{title:'МиГ-25',subtitle:'Борт 31 · стояночная конфигурация',kind:'aircraft',asset:'mig25/model-v1.glb',source:'https://sketchfab.com/3d-models/mig25-afe67617c5294dce9056106a22f640ff',credit:'manilov.ap · CC BY 4.0 · адаптация',views:{cockpit:{target:[0,3.2724,4.0717],offset:[3.6,1.6,4.4]},exhaust:{target:[0,2.3543,-9.1059],offset:[3.1,1.2,-5.3]}}},
 n1:{title:'Н-1',subtitle:'Лунная ракета · площадка №110',kind:'rocket',asset:'rockets/n1.glb',source:'https://sketchfab.com/3d-models/n1-rocket-7e9fbb8d9b794060bd8331934571c4dc',credit:'Scilence · CC BY 4.0 · адаптация'},
 r16:{title:'Р-16',subtitle:'8К64 · площадка №41',kind:'rocket',asset:'rockets/r16.glb',assetRevision:'r16-reference-v2',source:'https://github.com/ifdiakov/baikonur-3d/blob/main/docs/r16-source-model.md',sourceLabel:'Источники модели ↗',viewLabels:{front:'Сопла',side:'Стык ступеней',top:'Верхушка'},views:{front:{target:[0,1.5,0],offset:[4.3,-3.6,6.8]},side:{target:[0,16.2,0],offset:[5.2,1.3,7.2]},top:{target:[0,27.8,0],offset:[4.5,1.6,7]}}},
 proton:{title:'Протон',subtitle:'Площадки №81 и №200',kind:'rocket',asset:'proton/rocket-v1.glb',assetRevision:'proton-source-20261108-v1',yaw:Math.PI,source:'https://github.com/ifdiakov/baikonur-3d/blob/main/docs/proton-source-model.md',sourceLabel:'Источники модели ↗',views:{front:{target:[0,1.6,0],offset:[8,-7,11]},side:{target:[0,22.2,0],offset:[8,2,11]},top:{target:[0,49,0],offset:[12,4,16]}}},
 mriya:{title:'Мрия и Буран',subtitle:'Ан-225 · аэродром Юбилейный',kind:'aircraft',asset:'mriya-buran/near-v2.glb',assetRevision:'buran-paint-20261102-v1',yaw:Math.PI/2},
 aircraft:{title:'Airbus A320 · Алроса',subtitle:'A320-214 · рейс на Крайний',kind:'aircraft',source:'https://sketchfab.com/3d-models/bulgaria-air-airbus-a320-214-ab1d295a30c1477eb8a81b072b5fbf06',credit:'Dave Love SketchFab · CC BY 4.0 · адаптация RocketTrip'},
 tu204:{title:'Ту-204-300 · ЦПК',subtitle:'«Юрий Гагарин» · RA-64044 · Крайний',kind:'aircraft',asset:'tu204-cpk/model-v1.glb',assetRevision:'20261101-tu204-cpk-v1',source:'https://sketchfab.com/3d-models/tupolev-tu-204-3acbd21815b14758a3e0d48e1ff82233',credit:'mamont nikita · CC BY 4.0 · ливрея и адаптация RocketTrip'},
 train:{title:'М62 · Космотранс',subtitle:'Магистральный тепловоз · Байконур',kind:'vehicle',source:'https://sketchfab.com/3d-models/teplovoz-m62-6a3deae9991f45bfa89c2a6882a044e7',credit:'Leafia dev. · CC BY 4.0 · адаптация RocketTrip'},
 coach:{title:'Пассажирский вагон',subtitle:'Служебный состав космодрома',kind:'vehicle',source:'https://sketchfab.com/3d-models/527c6d20f06443b2ad6d8f88bfe28e04',credit:'mamont nikita · CC BY 4.0 · адаптация RocketTrip'},
 silo:{title:'Шахтная установка',subtitle:'Музейная модель ШПУ',kind:'site'},
 'proton-pad':{title:'Старт Протона',subtitle:'Площадки №81 и №200',kind:'site',initialView:'front',viewLabels:{front:'Стартовая позиция',side:'Газоходы',top:'Башня'},source:'https://github.com/ifdiakov/baikonur-3d/blob/main/docs/proton-source-model.md',sourceLabel:'Источники реконструкции ↗',views:{front:{target:[0,23,0],offset:[100,77,-125]},side:{target:[25,-3,0],offset:[48,34,40]},top:{target:[0,32,303],offset:[70,35,-113]},interface:{target:[0,-1,0],offset:[18,22,-23]}}},
 site45:{title:'Старт Зенита',subtitle:'Историческая площадка №45/1',kind:'site'}
};
export const MODEL_CATALOG=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([id,spec])=>[id,{...spec,id,description:MODEL_FACTS[id].summary,facts:MODEL_FACTS[id]}])));
const siteModels={
 'pad-2':['buran'],
 'pad-90':['cyclone-2','cyclone-pad','cyclone-3'],
 'pad-1':['soyuz','train','coach'],'pad-31':['soyuz'],'pad-41':['r16'],'pad-45':['zenit-land','soyuz5','site45','zenit-sea'],
 'pad-81':['proton-pad','proton'],'pad-200':['proton-pad','proton'],'pad-92':['proton'],'pad-42':['zenit-land','soyuz5'],'pad-250':['energia-polyus','energia-buran','energia'],
 'pad-110':['energia-buran','energia','n1'],'pad-112':['tua','energia-buran','energia-polyus','energia','energia-m','n1'],
 'pad-112a':['energia-m','buran','energia-buran'],'pad-251':['pua-100','mriya','buran','mig25'],'airfield':['tu204','aircraft'],'city':['train','coach'],
 ...Object.fromEntries(SILO_SITE_IDS.map(id=>[id,['silo']]))
};
export function resolveModelId(id){return id==='mig25ru'?'mig25':id;}
export function modelsForObject(record){if(record?.isRailStation||record?.id?.startsWith('rail-station-')||record?.category==='Железнодорожная станция')return ['train','coach'];return [...(siteModels[record?.id]||[])];}
export function modelsForKnowledge(id){id=resolveModelId(id);if(id==='zenit')return ['zenit-land','zenit-sea'];if(id==='buran')return ['buran','energia-buran','mriya'];return MODEL_CATALOG[id]?[id]:[];}
