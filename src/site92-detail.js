// Visual refinement of the existing photo-traced halls, not new surveyed facts.
export const SITE92_VERSION='20261111-site92-detail-v2';
export const SITE92_SHIFT_MAP=Object.freeze([-5,-2.5]);
export function detailSite92Hall(k,hall,{w,d,h,main=false}){
 const box=(...a)=>k.box(...a,hall);
 // Keep every added detail inside the former building footprint.
 for(const side of [-1,1]){
  box(.14,.65,d-.8,side*(w/2+.12),.6,0,'concrete','site92-plinth',0);
  box(.17,.22,d-.8,side*(w/2+.16),h-.4,0,'steel','site92-gutter',0);
  for(let z=-d/2+4;z<d/2-4;z+=15){
   box(.18,h-.8,.16,side*(w/2+.18),(h-.8)/2,z,'steel','site92-downpipe',0);
   if(main)for(const y of [8.5,14.5,20.5]){
    box(.12,2.5,9,side*(w/2+.28),y,z+4,'glass','site92-upper-window',0);
    for(const dz of [-3,0,3])box(.15,2.5,.11,side*(w/2+.35),y,z+4+dz,'light','site92-window-mullion',0);
    box(.15,.11,9,side*(w/2+.35),y,z+4,'light','site92-window-transom',0);
   }
  }
 }
 if(main){
  for(const z of [-d*.31,0,d*.31]){
   box(2.6,.65,3.8,w*.34,h+.65,z,'steel','site92-roof-vent',0);
   box(3,.2,4.2,w*.34,h+1.12,z,'dark','site92-vent-cap',0);
  }
  for(const z of [-d/2-.25,d/2+.25]){
   box(w-.8,.38,.22,0,h-1.2,z,'light','site92-front-cornice',0);
   for(const x of [-w*.37,w*.37]){
    box(3.8,3.4,.17,x,6,z,'glass','site92-front-window',0);
    box(.13,3.4,.18,x,6,z,'light','site92-front-mullion',0);
   }
  }
 }
}
// Move halls, not remote railway junctions. The three hall spurs keep their
// existing outside alignment, then continue smoothly to the shifted gates.
export function site92RailApproach(points,index){
 const compensation=SITE92_SHIFT_MAP.map(v=>-v*3.4/.14);
 const fixed=points.map(p=>p.map((v,k)=>v+compensation[k]));
 if(index===2||index===4)return fixed;
 const start=fixed.at(-1),previous=fixed.at(-2),end=points.at(-1);
 const length=Math.hypot(end[0]-start[0],end[1]-start[1]),d=Math.hypot(start[0]-previous[0],start[1]-previous[1]);
 const tangent=start.map((v,k)=>(v-previous[k])/d),c1=start.map((v,k)=>v+tangent[k]*length*.3),c2=end.map((v,k)=>v-tangent[k]*length*.3);
 const n=Math.max(20,Math.ceil(length/2));
 for(let j=1;j<=n;j++){const t=j/n,u=1-t;fixed.push(start.map((v,k)=>u*u*u*v+3*u*u*t*c1[k]+3*u*t*t*c2[k]+t*t*t*end[k]));}
 return fixed;
}
