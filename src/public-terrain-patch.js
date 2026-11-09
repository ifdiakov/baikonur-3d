import * as THREE from 'three';
// Road ink follows the terrain's actual triangles, not floating ribbons.
export function maskTerrain(material,polygons,bounds){
 const rings=polygons.filter(p=>p.bounds[0]<bounds[2]&&p.bounds[2]>bounds[0]&&p.bounds[1]<bounds[3]&&p.bounds[3]>bounds[1]);if(!rings.length)return;
 const f=n=>Number(n).toFixed(5),checks=rings.map(ring=>{
  let test='';for(let j=0;j<ring.points.length;j++){const a=ring.points[j],b=ring.points[(j+1)%ring.points.length];if(Math.abs(a[1]-b[1])<1e-6)continue;test+=`if((p.y>${f(Math.min(a[1],b[1]))})&&(p.y<=${f(Math.max(a[1],b[1]))})&&p.x<${f(a[0])}+(p.y-(${f(a[1])}))*${f((b[0]-a[0])/(b[1]-a[1]))})inside=!inside;`;}
  const b=ring.bounds;return `{vec2 p=vPublicGround.xz;if(p.x>=${f(b[0])}&&p.y>=${f(b[1])}&&p.x<=${f(b[2])}&&p.y<=${f(b[3])}){bool inside=false;${test}if(inside)discard;}}`;
 }).join('\n');
 material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vPublicGround;').replace('#include <project_vertex>','#include <project_vertex>\nvPublicGround=(modelMatrix*vec4(transformed,1.0)).xyz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vPublicGround;').replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n'+checks);};material.customProgramCacheKey=()=>JSON.stringify(rings);material.needsUpdate=true;
}
export function buildSurfacePatch({bounds,worldBounds,segments,heights,texture,night,voids=[]}){
 const [x0,z0,x1,z1]=worldBounds,dx=(x1-x0)/segments,dz=(z1-z0)/segments,positions=[],uv=[];
 const at=(x,z)=>[x0+x*dx,heights[z*(segments+1)+x],z0+z*dz];
 const clip=(poly,axis,value,greater)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ina=greater?a[axis]>=value:a[axis]<=value,inb=greater?b[axis]>=value:b[axis]<=value;if(ina)out.push(a);if(ina!==inb){const t=(value-a[axis])/(b[axis]-a[axis]);out.push(a.map((v,j)=>v+(b[j]-v)*t));}}return out;};
 for(let z=Math.max(0,Math.floor((bounds[1]-z0)/dz));z<=Math.min(segments-1,Math.floor((bounds[3]-z0)/dz));z++)for(let x=Math.max(0,Math.floor((bounds[0]-x0)/dx));x<=Math.min(segments-1,Math.floor((bounds[2]-x0)/dx));x++){
  for(let poly of [[at(x,z),at(x,z+1),at(x+1,z)],[at(x,z+1),at(x+1,z+1),at(x+1,z)]]){
   for(const [a,v,g]of [[0,bounds[0],true],[0,bounds[2],false],[2,bounds[1],true],[2,bounds[3],false]])poly=clip(poly,a,v,g);
   for(let i=1;i+1<poly.length;i++)for(const p of [poly[0],poly[i],poly[i+1]]){positions.push(...p);uv.push((p[0]-bounds[0])/(bounds[2]-bounds[0]),1-(p[2]-bounds[1])/(bounds[3]-bounds[1]));}
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
 const material=new THREE.MeshBasicMaterial({map:texture,color:night?0x737e87:0xffffff,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});maskTerrain(material,voids,bounds);const mesh=new THREE.Mesh(geometry,material);mesh.name='Подробная поверхность · рисунок дорог';mesh.userData.publicTerrainPatch=true;mesh.renderOrder=1;return mesh;
}
