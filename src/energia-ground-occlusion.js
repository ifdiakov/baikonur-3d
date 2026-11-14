import * as THREE from 'three';
import {UKSS_TRENCH,normalizeUkssContour} from './ukss-pad.js?v=20261031-facilities-rails-lighting-v1';

export const ENERGIA_GROUND_OCCLUSION_VERSION='energia-grade-depth-20261114-v1';

/** The photographic soil is a transparent colour layer without depth writes.
 * The DEM deliberately omits flat protected ground around the launch complex;
 * its opaque background is several world units below the visible soil. Supply
 * only the missing depth at grade, after soil colour and before launch effects.
 * The exact existing excavation remains open, including the real outlet.
 * This mesh owns its resources and is disposed with the launch effects. */
export function createEnergiaGroundOcclusion({siteRoot}){
 if(!siteRoot?.isObject3D)throw new TypeError('Energia ground occlusion requires a site root');
 const metadata=siteRoot.userData.ukssModel;
 const sourceContour=metadata?.terrainCutout?.polygon;
 const contour=normalizeUkssContour(sourceContour??[
  ...UKSS_TRENCH.map(point=>[point[0],point[1]]),
  ...[...UKSS_TRENCH].reverse().map(point=>[point[0],-point[1]])
 ]);
 const x=contour.map(point=>point[0]),z=contour.map(point=>point[1]);
 const sourceBounds=metadata?.bounds;
 const validBounds=Array.isArray(sourceBounds?.min)&&Array.isArray(sourceBounds?.max)
  &&sourceBounds.min.length===3&&sourceBounds.max.length===3
  &&[...sourceBounds.min,...sourceBounds.max].every(Number.isFinite);
 const margin=64;
 const bounds={
  minX:Math.min(...x,validBounds?sourceBounds.min[0]:-180)-margin,
  maxX:Math.max(...x,validBounds?sourceBounds.max[0]:380)+margin,
  minZ:Math.min(...z,validBounds?sourceBounds.min[2]:-180)-margin,
  maxZ:Math.max(...z,validBounds?sourceBounds.max[2]:240)+margin
 };
 // Shape coordinates use (x,-z), so a -90 degree rotation yields upward
 // facing X/Z ground without changing the supplied contour's orientation.
 const shape=new THREE.Shape();
 shape.moveTo(bounds.minX,-bounds.minZ);
 shape.lineTo(bounds.maxX,-bounds.minZ);
 shape.lineTo(bounds.maxX,-bounds.maxZ);
 shape.lineTo(bounds.minX,-bounds.maxZ);
 shape.closePath();
 const hole=new THREE.Path();
 contour.forEach(([px,pz],index)=>index?hole.lineTo(px,-pz):hole.moveTo(px,-pz));
 hole.closePath();shape.holes.push(hole);
 const geometry=new THREE.ShapeGeometry(shape);
 geometry.rotateX(-Math.PI/2);
 const material=new THREE.MeshBasicMaterial({
  colorWrite:false,depthWrite:true,depthTest:true,transparent:true,
  side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false
 });
 const mesh=new THREE.Mesh(geometry,material);
 mesh.name='УКСС · перекрытие факела поверхностью земли';
 // One centimetre in the source metre frame (0.0014 world units) prevents
 // competition with a coplanar concrete apron without reopening a visible gap.
 mesh.position.y=-.01;
 mesh.renderOrder=27;
 mesh.userData={pickable:false,museumComponent:'launch-ground-depth',
  energiaGroundOcclusion:{version:ENERGIA_GROUND_OCCLUSION_VERSION,
   contourSource:sourceContour?'source-model':'procedural-fallback',
   contour:contour.map(point=>[...point]),bounds,gradeY:mesh.position.y,
   triangles:geometry.index.count/3}};
 return mesh;
}
