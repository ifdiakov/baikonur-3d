import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {loadRocketSource} from './rocket-exhibits.js?v=20261102-site2-photo-v3';
import {SITE2_BURAN,SITE2_VERSION} from './site2-layout.js?v=20261103-site2-main-road-v1';
const controllers=new WeakMap();
export const site2Controller=root=>controllers.get(root);

// Build a parked, static orbiter from the existing corrected source. Shared
// rocket buffers, materials and the landing animation's scene stay untouched.
export function prepareSite2Buran(actors){
 actors.update({gear:0,chute:0,airbrake:0});
 const model=new THREE.Group();model.name='Буран · музей площадки 2';
 const groups=new Map(),oldGeometries=new Set();actors.buran.updateMatrixWorld(true);
 actors.buran.traverse(o=>{if(o.geometry)oldGeometries.add(o.geometry);});
 actors.buran.traverseVisible(o=>{
  if(!o.isMesh)return;
  const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);
  const list=groups.get(o.material)||[];list.push(g);groups.set(o.material,list);
 });
 for(const [material,geometries]of groups){
  const geometry=mergeGeometries(geometries,false);if(!geometry)throw Error('Не удалось собрать геометрию Бурана');
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Буран · '+material.name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.museumComponent='site2-source-buran';model.add(mesh);
  geometries.forEach(g=>g.dispose());
 }
 oldGeometries.forEach(g=>g.dispose());
 model.position.fromArray(SITE2_BURAN.position);model.rotation.y=SITE2_BURAN.yaw;
 model.userData.aircraft={forward:'+Z',starboard:'-X',unit:'metre',configuration:'museum-on-transport-carriers',sourcePreserved:true};
 return {model,source:actors.stats().source};
}
export function installSite2Exhibit(root){
 if(controllers.has(root))return controllers.get(root);
 const state={version:SITE2_VERSION,status:'pending',error:null,source:'energia-buran.glb',sharedSource:true,gear:0,drawCalls:0,triangles:0};
 root.userData.site2Model.asset=state;
 let pending=null;
 async function load(){
  if(state.status==='ready')return true;if(pending)return pending;
  state.status='loading';state.error=null;
  pending=(async()=>{try{
   const [source,{buildLandingAircraft}]=await Promise.all([loadRocketSource('energia-buran'),import('./buran-landing-aircraft.js?v=20261101-without-ll22-v1')]);
   const {model,source:provenance}=prepareSite2Buran(buildLandingAircraft({sourceBuran:source.scene}));
   root.add(model);root.updateWorldMatrix(true,true);
   const added=[];model.traverse(o=>{if(o.isMesh){added.push(o);state.triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
   state.status='ready';state.drawCalls=added.length;state.sourceTriangles=provenance.retainedTriangles;
   state.dimensions=provenance.bounds.size;state.materials=provenance.retainedMaterials;
   root.dispatchEvent({type:'museum-exhibit-loaded',added,removed:[]});return true;
  }catch(error){state.status='error';state.error=error.message;return false;}finally{pending=null;root.dispatchEvent({type:'site2-exhibit-change'});}})();
  return pending;
 }
 const controller={load,stats:()=>({...state}),ready:null};controllers.set(root,controller);
 const startup=globalThis.window?.__MUSEUM_STARTUP;
 controller.ready=startup?.defer?startup.defer(load,{key:'site2-buran',priority:35}):load();
 return controller;
}
