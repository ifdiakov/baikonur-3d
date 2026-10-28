import * as THREE from 'three';
import {RAIL_PROFILE} from './gagarin-rail-approach.js?v=20261028-museum4-v1';
import {buildRoadSurfaces,sampleRoadCurve} from './road-surface.js?v=20261028-museum4-v1';

/**
 * Baikonur transportation infrastructure / v1
 * Historical-layout-derived network with a naturalized geometry layer.
 * NOT CAD/surveyed. Station tracks and turnouts are museum reconstruction.
 * All route coordinates use the original plan 1300×1045 coordinate plane.
 */
export function buildTransportNetwork({data,point,layers,siteRecords,roadElevation=()=>0,railElevation=()=>0,gagarinRail,facilityRails,extraRails=[],extraRoads=[]}) {
  const RAIL_SCALE=RAIL_PROFILE.gauge/2.1;
  const junctions=[...(data.junctions||[])];
  const state={
    version:'2.0',railScale:RAIL_SCALE,railGauge:RAIL_PROFILE.gauge,roadMarkings:'arc-length-paint-with-junction-gaps',markingSegments:0,stationCount:0,roadRoutes:0,railRoutes:0,railSwitches:0,
    yardTracks:0,facilityDriveways:0,railTies:0,renderedRailLength:0,
    sources:'original Baikonur historical site plan + visually interpreted switches',
    confidence:'schematic-topology'
  };
  const materials={
    asphalt:new THREE.MeshStandardMaterial({color:0x555550,roughness:.96,polygonOffset:true,polygonOffsetFactor:-2}),
    service:new THREE.MeshStandardMaterial({color:0x766d5d,roughness:.98,polygonOffset:true,polygonOffsetFactor:-2}),
    shoulder:new THREE.MeshStandardMaterial({color:0xa69b84,roughness:1,polygonOffset:true,polygonOffsetFactor:-2}),
    asphaltEdge:new THREE.MeshBasicMaterial({color:0xd8d4c7,transparent:true,opacity:.8,depthWrite:false}),
    gravel:new THREE.MeshStandardMaterial({color:0x786f5e,roughness:1}),
    crushed:new THREE.MeshStandardMaterial({color:0x988b78,roughness:1}),
    rail:new THREE.MeshStandardMaterial({color:0x3f4242,roughness:.55,metalness:.64}),
    railHighlight:new THREE.MeshStandardMaterial({color:0x909390,metalness:.7,roughness:.45}),
    sleepers:new THREE.MeshStandardMaterial({color:0x766c5c,roughness:.96}),
    station:new THREE.MeshStandardMaterial({color:0x999992,roughness:.9}),
    stationRoof:new THREE.MeshStandardMaterial({color:0x6f8b8a,roughness:.73,metalness:.16}),
    stationDark:new THREE.MeshStandardMaterial({color:0x35484c,roughness:.69}),
    yellow:new THREE.MeshBasicMaterial({color:0xd0b061}),
    signal:new THREE.MeshStandardMaterial({color:0x536366,metalness:.36,roughness:.64}),
    signalLamp:new THREE.MeshBasicMaterial({color:0xde7c65})
  };
  const routeCurves=new Map(),roadCurves=[],roadSurfaces=[],railGroups=[],stationLabels=[];
  const tmp=new THREE.Vector3(),p=new THREE.Vector3(),q=new THREE.Vector3();
  const rootY=.75;
  function curveFor(points,elevation) {
    const pathPoints=points.map(([x,y])=>point(x,y,elevation));
    return new THREE.CatmullRomCurve3(pathPoints,false,'centripetal',.3);
  }
  function wrap(t){return Math.min(1,Math.max(0,t))}
  function baseSamples(curve,segments) {
    const samples=[],N=segments||Math.max(28,Math.ceil(curve.getLength()/13));
    for(let i=0;i<=N;i++){
      let t=i/N,v=curve.getPoint(t),d=curve.getTangent(t);
      const len=Math.hypot(d.x,d.z)||1;
      samples.push({t,pos:v,tan:d,nx:-d.z/len,nz:d.x/len});
    }
    return samples;
  }
  function ribbon(group,samples,width,y,material,edgeOffset=0,elevationAt=null) {
    if(samples.length<2)return null;
    const xyz=[],uv=[],ids=[];
    samples.forEach((s,i)=>{
      const half=width/2;for(const side of [-1,1]){
        xyz.push(s.pos.x+s.nx*(side*half+edgeOffset),elevationAt?elevationAt(s):y,s.pos.z+s.nz*(side*half+edgeOffset));
        uv.push(i/8,side>0?1:0);
      }
      if(i<samples.length-1){const k=i*2;ids.push(k,k+1,k+2,k+1,k+3,k+2)}
    });
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ids);
    g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,material);
    mesh.receiveShadow=true;group.add(mesh);return mesh;
  }
  function tube(group,samples,offset,radius,material,y,segments=6,elevationAt=null) {
    if(samples.length<3)return null;
    const pts=samples.map(s=>new THREE.Vector3(
      s.pos.x+s.nx*offset,elevationAt?elevationAt(s):y,s.pos.z+s.nz*offset
    ));
    const path=new THREE.CatmullRomCurve3(pts,false,'centripetal',.3);
    const obj=new THREE.Mesh(new THREE.TubeGeometry(path,Math.max(24,pts.length),radius,segments,false),material);
    group.add(obj);return obj;
  }
  function roadHeight(route,pos,t,u=t){const base=.72+roadElevation(route.id,pos);if(route.gateHeight===undefined)return base;const curve=roadCurves.find(r=>r.route===route)?.curve;if(!curve)return base;const length=curve.getLength(),remaining=length*(1-u),blend=1-THREE.MathUtils.smoothstep(remaining,0,Math.min(45,length));return THREE.MathUtils.lerp(base,route.gateHeight,blend);}
  function centerlineRoad(route) {
    const curve=curveFor(route.points,rootY);
    roadCurves.push({route,curve,width:route.class==='arterial'?8.5:route.class==='urban'?7.2:5.2});
    const main=route.class==='arterial',urban=route.class==='urban';
    const w=main?8.5:urban?7.2:5.2;
    roadSurfaces.push({id:route.id,curve,width:w,marked:main||urban,heightAt:(pos,t,u)=>roadHeight(route,pos,t,u)});
    if(route.gateWorld&&route.id==='r-site3-kaz-access'){
      const end=curve.getPoint(1),gate=new THREE.Vector3(...route.gateWorld);
      state.kazGateGap=Math.hypot(end.x-gate.x,end.z-gate.z);
    }
    state.roadRoutes++;
  }
  function sleeperInstances(group,locations,scale=RAIL_SCALE) {
    if(!locations.length)return;
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),materials.sleepers,locations.length);
    const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),pos=new THREE.Vector3(),size=new THREE.Vector3(RAIL_PROFILE.sleeperLength,RAIL_PROFILE.sleeperHeight,RAIL_PROFILE.sleeperWidth);
    locations.forEach((s,i)=>{
      const yaw=Math.atan2(s.tan.x,s.tan.z);
      rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
      pos.set(s.pos.x,(s.datum??.75)+RAIL_PROFILE.sleeperY,s.pos.z);
      matrix.compose(pos,rotation,size);mesh.setMatrixAt(i,matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;group.add(mesh);
    state.railTies+=locations.length;
  }
  function renderTrack(id,curve,role,record=true){
    const firstMesh=layers.rails.children.length;
    const isGagarin=id===gagarinRail?.id;
    const samples=baseSamples(curve,Math.max(32,Math.ceil(curve.getLength()/(isGagarin?2.5:8))));
    const length=curve.getLength(),offset=RAIL_PROFILE.gauge/2;
    const custom=facilityRails?.replacements.get(id)||extraRails.find(r=>r.id===id&&r.datum);
    const datum=s=>isGagarin?gagarinRail.datum(s.t):custom?.datum?custom.datum(s.t):.75+railElevation(id,s.pos);
    ribbon(layers.rails,samples,RAIL_PROFILE.ballastWidth*1.12,0,materials.gravel,0,s=>datum(s)+.01);
    ribbon(layers.rails,samples,RAIL_PROFILE.ballastWidth,0,materials.crushed,0,s=>datum(s)+RAIL_PROFILE.ballastY);
    for(const side of [-1,1]){
      ribbon(layers.rails,samples,RAIL_PROFILE.bodyWidth,0,materials.rail,side*offset,s=>datum(s)+RAIL_PROFILE.bodyY);
      tube(layers.rails,samples,side*offset,RAIL_PROFILE.headRadius,materials.rail,0,6,s=>datum(s)+RAIL_PROFILE.headY);
    }
    // Near the pad, sleeper spacing also matches its detailed track exactly.
    // Distant network ties are sampled more sparsely to keep the large map fast.
    const positions=[],step=RAIL_PROFILE.sleeperStep*(isGagarin?1:3),stepCount=Math.floor(length/step);
    for(let i=0;i<=stepCount;i++){
      const fraction=wrap(i*step/Math.max(length,.01)),v=curve.getPointAt(fraction),tan=curve.getTangentAt(fraction);
      const t=curve.getUtoTmapping(fraction);
      positions.push({pos:v,tan,datum:datum({pos:v,t})});
    }
    sleeperInstances(layers.rails,positions);
    for(const mesh of layers.rails.children.slice(firstMesh))mesh.userData.railRoute=id;
    state.renderedRailLength+=length;
    if(record){state.railRoutes++;routeCurves.set(id,curve)}
    railGroups.push({id,role,curve});
  }
  // Find a station's nearest physical trunk so yard ladders genuinely start
  // and end on existing railway lines rather than floating isolated rails.
  function nearestParameter(curve,target){
    let bestT=0,bestD=Number.POSITIVE_INFINITY;
    for(let j=0;j<=350;j++){
      const t=j/350,pt=curve.getPointAt(t);
      const d=pt.distanceToSquared(target);
      if(d<bestD){bestT=t;bestD=d}
    }
    return {t:bestT,distance:Math.sqrt(bestD)};
  }
  function yardTrack(baseCurve,t0,t1,maxOffset,side){
    const pts=[],count=34;
    for(let j=0;j<=count;j++){
      const k=j/count,t=t0+(t1-t0)*k;
      const pos=baseCurve.getPointAt(t),dir=baseCurve.getTangentAt(t);
      const inv=1/Math.max(Math.hypot(dir.x,dir.z),.0001);
      const easing=Math.sin(Math.PI*k)**2,delta=maxOffset*easing*side;
      pts.push(new THREE.Vector3(pos.x-dir.z*inv*delta,1.03,pos.z+dir.x*inv*delta));
    }
    return new THREE.CatmullRomCurve3(pts,false,'centripetal',.2);
  }
  function simpleBuilding(parent,location,direction,w,h,depth,material,tag){
    const ob=new THREE.Mesh(new THREE.BoxGeometry(w,h,depth),material);
    ob.position.copy(location);ob.rotation.y=Math.atan2(direction.x,direction.z);
    ob.userData.museumComponent=tag;ob.receiveShadow=true;
    parent.add(ob);return ob;
  }
  function stampStation(yard,mainCurve,midParameter,trackOffset){
    const pos=mainCurve.getPointAt(midParameter),dir=mainCurve.getTangentAt(midParameter);
    const len=Math.max(.001,Math.hypot(dir.x,dir.z)),normal=new THREE.Vector3(-dir.z/len,0,dir.x/len);
    const loc=pos.clone().addScaledVector(normal,trackOffset+6);
    loc.y=1.2;
    const group=new THREE.Group();layers.rails.add(group);
    const platformLoc=loc.clone();platformLoc.y=.97;
    simpleBuilding(group,platformLoc,dir,6,.75,72,materials.station,'station-platform');
    const house=loc.clone().addScaledVector(normal,6);house.y=4.2;
    simpleBuilding(group,house,dir,10,5.9,18,materials.station,'station-building');
    const roof=house.clone();roof.y=7.35;
    simpleBuilding(group,roof,dir,11.4,.65,19.5,materials.stationRoof,'station-roof');
    for(const sign of [-1,1]){
      const edge=house.clone().addScaledVector(normal,sign*5.5);edge.y=4.8;
      simpleBuilding(group,edge,dir,.35,2,14.5,materials.stationDark,'station-window-strip');
    }
    // Station labels are projected into the HTML overlay, not painted onto
    // terrain-facing sprites. Their typography remains readable at any zoom.
    const anchor=new THREE.Object3D();anchor.position.copy(house);anchor.position.y=1.2;
    group.add(anchor);
    stationLabels.push({id:yard.id,name:yard.label,anchor,group,record:yard});
    group.userData={stationName:yard.label,confidence:yard.confidence,stationId:yard.id};
    state.stationCount++;
  }
  function signalAt(curve,t,side=1){
    const pos=curve.getPointAt(wrap(t)),dir=curve.getTangentAt(wrap(t));
    const mag=Math.hypot(dir.x,dir.z)||1,normal=new THREE.Vector3(-dir.z/mag,0,dir.x/mag);
    const group=new THREE.Group();group.position.copy(pos.addScaledVector(normal,side*7*RAIL_SCALE));group.position.y=1;group.scale.setScalar(RAIL_SCALE);
    layers.rails.add(group);
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,8,7),materials.signal);
    post.position.y=4;group.add(post);
    const head=new THREE.Mesh(new THREE.BoxGeometry(2.2,3.6,1.2),materials.stationDark);
    head.position.y=9;group.add(head);
    for(let j=0;j<2;j++){
      const lamp=new THREE.Mesh(new THREE.CylinderGeometry(.37,.37,.3,12),j===0?materials.signalLamp:materials.yellow);
      lamp.rotation.x=Math.PI/2;lamp.position.set(0,10-j*1.35,.73);group.add(lamp);
    }
  }
  function turnoutBlade(curve,t){
    const p=curve.getPointAt(t),dir=curve.getTangentAt(t),length=Math.hypot(dir.x,dir.z)||1;
    const normal=new THREE.Vector3(-dir.z/length,0,dir.x/length),forward=new THREE.Vector3(dir.x/length,0,dir.z/length);
    // two explicitly distinct point rails and a short lateral closure.
    for(const side of [-1,1]){
      const start=p.clone().addScaledVector(forward,-6).addScaledVector(normal,side*1.06*RAIL_SCALE);
      const tip=p.clone().addScaledVector(forward,7).addScaledVector(normal,side*1.06*RAIL_SCALE+2.35*RAIL_SCALE);
      const middle=p.clone().addScaledVector(forward,1).addScaledVector(normal,side*1.06*RAIL_SCALE+.45*RAIL_SCALE);
      const c=new THREE.CatmullRomCurve3([start,middle,tip]);
      const pts=baseSamples(c,12);
      tube(layers.rails,pts,0,.16*RAIL_SCALE,materials.railHighlight,.82+.82*RAIL_SCALE,5);
    }
    state.railSwitches++;
  }
  for(const road of data.routes.road)centerlineRoad(road);
  for(const rail of data.routes.rail){
    const curve=rail.id===gagarinRail?.id?gagarinRail.curve:facilityRails?.replacements.get(rail.id)?.curve||curveFor(rail.points,.75);
    renderTrack(rail.id,curve,rail.role);
  }
  for(const connection of extraRails)renderTrack(connection.id,connection.curve,'connection',false);
  for(const yard of data.yards){
    const base=routeCurves.get(yard.railRoute);if(!base)continue;
    const target=point(yard.x,yard.y,1),near=nearestParameter(base,target);
    const length=base.getLength(),span=Math.min(yard.length,length*.56);
    const half=span/(length*2),t0=Math.max(.012,near.t-half),t1=Math.min(.988,near.t+half);
    let shownTracks=0;
    for(let k=1;k<yard.tracks;k++){
      const sign=k%2===1?1:-1,offset=Math.ceil(k/2)*13*RAIL_SCALE;
      const path=yardTrack(base,t0,t1,offset,sign);
      renderTrack(yard.id+'-yard-'+k,path,'yard',false);
      turnoutBlade(base,t0+k*.0018);
      turnoutBlade(base,t1-k*.0018);
      state.yardTracks++;shownTracks++;
    }
    stampStation(yard,base,near.t,(shownTracks?19:13)*RAIL_SCALE);
    signalAt(base,t0-.012,1);
    signalAt(base,t1+.012,-1);
  }
  for(const node of data.turnoutPoints){
    const base=routeCurves.get(node.railRoute);if(!base)continue;
    const near=nearestParameter(base,point(node.x,node.y,1));
    turnoutBlade(base,near.t);
  }
  // Schematic service turnouts to known complexes follow the supplied plan
  // and terminate at the facility apron; never create arbitrary town-sized
  // paved roads or fake station names.
  const wanted=new Set(data.facilityDriveways);
  const connected=[],drivewayPaths=[];
  for(const site of siteRecords){
    const number=site.number||site.name.match(/№\s*(\d+[А-ЯA-Z]?)/u)?.[1];
    if(!number||!wanted.has(number))continue;
    const port=data.facilityPorts?.[site.id];
    if(['pad-110','pad-251','pad-31','pad-45','pad-42'].includes(site.id))continue;
    const target=port?new THREE.Vector3(...port.position):point(site.x,site.y,.88);
    let best=null;
    for(const route of roadCurves){
      const near=nearestParameter(route.curve,target);
      if(!best||near.distance<best.distance)best={...near,route:route.curve};
    }
    if(!best||best.distance>280)continue;
    const outer=best.route.getPointAt(best.t);
    const routeDirection=best.route.getTangentAt(best.t).normalize();
    if(routeDirection.dot(target.clone().sub(outer))<0)routeDirection.negate();
    const p0=outer.clone(),p3=target.clone();p0.y=.72;
    const reach=Math.min(32,best.distance*.32),outward=port?new THREE.Vector3(...port.outward):p3.clone().sub(p0).normalize().negate();
    const cg=new THREE.CubicBezierCurve3(p0,p0.clone().addScaledVector(routeDirection,reach),p3.clone().addScaledVector(outward,Math.min(18,reach)),p3);
    const startRaise=roadElevation(roadCurves.find(r=>r.curve===best.route)?.route.id,p0);
    const drivewayHeight=(pos,t)=>THREE.MathUtils.lerp(.72+startRaise,p3.y,t*t*(3-2*t));
    const samples=sampleRoadCurve(cg,{width:4,heightAt:drivewayHeight,shoulder:2.4});
    roadSurfaces.push({id:'driveway-'+number,width:4,samples});
    junctions.push({x:p0.x,z:p0.z});
    drivewayPaths.push({id:'driveway-'+number,label:'Подъезд к пл. №'+number,width:4,
      points:samples.map(s=>s.pos.clone())});
    connected.push(number);
    state.facilityDriveways++;
  }
  // Roads, ramps and the Saturn entrance share a non-overlapping surface.
  // Paint uses the same sampled elevation and leaves all merge mouths open.
  const surfaceReport=buildRoadSurfaces({roads:[...roadSurfaces,...extraRoads],parent:layers.roads,junctions});
  state.markingSegments=surfaceReport.markingSegments;
  state.roadSurface=surfaceReport;
  return {
    roadPaths:()=>[...roadCurves.map(({route,curve,width})=>({id:route.id,
      label:route.id==='r-site3-kaz-access'?'Подъезд к пл. №3':route.id==='r-site75-seven-winds-access'?'Подъезд к пл. №75':'Автодорога',width,
      points:sampleRoadCurve(curve,{width,heightAt:(pos,t,u)=>roadHeight(route,pos,t,u)}).map(s=>s.pos)})),...drivewayPaths],
    stationLabels:()=>stationLabels.map(label=>({...label,world:label.anchor.getWorldPosition(new THREE.Vector3())})),
    stats:()=>({...state,roadRoutes:state.roadRoutes,railRoutes:state.railRoutes,trafficConnections:extraRails.length,
      siteAccess:connected,gatePorts:Object.keys(data.facilityPorts||{}),stationNames:data.yards.map(s=>s.label)}),
    routes:data.routes,confidence:data.realismNotes
  };
}
