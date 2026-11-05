// One world-coordinate anti-tiling system for both the regional steppe and
// the close-up PBR ground. No added images, meshes, WebGL extensions or LOD.
export const SOIL_ANTI_TILING_VERSION='soil-anti-tiling-warped-dual-domain-v1';

// Two non-commensurate texture domains break the obvious 3.2-unit repeating
// square. Smooth, deterministic world-space warps add variation without tile
// boundaries or per-instance randomness. The same coordinates are used for
// albedo, normal and roughness so the material stays physically coherent.
export const SOIL_ANTI_TILING_GLSL=/* glsl */`
float soilDetailHash(vec2 p){
 vec3 h=fract(vec3(p.x,p.y,p.x)*.1031);
 h+=dot(h,h.yzx+33.33);
 return fract((h.x+h.y)*h.z);
}
float soilDetailNoise(vec2 p){
 vec2 c=floor(p),f=fract(p);
 f=f*f*f*(f*(f*6.0-15.0)+10.0);
 return mix(mix(soilDetailHash(c),soilDetailHash(c+vec2(1.0,0.0)),f.x),
            mix(soilDetailHash(c+vec2(0.0,1.0)),soilDetailHash(c+vec2(1.0,1.0)),f.x),f.y);
}
vec2 soilDetailAtlasUV(float family,vec2 tiled){
 vec2 cell=vec2(mod(family,4.0),floor(family/4.0));
 // The atlas contains four 512px columns and two 512px rows.
 // The inset prevents bilinear bleeding between soil families.
 vec2 local=mix(vec2(.0015),vec2(.9985),fract(tiled));
 return (cell+local)/vec2(4.0,2.0);
}
void soilDetailDomains(vec2 world,out vec2 a,out vec2 b,out float factor){
 vec2 slow=vec2(soilDetailNoise(world/91.0+vec2(7.9,-3.2)),
                soilDetailNoise(world/83.0+vec2(-11.7,5.4)))-.5;
 vec2 fine=vec2(soilDetailNoise(world/24.0+vec2(19.3,-1.4)),
                soilDetailNoise(world/29.0+vec2(-9.1,13.7)))-.5;
 // Each sample has a different phase, rotation and irrational scale.
 // There is no hard cell selection, so adjacent fragments never snap.
 a=(world+slow*8.0+fine*1.65)/3.35;
 b=(mat2(.809017,.587785,-.587785,.809017)*world+
    slow.yx*5.7-fine.yx*2.15+vec2(31.17,-49.83))/4.43;
 factor=clamp(.43+.20*(soilDetailNoise(world/63.0+vec2(3.4,17.1))-.5),.32,.54);
}
`;

// CPU reference of the warp. It tests deterministic, continuous coordinate
// fields without requiring a browser/GPU just to validate anti-tiling changes.
const fract=x=>x-Math.floor(x);
const hash=(x,y)=>{const a=fract(x*.1031),b=fract(y*.1031),c=a;
 const dot=a*(b+33.33)+b*(c+33.33)+c*(a+33.33);
 return fract((a+dot+b+dot)*(c+dot));};
export function sampleSoilDetailDomains(x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z))throw new TypeError('World-space soil coordinates must be finite');
 const noise=(p,q)=>{
  const ix=Math.floor(p),iz=Math.floor(q),fx=fract(p),fz=fract(q);
  const smooth=t=>t*t*t*(t*(t*6-15)+10);
  const u=smooth(fx),v=smooth(fz);
  return (hash(ix,iz)*(1-u)+hash(ix+1,iz)*u)*(1-v)+
   (hash(ix,iz+1)*(1-u)+hash(ix+1,iz+1)*u)*v;
 };
 const sx=noise(x/91+7.9,z/91-3.2)-.5,sz=noise(x/83-11.7,z/83+5.4)-.5;
 const fx=noise(x/24+19.3,z/24-1.4)-.5,fz=noise(x/29-9.1,z/29+13.7)-.5;
 return {a:[(x+sx*8+fx*1.65)/3.35,(z+sz*8+fz*1.65)/3.35],
  b:[(.809017*x-.587785*z+sz*5.7-fz*2.15+31.17)/4.43,
     (.587785*x+.809017*z+sx*5.7-fx*2.15-49.83)/4.43],
  mix:Math.max(.32,Math.min(.54,.43+.20*(noise(x/63+3.4,z/63+17.1)-.5)))};
}
