/** Screen-aligned flank cards, restored to the earlier museum layout.
 * Colored zones and borders remain in the WebGL scene; this module creates
 * no terrain text, CSS3D objects, textures or plane panels. */
export function createFlankTerritories({flanks,camera,container}){
 const credits=document.createElement('a');credits.className='flank-portrait-credits';
 credits.href='./assets/flank-portraits/credits.html';credits.target='_blank';credits.rel='noopener';
 credits.textContent='Портреты: источники и лицензии ↗';container.append(credits);
 let alpha=0,layout='horizontal';
 for(const f of flanks){
  f.el.setAttribute('aria-label',f.zone+' · '+f.fullname+' · перейти к площадкам');
  f.el.classList.remove('flank-on-terrain');
 }
 function project(world){
  const p=world.clone().project(camera);
  if(p.z<=-1||p.z>=1||!Number.isFinite(p.x))return null;
  const x=(p.x+1)*.5*innerWidth,y=(1-p.y)*.5*innerHeight;
  return x<0||x>innerWidth||y<0||y>innerHeight?null:{x,y};
 }
function arrangeFlankCards(visible){
 if(visible.length===0)return;
 const ui=document.getElementById('ui'),dock=document.getElementById('timeDock');
 const uiRect=ui.getBoundingClientRect(),dockRect=dock.getBoundingClientRect();
 const mobileToolbar=innerWidth<=640&&uiRect.width>innerWidth*.7;
 const leftLimit=mobileToolbar?12:Math.min(innerWidth-34,Math.max(15,uiRect.right+12));
 const rightLimit=innerWidth-12;
 const available=Math.max(54,rightLimit-leftLimit);
 const horizontal=available>=visible.length*205+Math.max(0,visible.length-1)*12;
 layout=horizontal?'horizontal':'vertical';
 const gap=12;
 if(horizontal){
  const slot=available/visible.length;
  const width=Math.min(318,Math.floor(slot-gap));
  for(let j=0;j<visible.length;j++){
   const e=visible[j].el;
   e.style.width=width+'px';
   e.style.height='';
   e.style.maxHeight='min(47vh,370px)';
   e.style.overflowY='auto';
   e.classList.remove('is-stacked');
   const h=e.getBoundingClientRect().height||170;
   const x=leftLimit+slot*(j+.5);
   const y=Math.max(25+h/2,Math.min(dockRect.top-20-h/2,visible[j].p?.y||275));
   e.style.left=x+'px';e.style.top=y+'px';
  }
 }else{
  const width=Math.min(mobileToolbar?318:244,available);
  const upper=mobileToolbar?uiRect.bottom+14:45,lower=Math.max(upper+205,dockRect.top-15);
  const height=Math.max(90,Math.min(190,(lower-upper-gap*(visible.length-1))/visible.length-1));
  const total=visible.length*height+(visible.length-1)*gap;
  const start=Math.max(upper,(upper+lower-total)*.50);
  for(let j=0;j<visible.length;j++){
   const e=visible[j].el;
   e.classList.add('is-stacked');
   e.style.width=Math.floor(width)+'px';
   e.style.height=height+'px';
   e.style.maxHeight=height+'px';
   e.style.overflowY='auto';
   e.style.left=(mobileToolbar?innerWidth*.5:leftLimit+width*.5)+'px';
   e.style.top=(start+height*(j+.5)+j*gap)+'px';
  }
 }
}

 function update(value){
  alpha=Math.max(0,Math.min(1,value));const shown=alpha>.04,visible=[];
  credits.hidden=alpha<=.2;credits.style.opacity=String(alpha);
  for(const f of flanks){
   const el=f.el;el.style.display=shown?'flex':'none';
   el.style.setProperty('--level-alpha',alpha.toFixed(3));
   el.style.pointerEvents=alpha>.2?'auto':'none';el.tabIndex=alpha>.2?0:-1;
   el.setAttribute('aria-hidden',String(!shown));
   if(shown)visible.push({...f,p:project(f.world)});
  }
  if(shown)arrangeFlankCards(visible);
 }
 update(0);
 return {update,stats:()=>({plane:'screen',layout,panels:flanks.length,groundPanels:0,alpha})};
}
