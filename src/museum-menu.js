export const MUSEUM_MENU_VERSION='museum-sections-knowledge-v2';

// These entries open exhibits and animations already present in the museum.
// The separate knowledge base can add stories later without inventing them here.
export const MUSEUM_SECTIONS=Object.freeze([
 {id:'equipmentAccordion',items:[
  {action:'r7',title:'«Союз»',description:'Гагаринский старт и площадка №31'},
  {action:'energia-polyus',title:'«Энергия — Полюс»',description:'Ракета-экспонат на УКСС'},
  {action:'energia-buran',title:'«Энергия — Буран»',description:'Площадка №110, МИК и транспортёры'},
  {action:'energia',title:'«Энергия»',description:'Четырёхблочная ракета-носитель'},
  {action:'energia-m',title:'«Энергия-М»',description:'Двухблочная компоновка проекта'},
  {action:'tua',title:'«Кузнечики»',description:'Транспортно-установочные агрегаты'},
  {action:'mriya',title:'«Мрия» с «Бураном»',description:'Экспонат на Юбилейном'},
  {action:'aircraft',title:'Самолёт',description:'Сопровождение текущего рейса'},
  {action:'train',title:'Мотовоз и вагоны',description:'Локомотив и четыре вагона'},
  {action:'silo',title:'Шахтная пусковая установка',description:'Площадка №109'}
 ]},
 {id:'cyclogramsAccordion',items:[
  {action:'flight-cycle',title:'Москва — Крайний — Москва',description:'Посадка · стоянка · вылет'},
  {action:'train-cycle',title:'Рейс мотовоза',description:'Площадка №1 → Тюратам'},
  {action:'silo-cycle',title:'Открытие шахты',description:'Крышка и пар при приближении'}
 ]},
 {id:'mythsAccordion',items:[],empty:'Материалы раздела пока не добавлены.'},
 {id:'graveyardAccordion',items:[
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
  const body=details.querySelector('.sites-accordion-body'),counter=details.querySelector('.sites-accordion-count');
  body.replaceChildren();counter.textContent=String(section.items.length);counter.hidden=section.items.length===0;
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
 }
 return {stats:()=>({version:MUSEUM_MENU_VERSION,lastAction,sections:sections.map(section=>({id:section.id,open:section.open,
  count:section.querySelectorAll('[data-museum-action]').length}))})};
}
