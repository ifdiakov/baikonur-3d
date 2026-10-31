export const INTERCHANGE_VIEWS=Object.freeze([
 ['bridge','Мост ближе'],['all','Вся развязка'],['side','Сбоку'],['top','Сверху']
]);

const REFERENCE='https://sketchfab.com/3d-models/bridge-design-6c2d7e65a2e14600bde311a01e1baa27';

/** The bridge shares the museum information card and its close button. */
export function createInterchangeControls({onView}){
 const info=document.getElementById('info');
 const views=document.createElement('div');
 views.id='interchangeViews';views.hidden=true;views.setAttribute('role','group');
 views.setAttribute('aria-label','Ракурсы моста на развязке');
 for(const [view,label] of INTERCHANGE_VIEWS){
  const button=document.createElement('button');
  button.type='button';button.className='detail-button';button.dataset.interchangeView=view;
  button.textContent=label;button.onclick=()=>onView(view);views.append(button);
 }
 document.getElementById('description').after(views);
 const credit=document.createElement('p');credit.id='interchangeCredit';credit.hidden=true;
 const model=document.createElement('a');model.href=REFERENCE;model.target='_blank';
 model.rel='noopener noreferrer';model.textContent='Bridge Design · 3DtechVN';
 const license=document.createElement('a');license.href='https://creativecommons.org/licenses/by/4.0/';
 license.target='_blank';license.rel='noopener noreferrer';license.textContent='CC BY 4.0';
 credit.append('Дизайн по референсу ',model,' · ',license,'. Адаптация для макета RocketTrip.');
 views.after(credit);

 function hide(){
  views.hidden=true;credit.hidden=true;info.classList.remove('bridge-active');
  document.getElementById('detailMore').hidden=false;
 }
 function show(view){
  info.classList.remove('ukss-active','ukss-details-open','tua-active','tua-details-open','terminal-active','terminal-details-open');
  info.classList.add('bridge-active');
  document.getElementById('title').textContent='Развязка с трассой · эстакада';
  const brand=document.getElementById('infoOrg');
  brand.textContent='ROCKETTRIP';brand.classList.remove('has-org-logo');
  brand.removeAttribute('data-org-logo');brand.title='Музейный макет RocketTrip';
  document.getElementById('infoOrgRole').textContent='Музейный макет';
  document.getElementById('infoPurpose').textContent='Автодорога E38 / М-32';
  document.getElementById('description').textContent='Плавный бетонный виадук с металлическими ограждениями и освещением. Под центральным пролётом проходят дорога и железнодорожный путь.';
  for(const selector of ['#airportViews','#siloViews','#hotelViews','#mzkViews','#energiaViews','#ukssViews','#mik112Controls','#ukssMockupToggle','#rocketExhibitToggle']){
   const el=document.querySelector(selector);if(el)el.hidden=true;
  }
  document.getElementById('infoExtra').style.display='none';
  document.getElementById('detailMore').hidden=true;
  views.hidden=false;credit.hidden=false;info.style.display='block';info.scrollTop=0;
  for(const button of views.children)button.setAttribute('aria-pressed',String(button.dataset.interchangeView===view));
 }
 return {show,hide,get active(){return info.classList.contains('bridge-active');}};
}
