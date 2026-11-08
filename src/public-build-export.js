// Build-time only: never imported by the visitor runtime.
import * as THREE from 'three';
import {GLTFExporter} from '../node_modules/three/examples/jsm/exporters/GLTFExporter.js';
const encode=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
const asBase64=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});
const canvasBlob=(canvas,type='image/webp',quality=.88)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Image encoding failed')),type,quality));
const visibleTo=(o,root)=>{for(let p=o;p&&p!==root;p=p.parent)if(!p.visible)return false;return true;};
export async function exportPublicMuseum(d,emit){
 const revision='public-surface-v1',N=8,res=1536,overviewSize=2048;
 d.scene.updateMatrixWorld(true);d.eveningScene.setEvening(false);d.scene.updateMatrixWorld(true);
 const entries=d.objects.filter(o=>o.record.render!==false),allBounds=new THREE.Box3();
 for(const o of entries)allBounds.expandByPoint(o.g.getWorldPosition(new THREE.Vector3()));
 const center=allBounds.getCenter(new THREE.Vector3()),size=Math.ceil((Math.max(allBounds.max.x-allBounds.min.x,allBounds.max.z-allBounds.min.z)+1000)/512)*512;
 const minX=center.x-size/2,minZ=center.z-size/2,tileSize=size/N,bounds={minX,minZ,size,tiles:N};
 const camera={position:d.camera.position.toArray(),target:d.ctl.target.toArray()};
 const gridSize=129,heights=[];for(let z=0;z<gridSize;z++)for(let x=0;x<gridSize;x++)heights.push(+d.museumTerrainHeightAt(minX+x*size/(gridSize-1),minZ+z*size/(gridSize-1)).toFixed(3));
 const manifest={version:revision,bounds,terrain:{gridSize,heights},camera,sites:[],tiles:[],roadMode:'baked-into-terrain-texture',buildStats:{roadTriangles:0,meshes:0}};
 // Flatten the final, already cut authoring road surfaces into terrain ink.
 const fullRoads=d.layers.roads.children.filter(o=>o.name==='OpenStreetMap · автодороги');for(const r of fullRoads)r.visible=r===fullRoads.at(-1);d.layers.roads.visible=true;
 const roadMeshes=[];d.layers.roads.traverse(o=>{if(o.isMesh&&visibleTo(o,d.layers.roads)&&/полотно|асфальт|обочин|грунтовые проезды|разметк|белые кромки|двойная жёлтая|road-(pavement|shoulder|center-dash|edge)|asphalt|shoulder/.test(o.name))roadMeshes.push(o);});
 for(const entry of entries)entry.g.traverse(o=>{if(o.isMesh&&visibleTo(o,entry.g)&&(/road|apron|court/.test(o.userData.museumComponent||'')||(!Array.isArray(o.material)&&/asphalt/.test(o.material?.name||''))))roadMeshes.push(o);});
 const bins=Array.from({length:N*N},()=>[]),v=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
 function rasterMesh(mesh){
  const g=mesh.geometry,p=g.attributes.position,ix=g.index,count=ix?.count??p.count,materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const groups=g.groups.length?g.groups:[{start:0,count,materialIndex:0}];
  for(const group of groups){const mat=materials[group.materialIndex]||materials[0];if(!mat||mat.opacity===0)continue;
   const key=mesh.name+' '+mat.name,priority=/обочин|shoulder/.test(key)?0:/разметк|white|yellow|center-dash|edge-line/.test(key)?3:2;
   const color='#'+(mat.color?.getHexString()||'77786f');
   const matrices=mesh.isInstancedMesh?Array.from({length:mesh.count},(_,i)=>{const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);return mesh.matrixWorld.clone().multiply(m);}):[mesh.matrixWorld];
   for(const matrix of matrices)for(let i=group.start;i<Math.min(group.start+group.count,count);i+=3){
    for(let k=0;k<3;k++)v[k].fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(matrix);
    const area=(v[1].x-v[0].x)*(v[2].z-v[0].z)-(v[1].z-v[0].z)*(v[2].x-v[0].x);if(Math.abs(area)<1e-7)continue;
    const xs=v.map(p=>p.x),zs=v.map(p=>p.z),x0=Math.max(0,Math.floor((Math.min(...xs)-minX)/tileSize)),x1=Math.min(N-1,Math.floor((Math.max(...xs)-minX)/tileSize)),z0=Math.max(0,Math.floor((Math.min(...zs)-minZ)/tileSize)),z1=Math.min(N-1,Math.floor((Math.max(...zs)-minZ)/tileSize));
    if(x0>x1||z0>z1)continue;const tri={priority,color,points:v.map(p=>[p.x,p.z])};
    for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)bins[z*N+x].push(tri);manifest.buildStats.roadTriangles++;
   }
  }
 }
 for(const mesh of roadMeshes)rasterMesh(mesh);
 // Preserve the existing terrain palette and registered imagery.
 const terrainScene=new THREE.Scene();terrainScene.background=new THREE.Color(0xa7a08b);
 terrainScene.add(new THREE.HemisphereLight(0xbdd7f2,0x62533d,2));const sun=new THREE.DirectionalLight(0xffdfb4,2.2);sun.position.set(-700,1200,500);terrainScene.add(sun);
 const terrains=[d.ground,d.satelliteGround,...d.outerTerrain.planes,d.terrainRelief.mesh,d.sharedSiloHill.mesh];
 for(const original of terrains){if(!original?.isMesh||!original.visible)continue;const m=new THREE.Mesh(original.geometry,original.material);m.matrixAutoUpdate=false;m.matrix.copy(original.matrixWorld);m.frustumCulled=false;m.renderOrder=original.renderOrder;terrainScene.add(m);}
 for(const root of d.scene.children)if(/Сырдар|river|река/i.test(root.name)){const clone=root.clone();clone.traverse(o=>{o.userData={};});terrainScene.add(clone);}
 const renderer=d.renderer,oldSize=renderer.getSize(new THREE.Vector2()),oldRatio=renderer.getPixelRatio();renderer.setPixelRatio(1);renderer.setSize(overviewSize,overviewSize,false);
 const top=new THREE.OrthographicCamera(-size/2,size/2,size/2,-size/2,1,50000);top.position.set(center.x,20000,center.z);top.up.set(0,0,-1);top.lookAt(center.x,0,center.z);
 renderer.render(terrainScene,top);
 const base=document.createElement('canvas');base.width=base.height=overviewSize;base.getContext('2d').drawImage(renderer.domElement,0,0);
 renderer.setPixelRatio(oldRatio);renderer.setSize(oldSize.x,oldSize.y,false);
 const overview=document.createElement('canvas');overview.width=overview.height=overviewSize;const oc=overview.getContext('2d');oc.drawImage(base,0,0);
 const tile=document.createElement('canvas');tile.width=tile.height=res;const ctx=tile.getContext('2d');
 const cuts=[];for(const entry of entries)entry.g.traverse(root=>{for(const s of root.userData.archiveCutouts||[]){const points=s.polygon||(s.shape==='rectangle'?[[s.x-s.rx,s.z-s.rz],[s.x+s.rx,s.z-s.rz],[s.x+s.rx,s.z+s.rz],[s.x-s.rx,s.z+s.rz]]:Array.from({length:32},(_,i)=>[(s.x||0)+s.rx*Math.cos(i/32*Math.PI*2),(s.z||0)+s.rz*Math.sin(i/32*Math.PI*2)]));cuts.push(points.map(([x,z])=>{const p=new THREE.Vector3(x,0,z).applyMatrix4(root.matrixWorld);return[p.x,p.z];}));}});
 for(const item of window.__BAIKONUR_QA.stats().terrainVoids.items||[]){if(!item.shape?.polygon||!item.name)continue;const root=d.scene.getObjectByName(item.name);if(!root)continue;cuts.push(item.shape.polygon.map(([x,z])=>{const p=new THREE.Vector3(x,0,z).applyMatrix4(root.matrixWorld);return[p.x,p.z];}));}
 function paint(context,rows,x0,z0,scale){context.save();context.setTransform(scale,0,0,scale,-x0*scale,-z0*scale);for(const tri of rows){context.fillStyle=tri.color;context.beginPath();tri.points.forEach(([x,z],i)=>i?context.lineTo(x,z):context.moveTo(x,z));context.closePath();context.fill();}context.restore();}
 function holes(context,x0,z0,scale){context.save();context.globalCompositeOperation='destination-out';context.setTransform(scale,0,0,scale,-x0*scale,-z0*scale);for(const poly of cuts){context.beginPath();poly.forEach(([x,z],i)=>i?context.lineTo(x,z):context.moveTo(x,z));context.closePath();context.fill();}context.restore();}
 function rails(context,x0,z0,scale){context.save();context.setTransform(scale,0,0,scale,-x0*scale,-z0*scale);context.strokeStyle='#525652';context.lineCap='round';context.lineJoin='round';for(const route of d.transport.terrainPaths().rails){const pts=route.points;if(!pts?.length)continue;context.lineWidth=Math.max(.6,Math.min(1.3,route.width||.8));context.beginPath();pts.forEach((p,i)=>{const x=p.x??p[0],z=p.z??p[2];i?context.lineTo(x,z):context.moveTo(x,z);});context.stroke();}context.restore();}
 const allTris=[...new Set(bins.flat())].sort((a,b)=>a.priority-b.priority);paint(oc,allTris,minX,minZ,overviewSize/size);rails(oc,minX,minZ,overviewSize/size);holes(oc,minX,minZ,overviewSize/size);
 await emit('overview.webp',await asBase64(await canvasBlob(overview)));
 for(let z=0;z<N;z++)for(let x=0;x<N;x++){
  ctx.clearRect(0,0,res,res);ctx.drawImage(base,x*overviewSize/N,z*overviewSize/N,overviewSize/N,overviewSize/N,0,0,res,res);
  const x0=minX+x*tileSize,z0=minZ+z*tileSize;paint(ctx,bins[z*N+x].sort((a,b)=>a.priority-b.priority),x0,z0,res/tileSize);rails(ctx,x0,z0,res/tileSize);holes(ctx,x0,z0,res/tileSize);
  const file=`tiles/${x}-${z}.webp`;await emit(file,await asBase64(await canvasBlob(tile)));manifest.tiles.push({x,z,file});
 }
 const exporter=new GLTFExporter();
 for(const entry of entries){
  const root=new THREE.Group();root.name=entry.record.name||entry.name;root.position.copy(entry.g.position);root.quaternion.copy(entry.g.quaternion);root.scale.copy(entry.g.scale);
  const inverse=entry.g.matrixWorld.clone().invert(),mats=new Map();let triangles=0;
  function material(m){if(mats.has(m.uuid))return mats.get(m.uuid);let n;if(m.isMeshStandardMaterial||m.isMeshBasicMaterial)n=m.clone();else n=new THREE.MeshStandardMaterial({color:m.color||0x9a9c93,roughness:.9,side:m.side,transparent:m.transparent,opacity:m.opacity});n.userData={};n.onBeforeCompile=()=>{};mats.set(m.uuid,n);return n;}
  entry.g.traverse(o=>{if(!o.isMesh||!o.geometry?.attributes.position||!visibleTo(o,entry.g))return;if(roadMeshes.includes(o))return;
   const ms=Array.isArray(o.material)?o.material.map(material):material(o.material);let mesh;
   if(o.isInstancedMesh){mesh=new THREE.InstancedMesh(o.geometry,ms,o.count);mesh.instanceMatrix.copy(o.instanceMatrix);if(o.instanceColor)mesh.instanceColor=o.instanceColor.clone();}else mesh=new THREE.Mesh(o.geometry,ms);
   mesh.name=o.name;mesh.matrixAutoUpdate=false;mesh.matrix.multiplyMatrices(inverse,o.matrixWorld);root.add(mesh);
   triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);
  });
  root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),center=box.isEmpty()?entry.g.getWorldPosition(new THREE.Vector3()):box.getCenter(new THREE.Vector3()),dimensions=box.isEmpty()?new THREE.Vector3(5,5,5):box.getSize(new THREE.Vector3());
  let asset=null,bytes=0;if(root.children.length){const glb=await exporter.parseAsync(root,{binary:true,onlyVisible:true,maxTextureSize:512});bytes=glb.byteLength;asset='sites/'+entry.record.id+'.glb.gz';await emit(asset,encode(new Uint8Array(glb)));}
  const meta={id:entry.record.id,name:entry.record.name||entry.name,position:entry.g.position.toArray(),center:center.toArray(),size:dimensions.toArray(),asset,bytes,triangles,category:entry.record.category||entry.type,from:entry.from??1955};
  manifest.sites.push(meta);await emit('info/'+entry.record.id+'.json',btoa(unescape(encodeURIComponent(JSON.stringify(entry.record)))));manifest.buildStats.meshes+=root.children.length;
  for(const mat of mats.values())mat.dispose();
 }
 await emit('manifest-source.json',btoa(unescape(encodeURIComponent(JSON.stringify(manifest)))));return {sites:manifest.sites.length,roadTriangles:manifest.buildStats.roadTriangles,tiles:manifest.tiles.length};
}
