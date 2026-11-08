import * as THREE from 'three';

// A lightweight, clickable interpretation of the RocketTrip viewing stand.
// Location is owner-directed museum placement along the Site 31 -> Site 1
// corridor, never a claim of a surveyed historic/official viewpoint.
export const SITE31_NP_VERSION='site31-1-observation-v1';
export const SITE31_NP_DISTANCE_METRES=2400;
const METRES_PER_WORLD_UNIT=65/3.4;
const half=(n)=>n*.5;
function flat(v){return new THREE.Vector3(v.x,0,v.z);}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
const copyPoint=p=>Array.isArray(p)?new THREE.Vector3(...p):p.clone();

/** Choose a visible paved road shoulder near the observation radius in the
 * direction of Pad 1. Cached and detailed networks share the same geometry,
 * and this never mutates their tracks, source metadata, or owner road edits.
 */
export function planSite31Observation({launch,reference,roads=[],distanceMetres=SITE31_NP_DISTANCE_METRES}={}){
 if(!launch||!reference)throw Error('Площадки 31 и 1 нужны для размещения НП');
 const pad31=flat(copyPoint(launch)),pad1=flat(copyPoint(reference));
 const direction=pad1.clone().sub(pad31);
 if(direction.lengthSq()<1)throw Error('Площадки 31 и 1 не должны совпадать');
 direction.normalize();
 const radius=distanceMetres/METRES_PER_WORLD_UNIT;
 const intended=pad31.clone().addScaledVector(direction,radius);
 let best=null;
 for(const road of roads){
  const pts=road?.points||[];
  for(let i=1;i<pts.length;i++){
   const a=flat(copyPoint(pts[i-1])),b=flat(copyPoint(pts[i])),v=b.clone().sub(a);
   const len=v.length();if(len<.2)continue;
   // A small deterministic set of samples finds the closest real road
   // without a costly full OSM geometry build or a fake connecting spur.
   const n=Math.min(250,Math.max(1,Math.ceil(len/5)));
   for(let k=0;k<=n;k++){
    const p=a.clone().addScaledVector(v,k/n),d=p.clone().sub(pad31),radial=d.length();
    if(radial<radius*.70||radial>radius*1.30)continue;
    const heading=d.dot(direction)/radial;
    if(heading<.22)continue;
    const offset=Math.abs(radial-radius);
    const deviation=p.distanceTo(intended);
    const score=offset*.7+deviation*.8+(1-heading)*45+
     (road.highway&&road.width>6?25:0);
    if(!best||score<best.score)
     best={score,p,roadId:road.id??'',roadWidth:road.width||3,
      tangent:v.normalize(),distanceFromLaunch:radial,heading,roadY:Number.isFinite(pts[i-1]?.y)?pts[i-1].y:
       Array.isArray(pts[i-1])?pts[i-1][1]:0};
   }
  }
 }
 // Place the stand beside, not on, the asphalt. The alternative is an
 // approximate museum location until a surveyed viewing-point pin is supplied.
 const fallback=best?.p??intended,normal=best
  ?new THREE.Vector3(-best.tangent.z,0,best.tangent.x):new THREE.Vector3(-direction.z,0,direction.x);
 const toPad=pad31.clone().sub(fallback);
 const side=normal.dot(toPad)>0?-1:1,offset=(best?.roadWidth||3)/2+6.0;
 const world=fallback.clone().addScaledVector(normal,side*offset);
 world.y=Number.isFinite(best?.roadY)?best.roadY+.08:.08;
 const heading=pad31.clone().sub(world);
 return {position:world,lookAt:pad31,rotationY:Math.atan2(heading.x,heading.z),
  roadId:best?.roadId||null,connectedToRoad:Boolean(best),nominalDistanceMetres:distanceMetres,
  actualSceneDistance:flat(world).distanceTo(pad31),
  actualDistanceMetres:flat(world).distanceTo(pad31)*METRES_PER_WORLD_UNIT,
  clearanceFromRoad:offset-(best?.roadWidth||3)/2,
  source:'museum-placed-near-existing-road',referenceDirection:'pad-31→pad-1'};
}

const mat=(color,emissive=0)=>new THREE.MeshStandardMaterial({
 color,metalness:color===0x819197?.26:.06,roughness:.8,
 ...(emissive?{emissive:color,emissiveIntensity:emissive}:{})
});
const PALETTE={
 base:mat(0x7b7770),deck:mat(0xc0b7a6),shelter:mat(0x929ea1),
 roof:mat(0xe5d3b0),frame:mat(0x819197),glass:mat(0x2b5163),
 screen:mat(0x162e40),light:mat(0xffd6a2,1.3),mark:mat(0xe6c68c)
};
const VIEW_WIDTH=35*.14,VIEW_LENGTH=50*.14;
function box(parent,name,w,h,d,x,y,z,m){
 const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),PALETTE[m]);o.name=name;
 o.position.set(x,y,z);o.castShadow=false;o.receiveShadow=true;
 o.userData.museumComponent='observation-platform';parent.add(o);return o;
}
function rod(parent,name,from,to,r=.035,material='frame'){
 const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),v=b.clone().sub(a),o=
  new THREE.Mesh(new THREE.CylinderGeometry(r,r,v.length(),6),PALETTE[material]);
 o.position.copy(a.add(b).multiplyScalar(.5));
 o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());
 o.name=name;o.userData.museumComponent='observation-platform';parent.add(o);return o;
}
export function buildSite31Observation({plan}={}){
 if(!plan?.position||!plan?.lookAt)throw Error('Нужно положение НП 31–1');
 const root=new THREE.Group();root.name='НП RocketTrip · направление 31–1';
 root.position.copy(plan.position);root.rotation.y=plan.rotationY;
 root.userData.skipGenericSiteLights=true;
 box(root,'НП · основание',VIEW_WIDTH,.18,VIEW_LENGTH,0,.10,0,'base');
 box(root,'НП · настил',VIEW_WIDTH,.065,VIEW_LENGTH,0,.23,0,'deck');
 const w=half(VIEW_WIDTH)-.09,l=half(VIEW_LENGTH)-.09;
 for(const z of [-l,l]){
  rod(root,'НП · перила',[-w,.91,z],[w,.91,z],.03);
  for(const x of [-w,-w*.33,w*.33,w])rod(root,'НП · стойка перил',[x,.27,z],[x,.91,z],.026);
 }
 for(const x of [-w,w]){
  rod(root,'НП · боковое ограждение',[x,.91,-l],[x,.91,l],.03);
  for(const z of [-l,0,l])rod(root,'НП · боковая стойка',[x,.27,z],[x,.91,z],.025);
 }
 // Two 10×10 m shaded guest shelters, scaled to the surrounding scene.
 for(const side of [-1,1]){
  const sx=side*VIEW_WIDTH*.25,sz=1.7,size=10*.14;
  box(root,'НП · укрытие · основание',size,.11,size,sx,.32,sz,'base');
  for(const dx of [-.58,.58])for(const dz of [-.58,.58])
   rod(root,'НП · стойка укрытия',[sx+dx,.35,sz+dz],[sx+dx,2.25,sz+dz],.045);
  box(root,'НП · крыша укрытия',size+.30,.17,size+.32,sx,2.31,sz,'roof');
  box(root,'НП · скамья',1.05,.12,.27,sx,.52,sz,'shelter');
 }
 // Screen and launch-direction viewing axis, without an invented road.
 box(root,'НП · основание экрана',2.14,.15,.28,0,.45,-2.18,'frame');
 box(root,'НП · экран',2.4,1.42,.16,0,2.06,-2.18,'screen');
 for(const x of [-1.0,1.0])rod(root,'НП · опора экрана',[x,.4,-2.18],[x,2.9,-2.18],.07);
 // Two warm service lamps are modest geometry, not 32 shadow-casting lights.
 for(const x of [-2.05,2.05]){
  rod(root,'НП · стойка светильника',[x,.35,-.85],[x,2.3,-.85],.05);
  box(root,'НП · плафон',.28,.13,.23,x,2.34,-.75,'light');
 }
 box(root,'НП · указатель',1.8,.34,.12,0,1.16,3.23,'mark');
 const geometryCount={meshes:0,triangles:0};
 root.traverse(o=>{if(o.isMesh){geometryCount.meshes++;geometryCount.triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
 root.userData.observationPlatform={version:SITE31_NP_VERSION,
  id:'np-31-1',widthMetres:35,lengthMetres:50,shelters:2,shelterAreaM2:100,
  roadId:plan.roadId,roadConnected:plan.connectedToRoad,
  targetSite:'pad-31',nominalDistanceMetres:plan.nominalDistanceMetres,
  actualDistanceMetres:Math.round(plan.actualDistanceMetres),
  positionBasis:'illustrative-owner-request',geometry:geometryCount};
 return root;
}
