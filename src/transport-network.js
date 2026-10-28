import * as THREE from 'three';

/**
 * Baikonur transportation infrastructure / v1
 * Historical-layout-derived network with a naturalized geometry layer.
 * NOT CAD/surveyed. Station tracks and turnouts are museum reconstruction.
 * All route coordinates use the original plan 1300×1045 coordinate plane.
 */
export function buildTransportNetwork({data,point,layers,siteRecords}) {
  const state={
    version:'1.0',stationCount:0,roadRoutes:0,railRoutes:0,railSwitches:0,
    yardTracks:0,facilityDriveways:0,railTies:0,renderedRailLength:0,
    sources:'original Baikonur historical site plan + visually interpreted switches',
    confidence:'schematic-topology'
  };
  const materials={
    asphalt:new THREE.MeshStandardMaterial({color:0x555550,roughness:.96,polygonOffset:true,polygonOffsetFactor:-2}),
    service:new THREE.MeshStandardMaterial({color:0x766d5d,roughness:.98,polygonOffset:true,polygonOffsetFactor:-2}),
    shoulder:new THREE.MeshStandardMaterial({color:0xa69b84,roughness:1,polygonOffset:true,polygonOffsetFactor:-2}),
    asphaltEdge:new THREE.MeshBasicMaterial({color:0xb4a994}),
    gravel:new THREE.MeshStandardMaterial({color:0x786f5e,roughness:1}),
    crushed:new THREE.MeshStandardMaterial({color:0x918675,roughness:1}),
    rail:new THREE.MeshStandardMaterial({color:0x454749,roughness:.55,metalness:.64}),
    railHighlight:new THREE.MeshStandardMaterial({color:0x909390,metalness:.7,roughness:.45}),
    sleepers:new THREE.MeshStandardMaterial({color:0x574d46,roughness:.96}),
    station:new THREE.MeshStandardMaterial({color:0x999992,roughness:.9}),
    stationRoof:new THREE.MeshStandardMaterial({color:0x6f8b8a,roughness:.73,metalness:.16}),
    stationDark:new THREE.MeshStandardMaterial({color:0x35484c,roughness:.69}),
    yellow:new THREE.MeshBasicMaterial({color:0xd0b061}),
    signal:new THREE.MeshStandardMaterial({color:0x536366,metalness:.36,roughness:.64}),
    signalLamp:new THREE.MeshBasicMaterial({color:0xde7c65})
  };
  const routeCurves=new Map(),roadCurves=[],railGroups=[];
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
  function tube(group,samples,offset,radius,material,y,segments=6) {
    if(samples.length<3)return null;
    const pts=samples.map(s=>new THREE.Vector3(
      s.pos.x+s.nx*offset,y,s.pos.z+s.nz*offset
    ));
    const path=new THREE.CatmullRomCurve3(pts,false,'centripetal',.3);
    const obj=new THREE.Mesh(new THREE.TubeGeometry(path,Math.max(24,pts.length),radius,segments,false),material);
    group.add(obj);return obj;
  }
  function centerlineRoad(route) {
    const curve=curveFor(route.points,rootY);
    roadCurves.push({route,curve});
    const samples=baseSamples(curve);
    const main=route.class==='arterial',urban=route.class==='urban';
    const w=main?8.5:urban?7.2:5.2;
    const laneMaterial=main||urban?materials.asphalt:materials.service;
    if(route.id==='r-site23-saturn-access'){
      // The access climbs the Murguduk relief and joins the modelled elevated
      // Saturn service apron. A fixed y=.72 was buried under the hill mesh.
      const site=siteRecords.find(s=>s.id==='pad-23');
      const center=site?point(site.x,site.y,0):null;
      const modelScale=.525;
      function groundAt(sample){
        if(!center)return .8;
        const dx=(sample.pos.x-center.x)/modelScale;
        const dz=(sample.pos.z-center.z)/modelScale;
        const radius=Math.hypot(dx/150,dz/140);
        const v=Math.max(0,Math.min(1,(radius-.68)/.49));
        const fade=1-v*v*(3-2*v);
        const relief=7.8*fade+1.35*Math.sin(Math.min(radius,1)*Math.PI)*fade+
          (Math.sin(dx*.085+dz*.035)+Math.sin(dx*.038-dz*.076))*.22*fade;
        const surface=-2.55+modelScale*(relief-.22);
        return Math.max(.78,surface+.13);
      }
      // Match the arterial at the west end and paved site apron at the east.
      const ramp=sample=>{
        const t=sample.t,blend=Math.min(1,Math.max(0,t/.12));
        const eased=blend*blend*(3-2*blend);
        const height=groundAt(sample);
        const raised=.76*(1-eased)+height*eased;
        // Finish flush with Saturn's western internal road (local y=7.42),
        // rather than ending visibly above it on the hill.
        const apronY=-2.55+.525*(7.42+.23/2);
        const endBlend=Math.max(0,Math.min(1,(t-.78)/.22));
        const endEase=endBlend*endBlend*(3-2*endBlend);
        return raised*(1-endEase)+apronY*endEase;
      };
      ribbon(layers.roads,samples,w+3.1,.05,materials.shoulder,0,s=>ramp(s)-.07);
      ribbon(layers.roads,samples,w,.05,materials.service,0,ramp);
    }else{
      ribbon(layers.roads,samples,w+3.1,.66,materials.shoulder);
      ribbon(layers.roads,samples,w,.72,laneMaterial);
    }
    if(main){tube(layers.roads,samples,0,.10,materials.asphaltEdge,.795,4)}
    state.roadRoutes++;
  }
  function sleeperInstances(group,locations,scale=1) {
    if(!locations.length)return;
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),materials.sleepers,locations.length);
    const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),pos=new THREE.Vector3(),size=new THREE.Vector3(6.1*scale,.19*scale,.74*scale);
    locations.forEach((s,i)=>{
      const yaw=Math.atan2(s.tan.x,s.tan.z);
      rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
      pos.set(s.pos.x,1.04,s.pos.z);
      matrix.compose(pos,rotation,size);mesh.setMatrixAt(i,matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;group.add(mesh);
    state.railTies+=locations.length;
  }
  function renderTrack(id,curve,role,record=true){
    const samples=baseSamples(curve),length=curve.getLength(),offset=1.05;
    ribbon(layers.rails,samples,7.1,.77,materials.gravel);
    ribbon(layers.rails,samples,4.5,.82,materials.crushed);
    // Each railway consists of two physical rails, not one dark tube.
    tube(layers.rails,samples,-offset,.21,materials.rail,1.29);
    tube(layers.rails,samples,offset,.21,materials.rail,1.29);
    tube(layers.rails,samples,-offset,.06,materials.railHighlight,1.50,5);
    tube(layers.rails,samples,offset,.06,materials.railHighlight,1.50,5);
    // Deliberately sparse ties at overview resolution, dense enough on zoom.
    const positions=[],step=role==='yard'?6.2:7.7,stepCount=Math.floor(length/step);
    for(let i=0;i<=stepCount;i++){
      const fraction=wrap(i*step/Math.max(length,.01));const v=curve.getPointAt(fraction),tan=curve.getTangentAt(fraction);
      positions.push({pos:v,tan});
    }
    sleeperInstances(layers.rails,positions);
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
    const post=loc.clone().addScaledVector(normal,11);
    post.y=10.2;
    const mast=new THREE.Mesh(new THREE.CylinderGeometry(.20,.20,16,7),materials.signal);
    mast.position.copy(post);group.add(mast);
    const labelText=yard.label.toUpperCase();
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(12,28,40,.92)';ctx.fillRect(0,0,512,128);
    ctx.strokeStyle='rgba(213,155,115,.95)';ctx.lineWidth=7;ctx.strokeRect(3,3,506,122);
    ctx.fillStyle='#f5ede0';ctx.font='bold 31px Montserrat,Arial,sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(labelText,256,62,480);
    const tx=new THREE.CanvasTexture(canvas);tx.colorSpace=THREE.SRGBColorSpace;
    const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:tx,transparent:true,depthTest:false}));
    sign.position.copy(post);sign.position.y=22;sign.scale.set(47,11.75,1);group.add(sign);
    group.userData={stationName:yard.label,confidence:yard.confidence,stationId:yard.id};
    state.stationCount++;
  }
  function signalAt(curve,t,side=1){
    const pos=curve.getPointAt(wrap(t)),dir=curve.getTangentAt(wrap(t));
    const mag=Math.hypot(dir.x,dir.z)||1,normal=new THREE.Vector3(-dir.z/mag,0,dir.x/mag);
    const group=new THREE.Group();group.position.copy(pos.addScaledVector(normal,side*7));group.position.y=2;
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
      const start=p.clone().addScaledVector(forward,-6).addScaledVector(normal,side*1.06);
      const tip=p.clone().addScaledVector(forward,7).addScaledVector(normal,side*1.06+2.35);
      const middle=p.clone().addScaledVector(forward,1).addScaledVector(normal,side*1.06+.45);
      const c=new THREE.CatmullRomCurve3([start,middle,tip]);
      const pts=baseSamples(c,12);
      tube(layers.rails,pts,0,.16,materials.railHighlight,1.64,5);
    }
    state.railSwitches++;
  }
  for(const road of data.routes.road)centerlineRoad(road);
  for(const rail of data.routes.rail){
    const curve=curveFor(rail.points,1.03);
    renderTrack(rail.id,curve,rail.role);
  }
  for(const yard of data.yards){
    const base=routeCurves.get(yard.railRoute);if(!base)continue;
    const target=point(yard.x,yard.y,1),near=nearestParameter(base,target);
    const length=base.getLength(),span=Math.min(yard.length,length*.56);
    const half=span/(length*2),t0=Math.max(.012,near.t-half),t1=Math.min(.988,near.t+half);
    let shownTracks=0;
    for(let k=1;k<yard.tracks;k++){
      const sign=k%2===1?1:-1,offset=Math.ceil(k/2)*13;
      const path=yardTrack(base,t0,t1,offset,sign);
      renderTrack(yard.id+'-yard-'+k,path,'yard',false);
      turnoutBlade(base,t0+k*.0018);
      turnoutBlade(base,t1-k*.0018);
      state.yardTracks++;shownTracks++;
    }
    stampStation(yard,base,near.t,shownTracks?19:13);
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
  const connected=[];
  for(const site of siteRecords){
    const number=site.number||site.name.match(/№\s*(\d+[А-ЯA-Z]?)/u)?.[1];
    if(!number||!wanted.has(number))continue;
    const target=point(site.x,site.y,1);
    let best=null;
    for(const route of roadCurves){
      const near=nearestParameter(route.curve,target);
      if(!best||near.distance<best.distance)best={...near,route:route.curve};
    }
    if(!best||best.distance>280)continue;
    const outer=best.route.getPointAt(best.t);
    const pivot=outer.clone().lerp(target,.55);
    const routeDirection=best.route.getTangentAt(best.t);
    const sideways=new THREE.Vector3(-routeDirection.z,0,routeDirection.x);
    const shift=Math.min(24,best.distance*.075);
    pivot.addScaledVector(sideways,Math.sin(site.x*.13)*shift);
    const p0=outer.clone(),p3=target.clone().lerp(outer,.05);
    p3.y=.9;
    const cg=new THREE.CatmullRomCurve3([p0,pivot,p3],false,'centripetal',.15);
    const samples=baseSamples(cg,25);
    ribbon(layers.roads,samples,6.4,.81,materials.shoulder);
    ribbon(layers.roads,samples,4.0,.88,materials.service);
    connected.push(number);
    state.facilityDriveways++;
  }
  return {
    stats:()=>({...state,roadRoutes:state.roadRoutes,railRoutes:state.railRoutes,
      siteAccess:connected,stationNames:data.yards.map(s=>s.label)}),
    routes:data.routes,confidence:data.realismNotes
  };
}
