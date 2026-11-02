import * as THREE from 'three';
import {buildTerrainRelief} from './terrain-relief.js?v=20261101-natural-relief-v2';
import {sampleSteppe} from './steppe-field.js?v=20261101-steppe-v7';
import {saturnTerrainFootprint} from './saturn-access.js?v=20261101-saturn-terrain-v5';

const xz=p=>({x:p.x,z:p.z});

// The transport renderer samples curves more densely than the height grid.
// Keep the same corridor within 0.6 world units, with two extra units of verge.
function simplifyPath(points,tolerance=.6){
 if(points.length<3)return points.map(xz);
 const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;
 const stack=[[0,points.length-1]],limit=tolerance*tolerance;
 while(stack.length){
  const [first,last]=stack.pop(),a=points[first],b=points[last],dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  let farthest=-1,best=limit;
  for(let i=first+1;i<last;i++){
   const p=points[i],u=length?THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/length,0,1):0;
   const distance=(p.x-a.x-u*dx)**2+(p.z-a.z-u*dz)**2;
   if(distance>best){best=distance;farthest=i;}
  }
  if(farthest>=0){keep[farthest]=1;stack.push([first,farthest],[farthest,last]);}
 }
 return points.filter((_,i)=>keep[i]).map(xz);
}

/** Infrastructure stays at its approved level. The relief builder expands
 * these footprints by a cell diagonal before blending, so a triangle cannot
 * bridge over a narrow protected road between two grid samples. */
export function collectTerrainProtection({objects,transport,riverWater,riverCorePts,point,geography,places}){
 const protection={circles:[],rectangles:[],corridors:[],polygons:[]};
 const protectedSites=[],airports=[];
 const box=new THREE.Box3(),position=new THREE.Vector3();
 for(const object of objects){
  const root=object.geometryRoot||object.g;if(!root)continue;
  root.updateWorldMatrix(true,true);root.getWorldPosition(position);
  const margin=object.isStation?12:object.g.userData.airport?20:22;
  if(object.record.id==='pad-23'){
   // The transparent mesh skirt is deliberately larger than the real hill.
   // Protect its organic footprint, not the rectangular rendering patch.
   protection.polygons.push(saturnTerrainFootprint().map(p=>xz(root.localToWorld(new THREE.Vector3(p.x,0,p.z)))));
  }else{
   box.setFromObject(root);
   if(!box.isEmpty())protection.rectangles.push({minX:box.min.x-margin,maxX:box.max.x+margin,minZ:box.min.z-margin,maxZ:box.max.z+margin});
   else protection.circles.push({x:position.x,z:position.z,radius:margin});
  }
  protectedSites.push({id:object.record.id,x:position.x,z:position.z});
  if(object.g.userData.airport){
   // The final approach and climb-out remain clear of the raised steppe.
   const airport=object.g,scale=airport.getWorldScale(new THREE.Vector3()).x;
   const ends=[-1,1].map(sign=>airport.localToWorld(new THREE.Vector3(0,0,sign*1500/scale)));
   protection.corridors.push({points:ends.map(xz),width:140});
   airports.push({id:object.record.id,points:ends.map(xz),width:140});
  }
 }
 const groundPaths=transport.terrainPaths();
 for(const road of [...groundPaths.roads,...(transport.roadPaths().displayHighwayExtensions||[])]){
  if(road.points.length<2)continue;
  protection.corridors.push({points:simplifyPath(road.points),width:Math.max(road.width||4,4)+18});
 }
 for(const rail of groundPaths.rails){
  if(rail.points.length<2)continue;
  protection.corridors.push({points:simplifyPath(rail.points),width:Math.max(rail.width||2,2)+10});
 }
 // The river polygons include islands; all floodplain plants already use
 // that flat datum. A broad centreline corridor also covers the dry banks.
 for(const polygon of riverWater.polygons)protection.polygons.push(polygon.outer.map(([x,z])=>({x,z})));
 const riverCurve=new THREE.CatmullRomCurve3(riverCorePts.map(p=>point(...p)),false,'centripetal');
 protection.corridors.push({points:riverCurve.getPoints(620).map(xz),width:390});
 const settlementIds=new Set([39209179,16783113,15005695]);
 for(const feature of places.features){
  if(!settlementIds.has(feature.properties.osmId))continue;
  const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[];
  for(const rings of polygons)protection.polygons.push(rings[0].map(p=>xz(point(...geography.project(...p)))));
 }
 for(const bridge of transport.bridgeObjects()){
  bridge.updateWorldMatrix(true,true);box.setFromObject(bridge);
  if(!box.isEmpty())protection.rectangles.push({minX:box.min.x-20,maxX:box.max.x+20,minZ:box.min.z-20,maxZ:box.max.z+20});
 }
 return {protection,protectedSites,airports};
}

function reliefTexture({bounds,satelliteCanvas,renderer,satelliteOwnsGroundColor=false}){
 // The satellite shader replaces every RGB texel of this fully opaque map.
 // Relief edges still use their original per-vertex alpha and geometry.
 if(satelliteOwnsGroundColor){
  const texture=new THREE.DataTexture(new Uint8Array([161,136,109,255]),1,1,THREE.RGBAFormat);
  texture.name='Рельеф · непрозрачная основа спутникового покрытия';
  texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;texture.needsUpdate=true;return texture;
 }
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=808;
 const context=canvas.getContext('2d'),image=context.createImageData(canvas.width,canvas.height);
 const source=satelliteCanvas.getContext('2d').getImageData(0,0,satelliteCanvas.width,satelliteCanvas.height);
 const sample=(x,z)=>{
  const u=(x/4420+.5)*(source.width-1),v=(z/3553+.5)*(source.height-1);
  if(u<0||v<0||u>source.width-1||v>source.height-1)return null;
  const ix=Math.min(source.width-2,Math.floor(u)),iz=Math.min(source.height-2,Math.floor(v)),fx=u-ix,fz=v-iz;
  const values=[0,0,0,0];
  for(let dz=0;dz<2;dz++)for(let dx=0;dx<2;dx++){
   const weight=(dx?fx:1-fx)*(dz?fz:1-fz),k=((iz+dz)*source.width+ix+dx)*4;
   for(let c=0;c<4;c++)values[c]+=source.data[k+c]*weight;
  }
  return values;
 };
 for(let iz=0;iz<canvas.height;iz++)for(let ix=0;ix<canvas.width;ix++){
  const x=THREE.MathUtils.lerp(bounds.minX,bounds.maxX,ix/(canvas.width-1));
  const z=THREE.MathUtils.lerp(bounds.minZ,bounds.maxZ,iz/(canvas.height-1));
  const color=sampleSteppe(x,z,2),central=sample(x,z),k=(iz*canvas.width+ix)*4;
  for(let c=0;c<3;c++)image.data[k+c]=central?THREE.MathUtils.lerp(color[c],central[c],central[3]/255):color[c];
  image.data[k+3]=255;
 }
 context.putImageData(image,0,0);
 const texture=new THREE.CanvasTexture(canvas);texture.name='Светлая песчаная степь · рельеф';
 texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;
 texture.magFilter=THREE.LinearFilter;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
 return texture;
}

export function buildMuseumTerrainRelief(options){
 const {dem,satelliteCanvas,renderer,steppeSurface,scene,registerGroundSurface}=options;
 const {protection,protectedSites,airports}=collectTerrainProtection(options);
 const satelliteOwnsGroundColor=Boolean(steppeSurface?.stats?.().satellite?.surrounding);
 const texture=reliefTexture({bounds:dem.bounds,satelliteCanvas,renderer,satelliteOwnsGroundColor});
 const material=new THREE.MeshBasicMaterial({map:texture,
  color:0xffffff,vertexColors:true,transparent:true,depthWrite:true,alphaTest:.001,side:THREE.DoubleSide,forceSinglePass:true});
 material.name='Пологий рельеф Байконура · Mapzen / SRTM';steppeSurface.apply(material);
 const terrain=buildTerrainRelief({dem,material,protection,step:16,baseY:-2.755,
  verticalExaggeration:2.25,baseElevationMetres:68,transitionWidth:320,edgeFadeWidth:480,
  transitionVariation:.3,heightVariation:.28});
 scene.add(terrain.mesh);registerGroundSurface(terrain.mesh);
 const report=terrain.stats;
 return {...terrain,stats:()=>({...report(),protectedSites,airports,textureResolution:[texture.image.width,texture.image.height],
  proceduralColorGenerated:!satelliteOwnsGroundColor,
  sourceUrl:'https://registry.opendata.aws/terrain-tiles/',infrastructureAdapted:true,
  attribution:'Mapzen Terrain Tiles; SRTM data courtesy of the U.S. Geological Survey'})};
}
