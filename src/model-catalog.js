import {SILO_SITE_IDS} from './silo-sites.js?v=20261029-all-silos-v2';
export const MODEL_VIEWER_VERSION='proton-launch-v1';
export const MODEL_CATALOG=Object.freeze({
 soyuz:{title:'Союз',subtitle:'Ракета-экспонат',description:'Подробная модель из коллекции музея. Доступна на Гагаринском старте и площадке №31.',kind:'rocket',asset:'rockets/soyuz.glb'},
 'energia-polyus':{title:'Энергия — Полюс',subtitle:'Ракета и полезная нагрузка',description:'Компоновка «Энергии» с аппаратом «Полюс», представленная на УКСС.',kind:'rocket',asset:'rockets/energia-polyus.glb'},
 'energia-buran':{title:'Энергия — Буран',subtitle:'Ракетно-космический комплекс',description:'Орбитальный корабль и ракета-носитель из коллекции музея.',kind:'rocket',asset:'rockets/energia-buran.glb'},
 energia:{title:'Энергия',subtitle:'Ракета-носитель',description:'Четырёхблочная компоновка без боковой полезной нагрузки.',kind:'rocket',asset:'rockets/energia.glb'},
 'energia-m':{title:'Энергия-М',subtitle:'Проект двухблочной ракеты',description:'Два боковых блока и центральная ступень. Модель из коллекции музея.',kind:'rocket',asset:'rockets/energia-m.glb'},
 'zenit-land':{title:'Зенит-3SLБ',subtitle:'Наземный старт · площадка №45',description:'Байконурская версия: общая длина 58,7 м, обтекатель 4,10 м. Музейная реконструкция на основе модели «Зенита» и данных производителя.',kind:'rocket',source:'https://yuzhmash.com/en/products/launch-vehicles/zenit-3slb/'},
 'zenit-sea':{title:'Зенит-3SL',subtitle:'Морской старт · Sea Launch',description:'Морская версия по восьми предоставленным ракурсам: четыре сопла, открытая ферма, наружные трубопроводы.',kind:'rocket',source:'https://yuzhmash.com/en/products/launch-vehicles/zenit-3sl-launch-vehicle/'},
 tua:{title:'Кузнечики',subtitle:'Транспортно-установочный агрегат',description:'Подробная модель транспортёра с площадки №112. Свободный обзор ходовой части, рам и опор.',kind:'vehicle',asset:'tua/model-v2.glb'},
 buran:{title:'Буран',subtitle:'Орбитальный корабль · посадочная конфигурация',description:'Отдельный корабль из реконструкции посадки на Юбилейном: исходная обшивка, открытые створки и выпущенное шасси.',kind:'aircraft'},
 'mig25':{title:'МиГ-25',subtitle:'Борт 31 · стояночная конфигурация',description:'Кабина, воздухозаборники, шасси, подвески и сопла в исходной модели из коллекции.',kind:'aircraft',asset:'mig25/model-v1.glb',source:'https://sketchfab.com/3d-models/mig25-afe67617c5294dce9056106a22f640ff',credit:'manilov.ap · CC BY 4.0 · адаптация',views:{cockpit:{target:[0,3.2724,4.0717],offset:[3.6,1.6,4.4]},exhaust:{target:[0,2.3543,-9.1059],offset:[3.1,1.2,-5.3]}}},
 n1:{title:'Н-1',subtitle:'Лунная ракета · площадка №110',description:'Ступени, решётчатые переходники, двигательный блок и головная часть сверхтяжёлой лунной ракеты.',kind:'rocket',asset:'rockets/n1.glb',source:'https://sketchfab.com/3d-models/n1-rocket-7e9fbb8d9b794060bd8331934571c4dc',credit:'Scilence · CC BY 4.0 · адаптация'},
 proton:{title:'Протон-М',subtitle:'Площадки №81 и №200',description:'Шесть боковых баков, открытая межступенчатая ферма, двигатели и обтекатель в окраске по референсам. Ступени можно разнести для осмотра.',kind:'rocket',source:'https://www.ilslaunch.com/launch-vehicle/proton-breeze-m/',views:{front:{target:[0,1.6,0],offset:[8,-7,11]},side:{target:[0,22.2,0],offset:[8,2,11]},top:{target:[0,49,0],offset:[12,4,16]}}},
 mig:{title:'МиГ-25 ЛЛ22',subtitle:'Самолёт сопровождения',description:'Музейная модель самолёта оптического наблюдения из реконструкции посадки «Бурана».',kind:'aircraft'},
 mriya:{title:'Мрия и Буран',subtitle:'Ан-225 · аэродром Юбилейный',description:'Транспортный самолёт с орбитальным кораблём в музейной окраске по референсам.',kind:'aircraft',asset:'mriya-buran/near-v2.glb',yaw:Math.PI/2},
 aircraft:{title:'Самолёт Алросы',subtitle:'Рейс на Крайний',description:'Музейная модель семейства Boeing 737: окраска Алросы, освещённые окна, кабина и выпущенное шасси.',kind:'aircraft'},
 train:{title:'Мотовоз',subtitle:'Железнодорожная техника',description:'Маневровый тепловоз из состава, курсирующего между площадкой №1 и городом. Модель по фотографиям.',kind:'vehicle'},
 coach:{title:'Пассажирский вагон',subtitle:'Железнодорожная техника',description:'Вагон музейного состава: тележки, колёсные пары, тамбуры и окна.',kind:'vehicle'},
 silo:{title:'Шахтная установка',subtitle:'Музейная модель ШПУ',description:'Крышка шахты, видимый носовой отсек и белый пар. При приближении к центру крышка открывается.',kind:'site'},
 'proton-pad':{title:'Старт Протона',subtitle:'Площадки №81 и №200',description:'Стартовая позиция по фотографиям: шесть опор, два боковых газохода, передвижная башня с кольцевыми площадками, лифтами и кранами. Уберите ракету, чтобы рассмотреть проём и отражатель.',kind:'site',initialView:'front',viewLabels:{front:'Стартовая позиция',side:'Газоходы',top:'Башня'},source:'https://github.com/ifdiakov/baikonur-3d/blob/main/docs/proton-launch-reference.md',sourceLabel:'Источники реконструкции ↗',views:{front:{target:[0,23,0],offset:[100,77,-125]},side:{target:[25,-3,0],offset:[48,34,40]},top:{target:[0,32,303],offset:[70,35,-113]},interface:{target:[0,-1,0],offset:[18,22,-23]}}},
 site45:{title:'Старт Зенита',subtitle:'Историческая площадка №45/1',description:'Реконструкция по десяти фотографиям: открытый газоход, стартовый стол, откидная стрела, удалённая башня и мачты. Размеры сооружений оценены по фото.',kind:'site'}
});
const siteModels={
 'pad-1':['soyuz','train','coach'],'pad-31':['soyuz'],'pad-45':['zenit-land','site45','zenit-sea'],
 'pad-81':['proton-pad','proton'],'pad-200':['proton-pad','proton'],'pad-92':['proton'],'pad-42':['zenit-land'],'pad-250':['energia-polyus','energia-buran','energia'],
 'pad-110':['energia-buran','energia','n1'],'pad-112':['tua','energia-buran','energia-polyus','energia','energia-m','n1'],
 'pad-112a':['buran','energia-buran'],'pad-251':['mriya','buran','mig25','mig'],'airfield':['aircraft'],'city':['train','coach'],
 ...Object.fromEntries(SILO_SITE_IDS.map(id=>[id,['silo']]))
};
export function resolveModelId(id){return id==='mig25ru'?'mig25':id;}
export function modelsForObject(record){if(record?.isRailStation||record?.id?.startsWith('rail-station-')||record?.category==='Железнодорожная станция')return ['train','coach'];return [...(siteModels[record?.id]||[])];}
export function modelsForKnowledge(id){id=resolveModelId(id);if(id==='zenit')return ['zenit-land','zenit-sea'];if(id==='buran')return ['buran','energia-buran','mriya'];return MODEL_CATALOG[id]?[id]:[];}
