import * as THREE from 'three';

// Museum coordinates: east = +X, north = -Z. Dimensions are illustrative.
// The entry corner was identified by RocketTrip, not inferred from a map.
export const SATURN_ACCESS = Object.freeze({
  revision: 'northwest-natural-hill20-v4', routeId: 'r-site23-saturn-access',
  scale: .525, elevation: 17.45, verticalRaise: 20,
  gate: Object.freeze({x: -96, y: 7.59, z: -79}),
  internalJoin: Object.freeze({x: -92, y: 7.59, z: -29})
});
const smooth = (a,b,v) => {
  const t=Math.max(0,Math.min(1,(v-a)/(b-a)));
  return t*t*(3-2*t);
};

export function saturnTerrainSample(x,z) {
  // Keep the proven compact outer boundary clear of primary/trunk roads.
  // Only the interior profile changes: a smaller irregular summit gives the
  // slopes more room without spreading the hill toward either arterial.
  const angle=Math.atan2(z,x);
  const outline=1+.045*Math.sin(3*angle+.45)+.025*Math.cos(5*angle-.8);
  const cos=Math.cos(angle),sin=Math.sin(angle);
  // This rounded footprint still encloses the whole fence (-104..104,
  // -79..75), the northwest gate and every fixed building/light base. It
  // avoids the oversized, perfectly elliptical flat table of the old hill.
  const summit=1+.012*Math.sin(2*angle+.6)+.008*Math.sin(3*angle-1.1);
  const inner=summit/Math.pow((Math.abs(cos)/126)**4+(Math.abs(sin)/100)**4,.25);
  const outer=outline/Math.hypot(cos/235,sin/190);
  const t=THREE.MathUtils.clamp((Math.hypot(x,z)-inner)/(outer-inner),0,1);
  // Broad uneven shoulders lead into a longer, zero-curvature foot. The
  // integrated cosine ramps have no sharp shoulder/rim, and their maximum
  // fall is gentler than a narrow smoothstep ring around a large plateau.
  const warped=t+(.04*Math.sin(2*angle+.4)+.02*Math.sin(5*angle-1))*t*(1-t);
  const shoulder=.18,foot=.35,area=1-(shoulder+foot)/2;
  const ramp=(v,width)=>(v-width/Math.PI*Math.sin(Math.PI*v/width))/2;
  const drop=warped<shoulder?ramp(warped,shoulder):
    warped>1-foot?area-ramp(1-warped,foot):warped-shoulder/2;
  const fade=1-drop/area;
  const base=-SATURN_ACCESS.verticalRaise/SATURN_ACCESS.scale-.22;
  // Low, non-concentric undulations vanish smoothly at both the summit and
  // outer edge. They do not alter the approved 20-unit lift or level yard.
  const relief=(Math.sin(x*.023+z*.011)+.55*Math.sin(x*.013-z*.031))*.8*Math.sin(Math.PI*t)**4;
  // Retain level ground beneath the antennas, buildings and northwest gate.
  const height=base+(7.25-base)*fade+relief;
  return {height,opacity:1-smooth(.60,1,t)};
}
export const saturnTerrainHeight=(x,z)=>saturnTerrainSample(x,z).height;

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
  strip(root,sections,()=>7,()=>gate.y,pavementMaterial(0x555550),'northwest-gate-pavement',5);
  return {entryCorner:'north-west',gateLocal:{...gate},internalJoinLocal:{...internalJoin},revision:SATURN_ACCESS.revision};
}
