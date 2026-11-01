// Approximate registration of RocketTrip's supplied satellite mosaic.
// Controls and source/image treatment are recorded in the adjacent asset manifest.
// TextureLoader uses bottom-left UV coordinates; image north remains at v=1.
export const SATELLITE_REFERENCE=Object.freeze({
 url:new URL('../assets/terrain/satellite-single-pass-v1.jpg',import.meta.url).href,
 source:'RocketTrip / Google Drive / Поверхность земли / подложка.jpg',
 treatment:'mosaic harmonized for a single-satellite-pass appearance',
 worldToUv:Object.freeze([0.00025253091310637864,4.40479916308898e-7,0.580736699491189,-7.55798430496509e-7,-0.00026425034633227124,0.4979066536173544]),
 featherWorld:720,
 surrounding:Object.freeze({
  color:Object.freeze([161,136,109]),darkColor:Object.freeze([139,118,94]),lightColor:Object.freeze([190,166,134]),
  featherWorld:720,edgeIrregularity:.30
 }),
 extension:Object.freeze({
  url:new URL('../assets/terrain/satellite-expansion-v1.jpg',import.meta.url).href,
  source:'RocketTrip reference / generated surrounding steppe',
  treatment:'Two outpainting passes; the separately retained detailed original center remains authoritative',
  worldToUv:Object.freeze([0.00009728812509120913,0.0000018595158552411593,0.5355685531981587,-0.0000005714155248860683,-0.00010922020714511084,0.4986371647063046]),
  featherWorld:1000
 })
});

// This small numerical grid registers image coordinates to the existing OSM
// river. It changes texture sampling only; the photograph and 3D mesh stay fixed.
const correctionUrl=new URL('../assets/terrain/satellite-uv-correction-v1.bin',import.meta.url).href;
export async function loadSatelliteReference({fetcher=globalThis.fetch}={}){
 const response=await fetcher(correctionUrl);
 if(!response.ok)throw new Error('Satellite registration failed to load: '+response.status);
 const data=new Uint8Array(await response.arrayBuffer());
 if(data.byteLength!==256*256*4)throw new Error('Satellite registration grid is incomplete');
 return {...SATELLITE_REFERENCE,uvCorrection:{width:256,height:256,data,maxOffset:[.08,.08],
  provenance:{asset:'satellite-uv-correction-v1.bin',metadata:'satellite-uv-correction-v1.json',
   method:'thin-plate-spline inverse image registration',riverControls:38,geometryUnchanged:true}}};
}
