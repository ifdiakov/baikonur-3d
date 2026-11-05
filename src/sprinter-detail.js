import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export const SPRINTER_DETAIL_VERSION='sprinter-photo-detail-v3';
const V=(...p)=>new THREE.Vector3(...p);
let sharedTextures;
function canvasTexture(w,h,draw){
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d'),w,h);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;
}
async function textures(){
 if(!sharedTextures)sharedTextures=(async()=>{
  const logo=await new THREE.TextureLoader().loadAsync(new URL('../assets/models/sprinter/hood-logo-original-v1.png',import.meta.url).href);logo.colorSpace=THREE.SRGBColorSpace;logo.anisotropy=4;
  const wordmark=canvasTexture(2048,320,(c,w,h)=>{c.fillStyle='#183b7a';c.font='italic 900 266px Arial, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('ROCKETTRIP',w/2,h*.52,w*.96);});
  const environment=canvasTexture(512,256,(c,w,h)=>{
   const g=c.createLinearGradient(0,0,0,h);for(const [p,col]of [[0,'#99b6cf'],[.36,'#cbdbe2'],[.49,'#f4f1e8'],[.53,'#aaa38f'],[1,'#555d65']])g.addColorStop(p,col);c.fillStyle=g;c.fillRect(0,0,w,h);
   const light=c.createLinearGradient(0,0,w,0);for(const [p,a]of [[0,0],[.15,0],[.24,.5],[.32,0],[.6,0],[.71,.35],[.79,0],[1,0]])light.addColorStop(p,`rgba(255,255,255,${a})`);c.fillStyle=light;c.fillRect(0,0,w,h);
  });environment.mapping=THREE.EquirectangularReflectionMapping;
  const response=await fetch(new URL('../assets/models/sprinter/decals-v3.json',import.meta.url),{mode:'same-origin',credentials:'same-origin'});if(!response.ok)throw Error('Sprinter: отсутствует оформление кузова');
  const baked=await response.json();if(baked.version!==SPRINTER_DETAIL_VERSION)throw Error('Sprinter: неверная версия оформления');
  return {logo,wordmark,environment,decals:baked.decals};
 })().catch(error=>{sharedTextures=null;throw error;});
 return sharedTextures;
}
/** Project onto the actual body panels; no floating rectangular decals. */
export function projectSprinterDecal(panels,{sample,direction,columns=24,rows=16,gap=.004}){
 const positions=[],uv=[],valid=[],indices=[],out=direction.clone().negate(),ray=new THREE.Raycaster();
 for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
  const u=i/columns,v=j/rows;ray.set(sample(u,v),direction);const hit=ray.intersectObjects(panels,false)[0];valid.push(!!hit);
  if(hit){positions.push(...hit.point.addScaledVector(out,gap).toArray());}else positions.push(0,0,0);
  uv.push(u,v);
 }
 for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
  const a=j*(columns+1)+i,b=a+1,c=a+columns+1,d=c+1;if(![a,b,c,d].every(k=>valid[k]))continue;
  // Both faces are intentional: only a thin projected paint layer is rendered.
  indices.push(a,b,c,b,d,c);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
export async function addSprinterDetail(scene){
 if(typeof document==='undefined')return {version:SPRINTER_DETAIL_VERSION,decals:0};
 const {logo,wordmark,environment,decals}=await textures();scene.updateMatrixWorld(true);
 const lenses=[];
 scene.traverse(o=>{if(!o.isMesh)return;const m=o.material;
  if(['carpaint','chrome','material','windowglass','mirror','clearglass','redglass','orangeglass'].includes(m.name)){m.envMap=environment;m.envMapIntensity=.65;}
  if(m.name==='carpaint'){m.color.set('#e4e7e6');m.roughness=.31;m.clearcoat=.65;m.clearcoatRoughness=.18;}
  if(m.name==='chrome'||m.name==='material'){m.metalness=.8;m.roughness=.23;}
  if(m.name==='mirror'){m.metalness=.9;m.roughness=.08;}
  if(m.name==='windowglass'){m.color.set('#253c46');m.roughness=.27;m.metalness=.16;m.opacity=.96;m.depthWrite=true;m.envMapIntensity=.65;}
  if(m.name==='clearglass'){m.color.set('#c1d5de');m.opacity=.72;m.roughness=.17;m.depthWrite=true;}
  if(m.name==='redglass'||m.name==='orangeglass'){m.color.set(m.name==='redglass'?'#a71121':'#e88216');m.opacity=.95;m.roughness=.24;m.depthWrite=true;m.emissive.copy(m.color);m.emissiveIntensity=.04;m.userData.sprinterLens=true;lenses.push(m);}
 });
 const group=new THREE.Group();group.name='Sprinter · оформление по фотографиям RocketTrip';scene.add(group);
 function decal(name,map,key){
  // Precomputed from this exact GLB: keep thousands of panel raycasts off the UI thread.
  const data=decals[key],geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));geometry.setIndex(data.index);geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({map,transparent:true,alphaTest:.08,depthWrite:true,side:THREE.DoubleSide,roughness:.5,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,forceSinglePass:true});
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.userData.sprinterDecal=true;group.add(mesh);return mesh;
 }
 // The mark faces an observer in front; its top points to the windscreen.
 decal('RocketTrip · логотип на капоте',logo,'hood');
 // Right-hand leaf as seen from behind, below the latch and clear of the seam.
 decal('RocketTrip · надпись на задней двери',wordmark,'rear');
 for(const side of [-1,1])decal('RocketTrip · надпись на борту '+side,wordmark,'side'+side);
 // Low-profile roof A/C and rails visible in the owner's photographs.
 const pieces=new Map(),white=new THREE.MeshStandardMaterial({color:'#e2e5e4',roughness:.36,metalness:.06,envMap:environment,envMapIntensity:.5}),rubber=new THREE.MeshStandardMaterial({color:'#202a30',roughness:.74}),metal=new THREE.MeshStandardMaterial({color:'#9ba9ad',metalness:.8,roughness:.28,envMap:environment});
 function add(geometry,mat,position,rotation=null){if(geometry.index){const indexed=geometry;geometry=indexed.toNonIndexed();indexed.dispose();}const m=new THREE.Matrix4().compose(V(...position),rotation||new THREE.Quaternion(),V(1,1,1));geometry.applyMatrix4(m);if(!pieces.has(mat))pieces.set(mat,[]);pieces.get(mat).push(geometry);}
 add(new RoundedBoxGeometry(1.08,.18,1.22,3,.075),rubber,[0,2.535,-.5]);
 add(new RoundedBoxGeometry(1.06,.22,1.2,4,.095),white,[0,2.63,-.5]);
 for(let i=0;i<11;i++)add(new THREE.BoxGeometry(.62,.012,.018),rubber,[0,2.739,-.86+i*.068]);
 for(const side of [-1,1]){
  for(const z of [-2.25,-.7,.85])add(new RoundedBoxGeometry(.11,.09,.21,2,.025),rubber,[side*.66,2.56,z]);
  add(new THREE.CylinderGeometry(.019,.019,3.35,10),metal,[side*.66,2.62,-.65],new THREE.Quaternion().setFromAxisAngle(V(1,0,0),Math.PI/2));
 }
 add(new RoundedBoxGeometry(.085,.055,.12,2,.02),rubber,[.48,2.48,1.5]);
 add(new THREE.CylinderGeometry(.006,.011,.39,7),rubber,[.48,2.68,1.46],new THREE.Quaternion().setFromAxisAngle(V(1,0,0),-.2));
 // Supplemental upper brake light, with a gasket separate from the red lens.
 add(new RoundedBoxGeometry(.3,.06,.038,2,.015),rubber,[0,2.31,-3.12]);
 const stop=new THREE.MeshStandardMaterial({color:'#b3192a',roughness:.25,emissive:'#b3192a',emissiveIntensity:.04});stop.userData.sprinterLens=true;lenses.push(stop);
 add(new RoundedBoxGeometry(.25,.032,.016,2,.009),stop,[0,2.31,-3.143]);
 for(const [material,geometries]of pieces){const mesh=new THREE.Mesh(mergeGeometries(geometries),material);mesh.name='Sprinter · оборудование крыши и светотехника';group.add(mesh);geometries.forEach(g=>g.dispose());}
 group.traverse(o=>{if(o.isMesh)o.userData.pickable=false;});
 scene.userData.sprinterDetail={version:SPRINTER_DETAIL_VERSION,hoodLogo:true,rearDoorWordmark:'ROCKETTRIP',decals:4,roofAirConditioner:true,roofRails:true};
 return scene.userData.sprinterDetail;
}
