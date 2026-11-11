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
