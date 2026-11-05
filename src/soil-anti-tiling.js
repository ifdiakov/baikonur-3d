// Shared world-coordinate material mapping for regional and close-up soil.
// Five PBR families blend continuously with no GPU-dependent tile choices.
// All textures and DEM/infrastructure positions remain unchanged.
export const SOIL_ANTI_TILING_VERSION='soil-anti-tiling-continuous-v2';

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
 // Two rows of four families, with a 1/16-tile periodic gutter. Atlas texels
 // themselves are generated from the same wrapped content at both edges.
 vec2 cell=vec2(mod(family,4.0),floor(family/4.0));
 return (cell+mix(vec2(.0625),vec2(.9375),fract(tiled)))/vec2(4.0,2.0);
}
void soilDetailNeighbours(float coordinate,out float first,out float second,out float fraction){
 float family=clamp(coordinate,0.0,3.99999);
 first=floor(family);
 second=first+1.0;
 // Both sides converge on exactly the SAME family at an integer boundary.
 // Unlike ranking the two highest weights, no tertiary material may pop in.
 fraction=smoothstep(0.0,1.0,fract(family));
}
void soilDetailDomains(vec2 world,out vec2 a,out vec2 b,out float factor){
 vec2 slow=vec2(soilDetailNoise(world/121.0+vec2(7.9,-3.2)),
                soilDetailNoise(world/113.0+vec2(-11.7,5.4)))-.5;
 vec2 medium=vec2(soilDetailNoise(world/33.0+vec2(19.3,-1.4)),
                  soilDetailNoise(world/37.0+vec2(-9.1,13.7)))-.5;
 vec2 fine=vec2(soilDetailNoise(world/8.0+vec2(6.2,15.1)),
                soilDetailNoise(world/9.0+vec2(-4.7,8.2)))-.5;
 // High/mid-frequency continuous phase displacement breaks the old ~3m
 // near repeats. No grid-cell switching or hard seams during camera motion.
 a=(world+slow*16.0+medium*6.6+fine*1.4)/3.76;
 b=(mat2(.809017,.587785,-.587785,.809017)*world+
    slow.yx*9.4-medium.yx*4.8+fine.yx*1.9+vec2(31.17,-49.83))/4.71;
 factor=clamp(.50+.20*(soilDetailNoise(world/68.0+vec2(3.4,17.1))-.5),.39,.61);
}
vec3 soilDetailMacro(vec3 world){
 vec2 p=world.xz;
 vec2 warp=vec2(soilDetailNoise(p/157.0+vec2(6.2,-8.7)),
                soilDetailNoise(p/149.0+vec2(-2.3,4.8)))-.5;
 vec2 bent=p+warp*49.0;
 float broad=soilDetailNoise(bent/233.0+vec2(3.8,-5.3))-.5;
 float broken=soilDetailNoise(bent/73.0+vec2(-7.6,3.1))-.5;
 float grain=soilDetailNoise(bent/23.0+vec2(4.6,9.2))-.5;
 float amount=broad*.30+broken*.19+grain*.09;
 // Neutral, satellite-compatible warm/cool shifts: no new painted landmark.
 return clamp(vec3(1.0+amount*1.06,1.0+amount*.88,1.0+amount*.68),
              vec3(.82),vec3(1.18));
}
`;

const fract=x=>x-Math.floor(x);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=(x,y)=>{const a=fract(x*.1031),b=fract(y*.1031),c=a;
 const dot=a*(b+33.33)+b*(c+33.33)+c*(a+33.33);
 return fract((a+dot+b+dot)*(c+dot));};
const smooth=t=>t*t*t*(t*(t*6-15)+10);
const noise=(x,z)=>{
 const ix=Math.floor(x),iz=Math.floor(z),u=smooth(fract(x)),v=smooth(fract(z));
 return (hash(ix,iz)*(1-u)+hash(ix+1,iz)*u)*(1-v)+
  (hash(ix,iz+1)*(1-u)+hash(ix+1,iz+1)*u)*v;
};
export function sampleSoilDetailDomains(x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z))throw new TypeError('World-space soil coordinates must be finite');
 const sx=noise(x/121+7.9,z/121-3.2)-.5,sz=noise(x/113-11.7,z/113+5.4)-.5;
 const mx=noise(x/33+19.3,z/33-1.4)-.5,mz=noise(x/37-9.1,z/37+13.7)-.5;
 const fx=noise(x/8+6.2,z/8+15.1)-.5,fz=noise(x/9-4.7,z/9+8.2)-.5;
 return {a:[(x+sx*16+mx*6.6+fx*1.4)/3.76,(z+sz*16+mz*6.6+fz*1.4)/3.76],
  b:[(.809017*x-.587785*z+sz*9.4-mz*4.8+fz*1.9+31.17)/4.71,
     (.587785*x+.809017*z+sx*9.4-mx*4.8+fx*1.9-49.83)/4.71],
  mix:clamp(.50+.20*(noise(x/68+3.4,z/68+17.1)-.5),.39,.61)};
}
export function sampleSoilDetailNeighbours(coordinate){
 if(!Number.isFinite(coordinate))throw new TypeError('Soil family coordinate must be finite');
 const value=clamp(coordinate,0,3.99999),first=Math.floor(value),fraction=fract(value);
 return {first,second:first+1,blend:fraction*fraction*(3-2*fraction)};
}
