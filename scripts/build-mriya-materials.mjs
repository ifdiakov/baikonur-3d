import{NodeIO}from'@gltf-transform/core';import fs from'node:fs';import path from'node:path';import sharp from'sharp';
const [input,textureRoot,output]=process.argv.slice(2);const io=new NodeIO(),doc=await io.read(input),root=doc.getRoot(),meshes=root.listMeshes(),buffer=root.listBuffers()[0],originalMaterials=[...root.listMaterials()];
const textureCache=new Map(),materials=new Map();
async function material(name,file=null,kind='white'){
 const key=[name,file,kind].join('|');if(materials.has(key))return materials.get(key);
 const m=doc.createMaterial(name).setBaseColorFactor(kind==='dark'?[.025,.03,.034,1]:kind==='metal'?[.46,.49,.51,1]:[.92,.92,.9,1]).setRoughnessFactor(kind==='metal'?.45:kind==='dark'?.65:.63).setMetallicFactor(kind==='metal'?.7:.08).setDoubleSided(true);
 if(file){let t=textureCache.get(file);if(!t){const bytes=await sharp(path.join(textureRoot,file)).resize({width:file.includes('fuz-big')?2048:1024,height:file.includes('fuz-big')?2048:1024,fit:'inside',withoutEnlargement:true}).png().toBuffer();t=doc.createTexture(file).setImage(bytes).setMimeType('image/png');textureCache.set(file,t);}m.setBaseColorFactor([1,1,1,1]).setBaseColorTexture(t);}
 materials.set(key,m);return m;
}
const mriyaMaps={0:'fuz-nos.jpg',1:'left-stabil.jpg',2:'right-stabil.jpg',3:'left-rl-vysoty.jpg',4:'right-rl-vysoty.jpg',5:'kil-left.jpg',6:'kil-right.jpg',7:'left-naprav-top.jpg',8:'right-naprav-top.jpg',9:'left-naprav-bott.jpg',10:'right-naprav-bott.jpg',11:'gorb.jpg',12:'wing-right.jpg',13:'wing-left.jpg',16:'elevon.jpg',17:'mex-pov.jpg',23:'dver.jpg',38:'pilon-rgt3.jpg',39:'pilon-rgt1.jpg',40:'pilon-rgt2.jpg',49:'fuz-big.jpg',50:'pilon-rgt1.jpg',51:'pilon-rgt2.jpg',52:'pilon-rgt3.jpg'};
const white=await material('Mriya ivory enamel'),dark=await material('Cockpit and intake shadow',null,'dark'),metal=await material('Engine aluminium',null,'metal');
for(let i=0;i<54;i++)for(const p of meshes[i].listPrimitives()){
 const oldIndex=originalMaterials.indexOf(p.getMaterial()),oldName=p.getMaterial()?.getName(),uv=p.getAttribute('TEXCOORD_0');let m=white;
 if(i===37||i===33&&oldIndex===15)m=dark;
 else if((i>=18&&i<=22)||i===53)m=['___________','____________-2'].includes(oldName)?dark:metal;
 else if(i>=41&&i<=46)m=uv&&(oldIndex===5||oldIndex===27)?await material('Mriya nacelle stripe','Mriya/maps/dvigatel-right1.jpg'):oldIndex===7||oldIndex===3?dark:metal;
 else if(mriyaMaps[i]&&uv)m=await material('Mriya '+mriyaMaps[i],'Mriya/maps/'+mriyaMaps[i]);
 else if(i===14||i===15||i===34||i===47)m=metal;
 p.setMaterial(m);
}
// Buran's source contains separately modelled tiles but random wireframe colours.
// Restore the reference's thermal areas in source coordinates; no geometry changes.
const tileMat=doc.createMaterial('Buran thermal tiles — white upper / black lower').setBaseColorFactor([1,1,1,1]).setMetallicFactor(.02).setRoughnessFactor(.86).setDoubleSided(true);
const wingEdge=new Map(),finEdge=new Map();
for(let i=54;i<1869;i++)for(const p of meshes[i].listPrimitives()){
 const a=p.getAttribute('POSITION');for(let v=0;v<a.getCount();v++){const xyz=[];a.getElement(v,xyz);const[x,y,z]=xyz,az=Math.abs(z);
 if(az>3&&y>34.7&&y<37&&x<45){const k=Math.round(az*2);wingEdge.set(k,Math.min(wingEdge.get(k)??Infinity,x));}
 if(y>41&&Math.abs(z)<.6){const k=Math.round(y*3);let e=finEdge.get(k)||[Infinity,-Infinity];e=[Math.min(e[0],x),Math.max(e[1],x)];finEdge.set(k,e);}
 }}
let coloured=0;
for(let i=54;i<meshes.length;i++)for(const p of meshes[i].listPrimitives()){
 if(i>=1869){p.setMaterial(metal);continue;}
 const buranMap={1626:'NF.gif',357:'Kil_B.gif',136:'WingVR.gif',152:'WingVR.gif',503:'SF.gif',504:'SF.gif'}[i];
 if(buranMap&&p.getAttribute('TEXCOORD_0')){p.setMaterial(await material('Buran '+buranMap,'Mriya/Buran/Buran-max-transport/'+buranMap));continue;}
 const a=p.getAttribute('POSITION'),n=p.getAttribute('NORMAL'),colors=new Float32Array(a.getCount()*4);let meanY=0;
 for(let v=0;v<a.getCount();v++){
  const pos=[],normal=[];a.getElement(v,pos);n?.getElement(v,normal);const[x,y,z]=pos,az=Math.abs(z);meanY+=y;
  const noseLimit=x<24?Math.round((37.85-(x-17)*.25)*5)/5:35.9;
  let black=y<noseLimit||x<17.15;
  if(az>3&&x<45&&y<37.1){const edge=wingEdge.get(Math.round(az*2));black=normal[1]<-.2||y<35.3||(edge!==undefined&&x<edge+.45);}
  if(y>41&&az<.6)black=false; // Main fin UV supplies its precise black thermal outline.
  if(x>47&&y<38.7)black=true;
  // The small inset front cockpit panes are independently modelled faces.
  if(x>19&&x<22.5&&y>39.15&&y<40.2&&Math.abs(normal[0])>.2)black=true;
  const jitter=((i*37)%17)/1700;const c=black?.018+jitter:.86+jitter;
  colors.set([c,c*1.004,c*1.012,1],v*4);
 }
 p.setAttribute('COLOR_0',doc.createAccessor('Buran reference colours',buffer).setType('VEC4').setArray(colors));p.setMaterial(tileMat);coloured+=a.getCount();
}

// Period markings from the supplied Yubileiny photographs, on the flat orbiter sides.
const textSvg='<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="192"><text x="512" y="145" text-anchor="middle" font-family="DejaVu Sans" font-style="italic" font-weight="bold" font-size="150" fill="#17191d">БУРАН</text></svg>';
const titleTexture=doc.createTexture('Buran Cyrillic title').setImage(await sharp(Buffer.from(textSvg)).png().toBuffer()).setMimeType('image/png');
const flagTexture=doc.createTexture('USSR flag').setImage(await sharp(path.join(textureRoot,'Mriya/Buran/Buran-max-transport/Flag.gif')).resize(256,128).png().toBuffer()).setMimeType('image/png');
const titleMat=doc.createMaterial('Buran title').setBaseColorTexture(titleTexture).setAlphaMode('MASK').setAlphaCutoff(.1).setRoughnessFactor(.8);
const flagMat=doc.createMaterial('Buran USSR flag').setBaseColorTexture(flagTexture).setRoughnessFactor(.8);
function quad(name,center,right,up,width,height,mat){
 const positions=[],normals=[],nx=right[1]*up[2]-right[2]*up[1],ny=right[2]*up[0]-right[0]*up[2],nz=right[0]*up[1]-right[1]*up[0];
 for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]]){positions.push(...center.map((c,k)=>c+right[k]*a*width/2+up[k]*b*height/2));normals.push(nx,ny,nz);}
 const accessor=(name,type,array)=>doc.createAccessor(name,buffer).setType(type).setArray(array);
 const primitive=doc.createPrimitive().setAttribute('POSITION',accessor(name,'VEC3',new Float32Array(positions))).setAttribute('NORMAL',accessor(name,'VEC3',new Float32Array(normals))).setAttribute('TEXCOORD_0',accessor(name,'VEC2',new Float32Array([0,1,1,1,1,0,0,0]))).setIndices(accessor(name,'SCALAR',new Uint16Array([0,1,2,0,2,3]))).setMaterial(mat);
 root.listScenes()[0].addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive)));
}
for(const side of [-1,1]){quad('Buran name', [43.3,37.95,side*2.751],[side,0,0],[0,1,0],4.7,.88,titleMat);quad('Buran USSR flag',[39.85,38.05,side*2.751],[side,0,0],[0,1,0],1.45,.72,flagMat);}

// Dispose unreferenced source paint and the incorrect random palette.
for(const m of [...root.listMaterials()])if(!root.listMeshes().some(mesh=>mesh.listPrimitives().some(p=>p.getMaterial()===m)))m.dispose();
for(const t of [...root.listTextures()])if(!t.listParents().some(p=>p.propertyType==='Material'))t.dispose();
await io.write(output,doc);console.log(JSON.stringify({output,materials:root.listMaterials().length,textures:root.listTextures().length,colouredVertices:coloured}));
