// Source: owner-supplied mamont nikita mesh, CC BY 4.0. All livery artwork is
// repo-native SVG, projected into a portable self-contained GLB (no shaders).
import * as THREE from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld,simplify,meshopt,getBounds} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const source=await readFile(process.argv[2]||'scripts/source-models/tu204/source.glb');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const original=await io.readBinary(source),asset=original.getRoot().getAsset().extras;
const doc=new (await import('@gltf-transform/core')).Document(),buffer=doc.createBuffer(),scene=doc.createScene('Ту-204-300 · ЦПК'),root=doc.createNode('Ту-204-300 · Юрий Гагарин · RA-64044');scene.addChild(root);
const unit=.0254,zScale=40.19/((1534.1051025390625+50.78470993041992)*unit);
const position=v=>new THREE.Vector3((v[0]-941.93025)*unit,v[2]*unit,(741.6601963043213-v[1])*unit*zScale);
const material=(name,color,metal=.12,rough=.42)=>doc.createMaterial(name).setBaseColorFactor([...new THREE.Color(color).toArray(),1]).setMetallicFactor(metal).setRoughnessFactor(rough);
const mats={white:material('ЦПК · белая эмаль','#e8edf0'),metal:material('Ту-204 · алюминий','#abb6c0',.6,.36),darkMetal:material('ПС-90А · металл вентилятора','#485560',.65,.4),tyre:material('Шасси · резина','#171b21',0,.88),glass:material('Кабина и иллюминаторы','#193341',.2,.2),navy:material('ЦПК · синие гондолы','#102440',.22,.38),red:material('Левый БАНО','#a92330'),green:material('Правый БАНО','#166849')};
// Side projections cover z=+20.2..-20.2 and y=0..14.2. Independent artwork
// for each side makes every title readable rather than mirror-imaging it.
function artwork(side){
 const W=4096,H=1440,sx=W/40.4,sy=H/14.2,X=z=>(20.2-side*z)*sx,Y=y=>(14.2-y)*sy;
 const path=pts=>pts.map(([z,y],i)=>(i?'L':'M')+X(z).toFixed(2)+' '+Y(y).toFixed(2)).join(' ')+'Z';
 const wave=[[20.2,2.5],[18,2.55],[16,2.65],[14,3.25],[12,3.55],[10,3.62],[8,3.42],[6,3.0],[4,2.7],[1,2.7],[-3,2.8],[-7,3.2],[-11,3.8],[-14,5.2],[-17,6.2],[-20.2,6.7],[-20.2,0],[20.2,0]];
 let stars='';let seed=204300;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<360;i++){const x=rand()*W,y=rand()*H,r=.6+rand()*2.4;stars+=`<circle cx="${x}" cy="${y}" r="${r}" fill="${i%7?'#c6e8fa':'#ffffff'}" opacity="${.15+rand()*.65}"/>`;if(i%23===0)stars+=`<path d="M${x-5} ${y}h10M${x} ${y-5}v10" stroke="#e3f2ff" opacity=".5" stroke-width=".8"/>`;}
 const text=(s,z,y,h,color='#21333f',weight=700,length)=>`<text x="${X(z)}" y="${Y(y)}" text-anchor="middle" fill="${color}" font-family="DejaVu Sans" font-size="${h*sy}" font-weight="${weight}" ${length?`textLength="${length*sx}" lengthAdjust="spacingAndGlyphs"`:''}>${s}</text>`;
 const logo=(z,y,w)=>{const x=X(z),yy=Y(y),s=w*sx/260;return `<g transform="translate(${x-130*s},${yy-65*s}) scale(${s})"><ellipse cx="121" cy="70" rx="91" ry="40" transform="rotate(-17 121 70)" fill="none" stroke="#d4e5f0" stroke-width="9"/><path d="M65 83L206 8L150 99L128 70Z" fill="#e6344b"/><path d="M67 85L128 70L149 99Z" fill="#a91f36"/></g>`;};
 const fin=[[ -10.65,6.1],[-15.8,13.85],[-19.65,13.85],[-20.2,6.1]];
 const finPaint=path(fin),bodyPaint=path(wave);
 const blue=`<path d="${bodyPaint}"/><path d="${finPaint}"/>`;
 let s=`<defs><linearGradient id="blue" x1="0" y1="1" x2=".5" y2="0"><stop stop-color="#0a1c34"/><stop offset="1" stop-color="#183e60"/></linearGradient><clipPath id="paint">${blue}</clipPath></defs><rect width="4096" height="1440" fill="#ecf0f1"/><g fill="url(#blue)">${blue}</g><g clip-path="url(#paint)">${stars}</g>`;
 // Main fuselage title above the windows, name below the forward windows.
 s+=text('ЦЕНТР ПОДГОТОВКИ КОСМОНАВТОВ',1.6,5.8,.43,'#ca293a',700,15.2);
 s+=text('Юрий Гагарин',12.35,3.95,.31,'#1f2932',700,2.9);
 s+=text('RA-64044',-11.8,5.75,.34,'#26313a',600,2.65);
 s+=text('Ту-204-300',17.0,3.65,.21,'#23313b',600,1.65);
 for(const [i,color]of ['#ffffff','#2357a1','#d93645'].entries())s+=`<rect x="${X(17.1)-.32*sx}" y="${Y(5.21)+i*.12*sy}" width="${.64*sx}" height="${.12*sy}" fill="${color}"/>`;
 s+=`<circle cx="${X(15.8)}" cy="${Y(3.92)}" r="${.19*sy}" fill="#d3b371"/><circle cx="${X(15.8)}" cy="${Y(3.92)}" r="${.15*sy}" fill="#1b4161"/>`;
 s+=text('ЦПК',15.8,3.86,.13,'#e1e9e9',700);
 for(const z of [15.25,-10.2])s+=`<rect x="${X(z)-.42*sx}" y="${Y(5.75)}" width="${.84*sx}" height="${1.92*sy}" rx="${.13*sx}" fill="none" stroke="#667981" stroke-width="2"/><path d="M${X(z)-.17*sx} ${Y(4.55)}h${.2*sx}" stroke="#3d5562" stroke-width="3"/>`;
 s+=logo(-16.7,9.25,2.65)+text('РОСКОСМОС',-16.7,8.25,.32,'#f2f7f9',700,3.25);
 // Tiny structural seams remain subordinate to the original mesh detail.
 for(let z=-14;z<18;z+=2)s+=`<path d="M${X(z)} ${Y(6.1)}V${Y(2.4)}" stroke="#8394a0" stroke-width=".65" opacity=".17"/>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="1440">${s}</svg>`;
}
const output='assets/models/tu204-cpk';await mkdir(output,{recursive:true});
for(const side of [-1,1]){const svg=artwork(side),image=await sharp(Buffer.from(svg)).jpeg({quality:92,chromaSubsampling:'4:4:4'}).toBuffer();await writeFile(`${output}/livery-${side>0?'right':'left'}.svg`,svg);const tex=doc.createTexture('ЦПК · '+(side>0?'правый':'левый')+' борт').setImage(image).setMimeType('image/jpeg');mats['skin'+side]=material('ЦПК · '+side,'#ffffff',.17,.4).setBaseColorTexture(tex);}
const bins=new Map();let sourceTriangles=0,removedLines=0;
for(const [ni,node]of original.getRoot().listNodes().entries())if(node.getMesh())for(const p of node.getMesh().listPrimitives()){
 if(p.getMode()!==4){removedLines+=p.getIndices()?.getCount()/2||0;continue;}
 const pos=p.getAttribute('POSITION'),norm=p.getAttribute('NORMAL'),ix=p.getIndices(),count=ix?.getCount()||pos.getCount(),name=p.getMaterial().getName(),a=pos.getArray(),parents=Array.from({length:pos.getCount()},(_,i)=>i),co=new Map();
 const find=i=>parents[i]===i?i:parents[i]=find(parents[i]),join=(a,b)=>parents[find(a)]=find(b);
 const verts=[],normals=[];let v=[];
 for(let i=0;i<pos.getCount();i++){pos.getElement(i,v);verts.push(position(v));norm.getElement(i,v);normals.push(new THREE.Vector3(v[0],v[2],-v[1]/zScale).normalize());const k=verts[i].toArray().map(x=>x.toFixed(4)).join(',');if(co.has(k))join(i,co.get(k));else co.set(k,i);}
 for(let i=0;i<count;i+=3){const aa=ix?ix.getScalar(i):i,bb=ix?ix.getScalar(i+1):i+1,cc=ix?ix.getScalar(i+2):i+2;join(aa,bb);join(aa,cc);}
 const boxes=new Map();for(let i=0;i<pos.getCount();i++){const k=find(i);if(!boxes.has(k))boxes.set(k,new THREE.Box3());boxes.get(k).expandByPoint(verts[i]);}
 for(let i=0;i<count;i+=3){sourceTriangles++;const ids=[0,1,2].map(j=>ix?ix.getScalar(i+j):i+j),box=boxes.get(find(ids[0])),c=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),mid=ids.reduce((s,id)=>s.add(verts[id]),new THREE.Vector3()).multiplyScalar(1/3);let role='metal';
  if(name==='material_14')role='tyre';else if(name.startsWith('Translucent_Glass_Gray')||name==='0136_Charcoal'||name==='Color_008')role='glass';
  else if(ni===3){role=size.z>30||box.min.y>5.8?'skin'+(mid.x>=0?1:-1):Math.abs(c.x)>20?'navy':'white';}
  else if(ni===5||ni===6){role=Math.abs(c.x)>5&&Math.abs(c.x)<8&&box.max.y<3.4&&box.min.z>3?'navy':ni===5?'white':'metal';}
  else if(['material_17','Color_003','material_16'].includes(name)&&Math.abs(c.x)<2.3&&c.y>3)role='skin'+(mid.x>=0?1:-1);
  else if(['material_22','Color_006','material_9','aeroflot-silver','Color_000'].includes(name))role='darkMetal';
  if(ni===46)role='red';if(ni===48)role='green';
  // Winglet metal backing also receives the dark blue finish.
  if(Math.abs(mid.x)>20&&mid.y>4.5&&role==='metal')role='navy';
  if(!bins.has(role))bins.set(role,{p:[],n:[],uv:[]});const bin=bins.get(role),side=role==='skin-1'?-1:1;
  for(const id of ids){const v=verts[id];bin.p.push(...v.toArray());bin.n.push(...normals[id].toArray());bin.uv.push((20.2-side*v.z)/40.4,1-v.y/14.2);}
 }
}
for(const [name,b]of bins){const a=(type,array)=>doc.createAccessor().setType(type).setArray(new Float32Array(array)).setBuffer(buffer),p=doc.createPrimitive().setAttribute('POSITION',a('VEC3',b.p)).setAttribute('NORMAL',a('VEC3',b.n)).setMaterial(mats[name]);if(name.startsWith('skin'))p.setAttribute('TEXCOORD_0',a('VEC2',b.uv));root.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(p)));}
Object.assign(doc.getRoot().getAsset(),{copyright:`${asset.author}; CC BY 4.0; ${asset.source}; CPK livery adaptation by RocketTrip`,extras:{...asset,adaptation:'Tu-204-300 RA-64044 Yuri Gagarin; CPK livery from official May 2019 photos; normalized metres; removed SketchUp edge overlays; baked two-sided vector artwork'}});
await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.65,error:.0004}),dedup(),prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}));
const bytes=await io.writeBinary(doc);await writeFile(`${output}/model-v1.glb`,bytes);const decoded=await io.readBinary(bytes),bounds=getBounds(decoded.getRoot().listScenes()[0]),triangles=decoded.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0),0);
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest={id:'tu204-cpk',version:'tu204-cpk-v1',registration:'RA-64044',name:'Юрий Гагарин',variant:'Ту-204-300',source:{...asset,driveFileId:'1dk5mjXZuRpYuT7K4elGpc-p1DVP48g7m',bytes:source.length,sha256:hash(source)},bytes:bytes.length,sha256:hash(bytes),sourceTriangles,triangles,removedLineSegments:removedLines,primitives:bins.size,bounds,dimensions:{length:40.19,wingspan:41.8,height:13.901},scale:.28,reference:'https://www.gctc.ru/main.php?id=4611',notes:['Source already has the short fuselage proportions; no six-metre shortening applied.','Static parked aircraft; landing gear retained.','Illustrative livery projection; not a certified engineering model.']};
await writeFile(`${output}/manifest-v1.json`,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
