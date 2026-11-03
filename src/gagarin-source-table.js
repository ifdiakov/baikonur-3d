import * as THREE from 'three';
import {loadSite31Source} from './site31-source.js?v=20261103-launch-table-v1';

// The optimized asset joins its source nodes by material. Nodes 3–253 are
// the complete central launch table (88,524 triangles, x=-22.40…22.70m).
// All retained remote towers begin beyond |x|=54m. Select complete triangles
// in this empty separating band: no clipping, rescaling or new asset needed.
export function extractSite31Table(source){
 source.updateWorldMatrix(true,true);
 const table=new THREE.Group();table.name='Гагаринский старт · стол с площадки №31';
 const inverse=source.matrixWorld.clone().invert(),point=new THREE.Vector3();let triangles=0;
 source.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const g=mesh.geometry.clone(),matrix=inverse.clone().multiply(mesh.matrixWorld),normal=new THREE.Matrix3().getNormalMatrix(matrix);
  const positions=g.attributes.position,world=new Float32Array(positions.count*3),inside=[];
  for(let i=0;i<positions.count;i++){
   point.fromBufferAttribute(positions,i).applyMatrix4(matrix);point.toArray(world,i*3);inside.push(Math.abs(point.x)<30);
  }
  const selected=[],index=g.index,count=index?.count??positions.count;
  for(let i=0;i<count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);if(ids.every(id=>inside[id]))selected.push(...ids);}
  if(!selected.length){g.dispose();return;}
  g.setAttribute('position',new THREE.BufferAttribute(world,3));g.setIndex(selected);g.clearGroups();
  if(g.attributes.normal){const values=new Float32Array(positions.count*3);for(let i=0;i<positions.count;i++)point.fromBufferAttribute(g.attributes.normal,i).applyNormalMatrix(normal).toArray(values,i*3);g.setAttribute('normal',new THREE.BufferAttribute(values,3));}
  // Compact unused tower vertices too, so bounds and raycasts describe only
  // the copied table, not the surrounding Site 31 lightning/light masts.
  const remap=new Map(),used=[];const compact=selected.map(id=>{if(!remap.has(id)){remap.set(id,used.length);used.push(id);}return remap.get(id);});
  for(const [name,attribute]of Object.entries(g.attributes)){
   const values=new attribute.array.constructor(used.length*attribute.itemSize);
   used.forEach((id,i)=>{for(let k=0;k<attribute.itemSize;k++)values[i*attribute.itemSize+k]=attribute.isInterleavedBufferAttribute?attribute.data.array[id*attribute.data.stride+attribute.offset+k]:attribute.array[id*attribute.itemSize+k];});
   g.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize,attribute.normalized));
  }
  g.setIndex(compact);g.computeBoundingBox();g.computeBoundingSphere();
  const copy=new THREE.Mesh(g,mesh.material);copy.castShadow=true;copy.receiveShadow=true;copy.userData.museumComponent='gagarin-site31-table';table.add(copy);triangles+=selected.length/3;
 });
 if(triangles!==88524){table.traverse(o=>o.geometry?.dispose());throw Error('Состав стартового стола №31 не прошёл проверку');}
 table.userData.sourceTable={site:'pad-31',triangles,scale:1,launchAxis:[0,0,0]};return table;
}

export function installGagarinTable(root,fallback,{autoLoad=typeof window!=='undefined',loadSource=()=>loadSite31Source({consumer:'gagarin'})}={}){
 const state={status:'pending',sourceSite:'pad-31',triangles:0,error:null};root.userData.gagarinModel.tableAsset=state;
 let pending=null;
 const changed=()=>root.dispatchEvent({type:'gagarin-table-change'});
 async function load(){
  if(state.status==='ready')return true;if(pending)return pending;
  state.status='loading';state.error=null;changed();
  pending=(async()=>{try{
   const {scene,manifest}=await loadSource(),table=extractSite31Table(scene),removed=[];
   fallback.traverse(o=>{if(o.isMesh)removed.push(o);});
   root.add(table);fallback.removeFromParent();root.updateWorldMatrix(true,true);
   const added=table.children;root.dispatchEvent({type:'museum-exhibit-loaded',removed,added});
   // Instanced primitive geometry and materials also serve the retained yard.
   for(const o of removed)if(!o.isInstancedMesh)o.geometry.dispose();fallback.clear();
   Object.assign(state,{status:'ready',triangles:table.userData.sourceTable.triangles,error:null,sourceSha256:manifest.sourceSha256});
   Object.assign(root.userData.gagarinModel,{version:'5.0-site31-table',serviceHeightMetres:39.4111,
    sourceCredit:{author:manifest.author,url:manifest.sourceUrl,license:manifest.license,licenseUrl:manifest.licenseUrl},
    status:'Стартовый стол и башни обслуживания скопированы с 3D-модели площадки №31 в масштабе 1:1. Подъезды и газоотвод площадки №1 сохранены.'});
   return true;
  }catch(e){state.status='error';state.error=e.message;return false;}finally{pending=null;changed();}})();return pending;
 }
 const api={load,stats:()=>state,ready:Promise.resolve(false)};
 if(autoLoad){const startup=globalThis.window?.__MUSEUM_STARTUP;api.ready=startup?.defer?startup.defer(load,{key:'gagarin-source-table',priority:24}):load();}
 return api;
}
