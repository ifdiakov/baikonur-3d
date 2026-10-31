import * as THREE from 'three';

export const BRIDGE_EMBANKMENT_VERSION='road-constrained-embankments-v1';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};
const MAIN=new Set(['motorway','trunk']);
const GROUND_Y=-2.755,INNER=12,OUTER=82,HALF_WIDTH=13;
const softMin=(a,b,k=.14)=>Math.min(a,b)-Math.max(k-Math.abs(a-b),0)**2/(4*k);

/** Independent display profiles extend beyond the short bridge-owned ways.
 * Source OSM nodes and ownership stay unchanged. Every neighbouring rendered
 * road/rail corridor limits the earth below its pavement or ballast. */
export function createBridgeApproachPlan({plan,roadGraph,railGraph}){
  const highway=[],corridors=[];
  for(const [kind,graph] of [['road',roadGraph],['rail',railGraph]])for(const edge of graph.edges){
    if(edge.abandoned)continue;
    const main=kind==='road'&&MAIN.has(edge.tags.highway);
    const points=(edge.surfacePoints||[edge.a.position,edge.b.position]).map(p=>{
      const q=p.clone();
      if(kind==='road'&&!main)q.y=roadGraph.highwaySurfaceHeight?.(q,edge.width)??q.y;
      return plan.local(q);
    });
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];
      if(Math.min(a.x,b.x)>HALF_WIDTH+4||Math.max(a.x,b.x)<-HALF_WIDTH-4||Math.min(a.z,b.z)>OUTER+4||Math.max(a.z,b.z)<-OUTER-4)continue;
      const record={a,b,width:edge.width,kind,wayId:edge.wayId};
      (main?highway:corridors).push(record);
    }
  }
  function roadAt(z){
    let best=null,distance=Infinity;
    for(const e of highway){
      if(z<Math.min(e.a.z,e.b.z)-1e-6||z>Math.max(e.a.z,e.b.z)+1e-6)continue;
      const t=THREE.MathUtils.clamp((z-e.a.z)/(e.b.z-e.a.z||1),0,1),p=e.a.clone().lerp(e.b,t);
      if(Math.abs(p.x)<distance){best=p;distance=Math.abs(p.x);}
    }
    if(!best)throw new Error('No through-highway profile for embankment station '+z);
    return best;
  }
  const ground=GROUND_Y-plan.origin.y;
  function heightAt(x,z){
    const d=Math.abs(z),road=roadAt(z);
    const along=smooth((d-INNER)/(plan.halfLength-INNER))*(1-smooth((d-57)/(OUTER-57)));
    const across=Math.abs(x-road.x),crown=plan.width/2+.2;
    const foot=11.5-1.4*smooth((d-plan.halfLength)/(OUTER-plan.halfLength));
    const cross=1-smooth((across-crown)/(foot-crown));
    let y=ground+(road.y-.14-ground)*along*cross;
    let limit=Infinity;
    for(const e of corridors){
      const dx=e.b.x-e.a.x,dz=e.b.z-e.a.z;
      const t=THREE.MathUtils.clamp(((x-e.a.x)*dx+(z-e.a.z)*dz)/(dx*dx+dz*dz||1),0,1);
      const distance=Math.hypot(x-e.a.x-dx*t,z-e.a.z-dz*t),core=e.width/2+.45;
      if(distance>core+3.4)continue;
      const surface=e.a.y+(e.b.y-e.a.y)*t,clearance=e.kind==='rail'?.35:.18;
      const shoulder=Math.max(0,distance-core);
      limit=Math.min(limit,surface-clearance+shoulder*shoulder*.72);
    }
    if(Number.isFinite(limit))y=softMin(y,limit);
    return Math.max(ground,y);
  }
  return {version:BRIDGE_EMBANKMENT_VERSION,groundY:GROUND_Y,ground,inner:INNER,outer:OUTER,halfWidth:HALF_WIDTH,
    highway,corridors,roadAt,heightAt};
}

/** Two smooth height fields, with a completely open central underpass.
 * Indexed vertices share normals, including the rounded toes. A world-UV
 * texture is attached by the scene once the existing steppe map is ready. */
export function createBridgeEmbankmentGeometry(plan){
  const profile=plan.approachTerrain,positions=[],indices=[],parts=[];
  const xs=[-13,-11.5,-10,-8.5,-7,-6,-5,-4.25,-3.5,-2.8,-2.4,-2,-1.4,-.7,0,.7,1.4,2,2.4,2.8,3.5,4.25,5,6,7,8.5,10,11.5,13];
  for(const sign of [-1,1]){
    const first=positions.length/3,start=indices.length;
    for(let station=profile.inner;station<=profile.outer;station++){
      const z=sign*station;
      for(const x of xs)positions.push(x,profile.heightAt(x,z),z);
    }
    for(let j=0;j<profile.outer-profile.inner;j++)for(let i=0;i<xs.length-1;i++){
      const a=first+j*xs.length+i,b=a+1,c=a+xs.length,d=c+1;
      if(sign>0)indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c);
    }
    parts.push({side:sign,stationRange:sign<0?[-profile.outer,-profile.inner]:[profile.inner,profile.outer],
      abutment:sign*plan.halfLength,start,count:indices.length-start});
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const normals=geometry.attributes.normal,colors=[];
  // Match the museum sun in world space. The plain stays exactly unshaded
  // at each toe; the hills receive enough directional relief to read clearly
  // against the shared, otherwise flat steppe texture in both viewing modes.
  const light=V(-.45,.80,.40).normalize().applyAxisAngle(V(0,1,0),-plan.yaw);
  for(let i=0;i<normals.count;i++){
    const n=V().fromBufferAttribute(normals,i),slope=Math.max(0,1-n.y);
    const shade=1-slope*(.82-.34*n.dot(light));colors.push(shade,shade,shade);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return {geometry,report:{version:profile.version,count:2,groundY:profile.groundY,centralOpenLength:profile.inner*2,
    maximumWidth:profile.halfWidth*2,roadClearance:.18,railClearance:.35,texture:'shared-world-steppe',reliefShading:'directional-earth-slope-v2',
    constrainedCorridors:[...new Set(profile.corridors.map(e=>e.kind+':'+e.wayId))],parts,
    triangles:indices.length/3}};
}
