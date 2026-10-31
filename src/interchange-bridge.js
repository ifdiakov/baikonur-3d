import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {MUSEUM_METRE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';
import {createLightField} from './light-field.js?v=20261028-site41-v1';
import {createHighwayAsphaltMaterial,HIGHWAY_ASPHALT_COLOR} from './highway-surface.js?v=20261031-highway-lighting-v1';
import {ROAD_LIGHT_STYLES} from './road-lighting.js?v=20261031-highway-lighting-v1';

export const INTERCHANGE_BRIDGE_VERSION='reference-viaduct-v1';
export const INTERCHANGE_BRIDGE_WAY='172422627';
export const INTERCHANGE_BRIDGE_REFERENCE=Object.freeze({
  title:'Bridge Design',author:'3DtechVN',
  url:'https://sketchfab.com/3d-models/bridge-design-6c2d7e65a2e14600bde311a01e1baa27',
  authorUrl:'https://sketchfab.com/ndm.3dtech',
  license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
  adaptation:'Самостоятельная облегчённая геометрия по визуальному референсу; пролёт, опоры и подъезды адаптированы к музейной развязке.'
});

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=THREE.MathUtils.clamp;
const HALF_LENGTH=20,DECK_THICKNESS=.34,ASPHALT_LIFT=.006;

/** The viaduct follows the existing highway in both plan and elevation.
 * No source node, edge, route, rail or traffic datum is changed here. The map
 * compresses long distances, so the visible structure includes the approaches
 * on either side of the short OSM bridge way. Its eastern end stops before the
 * first ramp junction (local Z -22.76). */
export function createInterchangeBridgePlan({roadGraph,railGraph}){
  const way=roadGraph.ways.find(w=>w.osmId===INTERCHANGE_BRIDGE_WAY);
  if(!way)return null;
  const a=way.segments[0].a,b=way.segments.at(-1).b;
  const origin=a.position.clone().lerp(b.position,.5);
  const direction=b.position.clone().sub(a.position).setY(0).normalize();
  const right=V(direction.z,0,-direction.x),yaw=Math.atan2(direction.x,direction.z);
  const ids=new Set([way.osmId]);
  for(const node of [a,b])for(const edge of node.edges)
    if(edge.tags.highway==='trunk')ids.add(edge.wayId);
  const edges=roadGraph.ways.filter(w=>ids.has(w.osmId)).flatMap(w=>w.segments);
  const local=p=>{const d=p.clone().sub(origin);return V(d.dot(right),d.y,d.dot(direction));};
  const world=p=>origin.clone().addScaledVector(right,p.x).addScaledVector(direction,p.z).add(V(0,p.y,0));
  // The road, traffic and architectural deck share the same sampled profile.
  // Source nodes remain authoritative at junctions; interpolation only rounds
  // the spans between them, including the vertical bridge approaches.
  const profile=edges.flatMap(e=>{
    const points=e.surfacePoints||[e.a.position,e.b.position];
    return points.slice(1).map((p,i)=>({a:local(points[i]),b:local(p),wayId:e.wayId}));
  });
  function sample(z){
    const e=profile.find(e=>z>=Math.min(e.a.z,e.b.z)-1e-7&&z<=Math.max(e.a.z,e.b.z)+1e-7);
    if(!e)throw new Error('Bridge approach does not cover station '+z);
    const p=e.a.clone().lerp(e.b,clamp((z-e.a.z)/(e.b.z-e.a.z),0,1));
    const tangent=e.b.clone().sub(e.a);if(tangent.z<0)tangent.negate();tangent.normalize();
    return {p,tangent,normal:V(tangent.z,0,-tangent.x).normalize(),wayId:e.wayId};
  }
  const stations=[-HALF_LENGTH,HALF_LENGTH];
  for(let z=-HALF_LENGTH;z<=HALF_LENGTH;z+=.5)stations.push(z);
  for(const e of profile)for(const p of [e.a,e.b])if(Math.abs(p.z)<HALF_LENGTH)stations.push(p.z);
  stations.sort((a,b)=>a-b);
  const samples=stations.filter((z,i)=>!i||z-stations[i-1]>1e-6).map(sample);
  const width=way.width,totalWidth=width+.95;
  const protectedCorridors=[];
  for(const [kind,graph] of [['road',roadGraph],['rail',railGraph]])for(const source of graph.ways){
    if(ids.has(source.osmId)||source.abandoned)continue;
    for(const edge of source.segments){
      const aa=local(edge.a.position),bb=local(edge.b.position);
      if(Math.max(Math.abs(aa.z),Math.abs(bb.z))<HALF_LENGTH+10&&
        Math.min(Math.abs(aa.x),Math.abs(bb.x))<totalWidth+2&&
        Math.max(aa.y,bb.y)<-2){
        protectedCorridors.push({kind,wayId:source.osmId,width:edge.width,
          a:aa.toArray(),b:bb.toArray()});
      }
    }
  }
  const ownsRoadPoint=(p,wayId,margin=0)=>{
    if(wayId!=null&&!ids.has(String(wayId)))return false;
    const q=local(p);if(Math.abs(q.z)>HALF_LENGTH+margin)return false;
    const at=sample(clamp(q.z,-HALF_LENGTH,HALF_LENGTH));
    return Math.abs(q.x-at.p.x)<width/2+.5&&Math.abs(q.y-at.p.y)<.35;
  };
  return {way,origin,direction,right,yaw,local,world,sample,samples,sourceWayIds:[...ids],
    halfLength:HALF_LENGTH,length:HALF_LENGTH*2,width,totalWidth,deckThickness:DECK_THICKNESS,
    asphaltLift:ASPHALT_LIFT,protectedCorridors,ownsRoadPoint,
    isPoleAllowed(x,z){const q=local(V(x,origin.y,z));return Math.abs(q.z)>HALF_LENGTH+1.5||Math.abs(q.x-sample(clamp(q.z,-HALF_LENGTH,HALF_LENGTH)).p.x)>width/2+1.55;}
  };
}

/** Batched architectural geometry; no downloaded meshes or image textures. */
export function buildInterchangeBridge({parent,plan}){
  if(!plan)return null;
  const root=new THREE.Group();root.name='Южная развязка · бетонный виадук';
  root.position.copy(plan.origin);root.rotation.y=plan.yaw;parent.add(root);
  root.userData.interchangeBridge=true;
  const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.86,...extra});
  const mats={
    concrete:material(0xb5b3aa),shadow:material(0x717875),earth:material(0xa39980),
    steel:material(0x9ca8aa,{roughness:.45,metalness:.72}),
    asphalt:createHighwayAsphaltMaterial(),
    lampMetal:material(ROAD_LIGHT_STYLES.highway.poleColor,{roughness:.52,metalness:.62}),
    white:material(0xf0eee3,{roughness:.72}),yellow:material(0xe2b746,{roughness:.72}),
    lens:material(0xe6f0f5,{emissive:ROAD_LIGHT_STYLES.highway.color,emissiveIntensity:0})
  };
  const buckets=new Map(),supportParts=[],lamps=[];
  function add(geometry,mat,kind='detail',support=false){
    const key=mat==='concrete'&&support?'supports':mat;
    if(!buckets.has(key))buckets.set(key,{material:mats[mat],geometries:[],parts:[],vertices:0});
    const bucket=buckets.get(key),g=geometry.index?geometry.toNonIndexed():geometry;
    if(g!==geometry)geometry.dispose();
    if(g.attributes.uv)g.deleteAttribute('uv');
    bucket.parts.push({kind,start:bucket.vertices,count:g.attributes.position.count});
    bucket.vertices+=g.attributes.position.count;bucket.geometries.push(g);
    if(support){g.computeBoundingBox();supportParts.push({kind,min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()});}
  }
  function box(center,w,h,d,mat,kind,rotation=0,support=false){
    const g=new THREE.BoxGeometry(w,h,d);g.rotateY(rotation);g.translate(center.x,center.y,center.z);add(g,mat,kind,support);
  }
  function rod(a,b,r,mat,kind,sides=6){
    const d=b.clone().sub(a),g=new THREE.CylinderGeometry(r,r,d.length(),sides,1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),d.normalize()));
    const c=a.clone().lerp(b,.5);g.translate(c.x,c.y,c.z);add(g,mat,kind);
  }
  const offset=(at,x,y=0)=>at.p.clone().addScaledVector(at.normal,x).add(V(0,y,0));
  function swept(width,top,bottom,mat,kind,x=0){
    const positions=[],indices=[],points=plan.samples.map(at=>[-1,1].flatMap(side=>{
      const p=offset(at,x+side*width/2);return [p.clone().add(V(0,top,0)),p.clone().add(V(0,bottom,0))];
    }));
    for(const row of points)for(const p of row)positions.push(...p.toArray());
    const quad=(a,b,c,d)=>indices.push(a,b,c,b,d,c);
    for(let i=0;i<points.length-1;i++){
      const k=i*4,n=k+4;
      quad(k,n,k+2,n+2);quad(k+1,k+3,n+1,n+3);
      quad(k+1,n+1,k,n);quad(k+2,n+2,k+3,n+3);
    }
    quad(1,0,3,2);const k=(points.length-1)*4;quad(k,k+1,k+2,k+3);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();add(g,mat,kind);
  }
  function ribbon(width,lift,x,mat,kind){
    const positions=[],indices=[];
    for(const at of plan.samples){
      for(const side of [-1,1])positions.push(...offset(at,x+side*width/2,lift).toArray());
    }
    for(let i=0;i<plan.samples.length-1;i++){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setIndex(indices);g.computeVertexNormals();add(g,mat,kind);
  }
  swept(plan.totalWidth,-.012,-plan.deckThickness,'concrete','deck');
  for(const side of [-1,1])swept(.34,-plan.deckThickness+.02,-plan.deckThickness-.12,'shadow','longitudinal-girder',side*1.22);
  ribbon(plan.width,plan.asphaltLift,0,'asphalt','road-surface');
  for(const side of [-1,1]){
    ribbon(.055,.017,side*.074,'yellow','double-centerline');
    ribbon(.065,.017,side*(plan.width/2-.22),'white','edge-line');
    swept(.16,.12,-.018,'concrete','kerb',side*(plan.totalWidth/2-.12));
    // Thin W-beam crash barriers and a second pedestrian-safety top rail.
    for(const [height,width] of [[.35,.11],[.56,.045]])swept(.047,height+width/2,height-width/2,'steel','guardrail',side*(plan.totalWidth/2-.17));
    for(let z=-plan.halfLength+.22;z<=plan.halfLength-.22;z+=1.05){
      const at=plan.sample(z),p=offset(at,side*(plan.totalWidth/2-.17),.29);
      box(p,.045,.58,.045,'steel','guardrail-post',Math.atan2(at.tangent.x,at.tangent.z));
    }
  }
  function taperedBlock(low,high,lowWidth,lowDepth,topWidth,topDepth,mat,kind,support=false){
    const points=[];
    for(const [p,w,d] of [[low,lowWidth,lowDepth],[high,topWidth,topDepth]])
      for(const [x,z] of [[-1,-1],[1,-1],[1,1],[-1,1]])points.push(p.x+x*w/2,p.y,p.z+z*d/2);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    g.setIndex([0,1,2,0,2,3,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]);g.computeVertexNormals();add(g,mat,kind,support);
  }
  function taperedColumn(at,side,ground,top){
    const low=offset(at,side*.48),high=offset(at,side*1.22);
    low.y=ground;high.y=top;taperedBlock(low,high,.32,.40,.45,.55,'concrete','tapered-pier',true);
  }
  const ground=-2.7-plan.origin.y;
  for(const z of [-14,-6.5,6.5,14]){
    const at=plan.sample(z),yaw=Math.atan2(at.tangent.x,at.tangent.z),capTop=at.p.y-plan.deckThickness-.14,capBottom=capTop-.27;
    box(V(at.p.x,ground+.12,z),2.15,.24,1.05,'concrete','pier-footing',yaw,true);
    for(const side of [-1,1]){
      taperedColumn(at,side,ground+.24,capBottom);
      box(offset(at,side*1.22,-plan.deckThickness-.08),.48,.16,.50,'shadow','bearing');
    }
    box(V(at.p.x,(capTop+capBottom)/2,z),plan.totalWidth-.3,.27,.70,'concrete','pier-cap',yaw,true);
  }
  for(const sign of [-1,1]){
    const at=plan.sample(sign*plan.halfLength),yaw=Math.atan2(at.tangent.x,at.tangent.z);
    const top=at.p.y-plan.deckThickness;
    taperedBlock(V(at.p.x,ground,at.p.z),V(at.p.x,top,at.p.z),plan.totalWidth+.55,.82,plan.totalWidth+.1,.58,'concrete','abutment',true);
    box(V(at.p.x,ground+.12,at.p.z),plan.totalWidth+.7,.24,1.2,'concrete','abutment-footing',yaw,true);
    // Short retaining wings back the abutment, ending before the ramp junction.
    // Their top follows the unchanged approach surface; cars meet no new step.
    for(const side of [-1,1]){
      const far=plan.sample(sign*(plan.halfLength+1.25)),near=plan.sample(sign*(plan.halfLength+.25));
      const low=offset(far,side*(plan.totalWidth/2+.10));low.y=ground+.02;
      const high=offset(near,side*(plan.totalWidth/2-.07));high.y=near.p.y-.14;
      taperedBlock(low,high,.20,1.05,.16,.65,'concrete','wingwall',true);
      const soilLow=offset(far,side*(plan.totalWidth/2+.30));soilLow.y=ground+.01;
      const soilHigh=offset(near,side*(plan.totalWidth/2+.10));soilHigh.y=near.p.y-.32;
      taperedBlock(soilLow,soilHigh,.62,1.15,.26,.60,'earth','approach-shoulder');
    }
    const joint=plan.sample(sign*(plan.halfLength-.42));
    box(joint.p.clone().add(V(0,.015,0)),plan.width,.012,.07,'shadow','expansion-joint',Math.atan2(joint.tangent.x,joint.tangent.z));
  }
  for(let z=-17.5;z<=17.5;z+=5){
    const at=plan.sample(z);
    for(const side of [-1,1]){
      const style=ROAD_LIGHT_STYLES.highway,yaw=Math.atan2(at.tangent.x,at.tangent.z);
      const base=offset(at,side*(plan.totalWidth/2-.29),.13),top=base.clone().add(V(0,style.height,0));
      const pole=new THREE.CylinderGeometry(.035,.055,style.height,8,1);
      pole.translate(base.x,base.y+style.height/2,base.z);add(pole,'lampMetal','lamp-post');
      box(base.clone().add(V(0,.06,0)),.14,.12,.14,'lampMetal','lamp-base',yaw);
      const armCentre=top.clone().addScaledVector(at.normal,-side*style.armReach/2);
      box(armCentre,style.armReach,.065,.075,'lampMetal','lamp-bracket',yaw);
      const head=top.clone().addScaledVector(at.normal,-side*style.armReach);
      box(head,style.headLength,style.headThickness,style.headWidth,'lampMetal','lamp-head',yaw);
      box(head.clone().add(V(0,-style.headThickness/2-.006,0)),style.headLength*.83,.012,style.headWidth*.72,'lens','lamp-lens',yaw);
      // The halo must extend beyond the opaque fixture when viewed from above.
      lamps.push({x:head.x,y:head.y+.055,z:head.z,height:0,size:.78,color:style.color,owner:root,style:'highway',station:z,side});
    }
  }
  let triangles=0,meshCount=0;
  for(const [key,bucket] of buckets){
    const geometry=mergeGeometries(bucket.geometries,false);bucket.geometries.forEach(g=>g.dispose());
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,bucket.material);mesh.name='Виадук · '+key;
    mesh.castShadow=mesh.receiveShadow=true;mesh.userData.bridgeParts=bucket.parts;
    mesh.userData.groundSurface=['concrete','asphalt'].includes(key);
    mesh.userData.bridgeClickable=key!=='earth';
    root.add(mesh);triangles+=geometry.attributes.position.count/3;meshCount++;
  }
  const lights=createLightField(root,lamps,{name:'Виадук · фонари',minPixels:2.1});
  // A single additive sheet follows the exact deck vertices. Unlike flat disc
  // pools it cannot float over the sloping approaches or spill beyond the road.
  const spillGeometry=root.getObjectByName('Виадук · asphalt').geometry.clone();
  const spillPositions=spillGeometry.attributes.position,lightCoordinates=[];
  const spillLift=.018;
  for(let i=0;i<spillPositions.count;i++){
    const x=spillPositions.getX(i),z=spillPositions.getZ(i),at=plan.sample(clamp(z,-plan.halfLength,plan.halfLength));
    const across=V(x,0,z).sub(V(at.p.x,0,at.p.z)).dot(at.normal);
    lightCoordinates.push(across,z);spillPositions.setY(i,spillPositions.getY(i)+spillLift);
  }
  spillGeometry.deleteAttribute('color');
  spillGeometry.setAttribute('bridgeLightCoord',new THREE.Float32BufferAttribute(lightCoordinates,2));
  spillGeometry.computeBoundingBox();spillGeometry.computeBoundingSphere();
  const spillMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{strength:{value:0},tint:{value:new THREE.Color(ROAD_LIGHT_STYLES.highway.color)},halfLength:{value:plan.halfLength}},
    vertexShader:`attribute vec2 bridgeLightCoord;varying vec2 lightCoord;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){lightCoord=bridgeLightCoord;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader:`varying vec2 lightCoord;uniform float strength;uniform vec3 tint;uniform float halfLength;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float row=clamp(floor((lightCoord.y+17.5)/5.+.5),0.,7.);
        float dz=(lightCoord.y-(-17.5+row*5.))/3.2;
        float dx=min(abs(lightCoord.x-.85),abs(lightCoord.x+.85))/1.3;
        float falloff=pow(max(0.,1.-dx*dx-dz*dz),2.);
        float endFade=1.-smoothstep(halfLength-.45,halfLength,abs(lightCoord.y));
        gl_FragColor=vec4(tint,falloff*endFade*.32*strength);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const spill=new THREE.Mesh(spillGeometry,spillMaterial);spill.name='Виадук · свет на полотне';
  spill.renderOrder=6;spill.userData.bridgeClickable=false;spill.userData.bridgeLightSpill=true;root.add(spill);
  const spillTriangles=spillPositions.count/3;triangles+=spillTriangles;meshCount++;
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root);
  // A conservative vertical clearance: include the deepest longitudinal beam
  // across the whole deck, and the rail-head allowance above its source datum.
  let clearance=Infinity;
  for(const corridor of plan.protectedCorridors){
    const a=V(...corridor.a),b=V(...corridor.b),d=b.clone().sub(a).setY(0).normalize(),normal=V(d.z,0,-d.x);
    const n=Math.max(2,Math.ceil(a.distanceTo(b)/.18));
    for(let i=0;i<=n;i++)for(const side of [-1,-.5,0,.5,1]){
      const p=a.clone().lerp(b,i/n).addScaledVector(normal,side*(corridor.width/2+.04));
      if(Math.abs(p.z)>plan.halfLength-.8)continue;
      const upper=plan.sample(p.z).p;
      if(Math.abs(p.x-upper.x)>plan.totalWidth/2-.03)continue;
      clearance=Math.min(clearance,upper.y-plan.deckThickness-.12-p.y-(corridor.kind==='rail'?.16:.025));
    }
  }
  let evening=false;
  const report={version:INTERCHANGE_BRIDGE_VERSION,sourceWayId:INTERCHANGE_BRIDGE_WAY,
    sourceWayIds:plan.sourceWayIds,reference:INTERCHANGE_BRIDGE_REFERENCE,
    sourceCenterLonLat:aLonLat(plan.way),center:plan.origin.toArray(),yaw:plan.yaw,
    forward:plan.direction.toArray(),roadWidth:plan.width,totalWidth:plan.totalWidth,
    length:plan.length,sourceSpanLength:plan.way.segments.reduce((n,e)=>n+e.length,0),
    deckTop:plan.origin.y,deckThickness:plan.deckThickness,asphaltLift:plan.asphaltLift,clearance,
    approachProfile:plan.samples.map(s=>plan.world(s.p).toArray()),
    sourceTopologyPreserved:true,profile:'shared-smooth-highway-profile',physicalDetailMetre:MUSEUM_METRE,
    asphaltColor:'#'+new THREE.Color(HIGHWAY_ASPHALT_COLOR).getHexString(),
    lighting:{style:'modern-led',color:'#'+new THREE.Color(ROAD_LIGHT_STYLES.highway.color).getHexString(),colorTemperature:ROAD_LIGHT_STYLES.highway.colorTemperature,pairs:lamps.length/2,height:ROAD_LIGHT_STYLES.highway.height},
    supportStations:[-14,-6.5,6.5,14],centralClearSpan:12.3,supportParts,
    protectedCorridors:plan.protectedCorridors,lamps:lamps.length,drawCalls:meshCount+1,triangles,
    bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
  root.userData.interchangeBridgeModel=report;
  function setEvening(value){
    evening=!!value;lights.root.visible=evening;lights.setStrength(evening?1:0);
    spill.visible=evening;spillMaterial.uniforms.strength.value=evening?1:0;mats.lens.emissiveIntensity=evening?3.2:0;
  }
  setEvening(false);
  return {root,plan,setEvening,isPoleAllowed:plan.isPoleAllowed,stats:()=>({...report,evening,
    visibleLampGlows:evening?lamps.length:0,
    lightSpill:{type:'conforming-deck-overlay',enabled:evening,drawCalls:1,triangles:spillTriangles,elevationOffset:spillLift}})};
}

function aLonLat(way){
  const a=way.segments[0].a.coord,b=way.segments.at(-1).b.coord;
  return [(a[0]+b[0])/2,(a[1]+b[1])/2];
}
