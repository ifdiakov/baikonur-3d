// The Syr Darya source line runs west to east. Closing it far to the north
// produces the land area on the cosmodrome's side of every river meander.
export function createNorthBankMask(river,{water}={}){
 if(river.length<2)throw new Error('A river centreline is required');
 if(river[0][0]>river.at(-1)[0])river=[...river].reverse();
 const xs=river.map(p=>p[0]),zs=river.map(p=>p[1]);
 const west=Math.min(...xs)-50000,east=Math.max(...xs)+50000,north=Math.min(...zs)-50000;
 const points=[...river,[east,river.at(-1)[1]],[east,north],[west,north],[west,river[0][1]]];
 function contains(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[j],b=points[i];
   if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside&&(!water||!water.isWater(x,z));
 }
 return {contains,version:water?'north-of-syr-darya-water-v2':'north-of-syr-darya-v1',pointCount:river.length,
  waterVersion:water?.version};
}
