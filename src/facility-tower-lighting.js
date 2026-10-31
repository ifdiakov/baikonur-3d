import * as THREE from 'three';
import {createLightField} from './light-field.js?v=20261031-facility-lighting-v1';
import {registerFacilityFloodlights,registerFacilityBeacon} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';

export const FACILITY_TOWER_LIGHTING_VERSION='facility-tower-lighting-v1';
export const FACILITY_BEACON_PERIOD=3.8;
const FLOOD_COLOR=0xffe4bf,BEACON_COLOR=0xff4434,V=(...p)=>new THREE.Vector3(...p);
const visible=owner=>{for(let n=owner;n;n=n.parent)if(!n.visible)return false;return true;};
const mean=points=>points.reduce((p,q)=>p.add(q),new THREE.Vector3()).multiplyScalar(1/points.length);
function axes(normal){
 const up=Math.abs(normal.y)>.94?V(0,0,1):V(0,1,0),right=new THREE.Vector3().crossVectors(up,normal).normalize();
 return {right,up:new THREE.Vector3().crossVectors(normal,right).normalize()};
}

// The imported UKSS is merged by its original material roles. Its documented
// Light* meshes contain the preserved lens cylinders, not guessed map points.
// Recover connected lens components from those triangles without modifying
// the source geometry, asset statistics, or structural materials.
export function registerImportedUkssLights(root){
 if(root.userData.importedFacilityLighting)return root.userData.importedFacilityLighting;
 root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),lenses=[],structure=[],serviceTowers=new Map(),diverterPoints=[];
 root.traverse(mesh=>{
  if(!mesh.isMesh||Array.isArray(mesh.material))return;
  const name=mesh.material.name,position=mesh.geometry.attributes.position,index=mesh.geometry.index;
  if(!position)return;const matrix=inverse.clone().multiply(mesh.matrixWorld);
  const points=Array.from({length:position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix));
  if(!/^Light(?: \[source \d+\])?$/.test(name)){
   if(mesh.material.userData.museumComponent!=='ukss-dimensional-mockup')structure.push(...points);
   if(name==='Tower_2'||name==='Telega'){if(!serviceTowers.has(name))serviceTowers.set(name,[]);serviceTowers.get(name).push(...points);}
   if(name==='Ferm_red'||name==='Ferm_white')diverterPoints.push(...points);
   return;
  }
  const parent=points.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i])),join=(a,b)=>parent[find(a)]=find(b),samePoint=new Map();
  points.forEach((p,i)=>{const key=p.toArray().map(n=>n.toFixed(4)).join(':');if(samePoint.has(key))join(i,samePoint.get(key));else samePoint.set(key,i);});
  const count=index?.count??points.length,at=i=>index?index.getX(i):i;
  for(let i=0;i<count;i+=3){join(at(i),at(i+1));join(at(i),at(i+2));}
  const parts=new Map();points.forEach((p,i)=>{const key=find(i);if(!parts.has(key))parts.set(key,{points:[],faces:[]});parts.get(key).points.push(p);});
  for(let i=0;i<count;i+=3)parts.get(find(at(i))).faces.push([points[at(i)],points[at(i+1)],points[at(i+2)]]);
  for(const part of parts.values()){
   const center=new THREE.Box3().setFromPoints(part.points).getCenter(new THREE.Vector3());let normal=V(0,0,1),area=0;
   for(const [a,b,c] of part.faces){const n=new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a)),size=n.lengthSq();if(size>area){area=size;normal.copy(n).normalize();}}
   if(normal.dot(center.clone().negate())<0)normal.negate();
   const {right,up}=axes(normal),coordinates=part.points.map(p=>p.clone().sub(center));
   const extent=axis=>Math.max(...coordinates.map(p=>p.dot(axis)))-Math.min(...coordinates.map(p=>p.dot(axis)));
   center.addScaledVector(normal,Math.max(...coordinates.map(p=>p.dot(normal))));
   lenses.push({position:center,normal,size:[Math.max(.1,extent(right)),Math.max(.1,extent(up))],source:name});
  }
 });
 // Neighbouring lenses form their existing source screen. Vertical rows share
 // an X/Z footprint, while separate masts are tens of metres apart.
 const groups=lenses.map((_,i)=>i),find=i=>groups[i]===i?i:(groups[i]=find(groups[i]));
 for(let i=0;i<lenses.length;i++)for(let j=0;j<i;j++)if(Math.hypot(lenses[i].position.x-lenses[j].position.x,lenses[i].position.z-lenses[j].position.z)<2.7)groups[find(i)]=find(j);
 const boards=new Map();lenses.forEach((lens,i)=>{const key=find(i);if(!boards.has(key))boards.set(key,[]);boards.get(key).push(lens);});
 function sourceTop(points){
  const top=Math.max(...points.map(p=>p.y)),rim=points.filter(p=>top-p.y<.025),center=mean(rim);
  // A lattice screen can have several equally high uprights with empty space
  // between them. Keep the beacon on an actual source vertex, not that void.
  return rim.reduce((best,p)=>p.distanceToSquared(center)<best.distanceToSquared(center)?p:best).clone();
 }
 let boardIndex=0;
 for(const lamps of boards.values()){
  const center=mean(lamps.map(l=>l.position)),direction=mean(lamps.map(l=>l.normal)).setY(0);
  if(direction.lengthSq()>1e-8)direction.normalize();
  const target=center.clone().addScaledVector(direction,center.y*.55).setY(0),topLamp=Math.max(...lamps.map(l=>l.position.y));
  const frame=structure.filter(p=>Math.hypot(p.x-center.x,p.z-center.z)<18&&p.y>=topLamp-.5&&p.y<topLamp+18);
  registerFacilityFloodlights(root,{id:'ukss-source-screen-'+boardIndex++,target:target.toArray(),
   beacon:frame.length?sourceTop(frame).toArray():null,source:'UKSS source Light* connected lens geometry',
   lamps:lamps.map(l=>({position:l.position.toArray(),normal:l.normal.toArray(),size:l.size}))});
 }
 const high=Math.max(100,Math.max(0,...diverterPoints.map(p=>p.y))*.58),clusters=[];
 for(const p of diverterPoints){if(p.y<high)continue;let cluster=clusters.find(c=>Math.hypot(p.x-c[0].x,p.z-c[0].z)<20);if(!cluster)clusters.push(cluster=[]);cluster.push(p);}
 clusters.forEach((cluster,i)=>{
  const center=mean(cluster),near=structure.filter(p=>Math.hypot(p.x-center.x,p.z-center.z)<15&&p.y>=high);
  registerFacilityBeacon(root,{id:'ukss-source-diverter-'+i,position:sourceTop(near.length?near:cluster).toArray(),kind:'lightning-diverter',source:'UKSS source red/white tower geometry'});
 });
 for(const [role,points] of serviceTowers)registerFacilityBeacon(root,{id:'ukss-source-service-'+role,position:sourceTop(points).toArray(),kind:'service-tower',source:'UKSS source '+role+' geometry'});
 return root.userData.importedFacilityLighting={source:'preserved-imported-geometry',lensComponents:lenses.length,boards:boards.size,lightningTowers:clusters.length,serviceTowers:serviceTowers.size};
}

function spillMaterial(beam=false){
 return new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  uniforms:{strength:{value:0},tint:{value:new THREE.Color(FLOOD_COLOR)}},
  vertexShader:`attribute float enabled;attribute float lampPower;varying vec2 vUv;varying float power;
   #include <common>
   #include <logdepthbuf_pars_vertex>
   void main(){vUv=uv;power=enabled*lampPower;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
    #include <logdepthbuf_vertex>
   }`,
  fragmentShader:`uniform float strength;uniform vec3 tint;varying vec2 vUv;varying float power;
   #include <common>
   #include <logdepthbuf_pars_fragment>
   void main(){if(power<.01||strength<.01)discard;
    #include <logdepthbuf_fragment>
    ${beam?'float a=pow(max(0.,sin(vUv.y*3.14159265)),1.8)*.013;':'float r=length(vUv-.5)*2.;if(r>1.)discard;float a=pow(1.-r*r,3.)*.19;'}
    gl_FragColor=vec4(tint,a*power*strength);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`});
}

export function buildFacilityTowerLighting({scene,objects=[],groundMeshes=[],isLightAllowed=()=>true,isLightPowered=()=>true}={}){
 const ukss=objects.find(o=>o.record?.id==='pad-250');
 const importedUkss=ukss?.g.userData.ukssModel?.status==='ready'?registerImportedUkssLights(ukss.g):null;
 const root=new THREE.Group();root.name='Площадки · мачтовое освещение и маяки';root.userData.pickable=false;scene.add(root);
 const bindings=[],beaconBindings=[],siteCounts=new Map();
 for(const object of objects){const siteId=object.record?.id;if(!siteId)continue;
  object.g.traverse(node=>{const anchors=node.userData.facilityLighting;if(!anchors)return;
   for(const board of anchors.boards)bindings.push({owner:node,facility:object.g,siteId,board,id:`${siteId}:${board.id}:${bindings.length}`});
   for(const beacon of anchors.beacons)beaconBindings.push({owner:node,siteId,beacon,id:`${siteId}:${beacon.id}:${beaconBindings.length}`});
  });
 }
 const lensRecords=[],boards=[],beaconRecords=[],lensMatrices=[],beaconMatrices=[],dummy=new THREE.Object3D(),basis=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3();
 const ray=new THREE.Raycaster(new THREE.Vector3(),V(0,-1,0));let evening=false,pulse=0,lastMatrixKey='';
 function surfaceAt(target,facility,head){
  ray.ray.origin.set(target.x,Math.max(target.y+10,head.y+1),target.z);
  // archiveKit bakes the primitives into their facility root; the source
  // anchor group may therefore have no meshes of its own.
  const surfaces=[...groundMeshes];facility.traverse(mesh=>{if(mesh.isMesh)surfaces.push(mesh);});
  return ray.intersectObjects(surfaces,false).find(hit=>hit.point.y<=target.y+.8)?.point.y??target.y;
 }
 function positionBindings(){
  scene.updateMatrixWorld(true);lensRecords.length=boards.length=beaconRecords.length=lensMatrices.length=beaconMatrices.length=0;siteCounts.clear();
  for(const {owner,facility,siteId,board,id} of bindings){
   const target=owner.localToWorld(V(...board.target)),head=mean(board.lamps.map(lamp=>owner.localToWorld(V(...lamp.position))));
   target.y=surfaceAt(target,facility,head);const powered=isLightAllowed(head.x,head.z)&&isLightAllowed(target.x,target.z)&&isLightPowered(head.x,head.z)&&isLightPowered(target.x,target.z);
   const height=Math.max(.2,head.y-target.y),radiusX=THREE.MathUtils.clamp(height*.36,.6,8),radiusY=THREE.MathUtils.clamp(height*.52,.9,11);
   boards.push({id,sourceId:board.id,siteId,owner,position:head.toArray(),target:target.toArray(),radiusX,radiusY,powered,lamps:board.lamps.length,source:board.source});
   normalMatrix.getNormalMatrix(owner.matrixWorld);
   for(let i=0;i<board.lamps.length;i++){
    const lamp=board.lamps[i],localNormal=V(...lamp.normal).normalize(),localAxes=axes(localNormal),normal=localNormal.clone().applyMatrix3(normalMatrix).normalize();
    const sourcePosition=owner.localToWorld(V(...lamp.position)),p=sourcePosition.clone().addScaledVector(normal,.012),origin=owner.getWorldPosition(new THREE.Vector3());
    const right=localAxes.right.clone().transformDirection(owner.matrixWorld),up=localAxes.up.clone().transformDirection(owner.matrixWorld);
    const width=owner.localToWorld(localAxes.right.clone().multiplyScalar(lamp.size[0])).distanceTo(origin),height=owner.localToWorld(localAxes.up.clone().multiplyScalar(lamp.size[1])).distanceTo(origin);
    basis.makeBasis(right,up,normal);dummy.quaternion.setFromRotationMatrix(basis);dummy.position.copy(p);dummy.scale.set(width,height,1);dummy.updateMatrix();lensMatrices.push(dummy.matrix.clone());
    lensRecords.push({id:id+':'+i,boardId:id,siteId,owner,x:p.x,y:p.y,z:p.z,height:0,sourcePosition:sourcePosition.toArray(),normal:normal.toArray(),width,lensHeight:height,
     poolX:target.x,poolY:target.y,poolZ:target.z,color:FLOOD_COLOR,size:THREE.MathUtils.clamp(Math.max(width,height)*1.6,.16,.65),powered,brightness:1.3,source:board.source});
   }
  }
  for(const {owner,siteId,beacon,id} of beaconBindings){
   const sourcePosition=owner.localToWorld(V(...beacon.position)),p=sourcePosition.clone();p.y+=.045;
   const powered=isLightAllowed(p.x,p.z)&&isLightPowered(p.x,p.z);
   beaconRecords.push({id,sourceId:beacon.id,siteId,owner,x:p.x,y:p.y,z:p.z,height:0,sourcePosition:sourcePosition.toArray(),color:BEACON_COLOR,size:.28,powered,brightness:1,kind:beacon.kind,source:beacon.source});
   dummy.position.copy(p);dummy.quaternion.identity();dummy.scale.setScalar(1);dummy.updateMatrix();beaconMatrices.push(dummy.matrix.clone());
  }
  for(const siteId of new Set([...lensRecords,...beaconRecords].map(r=>r.siteId)))siteCounts.set(siteId,{siteId,fixtures:lensRecords.filter(r=>r.siteId===siteId).length,boards:boards.filter(r=>r.siteId===siteId).length,beacons:beaconRecords.filter(r=>r.siteId===siteId).length});
 }
 positionBindings();
 const glow=createLightField(root,lensRecords,{name:'Мачты · прожекторы',minPixels:1.2}),beacons=createLightField(root,beaconRecords,{name:'Башни · красные маяки',minPixels:1.5});
 const lensMaterial=new THREE.MeshBasicMaterial({color:FLOOD_COLOR,transparent:true,opacity:.95,depthWrite:false,toneMapped:false});
 const beaconMaterial=new THREE.MeshBasicMaterial({color:BEACON_COLOR,toneMapped:false});
 const lenses=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),lensMaterial,Math.max(1,lensRecords.length));lenses.count=lensRecords.length;
 const beaconLenses=new THREE.InstancedMesh(new THREE.SphereGeometry(.036,8,6),beaconMaterial,Math.max(1,beaconRecords.length));beaconLenses.count=beaconRecords.length;
 lenses.name='Мачты · светящиеся линзы';beaconLenses.name='Башни · линзы маяков';
 const poolGeometry=new THREE.PlaneGeometry(2,2),beamGeometry=new THREE.CylinderGeometry(0,1,1,12,1,true),enabled=new Float32Array(boards.length),powers=new Float32Array(boards.length);
 for(const geometry of [poolGeometry,beamGeometry]){geometry.setAttribute('enabled',new THREE.InstancedBufferAttribute(enabled,1));geometry.setAttribute('lampPower',new THREE.InstancedBufferAttribute(powers,1));}
 const poolMaterial=spillMaterial(),beamMaterial=spillMaterial(true),pools=new THREE.InstancedMesh(poolGeometry,poolMaterial,Math.max(1,boards.length)),beams=new THREE.InstancedMesh(beamGeometry,beamMaterial,Math.max(1,boards.length));
 pools.count=beams.count=boards.length;pools.name='Мачты · свет на поверхности';beams.name='Мачты · мягкие направленные лучи';pools.renderOrder=5;beams.renderOrder=7;
 for(const mesh of [lenses,beaconLenses,pools,beams]){mesh.frustumCulled=false;mesh.userData.pickable=false;root.add(mesh);}
 function updateMatrices(){
  lensMatrices.forEach((matrix,i)=>{dummy.matrix.copy(matrix);if(!lensRecords[i].powered||!visible(lensRecords[i].owner))dummy.matrix.scale(V(0,0,0));lenses.setMatrixAt(i,dummy.matrix);});
  beaconMatrices.forEach((matrix,i)=>{dummy.matrix.copy(matrix);if(!beaconRecords[i].powered||!visible(beaconRecords[i].owner))dummy.matrix.scale(V(0,0,0));beaconLenses.setMatrixAt(i,dummy.matrix);});
  boards.forEach((board,i)=>{
   const head=V(...board.position),target=V(...board.target),direction=head.clone().sub(target),length=direction.length();
   dummy.position.copy(target).add(V(0,.035,0));dummy.rotation.set(-Math.PI/2,0,Math.atan2(head.x-target.x,head.z-target.z));dummy.scale.set(board.radiusX,board.radiusY,1);dummy.updateMatrix();pools.setMatrixAt(i,dummy.matrix);
   dummy.position.copy(head).add(target).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(V(0,1,0),direction.normalize());dummy.scale.set(board.radiusX,length,board.radiusY);dummy.updateMatrix();beams.setMatrixAt(i,dummy.matrix);
   enabled[i]=board.powered&&visible(board.owner)?1:0;powers[i]=THREE.MathUtils.clamp(Math.sqrt(board.lamps)/3,.5,1.8);
  });
  for(const mesh of [lenses,beaconLenses,pools,beams])mesh.instanceMatrix.needsUpdate=true;
  for(const geometry of [poolGeometry,beamGeometry]){geometry.attributes.enabled.needsUpdate=true;geometry.attributes.lampPower.needsUpdate=true;}
 }
 function sync(){
  const owners=[...bindings,...beaconBindings].map(b=>b.owner);for(const owner of owners)owner.updateWorldMatrix(true,false);
  const key=owners.map(owner=>owner.matrixWorld.elements.join(',')).join('|');
  if(lastMatrixKey&&lastMatrixKey!==key){positionBindings();glow.refresh(lensRecords);beacons.refresh(beaconRecords);}lastMatrixKey=key;
  glow.sync();beacons.sync();updateMatrices();
 }
 function update(now=0){pulse=.28+.72*(.5-.5*Math.cos(now*.001*Math.PI*2/FACILITY_BEACON_PERIOD))**2;beacons.setStrength(evening?pulse:0);beaconMaterial.color.set(BEACON_COLOR).multiplyScalar(evening?.35+.65*pulse:0);}
 function setEvening(value){evening=!!value;root.visible=evening;glow.setStrength(evening?1:0);poolMaterial.uniforms.strength.value=beamMaterial.uniforms.strength.value=evening?1:0;update(0);sync();}
 function renderedAttachmentStats(){
  let maximumError=0,visibilityLeaks=0,activeLenses=0,activeBeacons=0;
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3();
  for(const [mesh,records,kind] of [[lenses,lensRecords,'lens'],[beaconLenses,beaconRecords,'beacon']])records.forEach((r,i)=>{
   mesh.getMatrixAt(i,matrix);const enabled=matrix.determinant()!==0,expected=r.powered&&visible(r.owner);
   if(enabled!==expected)visibilityLeaks++;
   if(expected)maximumError=Math.max(maximumError,position.setFromMatrixPosition(matrix).distanceTo(V(r.x,r.y,r.z)));
   if(evening&&enabled){if(kind==='lens')activeLenses++;else activeBeacons++;}
  });
  return {maximumError,visibilityLeaks,lensInstances:lenses.count,beaconInstances:beaconLenses.count,activeLenses,activeBeacons};
 }
 const clean=r=>({id:r.id,sourceId:r.sourceId,siteId:r.siteId,position:[r.x,r.y,r.z],sourcePosition:r.sourcePosition,normal:r.normal,width:r.width,lensHeight:r.lensHeight,boardId:r.boardId,powered:r.powered,visible:visible(r.owner),kind:r.kind,source:r.source});
 setEvening(false);
 return {root,setEvening,sync,update,
  lightPositions:({poweredOnly=false}={})=>[...lensRecords,...beaconRecords].filter(r=>!poweredOnly||r.powered).map(r=>[r.x,r.y,r.z]),
  records:()=>({floodlights:lensRecords.map(clean),beacons:beaconRecords.map(clean),boards:boards.map(({owner,...board})=>({...board,visible:visible(owner)}))}),
  stats:()=>({version:FACILITY_TOWER_LIGHTING_VERSION,evening,fixtures:lensRecords.length,boards:boards.length,beacons:beaconRecords.length,
   poweredFixtures:lensRecords.filter(r=>r.powered).length,poweredBeacons:beaconRecords.filter(r=>r.powered).length,
   visibleFixtures:lensRecords.filter(r=>r.powered&&visible(r.owner)).length,visibleBeacons:beaconRecords.filter(r=>r.powered&&visible(r.owner)).length,
   emissiveIntensity:evening?1.3:0,beaconPeriod:FACILITY_BEACON_PERIOD,beaconPulse:evening?pulse:0,beamAlignment:'source-fixture-to-surface-target',
   drawCalls:6,dynamicLights:0,rendered:renderedAttachmentStats(),sites:[...siteCounts.values()],importedUkss})};
}
