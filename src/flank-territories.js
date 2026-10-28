import * as THREE from 'three';
import {CSS3DObject,CSS3DRenderer} from 'three/addons/renderers/CSS3DRenderer.js';

/** Real DOM text and archival portraits, projected onto the terrain plane.
 * Keeping the native buttons preserves keyboard navigation and readable text
 * when a visitor zooms, without baking the information into a bitmap. */
export function createFlankTerritories({flanks,point,camera,container}){
 const renderer=new CSS3DRenderer();renderer.setSize(innerWidth,innerHeight);
 renderer.domElement.className='flank-territory-layer';
 renderer.domElement.setAttribute('aria-label','Конструкторские школы на территории космодрома');
 container.prepend(renderer.domElement);
 const credits=document.createElement('a');credits.className='flank-portrait-credits';
 credits.href='./assets/flank-portraits/credits.html';credits.target='_blank';credits.rel='noopener';
 credits.textContent='Портреты: источники и лицензии ↗';container.append(credits);
 const scene=new THREE.Scene(),objects=[];
 for(const f of flanks){
  f.el.classList.add('flank-on-terrain');
  f.el.setAttribute('aria-label',f.zone+' · '+f.fullname+' · перейти к площадкам');
  const object=new CSS3DObject(f.el);object.name=f.zone;
  object.position.copy(point(f.x,f.y,.85));object.rotation.x=-Math.PI/2;
  object.scale.setScalar(1.6);scene.add(object);objects.push(object);
 }
 let alpha=0;
 function update(value){
  alpha=THREE.MathUtils.clamp(value,0,1);
  credits.hidden=alpha<=.2;credits.style.opacity=String(alpha);
  for(let i=0;i<objects.length;i++){
   objects[i].visible=alpha>.035;
   const el=flanks[i].el;el.style.setProperty('--level-alpha',alpha.toFixed(3));
   el.style.pointerEvents=alpha>.2?'auto':'none';el.tabIndex=alpha>.2?0:-1;
   el.setAttribute('aria-hidden',String(alpha<=.035));
  }
  renderer.render(scene,camera);
  // The CSS3D renderer restores `display`; retain the button's flex layout.
  for(let i=0;i<objects.length;i++)flanks[i].el.style.display=objects[i].visible?'flex':'none';
 }
 function resize(){renderer.setSize(innerWidth,innerHeight);update(alpha);}
 window.addEventListener('resize',resize);
 update(0);
 return {update,stats:()=>({plane:'terrain',panels:objects.length,alpha,
  anchors:objects.map((o,i)=>({id:flanks[i].key,position:o.position.toArray(),rotation:o.rotation.x,visible:o.visible}))})};
}
