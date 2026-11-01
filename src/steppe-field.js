// An illustrative land-cover field, guided by the owner's satellite reference.
// Coordinates describe the shared museum world, never a model's local UVs.
// Salt pans and sand deposits are material variation, not surveyed polygons.
export const STEPPE_VERSION='baikonur-steppe-v7';
export const STEPPE_PALETTE=Object.freeze({
 soil:Object.freeze([140,127,101]),sand:Object.freeze([175,153,119]),
 salt:Object.freeze([207,198,170]),scrub:Object.freeze([118,113,91]),
 dark:Object.freeze([104,96,78]),ochre:Object.freeze([168,139,104])
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
function landscape(x,z){
 // Two scales of isotropic distortion form lobes and broken margins rather
 // than the old kilometre-wide diagonal sand bands.
 const wx=x+(steppeNoise(x,z,183,101)-.5)*74+(steppeNoise(x,z,39,103)-.5)*21;
 const wz=z+(steppeNoise(x+137,z-81,171,107)-.5)*69+(steppeNoise(x,z,33,109)-.5)*18;
 const edge=steppeNoise(wx,wz,13,43),fineEdge=steppeNoise(wx,wz,4.5,47);
 const basin=steppeNoise(wx,wz,164,37)*.54+steppeNoise(wx,wz,49,41)*.28+edge*.13+fineEdge*.05;
 // Cream crust remains local. The high-frequency edge contribution breaks
 // its outline and cuts darker islands into the wider shallow depressions.
 const salt=smooth(.66,.77,basin)*(1-smooth(.69,.88,steppeNoise(wx,wz,19,45))*.54);
 const deposit=steppeNoise(wx+83,wz-31,112,59)*.66+steppeNoise(wx,wz,28,53)*.25+edge*.09;
 const sand=smooth(.59,.78,deposit)*(1-salt*.94);
 const mottling=steppeNoise(wx,wz,31,71)*.56+steppeNoise(wx,wz,9.5,73)*.29+fineEdge*.15;
 const stone=smooth(.35,.72,mottling)*(1-salt*.82)*(1-sand*.48);
 const scrub=smooth(.30,.73,steppeNoise(wx,wz,29,67)*.68+steppeNoise(wx,wz,8,69)*.32)*(1-salt*.94)*(1-sand*.64);
 const tone=clamp(.5+(steppeNoise(x,z,470,11)-.5)*.23+(steppeNoise(wx,wz,72,79)-.5)*.58+(mottling-.5)*.72);
 const oxide=steppeNoise(wx+193,wz-71,78,97)*.70+steppeNoise(wx,wz,18,99)*.30;
 const ochre=clamp(smooth(.72,.86,oxide)*(1-salt*.86)+4*salt*(1-salt)*smooth(.60,.78,oxide)*.26);
 return {salt,sand,scrub,stone,tone,ochre};
}

export function sampleSteppeFields(x,z){
 const {salt,sand,scrub,stone,tone}=landscape(x,z);
 return {salt,sand,scrub,stone,tone};
}

/** sRGB 0–255, retaining the existing terrain renderer's public API. */
export function sampleSteppe(x,z,detail=1){
 const f=landscape(x,z),p=STEPPE_PALETTE;
 const grain=detail>0?(steppeNoise(x,z,8,83)-.5)*17:0;
 const fine=detail>1?(steppeNoise(x,z,2.7,89)-.5)*8:0;
 const tone=(f.tone-.5)*76+grain+fine;
 const soil=p.soil.map((c,i)=>mix(mix(c,p.dark[i],f.stone*.38),p.scrub[i],f.scrub*.10)+tone*[1,.96,.83][i]);
 const sand=p.sand.map((c,i)=>c+tone*[.62,.55,.42][i]);
 const salt=p.salt.map((c,i)=>c+tone*[.42,.40,.31][i]);
 const rim=4*f.salt*(1-f.salt);
 return soil.map((c,i)=>{
  const earth=mix(mix(c,sand[i],f.sand),p.ochre[i]+tone*.28,f.ochre*.76);
  return clamp(Math.round(mix(earth,salt[i],f.salt)-rim*[5,6,5][i]),0,255);
 });
}
