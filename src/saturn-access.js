import * as THREE from 'three';

// Museum coordinates: east = +X, north = -Z. Dimensions are illustrative.
// The entry corner was identified by RocketTrip, not inferred from a map.
export const SATURN_ACCESS = Object.freeze({
  revision: 'northwest-hill20-v2', routeId: 'r-site23-saturn-access',
  mainRoadId: 'r-nw-center', scale: .525, elevation: 17.45, verticalRaise: 20,
  gate: Object.freeze({x: -96, y: 7.59, z: -79}),
  internalJoin: Object.freeze({x: -92, y: 7.59, z: -29})
});
const smooth = (a,b,v) => {
  const t=Math.max(0,Math.min(1,(v-a)/(b-a)));
  return t*t*(3-2*t);
};

export function saturnTerrainSample(x,z) {
  // Broad, slightly asymmetric foothills; no circular cone or raised slab.
  // The zero-slope outer edge fades into the existing steppe at its old height.
  const angle=Math.atan2(z,x);
  const outline=1+.045*Math.sin(3*angle+.45)+.025*Math.cos(5*angle-.8);
  const cos=Math.cos(angle),sin=Math.sin(angle);
  const inner=1/Math.hypot(cos/155,sin/125);
  const outer=1.16*outline/Math.hypot(cos/330,sin/385);
  const t=THREE.MathUtils.clamp((Math.hypot(x,z)-inner)/(outer-inner),0,1);
  const fade=1-smooth(0,1,t);
  const base=-SATURN_ACCESS.verticalRaise/SATURN_ACCESS.scale-.22;
  const relief=(Math.sin(x*.014+z*.009)+.55*Math.sin(x*.008-z*.017))*.65*fade*(1-fade);
  // Retain level ground beneath the antennas, buildings and northwest gate.
  const height=base+(7.25-base)*fade+relief;
  return {height,opacity:1-smooth(.86,1,t)};
}
export const saturnTerrainHeight=(x,z)=>saturnTerrainSample(x,z).height;

function curve(points) {
  return new THREE.CatmullRomCurve3(points,false,'centripetal',.3);
}
function closestPoint(path,target) {
  let best=0,bestDistance=Infinity;
  for(let i=0;i<=600;i++) {
    const t=i/600,d=path.getPoint(t).distanceToSquared(target);
    if(d<bestDistance){best=t;bestDistance=d;}
  }
  let lo=Math.max(0,best-1/600),hi=Math.min(1,best+1/600);
  for(let i=0;i<35;i++) {
    const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;
    if(path.getPoint(a).distanceToSquared(target)<path.getPoint(b).distanceToSquared(target))hi=b;
    else lo=a;
  }
  const t=(lo+hi)/2;
  return {t,point:path.getPoint(t)};
}
function pavementMaterial(color) {
  return new THREE.MeshStandardMaterial({color,roughness:1,
    side:THREE.DoubleSide,transparent:true,opacity:1,depthWrite:true});
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

export function buildSaturnNorthwestAccess({data,point,layers,siteRecords}) {
  const site=siteRecords.find(s=>s.id==='pad-23');
  const arterial=data.routes.road.find(r=>r.id===SATURN_ACCESS.mainRoadId);
  if(!site||!arterial)throw new Error('Saturn northwest access requires Site 23 and the main road');
  const {scale,elevation,gate}=SATURN_ACCESS;
  const center=point(site.x,site.y,0);
  const world=(x,z,y=0)=>new THREE.Vector3(center.x+x*scale,y,center.z+z*scale);
  // Snap to the same spline used by the actual rendered arterial, not x=680.
  const trunk=curve(arterial.points.map(([x,y])=>point(x,y,.72)));
  const snapped=closestPoint(trunk,world(-410,-190,.72));
  const nodes=[snapped.point,
    world(-330,-210),world(-245,-205),world(-172,-150),
    world(-118,-122),world(-96,-95),world(gate.x,gate.z)];
  const path=curve(nodes);
  const count=Math.max(160,Math.ceil(path.getLength()/1.5));
  const sections=sectionsFor(path,count);
  const ground=(x,z)=>elevation+scale*saturnTerrainHeight((x-center.x)/scale,(z-center.z)/scale);
  const gateY=elevation+scale*gate.y;
  let minClearance=Infinity;
  for(const s of sections) {
    const blend=smooth(.80,1,s.t);
    s.width=THREE.MathUtils.lerp(5.2,7*scale,blend);
    s.shoulderWidth=s.width+THREE.MathUtils.lerp(3.1,2*scale,blend);
    const half=s.shoulderWidth/2;
    const highest=Math.max(ground(s.p.x,s.p.z),
      ground(s.p.x-half*s.nx,s.p.z-half*s.nz),
      ground(s.p.x+half*s.nx,s.p.z+half*s.nz));
    s.y=Math.max(.72,highest+THREE.MathUtils.lerp(.34,gateY-ground(s.p.x,s.p.z),blend));
    if(s.t===0)s.y=.72;
    if(s.t===1)s.y=gateY;
    minClearance=Math.min(minClearance,s.y-highest);
  }
  const group=new THREE.Group();group.name='Сатурн · северо-западный подъезд';layers.roads.add(group);
  strip(group,sections,s=>s.shoulderWidth,s=>s.y-.06,pavementMaterial(0xa69b84),'saturn-northwest-road-shoulder',4);
  strip(group,sections,s=>s.width,s=>s.y,pavementMaterial(0x555550),'saturn-northwest-access-road',5);
  // Low embankment sides meet the sampled mountain; no suspended black tube.
  const edges=[],faces=[];
  for(const side of [-1,1]) {
    const offset=edges.length/3;
    for(const s of sections){
      const x=s.p.x+side*s.nx*s.shoulderWidth/2,z=s.p.z+side*s.nz*s.shoulderWidth/2;
      edges.push(x,s.y-.07,z,x,Math.min(s.y-.07,ground(x,z)),z);
    }
    for(let i=0;i<sections.length-1;i++){const k=offset+i*2;faces.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  const fillGeometry=new THREE.BufferGeometry();
  fillGeometry.setAttribute('position',new THREE.Float32BufferAttribute(edges,3));
  fillGeometry.setIndex(faces);fillGeometry.computeVertexNormals();
  const fill=new THREE.Mesh(fillGeometry,pavementMaterial(0x9b917e));
  fill.name='saturn-northwest-road-embankment';fill.renderOrder=4;group.add(fill);
  const xUnit=point(site.x+1,site.y,0).x-center.x;
  const zUnit=point(site.x,site.y+1,0).z-center.z;
  const route={id:SATURN_ACCESS.routeId,class:'service',
    points:nodes.map(v=>[site.x+(v.x-center.x)/xUnit,site.y+(v.z-center.z)/zUnit]),
    confidence:'northwest entrance identified by user; intervening road is museum reconstruction',
    entryCorner:'north-west',revision:SATURN_ACCESS.revision};
  const report={revision:SATURN_ACCESS.revision,entryCorner:'north-west',
    gateLocal:{...gate},gateWorld:[center.x+gate.x*scale,gateY,center.z+gate.z*scale],
    gateMap:route.points.at(-1),junctionWorld:snapped.point.toArray(),
    junctionParameter:snapped.t,junctionError:0,gateError:0,
    minTerrainClearance:minClearance,sectionCount:sections.length,routeId:route.id};
  group.userData.saturnAccess=report;
  return {route,report,group,lampPath:{id:route.id,label:'Подъезд к «Сатурну»',width:5.2,
    points:sections.map(s=>new THREE.Vector3(s.p.x,s.y,s.p.z))}};
}
