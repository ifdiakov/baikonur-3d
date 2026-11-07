import * as THREE from 'three';

// Museum coordinates: east = +X, north = -Z. Dimensions are illustrative.
// The entry corner was identified by RocketTrip, not inferred from a map.
export const SATURN_ACCESS = Object.freeze({
  revision: 'northwest-asymmetric-hill20-v5', routeId: 'r-site23-saturn-access',
  scale: .525, elevation: 17.45, verticalRaise: 20,
  gate: Object.freeze({x: -96, y: 7.59, z: -79}),
  internalJoin: Object.freeze({x: -92, y: 7.59, z: -29})
});
export const SATURN_TERRAIN_BOUNDS=Object.freeze({minX:-280,maxX:640,minZ:-650,maxZ:270});
export const SATURN_TERRAIN_SEGMENTS=184;
const terrainBase=-SATURN_ACCESS.verticalRaise/SATURN_ACCESS.scale-.22;
const smooth = (a,b,v) => {
  const t=Math.max(0,Math.min(1,(v-a)/(b-a)));
  return t*t*t*(t*(t*6-15)+10);
};

// The north/east shoulders have room to spread, whereas the western primary
// road and southeastern trunk need a compact foot. An inverse-power blend of
// the radial limits rounds their joins while staying inside both road limits.
export function saturnTerrainOuterRadius(angle){
  const cos=Math.cos(angle),sin=Math.sin(angle);
  const ellipse=1/Math.hypot(cos/600,sin/560);
  const west=Math.max(0,-cos)/250,southeast=Math.max(0,.297*cos+.955*sin)/198;
  return (ellipse**-8+west**8+southeast**8)**(-1/8);
}

export function saturnTerrainFootprint(segments=128){
  if(!Number.isInteger(segments)||segments<12||segments>4096)throw new Error('Saturn footprint needs 12–4096 samples');
  return Array.from({length:segments},(_,i)=>{
    const angle=i*Math.PI*2/segments,radius=saturnTerrainOuterRadius(angle);
    return {x:Math.cos(angle)*radius,z:Math.sin(angle)*radius};
  });
}

export function saturnTerrainSample(x,z) {
  // The original level yard remains inside the same summit envelope. Only
  // its slopes and the broad, asymmetric transition into the steppe change.
  const angle=Math.atan2(z,x);
  const cos=Math.cos(angle),sin=Math.sin(angle);
  // This rounded footprint still encloses the whole fence (-104..104,
  // -79..75), the northwest gate and every fixed building/light base. It
  // avoids the oversized, perfectly elliptical flat table of the old hill.
  const summit=1+.012*Math.sin(2*angle+.6)+.008*Math.sin(3*angle-1.1);
  const inner=summit/Math.pow((Math.abs(cos)/126)**4+(Math.abs(sin)/100)**4,.25);
  const outer=saturnTerrainOuterRadius(angle);
  const t=THREE.MathUtils.clamp((Math.hypot(x,z)-inner)/(outer-inner),0,1);
  // Broad uneven shoulders lead into a longer, zero-curvature foot. The
  // integrated cosine ramps have no sharp shoulder/rim, and their maximum
  // fall is gentler than a narrow smoothstep ring around a large plateau.
  const warped=t+(.035*Math.sin(2*angle+.4)+.015*Math.sin(3*angle-1))*t*(1-t);
  const shoulder=.10,foot=.22,area=1-(shoulder+foot)/2;
  const ramp=(v,width)=>(v-width/Math.PI*Math.sin(Math.PI*v/width))/2;
  const drop=warped<shoulder?ramp(warped,shoulder):
    warped>1-foot?area-ramp(1-warped,foot):warped-shoulder/2;
  const fade=1-drop/area;
  // Low, non-concentric undulations vanish smoothly at both the summit and
  // outer edge. They do not alter the approved 20-unit lift or level yard.
  const relief=(Math.sin(x*.013+z*.008)+.55*Math.sin(x*.009-z*.018))*.6*Math.sin(Math.PI*t)**4;
  // Retain level ground beneath the antennas, buildings and northwest gate.
  const height=terrainBase+(7.25-terrainBase)*fade+relief;
  // A tall translucent slope revealed the underlying flat tint as a false
  // contour. Blend only the very bottom of the physical foot instead.
  return {height,opacity:smooth(0,.6,height-terrainBase)};
}
export const saturnTerrainHeight=(x,z)=>saturnTerrainSample(x,z).height;

let meshHeights;
function terrainMeshHeights(){
  if(meshHeights)return meshHeights;
  const {minX,maxX,minZ,maxZ}=SATURN_TERRAIN_BOUNDS,N=SATURN_TERRAIN_SEGMENTS,stride=N+1;
  const stepX=(maxX-minX)/N,stepZ=(maxZ-minZ)/N;
  meshHeights=new Float32Array(stride*stride);
  for(let z=0;z<=N;z++)for(let x=0;x<=N;x++)meshHeights[z*stride+x]=saturnTerrainHeight(minX+x*stepX,minZ+z*stepZ);
  return meshHeights;
}

// Use the same Float32 heights and the same cell diagonal as groundPatch().
// Camera and road clearance must follow triangles, not a bilinear surface.
export function saturnTerrainMeshHeight(x,z){
  const {minX,maxX,minZ,maxZ}=SATURN_TERRAIN_BOUNDS,N=SATURN_TERRAIN_SEGMENTS;
  if(!Number.isFinite(x)||!Number.isFinite(z)||x<minX||x>maxX||z<minZ||z>maxZ)return terrainBase;
  const stepX=(maxX-minX)/N,stepZ=(maxZ-minZ)/N;
  const ix=Math.min(N-1,Math.floor((x-minX)/stepX)),iz=Math.min(N-1,Math.floor((z-minZ)/stepZ));
  const u=THREE.MathUtils.clamp((x-minX-ix*stepX)/stepX,0,1),v=THREE.MathUtils.clamp((z-minZ-iz*stepZ)/stepZ,0,1);
  const heights=terrainMeshHeights(),stride=N+1,a=iz*stride+ix,b=a+1,c=a+stride,d=c+1;
  return u+v<=1?heights[a]*(1-u-v)+heights[b]*u+heights[c]*v:
    heights[b]*(1-v)+heights[c]*(1-u)+heights[d]*(u+v-1);
}

function curve(points) {
  return new THREE.CatmullRomCurve3(points,false,'centripetal',.3);
}
function pavementMaterial(color) {
  return new THREE.MeshStandardMaterial({color,roughness:1,
    side:THREE.DoubleSide,transparent:false,depthWrite:true});
}
// Cross-sections are sampled by arc length. All vertices receive finite
// heights, and the two strips share the exact same centerline and endpoint.
function strip(parent,sections,widthFn,heightFn,material,name,order) {
  const pos=[],uv=[],indices=[];
  for(let i=0;i<sections.length;i++) {
    const s=sections[i],half=widthFn(s)/2,y=heightFn(s);
    for(const side of [-1,1]) {
      pos.push(s.p.x+side*s.nx*half,y,s.p.z+side*s.nz*half);
      uv.push(side<0?0:1,s.t*20);
    }
    if(i<sections.length-1){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;
  mesh.userData.museumComponent=name;mesh.renderOrder=order;
  mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function sectionsFor(path,count) {
  return Array.from({length:count+1},(_,i)=>{
    const t=i/count,p=path.getPointAt(t),d=path.getTangentAt(t);
    const len=Math.hypot(d.x,d.z)||1;
    return {t,p,nx:-d.z/len,nz:d.x/len};
  });
}

export function addSaturnNorthwestGate(root) {
  const {gate,internalJoin}=SATURN_ACCESS;
  const path=curve([
    new THREE.Vector3(gate.x,gate.y,gate.z),
    new THREE.Vector3(-96,gate.y,-63),
    new THREE.Vector3(-92,gate.y,-48),
    new THREE.Vector3(internalJoin.x,internalJoin.y,internalJoin.z)
  ]);
  const sections=sectionsFor(path,40);
  strip(root,sections,()=>9,()=>gate.y-.12,pavementMaterial(0x9b917e),'northwest-gate-shoulder',4);
  strip(root,sections,()=>7,()=>gate.y,pavementMaterial(0x555751),'northwest-gate-pavement',5);
  return {entryCorner:'north-west',gateLocal:{...gate},internalJoinLocal:{...internalJoin},revision:SATURN_ACCESS.revision};
}
