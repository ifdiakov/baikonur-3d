// Nonfunctional exterior display details interpreted from the owner renders.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function r16VisualDetails(surfaceRadius){
 const groups=new Map(),counts={tailBells:4,fairingVentPairs:2,hatchFasteners:32,smallCaps:8,noseCap:1,tailClosure:1};
 function add(geometry,material,position=[0,0,0],rotation=null){
  if(rotation)geometry.applyQuaternion(rotation);geometry.translate(...position);
  if(geometry.index)geometry=geometry.toNonIndexed();geometry.deleteAttribute('uv');
  if(!groups.has(material))groups.set(material,[]);groups.get(material).push(geometry);
 }
 const radial=(angle,y,offset=0)=>{const r=surfaceRadius(angle,y)+offset;return [r*Math.cos(angle),y,r*Math.sin(angle)];};
 const orient=angle=>new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(Math.cos(angle),0,Math.sin(angle)));
 // A painted underside, with genuine openings around each visible bell,
 // covers the print assembly's exposed inner rims without coplanar faces.
 const underside=new THREE.Shape(Array.from({length:96},(_,i)=>{const a=i*Math.PI/48,r=surfaceRadius(a,.505)-.002;return new THREE.Vector2(r*Math.cos(a),r*Math.sin(a));}));
 for(let i=0;i<6;i++){const a=Math.PI/2+i*Math.PI/3,p=new THREE.Path();p.absarc(.85*Math.cos(a),.85*Math.sin(a),.27,0,Math.PI*2,true);underside.holes.push(p);}
 for(let i=0;i<4;i++){const a=i*Math.PI/2,p=new THREE.Path();p.absarc(1.64*Math.cos(a),1.64*Math.sin(a),.15,0,Math.PI*2,true);underside.holes.push(p);}
 const closure=new THREE.ShapeGeometry(underside,20);closure.rotateX(Math.PI/2);add(closure,'undercoat',[0,.493,0]);
 for(let i=0;i<4;i++){
  const a=i*Math.PI/2,x=1.64*Math.cos(a),z=1.64*Math.sin(a);
  const points=[[.228,.04],[.226,.11],[.208,.23],[.173,.37],[.124,.50],[.065,.61],[.06,.68]];
  add(new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),32),'metal',[x,0,z]);
  add(new THREE.LatheGeometry(points.map(([r,y])=>new THREE.Vector2(r-.013,y)).reverse(),32),'inner',[x,0,z]);
  const rim=new THREE.TorusGeometry(.221,.008,6,32);rim.rotateX(Math.PI/2);add(rim,'edge',[x,.045,z]);
  const throat=new THREE.CircleGeometry(.052,24);throat.rotateX(Math.PI/2);add(throat,'inner',[x,.63,z]);
  for(const yy of [1.30,1.80])for(const da of [-.13,.13]){
   add(new THREE.SphereGeometry(.014,8,6),'edge',radial(a+da,yy,.01));
   add(new THREE.SphereGeometry(.011,8,6),'edge',radial(a+da,yy+15.2,.01));
  }
 }
 for(const a of [0,Math.PI])for(const delta of [-.085,.085]){
  const angle=a+delta,shape=new THREE.Shape();
  shape.moveTo(-.065,-.18).lineTo(.065,-.18).lineTo(.065,.13).quadraticCurveTo(.065,.18,0,.18).quadraticCurveTo(-.065,.18,-.065,.13).closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:.024,bevelEnabled:true,bevelSize:.025,bevelThickness:.018,bevelSegments:2,steps:1,curveSegments:5});
  add(g,'detailPaint',radial(angle,2.25,.006),orient(angle));
 }
 for(const y of [3.48,18.48])for(const a of [.65,2.22,3.79,5.36])add(new THREE.SphereGeometry(.023,10,6),'mutedRed',radial(a,y,.016));
 add(new THREE.SphereGeometry(.06,16,10),'nose',[0,30.24,0]);
 let triangles=0;
 const geometries=[...groups].map(([material,parts])=>{
  const geometry=mergeGeometries(parts,false);triangles+=geometry.attributes.position.count/3;
  for(const p of parts)p.dispose();return {material,geometry};
 });
 return {geometries,triangles,counts};
}
