// Owner photographs and the existing satellite trace; dimensions and storeys
// are interpreted, not surveyed. Source imagery remains on the owner's Drive.
export const SITE95_VERSION='20261106-site95-town-v1';
export const SITE95_REFERENCE={folder:'1aAX8FNhWSsheMnL77NRQYO9Gieg5lFkE',satellite:'1kYur_BaNa6xrjT-iuhdipTElHMJPsTNR',photoCount:8,osmCompound:454637000,registration:'existing satellite frame, explicit museum road clearances'};
export const SITE95_PIXEL_ORIGIN=[827,473],SITE95_PIXEL_SCALE=.5;
export const site95Pixel=([u,v])=>[(u-827)*.5,(v-473)*.5];
export const SITE95_YAW=-Math.atan2(54,71);
const displayOffsets={"2":[0,2],"4":[14,4],"8":[10,6],"10":[-6,12],"11":[12,-16],"12":[0,2],"13":[4,-6],"14":[2,-2],"15":[10,-8],"18":[-18,6],"29":[10,-12],"30":[-38,-2],"31":[22,-6],"32":[-4,26],"35":[-12,6],"36":[0,10],"39":[20,12],"40":[16,-10],"41":[-20,22],"42":[8,22],"45":[-4,8],"50":[-2,2],"51":[16,-8]};
const trace=[[515,66,18,29,5],[548,84,23,43,5],[591,113,24,48,6],[635,161,22,44,6],[777,162,25,49,6],[753,228,32,49,9],[797,267,27,51,9],[821,282,22,48,8],[437,247,38,62,11],[446,319,29,66,8],[491,341,33,64,8],[510,399,28,66,8],[564,380,22,44,8],[605,412,20,42,8],[651,419,23,51,8],[744,475,22,41,7],[793,503,26,42,7],[822,528,26,42,7],[842,548,24,43,7],[778,570,18,35,6],[931,367,21,36,7],[962,393,22,37,7],[995,419,23,39,7],[1027,448,25,37,7],[911,423,19,34,7],[946,449,22,39,7],[980,476,25,44,7],[1019,503,23,36,7],[887,478,21,39,7],[921,507,23,40,7],[956,537,21,40,7],[998,564,23,40,7],[870,535,18,34,6],[901,563,18,34,6],[935,591,19,35,6],[972,620,20,37,6],[827,590,22,40,7],[866,621,23,40,7],[902,652,20,40,7],[783,639,24,48,7],[745,678,26,49,7],[817,705,26,47,7],[937,707,23,43,8],[1000,675,22,44,8],[1042,632,20,45,8],[1073,560,18,34,6],[1111,502,20,45,6],[1161,486,25,44,7],[761,730,17,127,7],[643,515,15,40,6],[693,516,20,49,6]];
export const SITE95_BUILDINGS=trace.map((b,i)=>{
 const position=site95Pixel(b),offset=displayOffsets[i+1]||[0,0];
 const family=i<4||i===48?'utility':i>=8&&i<=14?'brick':i>=20&&i<=38?'brick':i===5||i===6||i===7?'panel':'sand';
 const floors=family==='utility'?1:family==='panel'?4:3;
 return {id:'site95-block-'+(i+1),pixel:b.slice(0,2),length:b[3]*.5,depth:b[2]*.5,floors,family,yaw:SITE95_YAW,displayOffset:offset,position:position.map((v,j)=>v+offset[j])};
});
const view=(p,y,d)=>{const[x,z]=site95Pixel(p);return {target:[x,y,z],eye:[x+d[0],y+d[1],z+d[2]]};};
export const SITE95_VIEWS={all:view([797,420],4,[240,270,320]),barracks:view([495,355],4,[-45,39,65]),square:view([842,330],4,[42,32,64]),utilities:view([770,240],4,[44,28,60]),top:view([797,420],0,[0,510,.01])};
