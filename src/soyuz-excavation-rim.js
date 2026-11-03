import * as THREE from 'three';
import {offsetExcavationPolygon} from './soyuz-excavation-profile.js?v=20261103-soyuz-pits-v1';

export function buildExcavationRim(root,polygon,material){
 const outer=offsetExcavationPolygon(polygon,1.2),positions=[];
 const face=(a,b,c,d)=>positions.push(...a,...b,...c,...a,...c,...d);
 const area=polygon.reduce((a,p,i)=>{const q=polygon[(i+1)%polygon.length];return a+p[0]*q[1]-q[0]*p[1];},0);
 for(let i=0;i<polygon.length;i++){
  const j=(i+1)%polygon.length,a=polygon[i],b=polygon[j],c=outer[i],d=outer[j];
  const A=[a[0],0,a[1]],B=[b[0],0,b[1]],C=[c[0],.12,c[1]],D=[d[0],.12,d[1]];
  if(area>0)face(A,B,D,C);else face(A,C,D,B);
  if(area>0)face(C,D,[d[0],-.4,d[1]],[c[0],-.4,c[1]]);else face(D,C,[c[0],-.4,c[1]],[d[0],-.4,d[1]]);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Бетонная кромка котлована';mesh.userData.museumComponent='soyuz-excavation-rim';mesh.receiveShadow=true;root.add(mesh);
 return mesh;
}
