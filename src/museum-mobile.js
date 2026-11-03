/* Mobile navigation: keep the original museum scene and interactions. */
(function(){
  const mq=window.matchMedia('(max-width: 850px)');
  const bar=document.createElement('nav');bar.id='museumMobileBar';bar.setAttribute('aria-label','Мобильная навигация');
  bar.innerHTML='<button type="button" id="museumMobileMenu" aria-label="Открыть меню" aria-expanded="false">☰</button><span class="mobile-title">БАЙКОНУР 3D</span><button type="button" id="museumMobileHome" aria-label="Общий вид">⌂</button>';
  const shade=document.createElement('div');shade.id='museumMobileShade';
  document.body.append(shade,bar);
  const toggle=(open)=>{document.body.classList.toggle('mobile-menu-open',open&&mq.matches);bar.querySelector('#museumMobileMenu').setAttribute('aria-expanded',String(open&&mq.matches));};
  bar.querySelector('#museumMobileMenu').addEventListener('click',()=>toggle(!document.body.classList.contains('mobile-menu-open')));
  shade.addEventListener('click',()=>toggle(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')toggle(false)});
  document.getElementById('museumLeftStack')?.addEventListener('click',e=>{if(e.target.closest('button.entry,.entry'))toggle(false)});
  bar.querySelector('#museumMobileHome').addEventListener('click',()=>{toggle(false);document.getElementById('close')?.click();const params=new URL(location.href);params.searchParams.delete('view');history.replaceState(null,'',params);window.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));});
  mq.addEventListener?.('change',()=>toggle(false));
})();
