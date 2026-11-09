import * as THREE from 'three';
import {applyHighwayDisplayFade} from './highway-display.js?v=20261102-site2-photo-v3';
// Lossless typed buffers: no quantization, simplification, model or material changes.
export function packGeometry(geometry,{copy=false}={}){
 const attr=a=>a?{array:copy?a.array.slice():a.array,itemSize:a.itemSize,normalized:a.normalized,usage:a.usage,instanced:!!a.isInstancedBufferAttribute,meshPerAttribute:a.meshPerAttribute}:null;
 if(Object.values(geometry.attributes).some(a=>a.isInterleavedBufferAttribute))throw Error('Unexpected interleaved transport geometry');
 return {attributes:Object.fromEntries(Object.entries(geometry.attributes).map(([k,a])=>[k,attr(a)])),index:attr(geometry.index),groups:geometry.groups.map(g=>({...g})),drawRange:{...geometry.drawRange},name:geometry.name,userData:geometry.userData,
  boundingBox:geometry.boundingBox?{min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray()}:null,
  boundingSphere:geometry.boundingSphere?{center:geometry.boundingSphere.center.toArray(),radius:geometry.boundingSphere.radius}:null};
}
export function unpackGeometry(row){
 const geometry=new THREE.BufferGeometry(),attr=a=>(a.instanced?new THREE.InstancedBufferAttribute(a.array,a.itemSize,a.normalized,a.meshPerAttribute):new THREE.BufferAttribute(a.array,a.itemSize,a.normalized)).setUsage(a.usage??THREE.StaticDrawUsage);
 for(const [k,a]of Object.entries(row.attributes))geometry.setAttribute(k,attr(a));if(row.index)geometry.setIndex(attr(row.index));
 for(const g of row.groups||[])geometry.addGroup(g.start,g.count,g.materialIndex);geometry.setDrawRange(row.drawRange.start,row.drawRange.count);geometry.name=row.name;geometry.userData=row.userData||{};
 if(row.boundingBox)geometry.boundingBox=new THREE.Box3(new THREE.Vector3(...row.boundingBox.min),new THREE.Vector3(...row.boundingBox.max));
 if(row.boundingSphere)geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(...row.boundingSphere.center),row.boundingSphere.radius);
 return geometry;
}
export function transferBuffers(value){const buffers=new Set(),visit=v=>{if(!v||typeof v!=='object')return;if(ArrayBuffer.isView(v)){buffers.add(v.buffer);return;}if(v instanceof ArrayBuffer){buffers.add(v);return;}for(const child of Object.values(v))visit(child);};visit(value);return [...buffers];}
export function packTransportLayers(layers){
 const geometries=new Map(),materials=new Map();
 const geometry=g=>{if(!geometries.has(g.uuid))geometries.set(g.uuid,packGeometry(g));return g.uuid;};
 const material=m=>{if(!materials.has(m.uuid)){const json=m.toJSON();if(json.textures?.length)throw Error('Transport texture requires an explicit lossless codec');if(m.onBeforeCompile!==THREE.Material.prototype.onBeforeCompile&&!m.userData.highwayDisplayFade)throw Error('Unregistered transport shader hook: '+m.name);materials.set(m.uuid,json);}return m.uuid;};
 const supported=new Set(['Group','Object3D','Mesh','InstancedMesh','Points','Line','LineSegments','LineLoop']);
 const node=o=>{const type=o.isInstancedMesh?'InstancedMesh':o.type;if(!supported.has(type))throw Error('Unregistered transport object: '+type);return {name:o.name,type,matrix:o.matrix.toArray(),visible:o.visible,renderOrder:o.renderOrder,frustumCulled:o.frustumCulled,castShadow:o.castShadow,receiveShadow:o.receiveShadow,userData:JSON.parse(JSON.stringify(o.userData)),layers:o.layers.mask,
  ...(o.geometry&&o.material?{geometry:geometry(o.geometry),material:Array.isArray(o.material)?o.material.map(material):material(o.material)}:{}),
  ...(o.isInstancedMesh?{count:o.count,instanceMatrix:o.instanceMatrix.array,instanceColor:o.instanceColor?.array||null}:{}),children:o.children.map(node)};};
 for(const layer of Object.values(layers))layer.updateMatrixWorld(true);
 return {roots:Object.fromEntries(Object.entries(layers).map(([key,root])=>[key,root.children.map(node)])),geometries:Object.fromEntries(geometries),materials:Object.fromEntries(materials)};
}
export function unpackTransportLayers(packet){
 const geometries=new Map(Object.entries(packet.geometries).map(([id,row])=>[id,unpackGeometry(row)])),loader=new THREE.MaterialLoader();
 const materials=new Map(Object.entries(packet.materials).map(([id,row])=>{const m=loader.parse(row);if(m.userData.highwayDisplayFade)applyHighwayDisplayFade(m);return[id,m];}));
 const node=row=>{const mat=Array.isArray(row.material)?row.material.map(id=>materials.get(id)):materials.get(row.material);let o;
  if(row.type==='InstancedMesh'){o=new THREE.InstancedMesh(geometries.get(row.geometry),mat,row.count);o.instanceMatrix=new THREE.InstancedBufferAttribute(row.instanceMatrix,16);if(row.instanceColor)o.instanceColor=new THREE.InstancedBufferAttribute(row.instanceColor,3);}
  else if(row.geometry)o=new THREE[row.type](geometries.get(row.geometry),mat);else o=new THREE[row.type]();
  o.name=row.name;o.matrix.fromArray(row.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);o.visible=row.visible;o.renderOrder=row.renderOrder;o.frustumCulled=row.frustumCulled;o.castShadow=row.castShadow;o.receiveShadow=row.receiveShadow;o.userData=row.userData;o.layers.mask=row.layers;
  if(row.children.length)o.add(...row.children.map(node));return o;};
 return Object.fromEntries(Object.entries(packet.roots).map(([key,rows])=>[key,rows.map(node)]));
}
