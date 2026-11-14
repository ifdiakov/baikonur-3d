import * as THREE from 'three';
import {TRANSPORT_GROUND_Y,TRANSPORT_GROUND_VERSION} from './transport-ground-profile.js?v=20261114-ground-contact-v1';

export const TRANSPORT_GROUND_SUPPORT_VERSION='retained-model-rail-support-v1';
const vector=value=>Array.isArray(value)?new THREE.Vector3(...value):value.clone();

// A shared longitudinal grade gives overlapping switch ribbons one physical
// surface. Per-track interpolation would put the earth bed of one approach
// through another track even though their source/model endpoints are correct.
export function transportGroundSupportHeightAt(profile,x,z){
 const field=profile?.heightField;if(!field)return null;
 if(field.kind!=='model-port-plane-grade-v1')throw Error('Unknown model railway ground grade '+field.kind);
 const station=(x-field.origin[0])*field.direction[0]+(z-field.origin[1])*field.direction[1];
 const t=THREE.MathUtils.clamp(station/field.length,0,1),ease=t*t*(3-2*t);
 return field.startY+(field.endY-field.startY)*ease;
}

// Closed, retained earth beds under explicit model railway connectors. The
// top is the real ballast underside, not a second elevated road/rail surface.
// Their narrow footprints preserve neighbouring tracks and apron boundaries;
// ordinary source railways and bridge spans never enter this profile list.
export function buildTransportGroundSupport({profiles=[],parent=null,heightAt=()=>TRANSPORT_GROUND_Y}={}){
 const positions=[],ids=[],profileRows=[];let segments=0,maxRise=0;
 const triangle=(a,b,c)=>positions.push(...a.toArray(),...b.toArray(),...c.toArray());
 const quad=(a,b,c,d)=>{triangle(a,b,c);triangle(b,d,c);};
 for(const profile of profiles){
  const points=profile.points?.map(vector)??[],width=profile.width;
  if(points.length<2)continue;
  if(!(width>0&&Number.isFinite(width))||points.some(p=>!p.toArray().every(Number.isFinite)))throw Error('Invalid transport ground support '+profile.id);
  const rows=points.map((p,i)=>{
   const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
   const tangent=b.clone().sub(a).setY(0).normalize();
   let normal=new THREE.Vector3(-tangent.z,0,tangent.x);
   if(profile.normals?.[i])normal.set(profile.normals[i][0],0,profile.normals[i][1]).normalize();
   else if(i===0&&profile.startTangent||i===points.length-1&&profile.endTangent){
    const direction=vector(i===0?profile.startTangent:profile.endTangent).setY(0).normalize();normal.set(-direction.z,0,direction.x);
   }
   const left=p.clone().addScaledVector(normal,width/2),right=p.clone().addScaledVector(normal,-width/2);
   for(const edge of [left,right]){const y=transportGroundSupportHeightAt(profile,edge.x,edge.z);if(y!==null)edge.y=y;}
   const leftGround=heightAt(left.x,left.z),rightGround=heightAt(right.x,right.z);
   if(!Number.isFinite(leftGround)||!Number.isFinite(rightGround))throw Error('Invalid support terrain height '+profile.id);
   maxRise=Math.max(maxRise,left.y-leftGround,right.y-rightGround);
   const middle=p.clone(),middleY=transportGroundSupportHeightAt(profile,p.x,p.z);if(middleY!==null)middle.y=middleY;
   return {left,right,middle,bottomLeft:left.clone().setY(Math.min(left.y,leftGround)-.005),bottomRight:right.clone().setY(Math.min(right.y,rightGround)-.005),
    rise:Math.max(left.y-leftGround,right.y-rightGround)};
  });
  let count=0;
  for(let i=1;i<rows.length;i++){
   const a=rows[i-1],b=rows[i];if(Math.max(a.rise,b.rise)<=.005)continue;
   // Top winding matches the actual ballast ribbon; downward and vertical
   // faces close its physical volume all the way to the sampled ground.
   if(profile.heightField&&(Math.abs(a.middle.y-(a.left.y+a.right.y)/2)>.004||Math.abs(b.middle.y-(b.left.y+b.right.y)/2)>.004)){
    quad(a.right,a.middle,b.right,b.middle);quad(a.middle,a.left,b.middle,b.left);
   }else quad(a.right,a.left,b.right,b.left);
   quad(a.bottomLeft,a.bottomRight,b.bottomLeft,b.bottomRight);
   quad(a.bottomLeft,b.bottomLeft,a.left,b.left);
   quad(a.right,b.right,a.bottomRight,b.bottomRight);
   if(i===1||Math.max(rows[i-2].rise,a.rise)<=.005)quad(a.bottomLeft,a.left,a.bottomRight,a.right);
   if(i===rows.length-1||Math.max(b.rise,rows[i+1].rise)<=.005)quad(b.left,b.bottomLeft,b.right,b.bottomRight);
   count++;segments++;
  }
  if(count){ids.push(profile.id);profileRows.push({id:profile.id,siteId:profile.siteId??null,portId:profile.portId??null,segments:count});}
 }
 const stats={version:TRANSPORT_GROUND_SUPPORT_VERSION,groundVersion:TRANSPORT_GROUND_VERSION,profiles:profileRows,segments,maxRise,triangles:positions.length/9};
 if(!positions.length)return {mesh:null,stats};
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const material=new THREE.MeshStandardMaterial({color:0x988b78,roughness:1,side:THREE.DoubleSide});
 material.name='Грунтовое основание · короткие подходы к модельным путям';
 const mesh=new THREE.Mesh(geometry,material);mesh.name='ЖД · грунтовое основание модельных подходов';mesh.receiveShadow=true;
 mesh.userData={museumComponent:'transport-ground-support',transportGroundSupport:true,groundSurface:true,pickable:false,
  groundVersion:TRANSPORT_GROUND_VERSION,version:TRANSPORT_GROUND_SUPPORT_VERSION,profileIds:ids,kind:'retained-ballast-bed'};
 if(parent)parent.add(mesh);return {mesh,stats};
}

// Index the exact Float32 roof triangles produced above. Editors can drape a
// crossing shoulder onto real retained soil without guessing a radius around
// the track or traversing the scene for every vertex. The temporary mesh is
// never attached to a scene and does not change any physical support surface.
export function createTransportGroundSupportSampler({profiles=[],heightAt=()=>TRANSPORT_GROUND_Y}={}){
 const built=buildTransportGroundSupport({profiles,heightAt}),mesh=built.mesh,cellSize=8,cells=new Map();
 let triangleCount=0;
 if(mesh){
  const p=mesh.geometry.getAttribute('position');
  for(let i=0;i<p.count;i+=3){
   const a=[p.getX(i),p.getY(i),p.getZ(i)],b=[p.getX(i+1),p.getY(i+1),p.getZ(i+1)],c=[p.getX(i+2),p.getY(i+2),p.getZ(i+2)];
   const up=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
   if(up<=1e-12)continue; // closed bottom and vertical retaining faces are not soil tops
   const minX=Math.min(a[0],b[0],c[0]),maxX=Math.max(a[0],b[0],c[0]),minZ=Math.min(a[2],b[2],c[2]),maxZ=Math.max(a[2],b[2],c[2]);
   const triangle=Object.freeze({a:Object.freeze(a),b:Object.freeze(b),c:Object.freeze(c),minX,maxX,minZ,maxZ,
    den:(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2])});
   for(let x=Math.floor(minX/cellSize);x<=Math.floor(maxX/cellSize);x++)for(let z=Math.floor(minZ/cellSize);z<=Math.floor(maxZ/cellSize);z++){
    const key=x+','+z;let rows=cells.get(key);if(!rows){rows=[];cells.set(key,rows);}rows.push(triangle);
   }
   triangleCount++;
  }
  mesh.geometry.dispose();mesh.material.dispose();
 }
 function sample(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  const rows=cells.get(Math.floor(x/cellSize)+','+Math.floor(z/cellSize));if(!rows)return null;
  let height=null;
  for(const row of rows){
   if(x<row.minX-1e-7||x>row.maxX+1e-7||z<row.minZ-1e-7||z>row.maxZ+1e-7)continue;
   const {a,b,c,den}=row,u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,
    v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;
   if(Math.min(u,v,w)<-1e-7)continue;
   const y=u*a[1]+v*b[1]+w*c[1];height=height===null?y:Math.max(height,y);
  }
  return height;
 }
 function trianglesInBounds(bounds){
  if(!bounds||![bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ].every(Number.isFinite)||bounds.minX>bounds.maxX||bounds.minZ>bounds.maxZ)return [];
  const {minX,maxX,minZ,maxZ}=bounds,x0=Math.floor(minX/cellSize),x1=Math.floor(maxX/cellSize),z0=Math.floor(minZ/cellSize),z1=Math.floor(maxZ/cellSize),found=new Set();
  const add=rows=>{for(const triangle of rows??[])if(triangle.maxX>=minX&&triangle.minX<=maxX&&triangle.maxZ>=minZ&&triangle.minZ<=maxZ)found.add(triangle);};
  if((x1-x0+1)*(z1-z0+1)>cells.size*2){for(const rows of cells.values())add(rows);}
  else for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)add(cells.get(x+','+z));
  // These immutable exact triangles are candidates for polygon clipping,
  // never a radius-based extension of the original support footprint.
  return [...found];
 }
 return {heightAt:sample,trianglesInBounds,stats:{profiles:built.stats.profiles.length,triangles:triangleCount,cells:cells.size}};
}
