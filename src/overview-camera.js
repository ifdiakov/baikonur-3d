// Camera parameters are in SCENE_SCALE units. The outline is already in the
// museum's OSM map plane; it must not pass through the former schematic warp.
const FOV=52*Math.PI/180,MIN_HEIGHT=1200,MARGIN=16;

function rect(value){
 if(!value)return null;
 const left=Number(value.left??value.x),top=Number(value.top??value.y);
 const right=Number(value.right??(left+Number(value.width)));
 const bottom=Number(value.bottom??(top+Number(value.height)));
 return [left,top,right,bottom].every(Number.isFinite)&&right>left&&bottom>top
  ?{left,top,right,bottom}:null;
}
function pixels(points,width,height,x,z,altitude,depth){
 const radius=Math.hypot(altitude,depth),focal=height/(2*Math.tan(FOV/2));
 return points.map(([px,pz])=>{
  const distance=radius-depth/radius*(pz-z);
  return [width/2+focal*(px-x)/distance,height/2+focal*altitude/radius*(pz-z)/distance];
 });
}
// A projective camera preserves straight edges on the ground plane. Clipping
// each projected segment therefore checks the whole contour, not just corners.
function crossesRect(a,b,r){
 let lo=0,hi=1;
 for(const [value,delta,min,max]of [[a[0],b[0]-a[0],r.left,r.right],[a[1],b[1]-a[1],r.top,r.bottom]]){
  if(Math.abs(delta)<1e-12){if(value<min||value>max)return false;continue;}
  let t0=(min-value)/delta,t1=(max-value)/delta;if(t0>t1)[t0,t1]=[t1,t0];
  lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false;
 }
 return true;
}
function visible(points,width,top,bottom,obstacles){
 if(points.some(([x,y])=>!Number.isFinite(x)||!Number.isFinite(y)||x<MARGIN||x>width-MARGIN||y<top||y>bottom))return false;
 for(let i=0;i<points.length;i++)for(const r of obstacles){
  if(crossesRect(points[i],points[(i+1)%points.length],r))return false;
 }
 return true;
}
function area(points){
 return Math.abs(points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
}
function result(x,z,height,depth){
 return {target:[x,0,z],height,depth,
  maxDistance:Math.max(3300,Math.hypot(height,depth)*1.08),
  altitudeLimit:Math.max(1650,height*1.08)};
}

/** Fit a north-up overview around the visible toolbar, hero and timeline. */
export function fitOverviewCamera({width,height,outline,uiRect=null,heroRect=null,dockTop=height-172,topDown=false}){
 if(!(width>0&&height>0)||!Array.isArray(outline)||outline.length<3)throw new TypeError('Viewport and a finite outline are required');
 const points=outline.map(([x,y])=>[(x-650)*1.45,(y-522.5)*1.45]);
 if(points.some(p=>!p.every(Number.isFinite)))throw new TypeError('Invalid outline coordinate');
 const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
 const bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
 const raw=[rect(uiRect),rect(heroRect)].filter(Boolean);
 const obstacles=raw.map(r=>({left:r.left-12,top:r.top-12,right:r.right+12,bottom:r.bottom+12}));
 const bottom=Math.min(height-MARGIN,Number.isFinite(dockTop)?dockTop-MARGIN:height-188);
 const top=MARGIN,focal=height/(2*Math.tan(FOV/2));
 const fits=(x,z,h,d)=>visible(pixels(points,width,height,x,z,h,d),width,top,bottom,obstacles);

 // On the large desktop the north-eastern spur sits just left of the hero,
 // while the wide lower body extends beneath it. This avoids a small strip fit.
 if(!topDown&&width>=1400&&fits(290,-590,1650,2475))return result(290,-590,1650,2475);

 if(width<=640){
  const toolbar=rect(uiRect),safeTop=Math.max(top,toolbar?toolbar.bottom+MARGIN:top);
  const availableWidth=width-MARGIN*2,availableHeight=bottom-safeTop;
  if(availableHeight>32){
   let x=(bounds.minX+bounds.maxX)/2,z=(bounds.minZ+bounds.maxZ)/2;
   let h=Math.max(MIN_HEIGHT,(bounds.maxX-bounds.minX)*focal/(availableWidth*Math.hypot(1,topDown?0:.3)));
   for(let i=0;i<12;i++){
    const d=topDown?.001:h*.3,projected=pixels(points,width,height,x,z,h,d),sx=projected.map(p=>p[0]),sy=projected.map(p=>p[1]);
    const left=Math.min(...sx),right=Math.max(...sx),north=Math.min(...sy),south=Math.max(...sy),radius=Math.hypot(h,d);
    x+=((left+right)/2-width/2)*radius/focal;
    z+=((north+south)/2-(safeTop+bottom)/2)*radius*radius/(focal*h);
    h*=Math.max(1,(right-left)/availableWidth,(south-north)/availableHeight);
   }
   if(fits(x,z,h,topDown?.001:h*.3))return result(x,z,h,topDown?.001:h*.3);
  }
 }

 // Search two geometric dimensions only: height and viewing angle. A chosen
 // screen Y for the southern tip gives target Z analytically. The HUD then
 // supplies an interval of valid target X values. Horizontal edge crossings
 // at every HUD top/bottom are included in that interval calculation.
 function candidate(h,ratio,screenBottom){
  const d=topDown?.001:h*ratio,radius=Math.hypot(h,d),a=h/radius,b=d/radius;
  const atY=y=>{const t=(y-height/2)/focal;return t*radius/(a+t*b);};
  const z=bounds.maxZ-atY(screenBottom);
  // Keep the target inside the actual map limits so the scene's pan clamp
  // cannot invalidate an otherwise correct first-frame fit.
  if(z<bounds.minZ||z>bounds.maxZ)return null;
  const probes=[...points];
  for(const r of obstacles)for(const y of [r.top-.01,r.top+.01,r.bottom-.01,r.bottom+.01]){
   const planeZ=z+atY(y);if(!Number.isFinite(planeZ))continue;
   for(let i=0;i<points.length;i++){
    const p=points[i],q=points[(i+1)%points.length];
    if((planeZ>p[1]&&planeZ<q[1])||(planeZ>q[1]&&planeZ<p[1])){
     const t=(planeZ-p[1])/(q[1]-p[1]);probes.push([p[0]+t*(q[0]-p[0]),planeZ]);
    }
   }
  }
  let low=bounds.minX,high=bounds.maxX;
  for(const [px,pz]of probes){
   const distance=radius-b*(pz-z),sy=height/2+focal*a*(pz-z)/distance;
   if(distance<=0||sy<top||sy>bottom+.001)return null;
   let left=MARGIN,right=width-MARGIN;
   for(const r of obstacles)if(sy>=r.top-.02&&sy<=r.bottom+.02){
    if((r.left+r.right)/2<width/2)left=Math.max(left,r.right+.5);
    else right=Math.min(right,r.left-.5);
   }
   if(left>=right)return null;
   low=Math.max(low,px-(right-width/2)*distance/focal);
   high=Math.min(high,px-(left-width/2)*distance/focal);
   if(low>high)return null;
  }
  const x=(low+high)/2,projected=pixels(points,width,height,x,z,h,d);
  if(!visible(projected,width,top,bottom,obstacles))return null;
  return {x,z,h,d,ratio,screenBottom,score:area(projected)};
 }
 let best=null;
 const keep=c=>{if(c&&(!best||c.score>best.score))best=c;};
 const ratios=topDown?[0]:[.4,.65,1,1.25,1.5,Math.sqrt(3)];
 const bottoms=[...new Set([bottom-.5,bottom-28,bottom-60,bottom-100,bottom-160,bottom-220,height/2])].filter(y=>y>top&&y<=bottom);
 for(let h=MIN_HEIGHT;h<=6000;h+=60)for(const ratio of ratios)for(const y of bottoms)keep(candidate(h,ratio,y));
 if(best){
  const seed={...best};
  for(let h=Math.max(MIN_HEIGHT,seed.h-60);h<=seed.h+60;h+=15){
   for(const ratio of (topDown?[0]:Array.from({length:7},(_,i)=>Math.max(.3,Math.min(Math.sqrt(3),seed.ratio-.12+i*.04))))){
    for(const y of [seed.screenBottom-12,seed.screenBottom,Math.min(bottom-.5,seed.screenBottom+12)])keep(candidate(h,ratio,y));
   }
  }
  return result(best.x,best.z,best.h,best.d);
 }

 // Extremely obstructed or unusually small viewports: fit the largest simple
 // central opening. The normal desktop/mobile layouts return before this path.
 const left=Math.max(MARGIN,...raw.filter(r=>(r.left+r.right)/2<width/2).map(r=>r.right+MARGIN));
 const right=Math.min(width-MARGIN,...raw.filter(r=>(r.left+r.right)/2>=width/2).map(r=>r.left-MARGIN));
 let x=(bounds.minX+bounds.maxX)/2,z=(bounds.minZ+bounds.maxZ)/2,h=6000;
 for(let i=0;i<16;i++){
  const d=topDown?.001:h*.3,projected=pixels(points,width,height,x,z,h,d),sx=projected.map(p=>p[0]),sy=projected.map(p=>p[1]),radius=Math.hypot(h,d);
  const l=Math.min(...sx),r=Math.max(...sx),t=Math.min(...sy),b=Math.max(...sy);
  x+=((l+r)/2-(left+right)/2)*radius/focal;
  z+=((t+b)/2-(top+bottom)/2)*radius*radius/(focal*h);
  h*=Math.max(1,(r-l)/Math.max(80,right-left),(b-t)/Math.max(80,bottom-top));
 }
 return result(x,z,h,topDown?.001:h*.3);
}
