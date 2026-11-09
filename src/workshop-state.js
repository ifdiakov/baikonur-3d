import {validateRoadEdits} from './road-editor-core.js';
export const WORKSHOP_VERSION=1;
export const WORKSHOP_STORAGE='rockettrip-workshop-scene-v1';
export function validateWorkshopState(input){
 if(!input||input.version!==WORKSHOP_VERSION||!input.objects||Array.isArray(input.objects))throw Error('Нужен проект мастерской версии 1.');
 const entries=Object.entries(input.objects);if(entries.length>1000)throw Error('Слишком много объектов.');
 const objects=Object.create(null);
 for(const [id,p] of entries){
  if(!/^[a-z0-9_-]{1,100}$/i.test(id)||['__proto__','constructor','prototype'].includes(id))throw Error('Недопустимый ID объекта.');
  if(!p||!Array.isArray(p.position)||p.position.length!==3||!p.position.every(n=>Number.isFinite(n)&&Math.abs(n)<=60000))throw Error('Некорректное положение '+id);
  if(!Number.isFinite(p.yaw)||!Number.isFinite(p.scale)||p.scale<.01||p.scale>100)throw Error('Некорректный поворот/масштаб '+id);
  objects[id]={position:[...p.position],yaw:p.yaw,scale:p.scale,visible:p.visible!==false};
 }
 return {version:WORKSHOP_VERSION,objects,roadEdits:input.roadEdits?validateRoadEdits(input.roadEdits):null};
}
export function applyWorkshopObjects(objects,state){
 let changed=0;for(const o of objects){const p=state.objects[o.record.id];if(!p)continue;
  if(!o.g.userData.workshopBaseScale)o.g.userData.workshopBaseScale=o.g.scale.toArray();
  o.g.position.fromArray(p.position);o.g.rotation.y=p.yaw;
  o.g.scale.fromArray(o.g.userData.workshopBaseScale).multiplyScalar(p.scale);o.g.visible=p.visible;
  o.x=o.record.x=p.position[0]/3.4+650;o.y=o.record.y=p.position[2]/3.4+522.5;
  o.g.updateMatrixWorld(true);changed++;
 }return changed;
}
