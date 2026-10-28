import {readFileSync,writeFileSync} from 'node:fs';
let s=readFileSync('src/gagarin-pad.js','utf8');
if(!s.includes('GAGARIN_GROUND_DATUM')){
 s=s.replace('export function buildGagarinPad(root) {',`// GAGARIN_GROUND_DATUM: the rim is terrain level; the channel stays below it.
export const GAGARIN_RIM_Y=18.1;
export function buildGagarinPad(root) {`);
 s=s.replace('  function block(x,y,z,w,h,d,material,name,rotate=0) {',`  const atGrade=new Set(['western-forecourt','ballast-bed','rail-approach','rail-sleepers','service-road','duct-perimeter-road','lighting-tower','lighting-tower-bracing','lighting-array-head','floodlight-array','lightning-mast','lightning-mast-tip','utility-building','utility-roof','utility-door','utility-window']);
  function block(x,y,z,w,h,d,material,name,rotate=0) {
    if(atGrade.has(name))y+=GAGARIN_RIM_Y;`);
 s=s.replace('  function bar(a,b,r,material,name){',`  function bar(a,b,r,material,name){
    if(atGrade.has(name)){a=[a[0],a[1]+GAGARIN_RIM_Y,a[2]];b=[b[0],b[1]+GAGARIN_RIM_Y,b[2]];}`);
 s=s.replace('mesh.material=mats[material];mesh.userData.museumComponent=key;','mesh.material=mats[material];mesh.userData.museumComponent=key;\n    if(atGrade.has(key))mesh.position.y+=GAGARIN_RIM_Y;');
 s=s.replaceAll('(side?22:-22),.28)','(side?22:-22),bankY)');
 s=s.replace('yellow:0xd3b04d, fadedYellow:0xa98539,','yellow:0xd3b04d, fadedYellow:0xa98539, warning:0xc66843,');
 s=s.replace("version:'3.2',","version:'3.3-below-grade',\n    terrainDatum:{rimY:GAGARIN_RIM_Y,baseSurfaceY:-2.755,channelFloorY:.32,voidFollowsRotation:true},");
 writeFileSync('src/gagarin-pad.js',s);
}
let r=readFileSync('src/gagarin-rail-approach.js','utf8');
r=r.replace('return .75*(1-v*v*(3-2*v));','return .75*(1-v*v*(3-2*v))-2.755*(v*v*(3-2*v));');
r=r.replace("version:'pad1-matched-track-v1'","version:'pad1-matched-track-v2-below-grade'");
writeFileSync('src/gagarin-rail-approach.js',r);
