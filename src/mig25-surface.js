import * as THREE from 'three';

/** Compact, deterministic aircraft skin: painted panels, fasteners and wear.
 * Generated from geometry coordinates; none of the reference image pixels are
 * embedded. Both maps share the same UVs and remain independent of DOM/canvas. */
export function createMig25Surface(){
 const size=1024,colour=new Uint8Array(size*size*4),surface=new Uint8Array(size*size*4);
 const xs=[0,128,304,448,640,816,1024],ys=[0,176,384,528,752,896,1024];
 const hash=(x,y)=>{let a=Math.imul(x+39,374761393)+Math.imul(y+12,668265263);a=Math.imul(a^(a>>>13),1274126177);return ((a^(a>>>16))>>>0)/4294967296;};
 const noise=(x,y,k)=>{const a=x/k,b=y/k,ix=Math.floor(a),iy=Math.floor(b),u=a-ix,v=b-iy,s=u*u*(3-2*u),t=v*v*(3-2*v),n=size/k,h=(i,j)=>hash(i%n,j%n);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(ix,iy),h(ix+1,iy),s),THREE.MathUtils.lerp(h(ix,iy+1),h(ix+1,iy+1),s),t);};
 let iy=0;
 for(let y=0;y<size;y++){
  while(y>=ys[iy+1])iy++;let ix=0;
  for(let x=0;x<size;x++){
   while(x>=xs[ix+1])ix++;
   const i=(y*size+x)*4,edge=Math.min(x-xs[ix],xs[ix+1]-x,y-ys[iy],ys[iy+1]-y);
   const grain=hash(x,y),stain=noise(x,y,32)*.65+noise(x,y,128)*.35;
   let value=211+hash(ix,iy)*22+(stain-.5)*40+(grain-.5)*15;
   if(edge<1)value-=57;else if(edge<3)value-=24;else if(edge<8)value-=9;
   if(grain>.994)value-=30;
   colour.set([value,value+2,value+3,255],i);
   surface.set([edge<1?68:edge<3?110:127+(grain-.5)*12,171+(1-stain)*38,0,255],i);
  }
 }
 function pixel(x,y,rgb){x=Math.round(x);y=Math.round(y);if(x<0||x>=size||y<0||y>=size)return;const i=(y*size+x)*4;colour.set([...rgb,255],i);}
 function dot(x,y,r=.75,rgb=[145,152,154]){for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++)if(Math.hypot(xx-x,yy-y)<=r)pixel(xx,yy,rgb);}
 function line(x,y,xx,yy,rgb=[154,163,166]){const n=Math.ceil(Math.hypot(xx-x,yy-y));for(let i=0;i<=n;i++)pixel(x+(xx-x)*i/n,y+(yy-y)*i/n,rgb);}
 function rect(x,y,w,h,rgb){line(x,y,x+w,y,rgb);line(x+w,y,x+w,y+h,rgb);line(x+w,y+h,x,y+h,rgb);line(x,y+h,x,y,rgb);}
 for(let j=0;j<ys.length-1;j++)for(let k=0;k<xs.length-1;k++){
  const x=xs[k],y=ys[j],w=xs[k+1]-x,h=ys[j+1]-y;
  for(let a=8;a<w-7;a+=8){dot(x+a,y+5);dot(x+a,y+h-5);pixel(x+a+1,y+6,[245,246,242]);}
  for(let a=8;a<h-7;a+=8){dot(x+5,y+a);dot(x+w-5,y+a);}
  if((j+k)%3===0){const xx=x+w*.27,yy=y+h*.26,ww=w*.34,hh=h*.23;rect(xx,yy,ww,hh);rect(xx+3,yy+3,ww-6,hh-6,[186,192,193]);for(const u of [.1,.9])for(const v of [.1,.9])dot(xx+u*ww,yy+v*hh,1.4,[118,129,132]);}
  if((j*2+k)%7===0){const xx=x+w*.65,yy=y+h*.74;for(let i=0;i<18;i++){const a=i*Math.PI/9,b=(i+1)*Math.PI/9;line(xx+Math.cos(a)*8,yy+Math.sin(a)*8,xx+Math.cos(b)*8,yy+Math.sin(b)*8);}line(xx-3,yy,xx+3,yy);}
 }
 const map=new THREE.DataTexture(colour,size,size),detail=new THREE.DataTexture(surface,size,size);
 for(const t of [map,detail]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=4;t.needsUpdate=true;}
 map.colorSpace=THREE.SRGBColorSpace;map.name='МиГ-25 · панели, заклёпки, потёртости';detail.name='МиГ-25 · микрорельеф и шероховатость';
 return {map,detail};
}
