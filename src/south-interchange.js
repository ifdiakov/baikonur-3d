import * as THREE from 'three';
import {nearestRoadPoint} from './road-layout.js';

// Two separate overpasses in the southern entrance area of the museum plan.
// Deck dimensions and supports are illustrative, not measured bridge drawings.
export function buildSouthInterchange({data,point,layers}){
  const path=r=>new THREE.CatmullRomCurve3(r.points.map(([x,y])=>point(x,y,.72)),false,'centripetal',.3);
  const roadIds=['r-south-west','r-south-east'],railIds=['t-center-west-south','t-center-south-east'];
  const roadWest=data.routes.road.find(r=>r.id===roadIds[0]),roadEast=data.routes.road.find(r=>r.id===roadIds[1]);
  const railWest=data.routes.rail.find(r=>r.id===railIds[0]),railEast=data.routes.rail.find(r=>r.id===railIds[1]);
  const lower=data.routes.road.find(r=>r.id==='r-nw-center');
  if(!roadWest||!roadEast||!railWest||!railEast||!lower)throw Error('Southern interchange needs the existing highway, railway and entrance road');
  const center=point(...roadWest.points[0],0),railCenter=point(...railWest.points[0],0);
  const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const profile=(origin,top,flat,ramp,p)=>top*(1-smooth(flat,ramp,Math.hypot(p.x-origin.x,p.z-origin.z)));
  const roadElevation=(id,p)=>roadIds.includes(id)?profile(center,7.5,39,185,p):0;
  const railElevation=(id,p)=>railIds.includes(id)?profile(railCenter,8.4,33,230,p):0;
  const concrete=new THREE.MeshStandardMaterial({color:0xaaa69b,roughness:.94});
  const darkConcrete=new THREE.MeshStandardMaterial({color:0x8e8d85,roughness:.96});
  const steel=new THREE.MeshStandardMaterial({color:0x64716f,metalness:.48,roughness:.66});
  const zinc=new THREE.MeshStandardMaterial({color:0xa6afad,metalness:.65,roughness:.48});
  const asphalt=new THREE.MeshStandardMaterial({color:0x555550,roughness:.96});
  const earth=new THREE.MeshStandardMaterial({color:0xa69b84,roughness:1});
  const dark=new THREE.MeshBasicMaterial({color:0x5a5a54});
  const roots=[],reports=[];
  function box(parent,w,h,d,x,y,z,mat,name,surface=false){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);
    mesh.name=name;mesh.userData.groundSurface=surface;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function buildBridge(type,origin,direction,length,width,top){
    const parent=new THREE.Group();parent.name=type==='road'?'Южный автомобильный мост':'Южный железнодорожный мост';
    parent.position.copy(origin);parent.rotation.y=-Math.atan2(direction.z,direction.x);
    (type==='rail'?layers.rails:layers.roads).add(parent);roots.push(parent);
    const thickness=type==='road'?1.15:1.35;
    box(parent,length,thickness,width,0,top-thickness/2,0,concrete,'bridge-deck',true);
    for(const side of [-1,1]){
      for(const x of [-length*.34,length*.34]){
        box(parent,3.4,top-thickness-.8,1.5,x,(top-thickness+.8)/2,side*width*.31,darkConcrete,'bridge-pier');
        box(parent,5,.8,3,x,.25,side*width*.31,concrete,'bridge-footing');
      }
      box(parent,length,1.1,.42,0,top-thickness-.25,side*(width/2-.85),type==='rail'?steel:darkConcrete,'bridge-longitudinal-girder');
      // Kerbs, crash barriers and regularly spaced safety posts.
      box(parent,length,.26,.4,0,top+.13,side*(width/2-.2),concrete,'bridge-kerb');
      for(const level of [.67,1.13])box(parent,length,.13,.11,0,top+level,side*(width/2-.28),zinc,'bridge-guardrail');
      for(let x=-length/2;x<=length/2;x+=4.5)box(parent,.12,1.22,.12,x,top+.61,side*(width/2-.28),steel,'bridge-guardrail-post');
    }
    for(const sign of [-1,1]){
      box(parent,3.7,top-.8,width+1.3,sign*(length/2+1.7),(top+.8)/2,0,concrete,'bridge-abutment');
      box(parent,2.2,.34,width,sign*(length/2-.7),top-.17,0,dark,'bridge-expansion-joint');
      box(parent,4.2,.65,width+.7,sign*length*.34,top-thickness-.35,0,concrete,'bridge-pier-cap');
    }
    if(type==='rail')for(let x=-length/2;x<length/2;x+=7.5)
      box(parent,.25,.75,width-1.4,x,top-thickness-.32,0,steel,'rail-bridge-cross-member');
    reports.push({type,center:origin.toArray(),deckTop:top,clearance:top-thickness-.72,length,width});
  }
  const direction=(west,east,origin)=>point(...east.points[1],0).sub(origin).normalize()
    .add(origin.clone().sub(point(...west.points[1],0)).normalize()).normalize();
  const roadDirection=direction(roadWest,roadEast,center),railDirection=direction(railWest,railEast,railCenter);
  const mapOrigin=point(0,0,0),ux=point(1,0,0).x-mapOrigin.x,uz=point(0,1,0).z-mapOrigin.z;
  for(const [west,east,origin,d] of [[roadWest,roadEast,center,roadDirection],[railWest,railEast,railCenter,railDirection]]){
    for(const [route,sign] of [[west,-1],[east,1]]){
      const nodes=[50,110].map(distance=>{
        const p=origin.clone().addScaledVector(d,sign*distance);
        return [(p.x-mapOrigin.x)/ux,(p.z-mapOrigin.z)/uz];
      });
      route.points.splice(1,0,...nodes);
    }
  }
  buildBridge('road',center,roadDirection,72,13.3,.66+7.5);
  buildBridge('rail',railCenter,railDirection,60,6.7,.70+8.4);

  // Approach embankments have open space only beneath the central spans.
  function embankment(route,origin,raise,width,flat){
    const curve=path(route),pos=[],idx=[];
    const n=Math.max(100,Math.ceil(curve.getLength()/4));
    for(let i=0;i<=n;i++){
      const p=curve.getPointAt(i/n),d=curve.getTangentAt(i/n),len=Math.hypot(d.x,d.z)||1;
      const nx=-d.z/len,nz=d.x/len,h=raise(route.id,p),distance=p.distanceTo(new THREE.Vector3(origin.x,.72,origin.z));
      const isRamp=distance>flat&&h>.015;
      const y=isRamp?.66+h:.66,w=width/2;
      for(const side of [-1,1])pos.push(p.x+side*nx*w,y,p.z+side*nz*w,p.x+side*nx*(w+(isRamp?h*1.7:0)),-2.7,p.z+side*nz*(w+(isRamp?h*1.7:0)));
      if(i<n&&isRamp){const k=i*4;idx.push(k,k+4,k+1,k+1,k+4,k+5,k+2,k+3,k+6,k+3,k+7,k+6);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0xa99c83,roughness:1,side:THREE.DoubleSide}));
    mesh.name='bridge-approach-embankment';mesh.userData.groundSurface=true;
    (railIds.includes(route.id)?layers.rails:layers.roads).add(mesh);
  }
  for(const r of [roadWest,roadEast])embankment(r,center,roadElevation,11.6,38);
  for(const r of [railWest,railEast])embankment(r,railCenter,railElevation,4.7,33);

  const ramps=[],trunk=path(lower);
  function strip(samples,width,offset,mat,name){
    const xyz=[],indices=[];
    samples.forEach((s,i)=>{
      for(const side of [-1,1])xyz.push(s.p.x+side*s.nx*width/2,s.p.y+offset,s.p.z+side*s.nz*width/2);
      if(i<samples.length-1){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
    });
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));g.setIndex(indices);g.computeVertexNormals();
    const m=new THREE.Mesh(g,mat);m.name=name;m.userData.groundSurface=true;layers.roads.add(m);
  }
  for(const [route,side] of [[roadWest,-1],[roadEast,1]]){
    const highway=path(route),start=nearestRoadPoint(highway,center.clone().add(new THREE.Vector3(side*135,.72,0))).position;
    start.y=.72+roadElevation(route.id,start);
    const end=nearestRoadPoint(trunk,center.clone().add(new THREE.Vector3(0,.72,-112+side*13))).position;
    const curve=new THREE.CatmullRomCurve3([start,
      start.clone().lerp(end,.38).add(new THREE.Vector3(side*13,0,-30)),
      start.clone().lerp(end,.78).add(new THREE.Vector3(side*10,0,-18)),end],false,'centripetal',.3);
    const samples=Array.from({length:81},(_,i)=>{
      const t=i/80,p=curve.getPointAt(t),d=curve.getTangentAt(t),len=Math.hypot(d.x,d.z)||1;
      p.y=THREE.MathUtils.lerp(start.y,.72,smooth(0,1,t));return {p,nx:-d.z/len,nz:d.x/len};
    });
    strip(samples,7.2,-.06,earth,'interchange-ramp-shoulder');strip(samples,4.6,0,asphalt,'interchange-ramp-pavement');
    ramps.push({id:'south-interchange-ramp-'+side,label:'Съезд южной развязки',width:4.6,points:samples.map(s=>s.p)});
  }
  return {roadElevation,railElevation,ramps,
    isCrossing:p=>Math.hypot(p.x-center.x,p.z-center.z)<28,
    stats:()=>({version:'southern-two-bridges-v1',bridges:reports,ramps:ramps.length,
      source:'User-identified road and railway bridges; placement follows museum schematic; dimensions illustrative'})};
}
