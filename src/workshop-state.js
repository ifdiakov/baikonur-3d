export const WORKSHOP_STATE_VERSION=1;
export const WORKSHOP_STORAGE='rockettrip-workshop-scene-v1';
const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
export function validateWorkshopState(input,knownIds=null){
 if(!input||input.version!==1||!input.objects||typeof input.objects!=='object'||Array.isArray(input.objects))throw Error('Нужен файл мастерской версии 1.');
 const objects=Object.create(null),entries=Object.entries(input.objects);
 if(entries.length>1000)throw Error('Слишком много объектов.');
 for(const [id,p]of entries){
  if(!safeId(id)||knownIds&&!knownIds.has(id))throw Error('Неизвестный объект: '+id);
  if(!p||!Array.isArray(p.position)||p.position.length!==3||p.position.some((n,i)=>!Number.isFinite(n)||Math.abs(n)>(i===1?3000:60000)))throw Error('Некорректные координаты: '+id);
  if(!Number.isFinite(p.yaw)||Math.abs(p.yaw)>100*Math.PI||!Number.isFinite(p.scale)||p.scale<.005||p.scale>20)throw Error('Некорректный поворот или масштаб: '+id);
  objects[id]={position:[...p.position],yaw:p.yaw,scale:p.scale};
 }
 return {version:1,coordinateSystem:'baikonur-museum-world',objects,roads:input.roads??null};
}
export function mapToWorld(x,y,h){if(![x,y,h].every(Number.isFinite))throw Error('Введите числа.');return [(x-650)*3.4,h,(y-522.5)*3.4];}
export function worldToMap(p){return [p[0]/3.4+650,p[2]/3.4+522.5,p[1]];}
