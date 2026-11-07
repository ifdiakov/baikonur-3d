import * as THREE from 'three';

// Two enormous triangles lose metres in GPU world-coordinate interpolation
// near a close camera. This modest grid keeps terrain cutouts on their rims.
export const LARGE_TERRAIN_SEGMENTS=16;

/**
 * BAIKONUR STEPPES / terrain v7
 *
 * A deterministic, coordinate-continuous multi-scale earth material shared by
 * the wide and intermediate surfaces. This is a museum reconstruction; no
 * satellite imagery, cadastral terrain measurements or imported map tiles.
 *
 * Large structure: loess / gravel patches, solonchak crust, clay pans,
 * alluvial deposits and dry, sinuous wash traces. Far and mid maps sample
 * the SAME world-coordinate terrain function, so transitions have no seams.
 */
import {sampleSteppe} from './steppe-field.js?v=20261101-steppe-v7';
export {sampleSteppe} from './steppe-field.js?v=20261101-steppe-v7';
const smooth=(a,b,v)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t);};

/**
 * Two detail grades around a huge already existing repeating base:
 *  - regional 52 km landscape: broad terrain tone and alluvial structure
 *  - regional 18 km landscape: fine scrub, clay and dry salt crust
 * each feathering to the lower level for a clean horizon.
 */
export function buildExtendedTerrain({scene,registerGroundSurface,renderer,satelliteOwnsGroundColor=false}) {
  const config=[
    {id:'regional',extent:52000,resolution:512,height:-4.95,fade:.22,detail:0,order:0,segments:LARGE_TERRAIN_SEGMENTS},
    {id:'intermediate',extent:18000,resolution:768,height:-3.75,fade:.24,detail:1,order:1}
  ];
  const planes=[],textures=[],regionInfo=[],satelliteBase=[161,136,109];
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
        // The registered satellite shader replaces all of this RGB, including
        // the surrounding steppe. Preserve the original alpha mask exactly.
        const [r,g,b]=satelliteOwnsGroundColor?satelliteBase:sampleSteppe(wx,wz,spec.detail);
        const alpha=smooth(0,spec.fade,Math.min(edgeX,edgeZ));
        const k=(iy*side+ix)*4;
        bytes[k]=r;bytes[k+1]=g;bytes[k+2]=b;
        bytes[k+3]=Math.round(alpha*255);
        sum+=r+g+b;if(alpha>.05)nontransparent++;
      }
    }
    ctx.putImageData(img,0,0);
    const texture=new THREE.CanvasTexture(cv);
    texture.name='Baikonur steppe '+spec.id+' v5';
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.generateMipmaps=true;
    texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.magFilter=THREE.LinearFilter;
    texture.anisotropy=Math.min(renderer?.capabilities?.getMaxAnisotropy?.()||4,8);
    const material=new THREE.MeshBasicMaterial({
      map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
      polygonOffset:true,polygonOffsetFactor:-1
    });
    material.name='Earth / '+spec.id+' / no survey';
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(spec.extent,spec.extent,spec.segments||1,spec.segments||1),material);
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
      edition:7,extent:config[0].extent,mediumExtent:config[1].extent,
      textureResolution:config[0].resolution,
      textureResolutions:config.map(a=>a.resolution),
      regions:regionInfo,terrainTypes:['dry steppe','sand','solonchak','clay','gravel','alluvium'],
      proceduralColorGenerated:!satelliteOwnsGroundColor,
      riparianShrubs:riparianCount,photographicClaim:false,
      detailBeyondHistoricMap:true,continuousWorldCoordinates:true
    })
  };
}
