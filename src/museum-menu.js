// EVENING_NAVIGATION_V1
import {SILO_SITE_IDS} from './silo-sites.js?v=20261029-all-silos-v2';
import {COMPLEX_HISTORY_MENU} from './complex-history-menu.js?v=20261103-lean-startup-v1';

export const MUSEUM_MENU_VERSION='museum-six-sections-v15-buran-launch';

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

// Stable navigation groups. Animated reconstructions are not mixed into
// physical rocket exhibits, and one documented archive story has one home.
// Reconstruction links to UKSS/Yubileiny open their site cards: the actual
// launch/landing/loading buttons remain in those cards.
export const MUSEUM_STORY_GROUPS=Object.freeze({
 mythsAccordion:Object.freeze(['dmb-inscription','landing-turn','baikal-secret-flight']),
 traditionsAccordion:Object.freeze(['coins-under-tua']),
 graveyardAccordion:Object.freeze(['abort-51','polyus-turn'])
});
export const MUSEUM_SECTIONS=Object.freeze([
 {id:'sitesAccordion',title:'СТАРТОВЫЕ КОМПЛЕКСЫ',catalogue:true},
 {id:'equipmentAccordion',title:'РАКЕТЫ И ТЕХНИКА',items:[
  {action:'zenit-3sl',title:'«Зенит»',description:'Площадка №45 · просмотр ракеты в 3D'},
  {action:'r7',title:'«Союз»',description:'Гагаринский старт и площадка №31'},
  {action:'soyuz5',title:'«Союз-5»',description:'Байтерек · ступени и двигатели в 3D'},
  {action:'energia-polyus',title:'«Энергия — Полюс»',description:'Ракета-экспонат на УКСС'},
  {action:'energia-buran',title:'«Энергия — Буран»',description:'Площадка №110, МИК и транспортёры'},
  {action:'energia',title:'«Энергия»',description:'Четырёхблочная ракета-носитель'},
  {action:'energia-m',title:'«Энергия-М»',description:'Двухблочная компоновка проекта'},
  {action:'tua',title:'«Кузнечики»',description:'Транспортно-установочные агрегаты'},
  {action:'cyclone-2',title:'«Циклон»',description:'Площадка №90 · Циклон-2 и Циклон-3 в 3D'},
  {action:'rd180',title:'РД-180',description:'Двигатель Atlas · материалы, характеристики и связи'},
  {action:'proton',title:'«Протон»',description:'Площадки №81 и №200 · просмотр в 3D'},
  {action:'n1',title:'«Н-1»',description:'Лунная ракета · просмотр в 3D'},
  {action:'r16',title:'Р-16',description:'Музейный экспонат на площадке №41 · просмотр в 3D'},
  {action:'mig25',title:'МиГ-25',description:'Рассмотреть самолёт в 3D'},
  {action:'mriya',title:'«Мрия» с «Бураном»',description:'Экспонат на Юбилейном'},
  {action:'sprinter',title:'Mercedes-Benz Sprinter',description:'Экскурсионный микроавтобус RocketTrip'},
  {action:'silo',title:'Шахтная пусковая установка',description:'Площадка №109'}
 ]},
 {id:'reconstructionsAccordion',title:'ЦИФРОВЫЕ РЕКОНСТРУКЦИИ',items:[
  {action:'soyuz-launch-1',title:'Запуск «Союза» · Гагаринский старт',description:'Площадка №1 · механизмы «тюльпана», двигатели и газоотвод'},
  {action:'soyuz-launch-31',title:'Запуск «Союза» · площадка №31',description:'Площадка №31/6 · предстартовые операции и отрыв'},
  {action:'energia-reconstruction',title:'Запуск «Энергии — Полюс» · 1987',description:'УКСС · открыть карточку и запустить реконструкцию'},
  {action:'buran-launch-reconstruction',title:'Старт «Энергии — Бурана» · 1988',description:'Площадка 110 · отсчёт, обслуживание и три газоотвода'},
  {action:'buran-landing-reconstruction',title:'Посадка «Бурана» · 1988',description:'Юбилейный · запуск реконструкции в карточке аэродрома'},
  {action:'buran-loading-reconstruction',title:'Погрузка «Бурана» · ПУА-100',description:'Юбилейный · анимация погрузки в карточке'},
  {action:'flight-cycle',title:'Рейс Москва — Крайний — Москва',description:'Заход на посадку · стоянка · взлёт'},
  {action:'train-cycle',title:'Поезд: полный рейс мотовоза',description:'Площадка №1 → Тюратам · цикл движения'},
  {action:'silo-cycle',title:'Открытие шахтной установки',description:'Крышка и пар при приближении к шахте'},
  {action:'aircraft',title:'Сопровождение самолёта',description:'Камера следует за воздушным судном'},
  {action:'train',title:'Сопровождение локомотива',description:'Камера следует за поездом'}
 ]},
 {id:'complexHistoryAccordion',title:'ИСТОРИЯ КОСМОДРОМА',items:COMPLEX_HISTORY_MENU.map(item=>({action:'history:'+item.id,title:item.title,description:item.period+' · '+item.subtitle}))},
 {id:'mythsAccordion',title:'МИФЫ И ЛЕГЕНДЫ',items:[],empty:'Материалы раздела пока не добавлены.'},
 {id:'traditionsAccordion',parent:'mythsAccordion',title:'ТРАДИЦИИ И СУЕВЕРИЯ',items:[],empty:'Истории о традициях и суевериях космодрома готовятся к публикации.'},
 {id:'graveyardAccordion',title:'КОСМИЧЕСКОЕ КЛАДБИЩЕ',items:[
  {action:'r16-memorial',title:'Катастрофа Р-16',description:'24 октября 1960 · площадка №41'},
  {action:'mik-ruins',title:'Разрушенные пролёты МИК',description:'Площадка №112 · утраченная инфраструктура'}
 ],empty:'Подтверждённые аварии, неудачные пуски и районы падения будут добавляться по проверенным источникам.'}
]);

export function installMuseumMenu({container,onAction,stories=[]}){
 let lastAction=null;
 const sections=[...container.querySelectorAll('.museum-section')];
 for(const section of sections){
  section.addEventListener('toggle',()=>{
   if(section.open)for(const other of sections)if(other!==section)other.open=false;
  });
 }
 // Stories outside the visible sections remain in site knowledge cards;
 // removing a navigation group does not delete their archival records.
 const storyById=new Map(stories.map(story=>[story.action.slice(6),story]));
 for(const baseSection of MUSEUM_SECTIONS){
  const assigned=MUSEUM_STORY_GROUPS[baseSection.id]||[];
  const archiveItems=assigned.map(id=>storyById.get(id)).filter(Boolean);
  const section={...baseSection,items:[...(baseSection.items||[]),...archiveItems]};
  const details=container.querySelector('#'+section.id);
  if(!details)throw new Error('Museum section is missing: '+section.id);
  if(section.catalogue)continue;
  const body=details.querySelector('[data-menu-items]')||details.querySelector('.sites-accordion-body'),counter=details.querySelector('.sites-accordion-count');
  const nested=[...body.children].filter(child=>child.matches('details.museum-subsection'));
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
  body.append(...nested);
  const count=details.querySelectorAll('[data-museum-action],.entry').length;counter.textContent=String(count);counter.hidden=count===0;
 }
 // Parent counts include nested stories after both sections have been populated.
 for(const section of sections){const counter=section.querySelector('.sites-accordion-count');if(section.id==='mythsAccordion'&&counter){const count=section.querySelectorAll('[data-museum-action]').length;counter.textContent=String(count);counter.hidden=count===0;}}
 return {stats:()=>({version:MUSEUM_MENU_VERSION,lastAction,sections:sections.map(section=>{
  const siteIds=[...section.querySelectorAll('[data-site-id]')].map(entry=>entry.dataset.siteId);
  return {id:section.id,open:section.open,
   count:section.querySelectorAll(section.id==='sitesAccordion'?'#list > .entry,#list > .silo-group':'[data-museum-action],.entry').length,
   siteIds,siteCount:siteIds.length,
   researchIds:[...section.querySelectorAll('[data-research-id]')].map(entry=>entry.dataset.researchId)};
 })})};
}
