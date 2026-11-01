// The Syr Darya source line runs west to east. Closing it far to the north
// produces the land area on the cosmodrome's side of every river meander.
export function createNorthBankMask(river,{water}={}){
 if(river.length<2)throw new Error('A river centreline is required');
 if(river[0][0]>river.at(-1)[0])river=[...river].reverse();
 const xs=river.map(p=>p[0]),zs=river.map(p=>p[1]);
 // This is only the artificial closure of the north-side mask. It must
 // encompass the whole display terrain, not cut off its distant road lamps.
 // Every source river vertex and the real water exclusion remain unchanged.
 const minX=Math.min(...xs),maxX=Math.max(...xs),west=minX-200000,east=maxX+200000,north=Math.min(...zs)-200000;
 const points=[...river,[east,river.at(-1)[1]],[east,north],[west,north],[west,river[0][1]]];
 function contains(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  if(x<west||x>east||z<north)return false;
  if(x<minX||x>maxX)return z<(x<minX?river[0][1]:river.at(-1)[1])&&(!water||!water.isWater(x,z));
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[j],b=points[i];
   if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside&&(!water||!water.isWater(x,z));
 }
 return {contains,version:water?'north-of-syr-darya-water-v2':'north-of-syr-darya-v1',pointCount:river.length,
  waterVersion:water?.version,closureBounds:{west,east,north}};
}
