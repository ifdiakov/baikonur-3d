import {SILO_SITE_IDS} from './silo-sites.js?v=20261029-all-silos-v2';
export const MODEL_VIEWER_VERSION='mig25ru-v1';
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
 'mig25ru':{title:'МиГ-25РУ',subtitle:'Учебный самолёт · борт 32',description:'Модель по фотографиям: две ступенчатые кабины, глубокие воздухозаборники, парные сопла и выпускаемое шасси. Светло-серая окраска и красный номер 32.',kind:'aircraft'},
 mig:{title:'МиГ-25 ЛЛ22',subtitle:'Самолёт сопровождения',description:'Музейная модель самолёта оптического наблюдения из реконструкции посадки «Бурана».',kind:'aircraft'},
 mriya:{title:'Мрия и Буран',subtitle:'Ан-225 · аэродром Юбилейный',description:'Транспортный самолёт с орбитальным кораблём в музейной окраске по референсам.',kind:'aircraft',asset:'mriya-buran/near-v2.glb',yaw:Math.PI/2},
 aircraft:{title:'Самолёт Алросы',subtitle:'Рейс на Крайний',description:'Музейная модель семейства Boeing 737: окраска Алросы, освещённые окна, кабина и выпущенное шасси.',kind:'aircraft'},
 train:{title:'Мотовоз',subtitle:'Железнодорожная техника',description:'Маневровый тепловоз из состава, курсирующего между площадкой №1 и городом. Модель по фотографиям.',kind:'vehicle'},
 coach:{title:'Пассажирский вагон',subtitle:'Железнодорожная техника',description:'Вагон музейного состава: тележки, колёсные пары, тамбуры и окна.',kind:'vehicle'},
 silo:{title:'Шахтная установка',subtitle:'Музейная модель ШПУ',description:'Крышка шахты, видимый носовой отсек и белый пар. При приближении к центру крышка открывается.',kind:'site'},
 site45:{title:'Старт Зенита',subtitle:'Историческая площадка №45/1',description:'Реконструкция по десяти фотографиям: открытый газоход, стартовый стол, откидная стрела, удалённая башня и мачты. Размеры сооружений оценены по фото.',kind:'site'}
});
const siteModels={
 'pad-1':['soyuz','train','coach'],'pad-31':['soyuz'],'pad-45':['zenit-land','site45','zenit-sea'],
 'pad-42':['zenit-land'],'pad-250':['energia-polyus','energia-buran','energia'],
 'pad-110':['energia-buran','energia'],'pad-112':['tua','energia-buran','energia-polyus','energia','energia-m'],
 'pad-112a':['buran','energia-buran'],'pad-251':['mriya','buran','mig25ru','mig'],'airfield':['aircraft'],'city':['train','coach'],
 ...Object.fromEntries(SILO_SITE_IDS.map(id=>[id,['silo']]))
};
export function modelsForObject(record){if(record?.isRailStation||record?.id?.startsWith('rail-station-')||record?.category==='Железнодорожная станция')return ['train','coach'];return [...(siteModels[record?.id]||[])];}
export function modelsForKnowledge(id){if(id==='zenit')return ['zenit-land','zenit-sea'];if(id==='buran')return ['buran','energia-buran','mriya'];return MODEL_CATALOG[id]?[id]:[];}
