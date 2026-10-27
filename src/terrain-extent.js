import * as THREE from 'three';

/**
 * Baikonur Steppe extended visual ground, v3.
 * Procedural approximation, NOT a satellite image or surveyed elevation model.
 *
 * Detail spans 96×96 km in museum world units and dissolves into an underlying
 * 320×320 km repeating base. Fog is the same colour as the renderer background.
 * Geometry remains entirely independent of the 1300×1045 historical plan.
 */
export function buildExtendedTerrain({scene,registerGroundSurface}) {
  const extent=96000,canvas=document.createElement('canvas'),size=1792;
  canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const img=ctx.createImageData(size,size),pixels=img.data;
  const hash=(x,y,salt)=>{
    let v=Math.imul((x|0)+Math.imul(salt,137),374761393)^Math.imul((y|0)-salt*23,668265263);
    v=Math.imul(v^(v>>>13),1274126177);
    return((v^(v>>>16))>>>0)/4294967295;
  };
  const smooth=x=>x*x*(3-2*x);
  function noise(x,y,frequency,salt){
    const u=x*frequency,v=y*frequency,ix=Math.floor(u),iy=Math.floor(v);
    const fx=smooth(u-ix),fy=smooth(v-iy);
    const a=hash(ix,iy,salt),b=hash(ix+1,iy,salt),c=hash(ix,iy+1,salt),d=hash(ix+1,iy+1,salt);
    return(a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
  }
  // Colors deliberately overlap with central 1536×1236 aerial reconstruction.
  // Dry Sarysu steppe: calcareous light crust, yellowish clay, darker gravel.
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=x/size,ny=y/size;
    const n0=noise(nx,ny,2.8,1);
    const n1=noise(nx,ny,9.5,3);
    const n2=noise(nx,ny,34,5);
    const n3=noise(nx,ny,98,7);
    const n4=noise(nx,ny,275,11);
    const large=(n0-.5)*49+(n1-.5)*34;
    const mids=(n2-.5)*29+(n3-.5)*17;
    const fine=(n4-.5)*13;
    // Meandering dry-alluvial shadow: broad textured streaks, not roads.
    const wash=Math.sin(nx*43+ny*31+n1*9.5)*Math.cos(nx*18-ny*15+n0*5);
    const washDark=wash>.90?(wash-.90)*85:0;
    const salt=Math.max(0,(.39-n2)*4.5)*35;
    const iron=Math.max(0,n1-.71)*(n2*.8)*69;
    const dune=Math.sin(nx*149-ny*67+n1*18)*Math.max(0,n2-.48)*6;
    const r=174+large+mids+fine+salt+iron-washDark+dune;
    const g=158+large*.94+mids*.83+fine*.8+salt*.94+iron*.57-washDark*.87+dune*.75;
    const b=127+large*.82+mids*.67+fine*.58+salt*.87+iron*.27-washDark*.7+dune*.5;
    const edge=Math.min(nx,ny,1-nx,1-ny);
    const alpha=smooth(Math.max(0,Math.min(1,edge/.205)));
    const i=(y*size+x)*4;
    pixels[i]=Math.max(0,Math.min(255,Math.round(r)));
    pixels[i+1]=Math.max(0,Math.min(255,Math.round(g)));
    pixels[i+2]=Math.max(0,Math.min(255,Math.round(b)));
    pixels[i+3]=Math.floor(255*alpha);
  }
  ctx.putImageData(img,0,0);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=Math.min(8,THREE.WebGLRenderer ? 8 : 1);
  const material=new THREE.MeshBasicMaterial({
    map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide
  });
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(extent,extent),material);
  plane.name='Реконструкция степи · широкий бесшовный слой';
  plane.position.y=-2.86;
  plane.rotation.x=-Math.PI/2;
  plane.renderOrder=0;
  scene.add(plane);
  if(registerGroundSurface)registerGroundSurface(plane);
  return {
    plane,
    stats:()=>({edition:3,extent,textureResolution:size,edgeFadeFraction:.205,
      photographicClaim:false,detailBeyondHistoricMap:true})
  };
}
