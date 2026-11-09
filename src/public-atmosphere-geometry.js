import * as THREE from 'three';
// Build-time geometry: identical grid and diagonal to the public terrain.
export function terrainHeight(data,x,z){
 const [l,t,r,b]=data.bounds,n=data.segments,u=THREE.MathUtils.clamp((x-l)/(r-l)*n,0,n),v=THREE.MathUtils.clamp((z-t)/(b-t)*n,0,n),ix=Math.min(n-1,Math.floor(u)),iz=Math.min(n-1,Math.floor(v)),fx=u-ix,fz=v-iz,h=data.heights,k=iz*(n+1)+ix;
 return fx+fz<=1?h[k]+(h[k+1]-h[k])*fx+(h[k+n+1]-h[k])*fz:h[k+n+2]+(h[k+n+1]-h[k+n+2])*(1-fx)+(h[k+1]-h[k+n+2])*(1-fz);
}
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function clip(input,triangle){let out=input;const sign=Math.sign(cross(triangle[0],triangle[1],triangle[2]))||1;for(let k=0;k<3&&out.length;k++){const a=triangle[k],b=triangle[(k+1)%3],next=[];for(let j=0;j<out.length;j++){const p=out[j],q=out[(j+1)%out.length],dp=cross(a,b,p)*sign,dq=cross(a,b,q)*sign;if(dp>=-1e-7)next.push(p);if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);next.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}out=next;}return out;}
export function bakeDistrictFill(polygon,data){
 const points=polygon.map(p=>new THREE.Vector2(...p)),faces=THREE.ShapeUtils.triangulateShape(points,[]),positions=[];
 const [l,t,r,b]=data.bounds,n=data.segments,sx=(r-l)/n,sz=(b-t)/n;
 const emit=poly=>{for(let i=1;i<poly.length-1;i++){const tri=[poly[0],poly[i],poly[i+1]];if(Math.abs(cross(...tri))<1e-7)continue;if(cross(...tri)>0)tri.reverse();for(const [x,z]of tri)positions.push(x,terrainHeight(data,x,z),z);}};
 for(const ids of faces){const tri=ids.map(i=>polygon[i]);const x0=Math.max(0,Math.floor((Math.min(...tri.map(p=>p[0]))-l)/sx)),x1=Math.min(n-1,Math.floor((Math.max(...tri.map(p=>p[0]))-l)/sx)),z0=Math.max(0,Math.floor((Math.min(...tri.map(p=>p[1]))-t)/sz)),z1=Math.min(n-1,Math.floor((Math.max(...tri.map(p=>p[1]))-t)/sz));for(let iz=z0;iz<=z1;iz++)for(let ix=x0;ix<=x1;ix++){const a=[l+ix*sx,t+iz*sz],c=[a[0]+sx,a[1]+sz];emit(clip([a,[c[0],a[1]],[a[0],c[1]]],tri));emit(clip([[c[0],a[1]],c,[a[0],c[1]]],tri));}}
 return positions.map(n=>Math.round(n*10000)/10000);
}
export function bakeDistrictBorder(polygon,width,data){const out=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<1e-6)continue;const nx=-dz/len*width/2,nz=dx/len*width/2,count=Math.ceil(len/12);for(let j=0;j<count;j++){const at=t=>[a[0]+dx*t,a[1]+dz*t],p=at(j/count),q=at((j+1)/count),v=[[p[0]-nx,p[1]-nz],[p[0]+nx,p[1]+nz],[q[0]+nx,q[1]+nz],[q[0]-nx,q[1]-nz]];for(const k of [0,1,2,0,2,3]){const[x,z]=v[k];out.push(x,terrainHeight(data,x,z)+.06,z);}}}return out.map(n=>Math.round(n*10000)/10000);}
