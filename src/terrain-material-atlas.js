import * as THREE from 'three';

// Five independent, repeatable soil families packed into three GPU atlases:
// albedo, tangent-space normals and roughness. They are generated once, after
// the first interactive map, not downloaded for every terrain parcel.
export const DETAILED_SOIL_VERSION='five-material-atlas-v2-edge-gutters';
export const SOIL_MATERIALS=Object.freeze([
 Object.freeze({id:'clay',name:'Степной суглинок',rgb:[155,132,103],roughness:.89,grain:1.1}),
 Object.freeze({id:'sand',name:'Песок',rgb:[197,173,131],roughness:.96,grain:.62}),
 Object.freeze({id:'gravel',name:'Щебень и галька',rgb:[145,133,111],roughness:.84,grain:2.15}),
 Object.freeze({id:'salt',name:'Солончак',rgb:[195,186,163],roughness:.91,grain:.47}),
 Object.freeze({id:'scrub',name:'Сухая степная почва',rgb:[126,117,88],roughness:.94,grain:1.65})
]);
export const SOIL_ATLAS_COLUMNS=4,SOIL_ATLAS_ROWS=2;
export const SOIL_ATLAS_GUTTER_RATIO=1/16;
const clamp=n=>Math.min(1,Math.max(0,n));
const wrap=(v,n)=>(v%n+n)%n;
function hash(x,y,seed){
 let h=Math.imul(wrap(x,65536)+Math.imul(seed+7,181),374761393)^Math.imul(wrap(y,65536)-Math.imul(seed+3,29),668265263);
 h=Math.imul(h^(h>>>13),1274126177);
 return ((h^(h>>>16))>>>0)/4294967295;
}
// Coherent, periodic noise: the left/right and top/bottom tile borders match.
export function periodicSoilNoise(u,v,frequency,seed){
 const x=u*frequency,y=v*frequency,ix=Math.floor(x),iy=Math.floor(y);
 const fx=x-ix,fy=y-iy,a=fx*fx*(3-2*fx),b=fy*fy*(3-2*fy);
 const n=(xx,yy)=>hash(wrap(xx,frequency),wrap(yy,frequency),seed);
 return (n(ix,iy)*(1-a)+n(ix+1,iy)*a)*(1-b)+
  (n(ix,iy+1)*(1-a)+n(ix+1,iy+1)*a)*b;
}
function createTexture(bytes,width,height,kind,maxAnisotropy){
 const texture=new THREE.DataTexture(bytes,width,height,THREE.RGBAFormat);
 texture.name='Байконур · '+kind+' · 5 материалов';
 texture.colorSpace=kind==='цвет'?THREE.SRGBColorSpace:THREE.NoColorSpace;
 texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
 texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;
 texture.magFilter=THREE.LinearFilter;texture.anisotropy=Math.min(maxAnisotropy,8);
 texture.needsUpdate=true;return texture;
}
const nextFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
export async function createDetailedSoilAtlases({renderer,tileSize=512}={}){
 if(!Number.isInteger(tileSize)||tileSize<64||tileSize>512)throw new RangeError('Invalid detailed soil atlas resolution');
 const gutter=Math.round(tileSize*SOIL_ATLAS_GUTTER_RATIO),contentSize=tileSize-2*gutter;
 if(contentSize<32)throw new RangeError('Soil atlas has insufficient usable texels');
 const width=SOIL_ATLAS_COLUMNS*tileSize,height=SOIL_ATLAS_ROWS*tileSize,pixels=width*height*4;
 const albedo=new Uint8Array(pixels),normals=new Uint8Array(pixels),roughness=new Uint8Array(pixels);
 // Each family has a unique periodic, multi-frequency PBR surface. Compute
 // in short row slices, so animation and camera gestures stay responsive.
 for(let material=0;material<SOIL_MATERIALS.length;material++){
  const spec=SOIL_MATERIALS[material],field=new Float32Array(tileSize*tileSize);
  for(let y=0;y<tileSize;y++){
   for(let x=0;x<tileSize;x++){
    // Periodic content repeats in a real gutter, not in the neighbouring
    // material tile. At mip levels the renderer never sees another family's
    // colours while sampling a wrap edge.
    const u=wrap(x-gutter,contentSize)/contentSize,v=wrap(y-gutter,contentSize)/contentSize;
    field[y*tileSize+x]=.38*periodicSoilNoise(u,v,4,21+material*11)+
     .28*periodicSoilNoise(u,v,13,31+material*11)+
     .23*periodicSoilNoise(u,v,41,53+material*13)+
     .11*periodicSoilNoise(u,v,101,71+material*17);
   }
   if((y&31)===31)await nextFrame();
  }
  const ox=(material%SOIL_ATLAS_COLUMNS)*tileSize,oy=Math.floor(material/SOIL_ATLAS_COLUMNS)*tileSize;
  for(let y=0;y<tileSize;y++){
   for(let x=0;x<tileSize;x++){
    const i=y*tileSize+x,h=field[i];
    const left=field[y*tileSize+wrap(x-1,tileSize)],right=field[y*tileSize+wrap(x+1,tileSize)];
    const up=field[wrap(y-1,tileSize)*tileSize+x],down=field[wrap(y+1,tileSize)*tileSize+x];
    const random=hash(wrap(x-gutter,contentSize),wrap(y-gutter,contentSize),101+material*17)-.5;
    const pebble=material===2?Math.max(0,(h+random*.15-.54))*1.5:0;
    const saltCrack=material===3?Math.abs(h-.50)*.22:0;
    const grain=(h-.5)*spec.grain;
    const variation=grain*.42+random*.11+pebble*.28-saltCrack;
    const offset=((oy+y)*width+ox+x)*4;
    for(let channel=0;channel<3;channel++)
     albedo[offset+channel]=Math.round(Math.min(255,Math.max(0,spec.rgb[channel]*(1+variation))));
    albedo[offset+3]=255;
    const dx=(right-left)*spec.grain*3.8,dy=(down-up)*spec.grain*3.8;
    const inv=1/Math.hypot(dx,dy,1);
    normals[offset]=Math.round((-.5*dx*inv+.5)*255);
    normals[offset+1]=Math.round((-.5*dy*inv+.5)*255);
    normals[offset+2]=Math.round((.5*inv+.5)*255);
    normals[offset+3]=255;
    const r=Math.round(clamp(spec.roughness+grain*.075+random*.045)*255);
    roughness[offset]=roughness[offset+1]=roughness[offset+2]=r;
    roughness[offset+3]=255;
   }
   if((y&63)===63)await nextFrame();
  }
 }
 const anisotropy=renderer?.capabilities?.getMaxAnisotropy?.()??4;
 return {albedo:createTexture(albedo,width,height,'цвет',anisotropy),
  normal:createTexture(normals,width,height,'нормали',anisotropy),
  roughness:createTexture(roughness,width,height,'шероховатость',anisotropy),
  tileSize,width,height,gutterPixels:gutter,contentSize,gutterRatio:SOIL_ATLAS_GUTTER_RATIO,
  materialCount:SOIL_MATERIALS.length,
  gpuBytes:pixels*3,materials:SOIL_MATERIALS.map(m=>m.id)};
}
