// Owner-supplied CC BY 4.0 meshes. New livery is authored as SVG, baked into
// the GLB; no run-time image processing, source downloads, or custom shaders.
import * as THREE from 'three';
import {Document,NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld,simplify,meshopt,getBounds} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const profiles={};
for(const id of ['m62','coach']){
 const coach=id==='coach',source=await readFile(`scripts/source-models/${id}/source.glb`),original=await io.readBinary(source),credit=original.getRoot().getAsset().extras;
 const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene(coach?'Советский пассажирский вагон':'М62 · Космотранс');
 const sourceBounds=getBounds(original.getRoot().listScenes()[0]),centerZ=(sourceBounds.min[2]+sourceBounds.max[2])/2,centerX=coach?.00564:0;
 // Tread, rather than the flange tip, is the running datum. Source wheel
 // centres are retained longitudinally; transverse tread centres use 1520 mm.
 const radius=coach?.478:.54,wheelY=coach?.57743:.8766,ground=wheelY-radius;
 const axles=(coach?[-8.17442,-5.77362,5.65762,8.05842]:[-6.37154,-4.2028,-1.99341,2.0294,4.23879,6.40753]).map(z=>z-centerZ);
 const bogies=coach?[(axles[0]+axles[1])/2,(axles[2]+axles[3])/2]:[(axles[0]+axles[2])/2,(axles[3]+axles[5])/2];
 const profile={id,gauge:1.52,wheelRadius:radius,axles,bogies,bodyLength:coach?19.4:16.9,width:3.2,couplerHalf:(sourceBounds.max[2]-sourceBounds.min[2])/2,height:coach?4.04-ground:sourceBounds.max[1]-ground};profiles[id]=profile;
 const groups=new Map(),group=(name,translation=[0,0,0],parent=null)=>{if(!groups.has(name)){const n=doc.createNode(name).setTranslation(translation);(parent||scene).addChild(n);groups.set(name,n);}return groups.get(name);};
 group('body');bogies.forEach((z,i)=>group('bogie-'+i,[0,0,z]));axles.forEach((z,i)=>{const a=group('axle-'+i,[0,0,z]);for(const s of [-1,1])group(`wheel-${i}-${s}`,[s*.76,radius,0],a);});
 const material=(name,color,metal=.25,rough=.55)=>doc.createMaterial(name).setBaseColorFactor([...new THREE.Color(color).toArray(),1]).setMetallicFactor(metal).setRoughnessFactor(rough).setDoubleSided(true);
 const mats={metal:material('metal','#727a78',.65,.45),dark:material('dark','#212b2b',.35,.67),roof:material('roof','#919b92',.3,.75),paint:material('paint',coach?'#21462f':'#126967'),glass:material('glass','#18323a',.18,.24),lens:material('lens','#f6e3b9',.1,.2),tail:material('tail','#932f25',.1,.3)};
 // Preserve only unpainted source atlases (bogies, couplers, roof/interior).
 async function originalMaterial(index){const name='source-'+index;if(mats[name])return name;const t=original.getRoot().listTextures()[index],b=await sharp(t.getImage()).resize({width:768,height:768,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer();const tex=doc.createTexture(name).setImage(b).setMimeType('image/jpeg');mats[name]=material(name,'#ffffff',.32,.7).setBaseColorTexture(tex);return name;}
 for(const index of coach?[3,4,14]:[0,1,4,5,6])await originalMaterial(index);
 const nodes=[];
 for(const node of original.getRoot().listNodes())if(node.getMesh())for(const p of node.getMesh().listPrimitives()){
  if(p.getMode()!==4)continue;const pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),ix=p.getIndices(),uv=p.getAttribute('TEXCOORD_0'),m=new THREE.Matrix4().fromArray(node.getWorldMatrix()),nm=new THREE.Matrix3().getNormalMatrix(m),verts=[],normals=[],uvs=[],parents=Array.from({length:pos.getCount()},(_,i)=>i),co=new Map();
  const find=i=>parents[i]===i?i:parents[i]=find(parents[i]),join=(a,b)=>parents[find(a)]=find(b);let tmp=[];
  for(let i=0;i<pos.getCount();i++){pos.getElement(i,tmp);const v=new THREE.Vector3(...tmp).applyMatrix4(m);verts.push(v);normal.getElement(i,tmp);normals.push(new THREE.Vector3(...tmp).applyMatrix3(nm).normalize());uv?.getElement(i,tmp);uvs.push(uv?tmp.slice(0,2):[0,0]);const k=v.toArray().map(x=>x.toFixed(4)).join();if(co.has(k))join(i,co.get(k));else co.set(k,i);}
  const count=ix?.getCount()||pos.getCount();for(let i=0;i<count;i+=3){const ids=[0,1,2].map(j=>ix?ix.getScalar(i+j):i+j);join(ids[0],ids[1]);join(ids[0],ids[2]);}
  const boxes=new Map();for(let i=0;i<verts.length;i++){const k=find(i);if(!boxes.has(k))boxes.set(k,new THREE.Box3());boxes.get(k).expandByPoint(verts[i]);}
  nodes.push({name:node.getName(),p,ix,count,verts,normals,uvs,find,boxes});
 }
 const output=`assets/models/${coach?'soviet-coach':'m62-kosmotrans'}`;await mkdir(output,{recursive:true});
 const glassNode=nodes.find(n=>n.name===(coach?'ostekl_1':'stekla_0'));
 function artwork(side,front=false){
  const W=front?768:3072,H=768,L=front?3.4:22,Y=y=>(5.5-y)/5.5*H,X=x=>W/2+(front?side:-side)*x/L*W;
  const rect=(x,y,w,h,fill,stroke='',sw=1)=>`<rect x="${Math.min(X(x-w/2),X(x+w/2))}" y="${Y(y+h/2)}" width="${w/L*W}" height="${h/5.5*H}" rx="1" fill="${fill}" ${stroke?`stroke="${stroke}" stroke-width="${sw}"`:''}/>`;
  const txt=(s,x,y,h,w,color='#e8cf71')=>`<text x="${X(x)}" y="${Y(y)}" text-anchor="middle" fill="${color}" font-family="DejaVu Sans" font-size="${h/5.5*H}" font-weight="700" textLength="${w/L*W}" lengthAdjust="spacingAndGlyphs">${s}</text>`;
  let a=`<defs><linearGradient id="skin" x2="0" y2="1"><stop stop-color="${coach?'#315b3a':'#177c78'}"/><stop offset="1" stop-color="${coach?'#183a26':'#135953'}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#skin)"/>`;
  a+=rect(0,coach?3.55:3.96,L,.14,'#e2c76b')+rect(0,coach?2.06:2.36,L,coach?.16:.22,'#e6c86e');
  if(coach)a+=rect(0,1.52,L,.035,'#b5a166');
  else{a+=rect(0,1.78,L,.07,'#ddc47d');if(!front){a+=txt('КОСМОТРАНС',-.7,2.77,.29,4.25)+txt('КОСМИЧЕСКИЙ ЦЕНТР «ЮЖНЫЙ»',-.7,2.58,.11,3.9);for(const z of [-7.1,7.1])a+=txt('М62',z,2.77,.20,.72);}}
  if(!front){
   for(let z=-9;z<=9;z+=coach?1.453:1.055)a+=`<path d="M${X(z)} ${Y(1.95)}V${Y(3.8)}" stroke="#082c29" stroke-width=".8" opacity=".3"/>`;
   if(coach){a+=txt('СССР',0,3.67,.16,1.05)+txt('СЛУЖЕБНЫЙ',0,1.78,.15,1.65);}
   for(const box of glassNode.boxes.values()){const c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3());if(Math.sign(c.x)!==side||s.z<.1||s.y<.2||Math.abs(c.x)<1.2)continue;a+=rect(c.z,c.y,s.z+.09,s.y+.08,'#122323','#b4bca7',1.8);if(coach)a+=rect(c.z,c.y+.12,s.z,.025,'#aab2a4');}
   if(!coach){for(const z of [-6.45,6.45])a+=rect(z,2.89,.48,1.79,'none','#b2c3a4',1.3);}
  }else{
   if(!coach){a+=`<path d="M0 ${Y(2.93)} L${W/2} ${Y(2.62)} L${W} ${Y(2.93)}" fill="none" stroke="#e6c86e" stroke-width="18"/>`+txt('М62',0,2.10,.22,.8);a+=rect(0,1.42,L,.32,'#b53529');for(let x=-1.8;x<1.9;x+=.45)a+=`<path d="M${X(x)} ${Y(1.55)}L${X(x+.2)} ${Y(1.30)}" stroke="#e6c86e" stroke-width="17"/>`;}
   else a+=rect(0,2.5,1.08,2.5,'#303b35');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${a}</svg>`;
 }
 for(const side of [-1,1])for(const front of [false,true]){const name=(front?'front':'skin')+side,svg=artwork(side,front);await writeFile(`${output}/${name}.svg`,svg);const image=await sharp(Buffer.from(svg)).jpeg({quality:92,chromaSubsampling:'4:4:4'}).toBuffer();mats[name]=material(name,'#ffffff',.23,.54).setBaseColorTexture(doc.createTexture(name).setImage(image).setMimeType('image/jpeg'));}
 if(coach){let seams='';for(let y=50;y<2048;y+=130)seams+=`<path d="M0 ${y}h512" stroke="#5e685f" stroke-width="2"/><path d="M0 ${y+3}h512" stroke="#9ba397" stroke-width="1"/>`;const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="2048"><defs><linearGradient id="r"><stop stop-color="#68746c"/><stop offset=".45" stop-color="#929a8c"/><stop offset="1" stop-color="#68746c"/></linearGradient></defs><rect width="512" height="2048" fill="url(#r)"/>${seams}</svg>`;await writeFile(`${output}/roof.svg`,svg);mats.roof.setBaseColorFactor([1,1,1,1]).setBaseColorTexture(doc.createTexture('roof').setImage(await sharp(Buffer.from(svg)).jpeg({quality:85}).toBuffer()).setMimeType('image/jpeg'));}
 const bins=new Map();let sourceTriangles=0,removedTriangles=0;
 for(const {name,p,ix,count,verts,normals,uvs,find,boxes} of nodes)for(let i=0;i<count;i+=3){
  sourceTriangles++;const ids=[0,1,2].map(j=>ix?ix.getScalar(i+j):i+j),box=boxes.get(find(ids[0])),c=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),mid=ids.reduce((s,id)=>s.add(verts[id]),new THREE.Vector3()).multiplyScalar(1/3);
  let role='dark',dest='body',pivot=new THREE.Vector3(centerX,ground,centerZ);
  if(!coach){
   if(name.startsWith('wheel')){const k=axles.reduce((a,z,j)=>Math.abs(mid.z-centerZ-z)<Math.abs(mid.z-centerZ-axles[a])?j:a,0);role='source-0';if(size.x<.3){const s=Math.sign(c.x),oldX=(box.min.x+box.max.x)/2;dest=`wheel-${k}-${s}`;pivot.set(oldX,wheelY,axles[k]+centerZ);}else{dest='axle-'+k;pivot.set(0,ground,axles[k]+centerZ);}}
   else if(name.startsWith('bogie')){const k=mid.z<0?0:1;dest='bogie-'+k;pivot.z=bogies[k]+centerZ;role='source-0';}
   else if(name==='kuzov_0'){
    role=mid.y>4.08?'source-1':mid.y<1.75?'source-1':Math.abs(mid.z)>7.72?'front'+(mid.z>0?1:-1):'skin'+(mid.x>0?1:-1);
    // Frame-mounted equipment and handrails retain their unpainted atlas.
    if(box.max.y<2.08&&size.z<3.5)role='source-1';
    if(Math.abs(mid.z)>7.72&&mid.y>1.29&&mid.y<4.08)role='front'+(mid.z>0?1:-1); // cover the source fleet-number plate
   }else if(name==='stekla_0')role=c.y>4.1||c.y<2.0?(c.z>0?'lens':'dark'):'glass';
   else if(name.startsWith('otrajateli'))role=c.z>0?'lens':'metal';
   else if(name==='cabina_0')role='source-4';else if(name==='vnytrennosti_0')role='source-5';else if(name==='scepka_0')role='source-6';
   else if(name==='zerkala_0')role='metal';else if(name==='kojuxi_0')role='paint';
  }else{
   // Remove pantograph, its insulators and the disconnected electrical rack.
   if(name.startsWith('pantogr')||name==='ed431m_3_0'||name==='ed431m_2_0'||name==='ed431m_4_0'||name.startsWith('ed431m_door_int')||box.min.y>3.94||box.min.y>3.7&&box.max.y>4.0&&size.z<1){removedTriangles++;continue;}
   if(name.startsWith('telega')){
    if(name==='telega_2'||name==='telega_3'){removedTriangles++;continue;} // duplicate wheel faces in the source
    if(name==='telega_0'){const k=axles.reduce((a,z,j)=>Math.abs(c.z-centerZ-z)<Math.abs(c.z-centerZ-axles[a])?j:a,0),s=Math.sign(c.x);dest=`wheel-${k}-${s}`;pivot.set(c.x,wheelY,axles[k]+centerZ);role='metal';}
    else{const k=mid.z<0?0:1;dest='bogie-'+k;pivot.z=bogies[k]+centerZ;role='source-4';}
   }else if(name==='ostekl_1'||/^ed431m_door[1-4]_1$/.test(name))role='glass';
   else if(name==='ostekl_0'){role='metal';if(size.y>.25){removedTriangles++;continue;}} // retain frame bars, remove inner glazing sheet
   else if(/^ed431m_door[1-4]_3$/.test(name)){removedTriangles++;continue;}
   else if(name==='ed431m_1_0'||name==='ed431m_1_1'||/^ed431m_door[1-4]_[02]$/.test(name)){
    role=mid.y>3.82?'roof':mid.y<1.30?'source-3':Math.abs(mid.z)>9.55?'source-3':'skin'+(mid.x>0?1:-1);
   }else if(name==='ed431m_3_0')role='roof';else if(name==='ed431_scep_0')role='source-14';else role='dark';
  }
  const key=dest+'|'+role;if(!bins.has(key))bins.set(key,{dest,role,p:[],n:[],uv:[]});const bin=bins.get(key);
  for(const j of ids){const v=verts[j],local=v.clone().sub(pivot);bin.p.push(...local.toArray());bin.n.push(...normals[j].toArray());
   const side=role.endsWith('-1')?-1:1;bin.uv.push(...(role.startsWith('skin')?[.5-side*v.z/22,(5.5-v.y)/5.5]:role.startsWith('front')?[.5+side*v.x/3.4,(5.5-v.y)/5.5]:coach&&role==='roof'?[.5+v.x/3.4,.5+v.z/21]:uvs[j]));}
 }
 for(const b of bins.values()){const a=(type,array)=>doc.createAccessor().setType(type).setArray(new Float32Array(array)).setBuffer(buffer),p=doc.createPrimitive().setAttribute('POSITION',a('VEC3',b.p)).setAttribute('NORMAL',a('VEC3',b.n)).setMaterial(mats[b.role]);if(mats[b.role].getBaseColorTexture())p.setAttribute('TEXCOORD_0',a('VEC2',b.uv));groups.get(b.dest).addChild(doc.createNode(b.dest+'-'+b.role).setMesh(doc.createMesh().addPrimitive(p)));}
 if(coach){const chunks=[];for(const z of [-6,-3,0,3,6]){const g=new THREE.BoxGeometry(.42,.085,.54).toNonIndexed();g.translate(0,4.13-ground,z);chunks.push(g);}const a=(type,array)=>doc.createAccessor().setType(type).setArray(new Float32Array(array)).setBuffer(buffer),pp=chunks.flatMap(g=>Array.from(g.attributes.position.array)),nn=chunks.flatMap(g=>Array.from(g.attributes.normal.array));groups.get('body').addChild(doc.createNode('roof-vents').setMesh(doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION',a('VEC3',pp)).setAttribute('NORMAL',a('VEC3',nn)).setMaterial(mats.metal))));}
 Object.assign(doc.getRoot().getAsset(),{copyright:`${credit.author}; CC BY 4.0; ${credit.source}; museum livery and running rig adaptation by RocketTrip`,extras:{...credit,profile,adaptation:coach?'Soviet green/yellow museum coach; pantograph/electrical roof rack removed; series not authenticated.':'M62 in an interpretive Kosmotrans livery, based on photographs of TEM2UM; no historical M62 fleet identity claimed.'}});
 await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.72,error:.0002}),dedup(),prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}));
 const bytes=await io.writeBinary(doc);await writeFile(`${output}/model-v1.glb`,bytes);const decoded=await io.readBinary(bytes),triangles=decoded.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((s,p)=>s+p.getIndices().getCount()/3,0),0),hash=b=>createHash('sha256').update(b).digest('hex');
 const manifest={id:coach?'soviet-coach':'m62-kosmotrans',version:'rail-source-v1',source:{...credit,driveFileId:coach?'1hpAKrVxPOBb-4nTQmMZRhT5tovpWBOik':'1OdvxvayfFYuhg39OVw4kX9SSpRiRhq3O',bytes:source.length,sha256:hash(source)},bytes:bytes.length,sha256:hash(bytes),sourceTriangles,triangles,removedTriangles,primitives:decoded.getRoot().listMeshes().length,bounds:getBounds(decoded.getRoot().listScenes()[0]),profile};
 await writeFile(`${output}/manifest-v1.json`,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
}
await writeFile('src/rail-vehicle-profiles.js','// Source geometry in metres; generated by scripts/prepare-rail-assets.mjs.\nexport const RAIL_VEHICLE_PROFILES=Object.freeze('+JSON.stringify(profiles,null,2)+');\n');
