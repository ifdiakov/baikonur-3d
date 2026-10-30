import * as THREE from 'three';
import {sampleSteppe} from './terrain-extent.js';

export const RIVER_SURFACE_VERSION='syrdarya-water-polygons-v1';
function ringArea(ring){
 const [ox,oz]=ring[0];let sum=0;
 for(let i=1;i<ring.length;i++)sum+=(ring[i-1][0]-ox)*(ring[i][1]-oz)-(ring[i][0]-ox)*(ring[i-1][1]-oz);
 return Math.abs(sum)/2;
}
const squaredDistance=(x,z,a,b)=>{
 const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
 const t=length?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length)):0;
 return (x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2;
};
function insideRing(x,z,ring){
 let inside=false;
 for(let i=1;i<ring.length;i++){
  const a=ring[i-1],b=ring[i];
  if(squaredDistance(x,z,a,b)<1e-16)return true;
  if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
const boundsOf=ring=>({minX:Math.min(...ring.map(p=>p[0])),maxX:Math.max(...ring.map(p=>p[0])),
 minZ:Math.min(...ring.map(p=>p[1])),maxZ:Math.max(...ring.map(p=>p[1]))});
const inBounds=(x,z,b)=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;

/** project takes one WGS84 [lon,lat] pair and returns [worldX,worldZ].
 * The same exact rings serve rendering, lighting and runway clearance.
 * landClearance is positive on land, negative in water, zero at the shore.
 */
export function createRiverWaterModel({data,project}){
 if(!data?.features?.length||typeof project!=='function')throw new Error('River water polygons and a projection are required');
 const polygons=[],edgeCounts=new Map();
 for(const feature of data.features){
  const coordinates=feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:
   feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:null;
  if(!coordinates)throw new Error('River water requires Polygon/MultiPolygon areas');
  for(let part=0;part<coordinates.length;part++){
   const rings=coordinates[part].map(ring=>ring.map(coordinate=>{
    const p=project(coordinate);if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw new Error('Invalid projected river point');return [...p];
   }));
   for(const ring of rings){
    if(ring.length<4||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw new Error('Unclosed source water ring');
    for(let i=1;i<ring.length;i++){
     const a=ring[i-1],b=ring[i],ka=a.join(','),kb=b.join(','),key=ka<kb?ka+'|'+kb:kb+'|'+ka;
     const edge=edgeCounts.get(key);if(edge)edge.count++;else edgeCounts.set(key,{a,b,count:1});
    }
   }
   polygons.push({id:feature.id+':'+part,sourceId:feature.id,source:feature.properties,
    outer:rings[0],holes:rings.slice(1),bounds:boundsOf(rings[0])});
  }
 }
 // Shared cuts between neighbouring OSM water areas are not riverbanks.
 const shoreline=[...edgeCounts.values()].filter(edge=>edge.count===1);
 const isWater=(x,z)=>Number.isFinite(x)&&Number.isFinite(z)&&polygons.some(p=>
  inBounds(x,z,p.bounds)&&insideRing(x,z,p.outer)&&!p.holes.some(hole=>insideRing(x,z,hole)));
 const distanceToShore=(x,z)=>{
  if(!Number.isFinite(x)||!Number.isFinite(z))return NaN;
  let distance=Infinity;for(const {a,b} of shoreline)distance=Math.min(distance,squaredDistance(x,z,a,b));
  return Math.sqrt(distance);
 };
 const landClearance=(x,z)=>{const distance=distanceToShore(x,z);return isWater(x,z)?-Math.max(distance,1e-10):distance;};
 const islands=polygons.flatMap(p=>p.holes.map((ring,index)=>({
  id:p.id+':island-'+index,sourceRelation:p.sourceId,sourceWayId:p.source.sourceIslandWayIds?.[index],
  ring,bounds:boundsOf(ring),area:ringArea(ring)
 })));
 return {version:RIVER_SURFACE_VERSION,polygons,islands,shoreline,isWater,distanceToShore,landClearance,
  stats:()=>({version:RIVER_SURFACE_VERSION,polygonCount:polygons.length,
   islandCount:islands.length,shoreSegments:shoreline.length,
   waterArea:polygons.reduce((n,p)=>n+ringArea(p.outer)-p.holes.reduce((a,h)=>a+ringArea(h),0),0),
   sourceRelations:[...new Set(polygons.map(p=>p.sourceId))],sourceEvidence:data.sourceEvidence})};
}

function pathFromRing(ring,shape=false){
 const path=shape?new THREE.Shape():new THREE.Path();
 ring.forEach(([x,z],index)=>index?path.lineTo(x,-z):path.moveTo(x,-z));
 path.closePath();return path;
}
function flatGeometry(shapes,elevation){
 const geometry=new THREE.ShapeGeometry(shapes);
 geometry.rotateX(-Math.PI/2);geometry.translate(0,elevation,0);
 // Float32 storage can reverse almost-collinear sub-pixel slivers. Correct
 // their winding without moving any source boundary or island vertex.
 const positions=geometry.attributes.position,original=geometry.index,indices=[];
 for(let i=0;i<original.count;i+=3){
  const a=original.getX(i),b=original.getX(i+1),c=original.getX(i+2);
  const cross=(positions.getZ(b)-positions.getZ(a))*(positions.getX(c)-positions.getX(a))-
   (positions.getX(b)-positions.getX(a))*(positions.getZ(c)-positions.getZ(a));
  if(Math.abs(cross)<1e-10)continue;
  indices.push(a,...(cross>0?[b,c]:[c,b]));
 }
 geometry.setIndex(indices);
 // Do not interpolate normals between overlapping ribbons. These are actual
 // planar polygons, triangulated with their island holes, all facing upward.
 const normal=geometry.attributes.normal;
 for(let i=0;i<normal.count;i++)normal.setXYZ(i,0,1,0);
 geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
function waterMaterial(){
 const material=new THREE.MeshBasicMaterial({color:0x567d79,transparent:false,depthWrite:true});
 material.name='Сырдарья · единая непрозрачная водная поверхность';
 // Very low-contrast sediment variation lives in world coordinates, so it
 // cannot reveal the triangulation or create dark wedges at a river bend.
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
   varying vec2 vRiverWorld;
  `).replace('#include <project_vertex>',`#include <project_vertex>
   vRiverWorld=(modelMatrix*vec4(transformed,1.0)).xz;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying vec2 vRiverWorld;
   float riverHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float riverNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(riverHash(i),riverHash(i+vec2(1,0)),f.x),mix(riverHash(i+vec2(0,1)),riverHash(i+vec2(1,1)),f.x),f.y);}
  `).replace('#include <color_fragment>',`#include <color_fragment>
   float riverTone=.55*riverNoise(vRiverWorld*.017)+.45*riverNoise(vRiverWorld*.19);
   diffuseColor.rgb*=.98+.04*riverTone;
  `);
 };
 material.customProgramCacheKey=()=>RIVER_SURFACE_VERSION;return material;
}

/** One opaque water mesh and one land mesh. The geography, including every
 * hole, is shared with createRiverWaterModel; no offset strips are layered.
 */
export function buildRiverSurface({model,parent,elevation=-1.69}){
 if(!model?.polygons?.length)throw new Error('A projected river water model is required');
 const group=new THREE.Group();group.name='Сырдарья · берега и острова OSM';
 const shapes=model.polygons.map(p=>{
  const shape=pathFromRing(p.outer,true);shape.holes=p.holes.map(ring=>pathFromRing(ring));return shape;
 });
 const water=new THREE.Mesh(flatGeometry(shapes,elevation),waterMaterial());
 water.name='Сырдарья · фактическое русло с островными отверстиями';
 water.userData.museumComponent='syrdarya-water-polygons';water.userData.pickable=false;
 water.renderOrder=3;group.add(water);

 const landGeometry=flatGeometry(model.islands.map(island=>pathFromRing(island.ring,true)),elevation+.18);
 const colours=[],colour=new THREE.Color(),positions=landGeometry.attributes.position;
 for(let i=0;i<positions.count;i++){
  const rgb=sampleSteppe(positions.getX(i),positions.getZ(i),2);
  colour.setRGB(rgb[0]/255,rgb[1]/255,rgb[2]/255,THREE.SRGBColorSpace);
  colours.push(colour.r,colour.g,colour.b);
 }
 landGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
 const landMaterial=new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true,transparent:false,depthWrite:true});
 landMaterial.name='Сырдарья · общий грунт на фактических островах';
 const islands=new THREE.Mesh(landGeometry,landMaterial);
 islands.name='Сырдарья · острова по внутренним контурам OSM';
 islands.userData.museumComponent='syrdarya-source-islands';islands.userData.pickable=false;
 islands.renderOrder=3;group.add(islands);parent?.add(group);
 const report={...model.stats(),waterElevation:elevation,islandElevation:elevation+.18,
  waterTriangles:water.geometry.index.count/3,islandTriangles:landGeometry.index.count/3,
  drawCalls:2,geometryBasis:'OSM-multipolygon-outer-and-inner-rings',transparentWaterLayers:0};
 group.userData.riverSurface=report;
 return {group,water,islands,model,stats:()=>report};
}
