import {SILO_SITE_IDS} from './silo-sites.js?v=20261029-all-silos-v2';

export const MUSEUM_MENU_VERSION='museum-traditions-v7';

// Use the reviewed catalogue and the same silo roster as the rendered models.
// Technical complexes, measurement sites, hotels and rail stations are not
// launch sites merely because they have a numbered cosmodrome address.
export const MUSEUM_LAUNCH_ENTRIES=Object.freeze([
 {id:'pad-1',label:'Гагаринский старт'},
 {id:'pad-31',label:'Площадка 31'},
 {id:'pad-45',label:'Зенит / Байтерек · пл. 45'},
 {id:'pad-81',label:'Протон · пл. 81'},
 {id:'pad-200',label:'Протон · пл. 200'},
 {id:'pad-90',label:'Циклоны · пл. 90'},
 {id:'pad-250',label:'УКСС'},
 {id:'pad-110',label:'Энергия — Буран · пл. 110'},
 {id:'pad-41',label:'Р-16 · пл. 41'}
].map(entry=>Object.freeze(entry)));
export const MUSEUM_SILO_GROUP=Object.freeze({id:'siloInstallations',title:'Шахтные установки',siteIds:SILO_SITE_IDS});
const LAUNCH_SITE_IDS=new Set(MUSEUM_LAUNCH_ENTRIES.map(entry=>entry.id)),SILO_IDS=new Set(SILO_SITE_IDS);
export function isMuseumSilo(record){return SILO_IDS.has(record?.id);}
export function museumCatalogueSection(record){
 return LAUNCH_SITE_IDS.has(record?.id)||isMuseumSilo(record)
  ?'sitesAccordion':'infrastructureAccordion';
}

// These entries open exhibits and animations already present in the museum.
// The separate knowledge base can add stories later without inventing them here.
export const MUSEUM_SECTIONS=Object.freeze([
 {id:'sitesAccordion',title:'СТАРТОВЫЕ КОМПЛЕКСЫ',catalogue:true},
 {id:'equipmentAccordion',title:'РАКЕТЫ И ТЕХНИКА',items:[
  {action:'zenit-3sl',title:'«Зенит»',description:'Площадка №45 · просмотр ракеты в 3D'},
  {action:'r7',title:'«Союз»',description:'Гагаринский старт и площадка №31'},
  {action:'energia-polyus',title:'«Энергия — Полюс»',description:'Ракета-экспонат на УКСС'},
  {action:'energia-buran',title:'«Энергия — Буран»',description:'Площадка №110, МИК и транспортёры'},
  {action:'energia',title:'«Энергия»',description:'Четырёхблочная ракета-носитель'},
  {action:'energia-m',title:'«Энергия-М»',description:'Двухблочная компоновка проекта'},
  {action:'tua',title:'«Кузнечики»',description:'Транспортно-установочные агрегаты'},
  {action:'cyclone-2',title:'«Циклон»',description:'Площадка №90 · Циклон-2 и Циклон-3 в 3D'},
  {action:'proton',title:'«Протон-М»',description:'Площадки №81 и №200 · просмотр в 3D'},
  {action:'n1',title:'«Н-1»',description:'Лунная ракета · просмотр в 3D'},
  {action:'r16',title:'Р-16',description:'Музейный экспонат на площадке №41 · просмотр в 3D'},
  {action:'mig25',title:'МиГ-25',description:'Рассмотреть самолёт в 3D'},
  {action:'mriya',title:'«Мрия» с «Бураном»',description:'Экспонат на Юбилейном'},
  {action:'aircraft',title:'Самолёт',description:'Сопровождение текущего рейса'},
  {action:'sprinter',title:'Mercedes-Benz Sprinter',description:'Экскурсионный микроавтобус RocketTrip'},
  {action:'train',title:'М62 и вагоны',description:'Локомотив и четыре вагона'},
  {action:'silo',title:'Шахтная пусковая установка',description:'Площадка №109'},
  {action:'flight-cycle',title:'Москва — Крайний — Москва',description:'Посадка · стоянка · вылет'},
  {action:'train-cycle',title:'Рейс мотовоза',description:'Площадка №1 → Тюратам'},
  {action:'silo-cycle',title:'Открытие шахты',description:'Крышка и пар при приближении'}
 ]},
 {id:'infrastructureAccordion',title:'ИНФРАСТРУКТУРА',catalogue:true},
 {id:'mythsAccordion',title:'МИФЫ И ЛЕГЕНДЫ',items:[],empty:'Материалы раздела пока не добавлены.'},
 {id:'traditionsAccordion',title:'ТРАДИЦИИ И СУЕВЕРИЯ',items:[],empty:'Истории о традициях и суевериях космодрома готовятся к публикации.'},
 {id:'graveyardAccordion',title:'КОСМИЧЕСКОЕ КЛАДБИЩЕ',items:[
  {action:'r16-memorial',title:'Катастрофа Р-16',description:'Площадка №41'},
  {action:'mik-ruins',title:'Разрушенные пролёты МИК',description:'Площадка №112'}
 ]}
]);

export function installMuseumMenu({container,onAction,stories=[]}){
 let lastAction=null;
 const sections=[...container.querySelectorAll('.museum-section')];
 for(const section of sections){
  section.addEventListener('toggle',()=>{
   if(section.open)for(const other of sections)if(other!==section)other.open=false;
  });
 }
 for(const baseSection of MUSEUM_SECTIONS){
  const section=baseSection.id==='mythsAccordion'?{...baseSection,items:stories}:baseSection;
  const details=container.querySelector('#'+section.id);
  if(!details)throw new Error('Museum section is missing: '+section.id);
  if(section.catalogue)continue;
  const body=details.querySelector('[data-menu-items]')||details.querySelector('.sites-accordion-body'),counter=details.querySelector('.sites-accordion-count');
  body.replaceChildren();
  for(const item of section.items){
   const button=document.createElement('button');button.type='button';button.className='museum-menu-entry';button.dataset.museumAction=item.action;
   const title=document.createElement('span');title.className='museum-menu-entry-title';title.textContent=item.title;
   const description=document.createElement('span');description.className='museum-menu-entry-description';description.textContent=item.description;
   button.append(title,description);
   button.addEventListener('click',event=>{
    // Starting a following mode must not bubble into the sidebar's ordinary
    // navigation handler, which stops the previous following mode.
    event.stopPropagation();
    if(onAction(item.action)!==false)lastAction=item.action;
   });
   body.append(button);
  }
  if(!section.items.length){const empty=document.createElement('p');empty.className='museum-menu-empty';empty.textContent=section.empty;body.append(empty);}
  const count=details.querySelectorAll('[data-museum-action],.entry').length;counter.textContent=String(count);counter.hidden=count===0;
 }
 return {stats:()=>({version:MUSEUM_MENU_VERSION,lastAction,sections:sections.map(section=>{
  const siteIds=[...section.querySelectorAll('[data-site-id]')].map(entry=>entry.dataset.siteId);
  return {id:section.id,open:section.open,
   count:section.querySelectorAll(section.id==='sitesAccordion'?'#list > .entry,#list > .silo-group':'[data-museum-action],.entry').length,
   siteIds,siteCount:siteIds.length,
   researchIds:[...section.querySelectorAll('[data-research-id]')].map(entry=>entry.dataset.researchId)};
 })})};
}
