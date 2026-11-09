import {writeFile} from 'node:fs/promises';
// Rasterize already-cut final road triangles in 2D, offline.
export async function bakeSiteRoadInk(page,seed,out){
 await page.evaluate(()=>{
  const b=window.__BUILD,T=b.THREE,meshes=new Set(),groups=[],v=new T.Vector3(),instance=new T.Matrix4(),world=new T.Matrix4();
  for(const layer of [b.layers.roads,b.layers.rails])layer.traverseVisible(o=>{if(o.isMesh)meshes.add(o);});
  for(const o of b.objects)o.g.traverse(m=>{const c=m.userData.museumComponent||'';if(m.isMesh&&(c==='internal-access-road'||c==='service-lane'||/asphalt/i.test(m.material?.name||'')))meshes.add(m);});
  for(const mesh of meshes){const g=mesh.geometry,p=g.attributes.position,idx=g.index;if(!p)continue;
   const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material],ranges=g.groups.length&&mats.length>1?g.groups:[{start:0,count:idx?.count??p.count,materialIndex:0}];
   for(const range of ranges){const mat=mats[range.materialIndex];if(!mat||mat.opacity<.5)continue;const triangles=[];for(let j=0;j<(mesh.isInstancedMesh?mesh.count:1);j++){
    if(mesh.isInstancedMesh){mesh.getMatrixAt(j,instance);world.multiplyMatrices(mesh.matrixWorld,instance);}else world.copy(mesh.matrixWorld);
    for(let k=range.start;k<range.start+range.count;k+=3){const q=[];for(let n=0;n<3;n++){v.fromBufferAttribute(p,idx?idx.getX(k+n):k+n).applyMatrix4(world);q.push(v.x,v.z);}const area=(q[2]-q[0])*(q[5]-q[1])-(q[4]-q[0])*(q[3]-q[1]);if(Math.abs(area)<1e-7)continue;if(area>0){const x=q[2],z=q[3];q[2]=q[4];q[3]=q[5];q[4]=x;q[5]=z;}triangles.push({p:q,b:[Math.min(q[0],q[2],q[4]),Math.min(q[1],q[3],q[5]),Math.max(q[0],q[2],q[4]),Math.max(q[1],q[3],q[5])]});}
   }
   const name=(mesh.name+' '+mat.name).toLowerCase(),priority=/обочин|shoulder|gravel/.test(name)?0:/размет|marking|dash/.test(name)?3:mesh.parent?.name.includes('железнодорожные')?2:1;
   groups.push({triangles,color:'#'+(mat.color||new T.Color(.4,.4,.4)).getHexString(),priority});
  }}
  groups.sort((a,b)=>a.priority-b.priority);window.__ROAD_INK=groups;
 });
 for(const site of seed.sites){
  const span=Math.min(800,Math.max(100,Math.max(site.size[0],site.size[2])+60)),bounds=[site.center[0]-span/2,site.center[2]-span/2,site.center[0]+span/2,site.center[2]+span/2];
  const image=await page.evaluate(({bounds,worldBounds})=>{
   const cv=document.createElement('canvas');cv.width=cv.height=1024;const c=cv.getContext('2d'),[l,t,r,b]=bounds,[wl,wt,wr,wb]=worldBounds;
   c.fillStyle='#a18a6d';c.fillRect(0,0,1024,1024);c.drawImage(window.__FULL_ATLAS,(l-wl)/(wr-wl)*4096,(t-wt)/(wb-wt)*4096,(r-l)/(wr-wl)*4096,(b-t)/(wb-wt)*4096,0,0,1024,1024);
   const sx=1024/(r-l),sz=1024/(b-t);
   for(const group of window.__ROAD_INK){c.fillStyle=group.color;c.beginPath();let n=0;for(const tri of group.triangles){const q=tri.b;if(q[2]<l||q[0]>r||q[3]<t||q[1]>b)continue;const p=tri.p;c.moveTo((p[0]-l)*sx,(p[1]-t)*sz);c.lineTo((p[2]-l)*sx,(p[3]-t)*sz);c.lineTo((p[4]-l)*sx,(p[5]-t)*sz);c.closePath();n++;}if(n)c.fill();}
   return cv.toDataURL('image/webp',.92).split(',')[1];
  },{bounds,worldBounds:seed.bounds});
  const bytes=Buffer.from(image,'base64'),url=out+'/sites/'+site.id+'-ground.webp';await writeFile(url,bytes);site.terrainPatch={url,bounds,bytes:bytes.length};
 }
 console.log('SITE_ROAD_INK_BAKED',seed.sites.length);
}
