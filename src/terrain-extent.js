import * as THREE from 'three';

/**
 * BAIKONUR STEPPES / terrain v4
 *
 * A deterministic, coordinate-continuous multi-scale earth material shared by
 * the wide and intermediate surfaces. This is a museum reconstruction; no
 * satellite imagery, cadastral terrain measurements or imported map tiles.
 *
 * Large structure: loess / gravel patches, solonchak crust, clay pans,
 * alluvial deposits and dry, sinuous wash traces. Far and mid maps sample
 * the SAME world-coordinate terrain function, so transitions have no seams.
 */
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const lerp=(a,b,t)=>a+(b-a)*t;
function hash(ix,iy,salt){
  let h=Math.imul(ix|0,374761393)^Math.imul(iy|0,668265263)^Math.imul(salt|0,1442695041);
  h=Math.imul(h^(h>>>13),1274126177);
  return((h^(h>>>16))>>>0)/4294967295;
}
function noise(x,z,cell,salt){
  const u=x/cell,v=z/cell,ix=Math.floor(u),iz=Math.floor(v),
    fx=smooth(0,1,u-ix),fz=smooth(0,1,v-iz);
  return lerp(lerp(hash(ix,iz,salt),hash(ix+1,iz,salt),fx),
              lerp(hash(ix,iz+1,salt),hash(ix+1,iz+1,salt),fx),fz);
}

/** Return an SRGB earth color, in 0–255 channels, at *world* map X/Z.
 * High-frequency contributions can be disabled for the very distant texture
 * to avoid moiré and keep it temporally stable during camera movements.
 */
export function sampleSteppe(x,z,detail=1){
  // Regional patterns measured in illustrative world units.
  const lithic=noise(x,z,10800,7),
        macro=noise(x,z,5300,11),
        fans=noise(x,z,2410,13),
        fineClay=noise(x,z,930,17),
        lichen=noise(x,z,345,23),
        grain=detail>0?noise(x,z,95,29):.5,
        grit=detail>1?noise(x,z,26,31):.5;
  const relief=(lithic-.5)*32+(macro-.5)*35+(fans-.5)*24+(fineClay-.5)*13;
  const micros=(lichen-.5)*11+(grain-.5)*(detail>0?12:0)+(grit-.5)*(detail>1?7:0);
  // Irregular salt-pan margins; pastel pale deposits, no white circles.
  const saltSignal=macro*.24+fans*.50+fineClay*.26;
  const salt=smooth(.51,.70,saltSignal)*(14+lichen*38);
  const panDry=smooth(.46,.66,macro*.56+fans*.44)*smooth(.53,.76,lichen);
  // Dark laminated pebble fields and stony hills interrupt the light loess.
  const stone=smooth(.51,.74,fans*.48+macro*.32+fineClay*.20)*(9+grain*17);
  // Nonperiodic erosion is represented by irregular low-contrast clay patches,
  // not sinusoidal channels, wash bands or wave-like ridges.
  const dryClay=noise(x,z,680,41)*.52+noise(x,z,225,43)*.31+noise(x,z,95,47)*.17;
  const weathered=smooth(.62,.83,dryClay)*10;
  const transition=smooth(.30,.58,dryClay)*5;
  const loess=panDry*8;
  const rr=171+relief+micros+salt+loess-stone*1.15-weathered+transition;
  const gg=156+relief*.88+micros*.87+salt*.95+loess*.82-stone*1.25-weathered*.92+transition*.87;
  const bb=132+relief*.69+micros*.69+salt*.86+loess*.67-stone*1.02-weathered*.81+transition*.68;
  return [
    clamp(Math.round(rr),0,255),clamp(Math.round(gg),0,255),
    clamp(Math.round(bb),0,255)
  ];
}

/**
 * Two detail grades around a huge already existing repeating base:
 *  - regional 116 km landscape: broad terrain tone and alluvial structure
 *  - regional 18 km landscape: fine scrub, clay and dry salt crust
 * each feathering to the lower level for a clean horizon.
 */
export function buildExtendedTerrain({scene,registerGroundSurface,renderer}) {
  const config=[
    {id:'regional',extent:116000,resolution:512,height:-4.95,fade:.22,detail:0,order:0},
    {id:'intermediate',extent:18000,resolution:768,height:-3.75,fade:.24,detail:1,order:1}
  ];
  const planes=[],textures=[],regionInfo=[];
  for(const spec of config){
    const cv=document.createElement('canvas'),side=spec.resolution;
    cv.width=cv.height=side;
    const ctx=cv.getContext('2d',{willReadFrequently:true});
    const img=ctx.createImageData(side,side),bytes=img.data;
    const repeat=spec.extent/side;
    let sum=0,nontransparent=0;
    for(let iy=0;iy<side;iy++){
      const wz=(iy/(side-1)-.5)*spec.extent;
      const edgeZ=Math.min(iy/(side-1),1-iy/(side-1));
      for(let ix=0;ix<side;ix++){
        const wx=(ix/(side-1)-.5)*spec.extent;
        const edgeX=Math.min(ix/(side-1),1-ix/(side-1));
        const [r,g,b]=sampleSteppe(wx,wz,spec.detail);
        const alpha=smooth(0,spec.fade,Math.min(edgeX,edgeZ));
        const k=(iy*side+ix)*4;
        bytes[k]=r;bytes[k+1]=g;bytes[k+2]=b;
        bytes[k+3]=Math.round(alpha*255);
        sum+=r+g+b;if(alpha>.05)nontransparent++;
      }
    }
    ctx.putImageData(img,0,0);
    const texture=new THREE.CanvasTexture(cv);
    texture.name='Baikonur steppe '+spec.id+' v4';
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.generateMipmaps=true;
    texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.magFilter=THREE.LinearFilter;
    texture.anisotropy=Math.min(renderer?.capabilities?.getMaxAnisotropy?.()||4,8);
    const material=new THREE.MeshBasicMaterial({
      map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide,
      polygonOffset:true,polygonOffsetFactor:-1
    });
    material.name='Earth / '+spec.id+' / no survey';
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(spec.extent,spec.extent),material);
    plane.name='Степь Байконура / '+spec.id;
    plane.rotation.x=-Math.PI/2;plane.position.y=spec.height;
    plane.renderOrder=spec.order;
    plane.receiveShadow=false;
    scene.add(plane);
    if(registerGroundSurface)registerGroundSurface(plane);
    planes.push(plane);textures.push(texture);
    regionInfo.push({name:spec.id,extent:spec.extent,resolution:side,
      metresPerPixel:Math.round(repeat*100)/100,edgeFadeFraction:spec.fade,
      averageBrightness:Math.round(sum/(side*side*3)),coveredPixels:nontransparent});
  }
  // A single instanced-shrub mesh adds modest riparian vegetation only along
  // the given mapped Syr Darya river; no random trees over launch complexes.
  let riparianCount=0;
  function addRiparian({riverCorePts,point,siteRecords=[]}){
    if(!riverCorePts?.length)return 0;
    const steps=610,bankShrubs=[];
    const pseudo=(seed)=>((Math.sin(seed*91.9158+22.8811)*43758.5453)%1+1)%1;
    const river=new THREE.CatmullRomCurve3(
      riverCorePts.map(([x,y])=>point(x,y,-1.7)),false,'centripetal');
    const facilities=siteRecords.map(s=>point(s.x,s.y,0));
    for(let j=0;j<steps;j++){
      const t=(j+.5)/steps,c=river.getPoint(t),d=river.getTangent(t);
      const mag=Math.hypot(d.x,d.z)||1,nx=-d.z/mag,nz=d.x/mag;
      for(let side of [-1,1]){
        const seed=j*2+(side===-1?0:1);
        if(pseudo(seed+12)<.39)continue;
        const lateral=side*(39+pseudo(seed+9)*140);
        const along=(pseudo(seed+5)-.5)*18;
        const x=c.x+nx*lateral+d.x*along,z=c.z+nz*lateral+d.z*along;
        if(facilities.some(p=>(p.x-x)**2+(p.z-z)**2<130**2))continue;
        bankShrubs.push({x,z,w:.9+pseudo(seed+18)*2.8,h:.55+pseudo(seed+45)*1.1,
          tone:pseudo(seed+31)});
      }
    }
    if(!bankShrubs.length)return 0;
    const mat=new THREE.MeshStandardMaterial({
      color:0x737c5c,roughness:1,metalness:0,flatShading:true
    });
    const mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),mat,bankShrubs.length);
    const m=new THREE.Matrix4(),quat=new THREE.Quaternion(),sc=new THREE.Vector3(),
      pos=new THREE.Vector3(),color=new THREE.Color();
    bankShrubs.forEach((o,i)=>{
      pos.set(o.x,-1.54,o.z);sc.set(o.w,o.h,o.w*.7);
      quat.setFromAxisAngle(new THREE.Vector3(0,1,0),o.tone*Math.PI*2);
      m.compose(pos,quat,sc);mesh.setMatrixAt(i,m);
      color.setHSL(.16+o.tone*.055,.11+o.tone*.10,.28+o.tone*.13);
      mesh.setColorAt(i,color);
    });
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.name='Редкий кустарник поймы Сырдарьи';
    mesh.renderOrder=5;mesh.frustumCulled=false;
    scene.add(mesh);
    riparianCount=bankShrubs.length;return riparianCount;
  }
  return {
    planes,addRiparian,
    sample:sampleSteppe,
    stats:()=>({
      edition:4,extent:config[0].extent,mediumExtent:config[1].extent,
      textureResolution:config[0].resolution,
      textureResolutions:config.map(a=>a.resolution),
      regions:regionInfo,terrainTypes:['loess','solonchak','clay','gravel','dry washes','alluvium'],
      riparianShrubs:riparianCount,photographicClaim:false,
      detailBeyondHistoricMap:true,continuousWorldCoordinates:true
    })
  };
}
