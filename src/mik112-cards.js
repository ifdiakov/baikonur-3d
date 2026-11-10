import * as THREE from 'three';
export const MIK112_CARDS_VERSION='20261110-mik-tua-independent-v1';
export const TUA112_CARD_ID='tua-112';
// Existing hall and existing machines only: no duplicate scene geometry.
export function createMik112Cards(parent,exhibit){
 if(!parent||!exhibit)return {cards:[],bindPicking:()=>0};
 parent.mapTitle='МИК-112';parent.calloutKind='mik112';parent.calloutSide=-1;
 parent.record={...parent.record,titleShort:'МИК-112',titleFull:'Площадка №112 · МИК-112',purpose:'Монтажно-испытательный корпус площадки №112.',purposeLong:'Монтажно-испытательный корпус. Подготовка ракетно-космической техники; реконструкция «Гибель Бурана» — в карточке здания.'};
 const anchor=new THREE.Object3D();anchor.name='Кузнечики · отдельная точка плашки';exhibit.transportersGroup.add(anchor);
 const purpose='Два транспортно-установочных агрегата «Кузнечики». Перевозка и установка ракетно-космического комплекса «Энергия».',record={...parent.record,id:TUA112_CARD_ID,titleShort:'Кузнечики',titleFull:'Кузнечики · площадка №112',purpose,purposeLong:purpose,purposeShort:purpose,note:purpose};
 const card={...parent,name:'Кузнечики',mapTitle:'Кузнечики · пл. 112',calloutKind:'tua',calloutSide:1,g:anchor,geometryRoot:exhibit.transportersGroup,record,archive:null};
 function bindPicking(index){
  const slots=exhibit.transporterRoots;anchor.position.set(0,0,0);for(const slot of slots)anchor.position.add(slot.position);anchor.position.multiplyScalar(1/Math.max(1,slots.length));
  let meshes=0;exhibit.transportersGroup.traverse(mesh=>{if(mesh.isMesh){mesh.userData.idx=index;meshes++;}});return meshes;
 }return {cards:[card],bindPicking};
}
