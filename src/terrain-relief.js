import * as THREE from 'three';

// Geographic spacing is independent of the enlarged exhibit/model scale.
export const RELIEF_WORLD_UNITS_PER_METRE=3.4/65;
export const TERRAIN_RELIEF_VERSION='baikonur-dem-relief-v1';
const MAX_TRIANGLES=350000;
const clamp01=x=>Math.max(0,Math.min(1,x));
const smoothstep=(a,b,x)=>{const t=b>a?clamp01((x-a)/(b-a)):(x>a?1:0);return t*t*(3-2*t);};
const finite=n=>Number.isFinite(n);
const pointOK=p=>p&&finite(p.x)&&finite(p.z);

function pointSegmentDistance(x,z,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;
 const t=length2?clamp01(((x-a.x)*dx+(z-a.z)*dz)/length2):0;
 return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
}

function upperBound(values,value){
 let lo=0,hi=values.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(values[mid]<=value)lo=mid+1;else hi=mid;}
 return lo;
}

/**
 * Distance to engineering areas, indexed once rather than scanning every road
 * for every vertex. A corridor's width is its full pavement/reserved width.
 * Polygon interiors use exact scanline intersections, cached per terrain row.
 */
export function createReliefProtection(protection={},options={}){
 const margin=Math.max(0,options.margin??0),transitionWidth=Math.max(0,options.transitionWidth??120);
 const cellSize=Math.max(16,options.cellSize??Math.max(96,margin+transitionWidth));
 const bounds=options.bounds,reach=margin+transitionWidth;
 const cells=new Map(),polygonCells=new Map(),counts={circles:0,rectangles:0,corridors:0,segments:0,polygons:0};
 let primitiveCount=0;
 const key=(x,z)=>x+','+z;
 function index(target,item,box,padding=0){
  let minX=box.minX-padding,maxX=box.maxX+padding,minZ=box.minZ-padding,maxZ=box.maxZ+padding;
  if(bounds){minX=Math.max(minX,bounds.minX);maxX=Math.min(maxX,bounds.maxX);minZ=Math.max(minZ,bounds.minZ);maxZ=Math.min(maxZ,bounds.maxZ);}
  if(minX>maxX||minZ>maxZ)return;
  for(let z=Math.floor(minZ/cellSize);z<=Math.floor(maxZ/cellSize);z++)for(let x=Math.floor(minX/cellSize);x<=Math.floor(maxX/cellSize);x++){
   const k=key(x,z);let bucket=target.get(k);if(!bucket){bucket=[];target.set(k,bucket);}bucket.push(item);
  }
 }
 function segment(a,b,radius=0){
  if(!pointOK(a)||!pointOK(b))return;
  index(cells,{kind:'segment',a:{x:a.x,z:a.z},b:{x:b.x,z:b.z},radius},
   {minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z)},radius+reach);
  primitiveCount++;counts.segments++;
 }
 for(const circle of protection.circles||[]){
  if(!pointOK(circle)||!finite(circle.radius)||circle.radius<0)continue;
  const item={kind:'circle',x:circle.x,z:circle.z,radius:circle.radius};
  index(cells,item,{minX:item.x,maxX:item.x,minZ:item.z,maxZ:item.z},item.radius+reach);
  primitiveCount++;counts.circles++;
 }
 for(const rect of protection.rectangles||[]){
  if(!rect||!['minX','maxX','minZ','maxZ'].every(k=>finite(rect[k]))||rect.minX>rect.maxX||rect.minZ>rect.maxZ)continue;
  const item={kind:'rectangle',minX:rect.minX,maxX:rect.maxX,minZ:rect.minZ,maxZ:rect.maxZ};
  index(cells,item,item,reach);primitiveCount++;counts.rectangles++;
 }
 for(const corridor of protection.corridors||[]){
  if(!corridor?.points||corridor.points.length<2)continue;
  const radius=Math.max(0,finite(corridor.width)?corridor.width/2:0);counts.corridors++;
  for(let i=1;i<corridor.points.length;i++)segment(corridor.points[i-1],corridor.points[i],radius);
 }
 for(const source of protection.polygons||[]){
  if(!Array.isArray(source)||source.length<3||!source.every(pointOK))continue;
  const points=source.map(p=>({x:p.x,z:p.z})),box={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
  for(const p of points){box.minX=Math.min(box.minX,p.x);box.maxX=Math.max(box.maxX,p.x);box.minZ=Math.min(box.minZ,p.z);box.maxZ=Math.max(box.maxZ,p.z);}
  const polygon={box,edgeRows:new Map(),scanlines:new Map()};counts.polygons++;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[j],b=points[i];segment(a,b);
   if(a.z===b.z)continue;
   let low=Math.min(a.z,b.z),high=Math.max(a.z,b.z);
   if(bounds){low=Math.max(low,bounds.minZ);high=Math.min(high,bounds.maxZ);}
   for(let row=Math.floor(low/cellSize);row<=Math.floor(high/cellSize);row++){
    let edges=polygon.edgeRows.get(row);if(!edges){edges=[];polygon.edgeRows.set(row,edges);}edges.push({a,b});
   }
  }
  index(polygonCells,polygon,box);
 }
 function insidePolygon(polygon,x,z){
  const box=polygon.box;if(x<box.minX||x>box.maxX||z<box.minZ||z>box.maxZ)return false;
  let crossings=polygon.scanlines.get(z);
  if(!crossings){
   crossings=[];
   for(const {a,b} of polygon.edgeRows.get(Math.floor(z/cellSize))||[])
    if((a.z>z)!==(b.z>z))crossings.push(a.x+(z-a.z)*(b.x-a.x)/(b.z-a.z));
   crossings.sort((a,b)=>a-b);
   // Normal construction uses only the grid's rows; bound arbitrary inspector
   // queries as well so this helper remains safe to reuse interactively.
   if(polygon.scanlines.size>=1024)polygon.scanlines.clear();
   polygon.scanlines.set(z,crossings);
  }
  return (upperBound(crossings,x)&1)===1;
 }
 function distanceAt(x,z){
  if(!finite(x)||!finite(z))return Infinity;
  const k=key(Math.floor(x/cellSize),Math.floor(z/cellSize));
  for(const polygon of polygonCells.get(k)||[])if(insidePolygon(polygon,x,z))return 0;
  let nearest=Infinity;
  for(const item of cells.get(k)||[]){
   let d;
   if(item.kind==='circle')d=Math.max(0,Math.hypot(x-item.x,z-item.z)-item.radius);
   else if(item.kind==='rectangle')d=Math.hypot(Math.max(item.minX-x,0,x-item.maxX),Math.max(item.minZ-z,0,z-item.maxZ));
   else d=Math.max(0,pointSegmentDistance(x,z,item.a,item.b)-item.radius);
   if(d<nearest)nearest=d;
   if(nearest===0)return 0;
  }
  return nearest;
 }
 function sample(x,z){const distance=distanceAt(x,z);return {distance,protected:distance<=margin,weight:smoothstep(margin,margin+transitionWidth,distance)};}
 return {distanceAt,sample,weightAt:(x,z)=>sample(x,z).weight,
  stats:()=>({...counts,primitives:primitiveCount,hashCells:cells.size,polygonHashCells:polygonCells.size,cellSize,margin,transitionWidth})};
}

function createDemSampler(dem){
 if(!dem||!Number.isInteger(dem.width)||!Number.isInteger(dem.height)||dem.width<2||dem.height<2||dem.values?.length!==dem.width*dem.height)
  throw new Error('Terrain relief requires a rectangular DEM with at least 2 × 2 samples');
 const bounds=dem.bounds;
 if(!bounds||!['minX','maxX','minZ','maxZ'].every(k=>finite(bounds[k]))||bounds.maxX<=bounds.minX||bounds.maxZ<=bounds.minZ)
  throw new Error('Terrain relief requires increasing world X/Z bounds');
 const metresPerUnit=dem.metresPerUnit??1,offsetMetres=dem.offsetMetres??0;
 if(!finite(metresPerUnit)||metresPerUnit<=0||!finite(offsetMetres))throw new Error('Invalid DEM elevation units');
 for(const value of dem.values)if(!finite(value))throw new Error('DEM contains a non-finite elevation');
 const spanX=bounds.maxX-bounds.minX,spanZ=bounds.maxZ-bounds.minZ;
 return (x,z)=>{
  const px=clamp01((x-bounds.minX)/spanX)*(dem.width-1),pz=clamp01((z-bounds.minZ)/spanZ)*(dem.height-1);
  const ix=Math.min(dem.width-2,Math.floor(px)),iz=Math.min(dem.height-2,Math.floor(pz)),u=px-ix,v=pz-iz,i=iz*dem.width+ix;
  const top=dem.values[i]*(1-u)+dem.values[i+1]*u,bottom=dem.values[i+dem.width]*(1-u)+dem.values[i+dem.width+1]*u;
  return offsetMetres+metresPerUnit*(top*(1-v)+bottom*v);
 };
}

/** Build deterministic CPU terrain data; no renderer, textures or DOM needed. */
export function createTerrainReliefField({dem,protection={},step=16,baseY=-2.755,verticalExaggeration=2.5,
 baseElevationMetres=68,transitionWidth=120,edgeFadeWidth=240}={}){
 const sampleDem=createDemSampler(dem),bounds={...dem.bounds};
 if(!finite(step)||step<=0||!finite(baseY)||!finite(verticalExaggeration)||verticalExaggeration<0||!finite(baseElevationMetres)||
    !finite(transitionWidth)||transitionWidth<0||!finite(edgeFadeWidth)||edgeFadeWidth<0)throw new Error('Invalid terrain relief options');
 const spanX=bounds.maxX-bounds.minX,spanZ=bounds.maxZ-bounds.minZ;
 let columns=Math.max(1,Math.ceil(spanX/step)),rows=Math.max(1,Math.ceil(spanZ/step));
 if(columns*rows*2>MAX_TRIANGLES){
  const ratio=Math.sqrt(columns*rows*2/MAX_TRIANGLES);
  columns=Math.max(1,Math.floor(columns/ratio));rows=Math.max(1,Math.floor(rows/ratio));
  if(columns*rows*2>MAX_TRIANGLES){
   if(columns>=rows)columns=Math.max(1,Math.floor(MAX_TRIANGLES/(2*rows)));
   else rows=Math.max(1,Math.floor(MAX_TRIANGLES/(2*columns)));
  }
 }
 const stepX=spanX/columns,stepZ=spanZ/rows,gridDiagonal=Math.hypot(stepX,stepZ),margin=gridDiagonal+.05;
 const protectedGround=createReliefProtection(protection,{margin,transitionWidth,bounds});
 const xAxis=new Float32Array(columns+1),zAxis=new Float32Array(rows+1),stride=columns+1,vertices=stride*(rows+1);
 for(let x=0;x<=columns;x++)xAxis[x]=bounds.minX+x*stepX;
 for(let z=0;z<=rows;z++)zAxis[z]=bounds.minZ+z*stepZ;
 const positions=new Float32Array(vertices*3),uv=new Float32Array(vertices*2),colors=new Float32Array(vertices*4),offsets=new Float32Array(vertices);
 let minOffset=Infinity,maxOffset=0,nonZeroVertices=0,protectedVertices=0,maxProtectedOffset=0;
 for(let z=0;z<=rows;z++)for(let x=0;x<=columns;x++){
  const i=z*stride+x,wx=xAxis[x],wz=zAxis[z],protectedSample=protectedGround.sample(wx,wz);
  const edgeDistance=Math.max(0,Math.min(wx-bounds.minX,bounds.maxX-wx,wz-bounds.minZ,bounds.maxZ-wz));
  const edgeWeight=edgeFadeWidth?(x===0||x===columns||z===0||z===rows?0:smoothstep(0,edgeFadeWidth,edgeDistance)):1;
  const offset=Math.max(0,sampleDem(wx,wz)-baseElevationMetres)*RELIEF_WORLD_UNITS_PER_METRE*verticalExaggeration*protectedSample.weight*edgeWeight;
  offsets[i]=offset;positions[i*3]=wx;positions[i*3+1]=baseY+offset;positions[i*3+2]=wz;
  uv[i*2]=x/columns;uv[i*2+1]=1-z/rows;
  const storedOffset=offset>0?Math.max(0,positions[i*3+1]-baseY):0;
  minOffset=Math.min(minOffset,storedOffset);maxOffset=Math.max(maxOffset,storedOffset);if(offset>0)nonZeroVertices++;
  if(protectedSample.protected){protectedVertices++;maxProtectedOffset=Math.max(maxProtectedOffset,offset);}
 }
 const indices=[];let maxSlope=0,omittedTriangles=0;
 function triangle(a,b,c){
  if(offsets[a]===0&&offsets[b]===0&&offsets[c]===0){omittedTriangles++;return;}
  indices.push(a,b,c);
  const ax=positions[a*3],az=positions[a*3+2],ay=positions[a*3+1];
  const dx1=positions[b*3]-ax,dz1=positions[b*3+2]-az,dy1=positions[b*3+1]-ay;
  const dx2=positions[c*3]-ax,dz2=positions[c*3+2]-az,dy2=positions[c*3+1]-ay,det=dx1*dz2-dx2*dz1;
  maxSlope=Math.max(maxSlope,Math.hypot((dy1*dz2-dy2*dz1)/det,(dx1*dy2-dx2*dy1)/det));
 }
 for(let z=0;z<rows;z++)for(let x=0;x<columns;x++){const a=z*stride+x,b=a+1,c=a+stride,d=c+1;triangle(a,c,b);triangle(b,c,d);}
 for(let z=0;z<=rows;z++)for(let x=0;x<=columns;x++){
  const i=z*stride+x,l=z*stride+Math.max(0,x-1),r=z*stride+Math.min(columns,x+1),t=Math.max(0,z-1)*stride+x,b=Math.min(rows,z+1)*stride+x;
  const dx=(positions[r*3+1]-positions[l*3+1])/(positions[r*3]-positions[l*3]);
  const dz=(positions[b*3+1]-positions[t*3+1])/(positions[b*3+2]-positions[t*3+2]);
  const alpha=smoothstep(0,.35,offsets[i]),diffuse=(-dx*.7+dz*.5)/Math.sqrt(1+dx*dx+dz*dz);
  const shade=1+Math.max(-.045,Math.min(.035,diffuse*.12))*alpha;
  colors[i*4]=shade;colors[i*4+1]=shade;colors[i*4+2]=shade;colors[i*4+3]=alpha;
 }
 function inBounds(x,z){return finite(x)&&finite(z)&&x>=bounds.minX&&x<=bounds.maxX&&z>=bounds.minZ&&z<=bounds.maxZ;}
 function heightAt(x,z){
  if(!inBounds(x,z))return baseY;
  // Use Float32 axes and the exact mesh diagonal, including triangles next to
  // narrow protected roads; bilinear interpolation would cut through them.
  const ix=Math.max(0,Math.min(columns-1,upperBound(xAxis,x)-1)),iz=Math.max(0,Math.min(rows-1,upperBound(zAxis,z)-1));
  const u=clamp01((x-xAxis[ix])/(xAxis[ix+1]-xAxis[ix])),v=clamp01((z-zAxis[iz])/(zAxis[iz+1]-zAxis[iz]));
  const a=iz*stride+ix,b=a+1,c=a+stride,d=c+1;
  if(u+v<=1){
   if(offsets[a]===0&&offsets[b]===0&&offsets[c]===0)return baseY;
   return positions[a*3+1]*(1-u-v)+positions[b*3+1]*u+positions[c*3+1]*v;
  }
  if(offsets[b]===0&&offsets[c]===0&&offsets[d]===0)return baseY;
  return positions[b*3+1]*(1-v)+positions[c*3+1]*(1-u)+positions[d*3+1]*(u+v-1);
 }
 function sample(x,z){
  const inside=inBounds(x,z),height=heightAt(x,z);
  return {elevationMetres:inside?sampleDem(x,z):null,offset:Math.max(0,height-baseY),height,
   protected:inside&&protectedGround.sample(x,z).protected,inBounds:inside};
 }
 const summary={version:TERRAIN_RELIEF_VERSION,source:dem.source??'DEM elevation grid',bounds,baseY,baseElevationMetres,
  verticalExaggeration,worldUnitsPerMetre:RELIEF_WORLD_UNITS_PER_METRE,requestedStep:step,edgeFadeWidth,
  grid:{columns,rows,stepX,stepZ},minOffset,maxOffset,minHeight:baseY+minOffset,maxHeight:baseY+maxOffset,maxSlope,
  vertices,triangles:indices.length/3,omittedTriangles,nonZeroVertices,protection:protectedGround.stats(),
  flatChecks:{verticesChecked:vertices,protectedVertices,maxProtectedOffset,violations:maxProtectedOffset>0?1:0,gridMarginSafe:margin>=gridDiagonal}};
 return {positions,uv,colors,indices:vertices>65535?new Uint32Array(indices):new Uint16Array(indices),offsets,xAxis,zAxis,
  heightAt,sample,stats:()=>({...summary,bounds:{...summary.bounds},grid:{...summary.grid},protection:{...summary.protection},flatChecks:{...summary.flatChecks}})};
}

/** Shared material callbacks and their three steppe samplers stay untouched. */
export function buildTerrainRelief(options={}){
 if(!options.material?.isMeshBasicMaterial)throw new Error('Terrain relief requires the shared MeshBasicMaterial soil material');
 const field=createTerrainReliefField(options),geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(field.positions,3));
 geometry.setAttribute('uv',new THREE.BufferAttribute(field.uv,2));
 geometry.setAttribute('color',new THREE.BufferAttribute(field.colors,4));
 geometry.setIndex(new THREE.BufferAttribute(field.indices,1));geometry.computeVertexNormals();
 const normals=geometry.getAttribute('normal');
 for(let i=0;i<normals.count;i++)if(normals.getX(i)===0&&normals.getY(i)===0&&normals.getZ(i)===0)normals.setXYZ(i,0,1,0);
 geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const material=options.material;
 Object.assign(material,{vertexColors:true,transparent:true,depthWrite:true,alphaTest:.001,polygonOffset:true,polygonOffsetFactor:-2});
 material.userData.terrainRelief={version:TERRAIN_RELIEF_VERSION,geometry:true,source:options.dem.source??'DEM elevation grid'};material.needsUpdate=true;
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Рельеф степи · цифровая модель высот';mesh.renderOrder=3;
 mesh.userData={...mesh.userData,museumComponent:'dem-terrain-relief',groundSurface:true,pickable:false,terrainRelief:field.stats()};
 return {mesh,heightAt:field.heightAt,sample:field.sample,stats:field.stats};
}
