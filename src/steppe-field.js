// An illustrative land-cover field, guided by photographs of Baikonur.
// Coordinates describe the shared museum world, never a model's local UVs.
// Salt pans and sand deposits are material variation, not surveyed polygons.
export const STEPPE_VERSION='baikonur-steppe-v5';
export const STEPPE_PALETTE=Object.freeze({
 soil:Object.freeze([166,153,129]),sand:Object.freeze([202,181,145]),
 salt:Object.freeze([228,224,207]),scrub:Object.freeze([112,111,86])
});
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
function hash(x,z,seed){
 let h=Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^Math.imul(seed|0,1442695041);
 h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
}
export function steppeNoise(x,z,cell,seed){
 const u=x/cell,v=z/cell,ix=Math.floor(u),iz=Math.floor(v),fx=smooth(0,1,u-ix),fz=smooth(0,1,v-iz);
 return mix(mix(hash(ix,iz,seed),hash(ix+1,iz,seed),fx),mix(hash(ix,iz+1,seed),hash(ix+1,iz+1,seed),fx),fz);
}
export function sampleSteppeFields(x,z){
 const u=x*.83867+z*.54464,v=-x*.54464+z*.83867;
 const warpX=(steppeNoise(x,z,820,101)-.5)*250,warpZ=(steppeNoise(x+137,z-81,710,103)-.5)*210;
 const wx=u+warpX,wz=v+warpZ;
 const basin=steppeNoise(wx,wz,640,37)*.56+steppeNoise(wx,wz,205,41)*.29+steppeNoise(wx,wz,67,43)*.15;
 const salt=smooth(.60,.735,basin);
 // Stretched, broken deposits; domain warping avoids parallel dune stripes.
 const dune=steppeNoise(wx*.62,wz*2.4,370,51)*.64+steppeNoise(wx*.8,wz*2.1,118,53)*.36;
 const sand=smooth(.48,.70,dune)*(1-salt);
 const scrub=smooth(.31,.72,steppeNoise(wx,wz,145,67))*(1-salt*.96)*(1-sand*.72);
 const stone=smooth(.45,.75,steppeNoise(wx,wz,315,71))*(1-salt)*(1-sand*.55);
 const tone=clamp(.5+(steppeNoise(x,z,2350,11)-.5)*.55+(steppeNoise(wx,wz,255,79)-.5)*.3);
 return {salt,sand,scrub,stone,tone};
}

/** sRGB 0–255, retaining the existing terrain renderer's public API. */
export function sampleSteppe(x,z,detail=1){
 const f=sampleSteppeFields(x,z),p=STEPPE_PALETTE;
 const grain=detail>0?(steppeNoise(x,z,38,83)-.5)*8:0;
 const fine=detail>1?(steppeNoise(x,z,12,89)-.5)*5:0;
 const tone=(f.tone-.5)*42+grain+fine-f.stone*13;
 const soil=p.soil.map((c,i)=>c+tone*[1,.94,.83][i]-f.scrub*[8,5,8][i]);
 const sand=p.sand.map((c,i)=>c+tone*[.45,.40,.34][i]);
 const salt=p.salt.map((c,i)=>c+tone*[.14,.13,.12][i]);
 // A narrow weathered margin makes a salt pan read as an irregular shallow
 // depression, without adding a geometric crater or a painted white circle.
 const rim=4*f.salt*(1-f.salt);
 return soil.map((c,i)=>clamp(Math.round(mix(mix(c,sand[i],f.sand),salt[i],f.salt)-rim*[4,6,7][i]),0,255));
}
