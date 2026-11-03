import * as THREE from 'three';

// The two catalogue labels belong to one OSM compound ("Site 106 & 109").
// This is ONE broad geological rise, not a pair of independent pedestals.
// Coordinates are resolved from the live museum layout, never inferred from
// the original flat catalogue positions or an invented satellite contour.
export const SHARED_SILO_HILL_VERSION='shared-silo-hill-106-109-v1';
export const SHARED_SILO_HILL_PROFILE=Object.freeze({
 siteIds:Object.freeze(['pad-106','pad-109']),
 rise:3.05,
 crestRadius:25,
 shoulderRadius:134,
 sampleStep:4.5
});
const clamp01=n=>Math.min(1,Math.max(0,n));
const smoother=t=>{t=clamp01(t);return t*t*t*(t*(t*6-15)+10);};

export function createSharedSiloHillField(anchors,baseHeightAt,profile=SHARED_SILO_HILL_PROFILE){
 if(!Array.isArray(anchors)||anchors.length!==2||
  anchors.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.z)))
  throw new Error('Shared silo hill needs both site 106 and 109 world anchors');
 if(typeof baseHeightAt!=='function')throw new Error('Shared silo hill needs the existing DEM terrain sampler');
 const [a,b]=anchors,spacing=Math.hypot(b.x-a.x,b.z-a.z);
 if(spacing<1e-5||spacing>260)throw new Error('The shared 106/109 compound must have two nearby distinct sites');
 const dx=(b.x-a.x)/spacing,dz=(b.z-a.z)/spacing;
 const middle={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
 const {crestRadius,shoulderRadius,rise}=profile;
 if(!(crestRadius>12&&shoulderRadius>crestRadius*2&&rise>0))
  throw new Error('Shared silo hill dimensions are invalid');
 // A capsule-shaped spine passes continuously through BOTH sites. All
 // broad-scale asymmetry lives in the shoulders, never under a shaft apron.
 const halfSpine=spacing/2+6;
 const bounds={
  minX:Math.min(a.x,b.x)-shoulderRadius*1.15,
  maxX:Math.max(a.x,b.x)+shoulderRadius*1.15,
  minZ:Math.min(a.z,b.z)-shoulderRadius*1.15,
  maxZ:Math.max(a.z,b.z)+shoulderRadius*1.15
 };
 function offsetAt(x,z){
  const u=(x-middle.x)*dx+(z-middle.z)*dz;
  const v=-(x-middle.x)*dz+(z-middle.z)*dx;
  const d=Math.hypot(Math.max(0,Math.abs(u)-halfSpine),v);
  // No visible concentric contour, sinusoidal ladder or knife-edge perimeter.
  const waviness=1+.055*Math.sin(x/61+Math.sin(z/91)*.6)+
   .04*Math.sin(z/47-x/125)+.018*Math.sin((x+z)/29);
  const outer=shoulderRadius*waviness;
  const t=clamp01((d-crestRadius)/(outer-crestRadius));
  const fade=1-smoother(t);
  const shoulderBreakup=.09*(Math.sin(x/39+z/88)+.42*Math.sin(z/24-x/56))*
   Math.sin(Math.PI*t)**2;
  return Math.max(0,rise*fade+shoulderBreakup);
 }
 function heightAt(x,z){
  return baseHeightAt(x,z)+offsetAt(x,z);
 }
 const heightAtSite=anchors.map(p=>heightAt(p.x,p.z));
 return {anchors:anchors.map(p=>({...p})),center:middle,spacing,bounds,
  profile,offsetAt,heightAt,heightAtSite};
}

// One mesh, one palette, one shared DEM-aligned surface. No visible seam
// between sites, and the satellite image continues across both slopes.
export function buildSharedSiloHill({scene,objects,terrainRelief,steppeSurface,registerGroundSurface}){
 const sites=SHARED_SILO_HILL_PROFILE.siteIds.map(id=>{
  const object=objects.find(item=>item.record.id===id);
  if(!object?.g)throw new Error('Missing shaft for shared Site 106/109 hill: '+id);
  return object;
 });
 sites.forEach(item=>item.g.updateWorldMatrix(true,false));
 const anchors=sites.map(item=>{
  const position=item.g.getWorldPosition(new THREE.Vector3());
  return {x:position.x,z:position.z};
 });
 const field=createSharedSiloHillField(anchors,terrainRelief.heightAt);
 const {bounds,profile}=field,segmentsX=Math.ceil((bounds.maxX-bounds.minX)/profile.sampleStep);
 const segmentsZ=Math.ceil((bounds.maxZ-bounds.minZ)/profile.sampleStep);
 const positions=[],colors=[],indices=[],uv=[];
 for(let iz=0;iz<=segmentsZ;iz++)for(let ix=0;ix<=segmentsX;ix++){
  const x=THREE.MathUtils.lerp(bounds.minX,bounds.maxX,ix/segmentsX);
  const z=THREE.MathUtils.lerp(bounds.minZ,bounds.maxZ,iz/segmentsZ);
  const height=field.heightAt(x,z),offset=field.offsetAt(x,z);
  positions.push(x,height,z);uv.push(ix/segmentsX,1-iz/segmentsZ);
  const flank=1-smoother(offset/.22);
  // Alpha and slope both go to zero continuously at the toe.
  const opacity=smoother(offset/.20);
  const shade=1+(field.offsetAt(x-3,z)-field.offsetAt(x+3,z))*.006*(1-flank);
  colors.push(shade,shade,shade,opacity);
  if(ix<segmentsX&&iz<segmentsZ){
   const a=iz*(segmentsX+1)+ix,b=a+1,c=a+segmentsX+1,d=c+1;
   indices.push(a,c,b,b,c,d);
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 geometry.setIndex(indices);geometry.computeVertexNormals();
 geometry.computeBoundingBox();geometry.computeBoundingSphere();
 // Cloning the regional DEM's soil preserves the photographed world-space
 // palette, colour management, roughness/lighting policy and evening state.
 const material=terrainRelief.mesh.material.clone();
 material.name='Земля · единый пологий холм 106 / 109';
 Object.assign(material,{vertexColors:true,transparent:true,depthWrite:true,
  alphaTest:.002,polygonOffset:true,polygonOffsetFactor:-2,forceSinglePass:true});
 steppeSurface.apply(material);
 const mesh=new THREE.Mesh(geometry,material);
 mesh.name='Единый пологий холм · площадки № 106 и № 109';
 mesh.renderOrder=3.5;mesh.receiveShadow=true;
 mesh.userData={museumComponent:'shared-silo-hill',pickable:false,groundSurface:true,
  siteIds:[...profile.siteIds],profile:{...profile},source:'DEM plus illustrative broad compound mound'};
 scene.add(mesh);
 registerGroundSurface(mesh);
 // Raise only the two museum exhibits. Their horizontal anchors, yaw,
 // opening lids, void controllers and model geometry stay unchanged.
 const siteHeights={};
 sites.forEach((item,i)=>{
  const targetY=field.heightAtSite[i]+.035;
  item.g.position.y=targetY;
  item.g.updateWorldMatrix(true,true);
  item.g.userData.sharedHill={version:SHARED_SILO_HILL_VERSION,
   crestLift:field.offsetAt(anchors[i].x,anchors[i].z),elevation:targetY};
  siteHeights[item.record.id]=targetY;
 });
 return {mesh,heightAt:field.heightAt,offsetAt:field.offsetAt,stats:()=>({
  version:SHARED_SILO_HILL_VERSION,kind:'one-continuous-hill',siteIds:[...profile.siteIds],
  summitLift:profile.rise,crestRadius:profile.crestRadius,shoulderRadius:profile.shoulderRadius,
  spacing:field.spacing,center:field.center,siteHeights:{...siteHeights},
  triangles:geometry.index.count/3,bounds:{...bounds},
  texture:'shared satellite / world XZ',engineeredAccess:'preserved'
 })};
}
