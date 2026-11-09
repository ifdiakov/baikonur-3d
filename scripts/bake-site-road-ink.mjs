import {writeFile} from 'node:fs/promises';
// Render approved source materials offline. Unlike CPU projection of raw
// triangles this preserves the road editor's shader masks and depth clipping.
export async function bakeSiteRoadInk(page,seed,out){
 let count=0;
 for(const site of seed.sites){
  const span=Math.min(800,Math.max(100,Math.max(site.size[0],site.size[2])+60));
  const bounds=[site.center[0]-span/2,site.center[2]-span/2,site.center[0]+span/2,site.center[2]+span/2];
  const image=await page.evaluate(({bounds})=>{
   const b=window.__BUILD,T=b.THREE,[l,t,r,bottom]=bounds,w=r-l,h=bottom-t,cx=(l+r)/2,cz=(t+bottom)/2;
   const camera=new T.OrthographicCamera(-w/2,w/2,h/2,-h/2,.1,30000);
   camera.position.set(cx,12000,cz);camera.up.set(0,0,-1);camera.lookAt(cx,0,cz);camera.updateMatrixWorld(true);
   // The scene has already been filtered by build-public-scene: terrain,
   // approved roads/rails, water and facility asphalt, no buildings/labels.
   b.renderer.render(b.scene,camera);
   return b.renderer.domElement.toDataURL('image/webp',.92).split(',')[1];
  },{bounds});
  const bytes=Buffer.from(image,'base64'),url=out+'/sites/'+site.id+'-ground.webp';
  await writeFile(url,bytes);site.terrainPatch={url,bounds,bytes:bytes.length};
  if(++count%10===0)console.log('SITE_ROAD_INK_PROGRESS',count,'/',seed.sites.length);
 }
 console.log('SITE_ROAD_INK_BAKED',seed.sites.length);
}
