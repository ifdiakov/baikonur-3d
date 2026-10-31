import * as THREE from 'three';
import {registerFacilityFloodlights,registerFacilityBeacon} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';
import {createSurfacePalette} from './surface-materials.js';
import {MUSEUM_METRE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';
import {RAIL_PROFILE} from './gagarin-rail-approach.js?v=20261031-facilities-rails-lighting-v1';
import {GAGARIN_LEGACY_METRE,GAGARIN_LEGACY_RIM_Y,GAGARIN_RIM_Y,GAGARIN_RAIL_PORT,GAGARIN_PHYSICAL_RAIL_GAUGE,GAGARIN_ROCKET_MOUNT} from './gagarin-metric-profile.js?v=20261031-facilities-rails-lighting-v1';
export {GAGARIN_RIM_Y,GAGARIN_RAIL_PORT,GAGARIN_ROCKET_MOUNT} from './gagarin-metric-profile.js?v=20261031-facilities-rails-lighting-v1';

/**
 * GAGARIN'S START — SITE 1, launch position 5
 * PHOTO-GROUNDED MUSEUM STUDY v3.2, not engineering drawings.
 * v3.1: real coaxial openings through all service decks and crown.
 * v3.2: eastern duct plan traced from owner screenshot 2026-10-27 20:41:25.
 *
 * Primary user references: IMG_5826 (whole tower), IMG_8447
 * (elevated concrete bridge, gallery, stairs, undercroft), IMG_4933/4948
 * (underside of the exhaust throat), overhead 2026-10-27 17:49 and 16:18
 * (rail approach and widening eastern duct). 18 photographs are linked
 * from the site's source catalog in Google Drive.
 *
 * Local coordinate frame:
 *  +Z = incoming rail / west
 *  -Z = widening flame duct / east
 *  Y = physical elevation in metres, terrain at y=0.
 * The retained construction below uses old drawing coordinates (rim18.1)
 * inside one uniformly converted subgroup; the public root uses metres.
 * Parent rotation -PI/2 maps local -Z to global +X (east).
 * Schematized positions/sizes; do not treat as a surveyed facility.
 */

// GAGARIN_GROUND_DATUM: the rim is terrain level; the channel stays below it.
export function buildGagarinPad(root) {
  const metricRoot=root,legacyRoot=new THREE.Group();
  legacyRoot.name='Гагаринский старт · фотографическая архитектура в метрах';
  legacyRoot.userData.metricArchitecture='gagarin';
  legacyRoot.scale.setScalar(GAGARIN_LEGACY_METRE);
  legacyRoot.position.y=-GAGARIN_LEGACY_RIM_Y*GAGARIN_LEGACY_METRE;
  metricRoot.add(legacyRoot);root=legacyRoot;
  root.name='Пл. 1 — Гагаринский старт / Метрическая фотографическая реконструкция';
  const colors={
    concrete:0x9d9c94, oldConcrete:0x817f76, paleConcrete:0xc0b9ac,
    cutFace:0x756e64, soot:0x44403a, duct:0x4e473e,
    soil:0x988b78, asphalt:0x77746d, rust:0x924e37,
    green:0x426e57, brightGreen:0x659078, olive:0x324b3b,
    steel:0x4b5e56, shadowSteel:0x2f3d37,
    paleSteel:0xa3b5ad, white:0xd1d2c8,
    yellow:0xd3b04d, fadedYellow:0xa98539, warning:0xc66843,
    rail:0x3f4242, timber:0x766c5c, window:0x344852,
    blueRoof:0x698c97, grass:0x777d65, sky:0xa3a7a3
  };
  const mats=createSurfacePalette(root,colors,{
    concrete:'concrete',oldConcrete:'concrete',paleConcrete:'concrete',
    cutFace:'concrete',soot:'concrete',duct:'concrete',rust:'rust',
    green:'paint',brightGreen:'paint',olive:'paint',steel:'metal',shadowSteel:'metal',
    paleSteel:'sheet',white:'paint',yellow:'paint',fadedYellow:'paint',rail:'metal',blueRoof:'sheet'
  },{window:{roughness:.3}});
  // Repeating beams, stairs and concrete blocks are instanced for good WebGL speed.
  const rodGeometry=new THREE.CylinderGeometry(1,1,1,6,1);
  const boxGeometry=new THREE.BoxGeometry(1,1,1);
  const buckets=new Map(),features={};
  let primitiveCount=0,renderMeshCount=0;
  const tmpP=new THREE.Vector3(),tmpQ=new THREE.Vector3(),tmpMid=new THREE.Vector3();
  const tmpQuat=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),tmpS=new THREE.Vector3(),tmpM=new THREE.Matrix4();
  const V=(...coords)=>new THREE.Vector3(...coords);
  function bucket(mat,kind) {
    const key=mat+':'+kind;
    let item=buckets.get(key);
    if(!item){item={material:mats[mat],kind,matrices:[]};buckets.set(key,item)}
    return item;
  }
  function mark(name){if(name)features[name]=(features[name]||0)+1;primitiveCount++}
  const atGrade=new Set(['western-forecourt','ballast-bed','rail-approach','rail-sleepers','service-road','duct-perimeter-road','lighting-tower','lighting-tower-bracing','lighting-array-head','floodlight-array','lightning-mast','lightning-mast-tip','utility-building','utility-roof','utility-door','utility-window']);
  function block(x,y,z,w,h,d,material,name,rotate=0) {
    if(atGrade.has(name))y+=GAGARIN_LEGACY_RIM_Y;
    tmpQuat.setFromAxisAngle(up,rotate);tmpS.set(w,h,d);
    tmpM.compose(tmpP.set(x,y,z),tmpQuat,tmpS);
    bucket(material,'box').matrices.push(tmpM.clone());mark(name);
  }
  function bar(a,b,r,material,name){
    if(atGrade.has(name)){a=[a[0],a[1]+GAGARIN_LEGACY_RIM_Y,a[2]];b=[b[0],b[1]+GAGARIN_LEGACY_RIM_Y,b[2]];}
    tmpP.set(a[0],a[1],a[2]);tmpQ.set(b[0],b[1],b[2]);
    const dir=tmpQ.clone().sub(tmpP),dist=dir.length();
    if(dist<.001)return;
    tmpQuat.setFromUnitVectors(up,dir.multiplyScalar(1/dist));
    tmpS.set(r,dist,r);tmpMid.copy(tmpP).add(tmpQ).multiplyScalar(.5);
    tmpM.compose(tmpMid,tmpQuat,tmpS);
    bucket(material,'rod').matrices.push(tmpM.clone());mark(name);
  }
  function direct(mesh,material,key,parent=root) {
    mesh.material=mats[material];mesh.userData.museumComponent=key;
    if(atGrade.has(key))mesh.position.y+=GAGARIN_LEGACY_RIM_Y;
    mesh.receiveShadow=true;parent.add(mesh);mark(key);renderMeshCount++;return mesh;
  }
  function surface(points,y,material,key){
    const sh=new THREE.Shape();
    points.forEach(([x,z],i)=>i?sh.lineTo(x,-z):sh.moveTo(x,-z));
    sh.closePath();
    const mesh=new THREE.Mesh(new THREE.ShapeGeometry(sh),mats[material]);
    mesh.rotation.x=-Math.PI/2;mesh.position.y=y;
    return direct(mesh,material,key);
  }

  // A real extruded deck with an empty circular rocket passage.
  // The origin is the rocket axis; a painted disk would still occlude it.
  function openServiceDeck(w,d,y,thickness,radius,material,key){
    const outline=new THREE.Shape();
    outline.moveTo(-w/2,-d/2);outline.lineTo(w/2,-d/2);
    outline.lineTo(w/2,d/2);outline.lineTo(-w/2,d/2);outline.closePath();
    const aperture=new THREE.Path();
    aperture.absarc(0,0,radius,0,Math.PI*2,true);
    outline.holes.push(aperture);
    const geometry=new THREE.ExtrudeGeometry(outline,{
      depth:thickness,bevelEnabled:false,curveSegments:64,steps:1
    });
    const mesh=new THREE.Mesh(geometry,mats[material]);
    mesh.rotation.x=-Math.PI/2;
    mesh.position.y=y-thickness/2;
    mesh.userData.rocketAperture={center:[0,0],radius,deckY:y,thickness};
    return direct(mesh,material,key);
  }

  function faceStrip(p1,p2,q1,q2,material,key) {
    const v=[...p1,...p2,...q1,...p2,...q2,...q1];
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.computeVertexNormals();
    return direct(new THREE.Mesh(g),material,key);
  }
  function railLine(coords,y,material,r,key){
    for(let i=0;i<coords.length-1;i++)bar([coords[i][0],y,coords[i][1]],[coords[i+1][0],y,coords[i+1][1]],r,material,key);
  }
  function edgeRailLine(coords,base,material,key){
    for(const [x,z] of coords)bar([x,base,z],[x,base+1.8,z],.12,material,key);
    railLine(coords,base+1.8,material,.14,key);
  }
  function rungLadder(a,b,width,material,key,n=14){
    const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b);
    const delta=q.clone().sub(p),offset=new THREE.Vector3(width/2,0,0);
    bar(p.clone().sub(offset).toArray(),q.clone().sub(offset).toArray(),.16,material,key);
    bar(p.clone().add(offset).toArray(),q.clone().add(offset).toArray(),.16,material,key);
    for(let j=0;j<=n;j++){
      const c=p.clone().addScaledVector(delta,j/n);
      bar(c.clone().sub(offset).toArray(),c.clone().add(offset).toArray(),.11,'paleSteel',key);
    }
  }

  // 01 / WEST RAIL AXIS — separate bridge approach, track ballast,
  // two low side utility yards with blue-roofed service buildings.
  surface([[-43,140],[43,140],[56,85],[45,15],[-45,15],[-57,86]],.12,'oldConcrete','western-forecourt');
  // The complete approach now uses the shared metric cross-section. Its
  // actual running surface meets the external head-level socket exactly.
  const railAt=()=>({gauge:RAIL_PROFILE.gauge/MUSEUM_METRE,y:GAGARIN_RAIL_PORT[1],
    width:RAIL_PROFILE.headWidth/MUSEUM_METRE,height:RAIL_PROFILE.railHeight/MUSEUM_METRE,
    sleeper:RAIL_PROFILE.sleeperLength/MUSEUM_METRE});
  const railSamples=Array.from({length:81},(_,i)=>5.5+(GAGARIN_RAIL_PORT[2]-5.5)*i/80);
  const ballast=[...railSamples.map(z=>[-RAIL_PROFILE.ballastWidth/MUSEUM_METRE/2/GAGARIN_LEGACY_METRE,z/GAGARIN_LEGACY_METRE]),...railSamples.slice().reverse().map(z=>[RAIL_PROFILE.ballastWidth/MUSEUM_METRE/2/GAGARIN_LEGACY_METRE,z/GAGARIN_LEGACY_METRE])];
  surface(ballast,RAIL_PROFILE.ballastY/MUSEUM_METRE/GAGARIN_LEGACY_METRE,'soil','ballast-bed');
  for(let i=1;i<railSamples.length;i++)for(const side of [-1,1]){
    const a=railSamples[i-1],b=railSamples[i],pa=railAt(a),pb=railAt(b);
    block(side*pa.gauge/2/GAGARIN_LEGACY_METRE,(pa.y-pa.height/2)/GAGARIN_LEGACY_METRE,(a+b)/2/GAGARIN_LEGACY_METRE,pa.width/GAGARIN_LEGACY_METRE,pa.height/GAGARIN_LEGACY_METRE,(b-a)/GAGARIN_LEGACY_METRE,'rail','rail-approach');
  }
  for(let z=6;z<GAGARIN_RAIL_PORT[2];z+=.75){const p=railAt(z);block(0,RAIL_PROFILE.sleeperY/MUSEUM_METRE/GAGARIN_LEGACY_METRE,z/GAGARIN_LEGACY_METRE,p.sleeper/GAGARIN_LEGACY_METRE,RAIL_PROFILE.sleeperHeight/MUSEUM_METRE/GAGARIN_LEGACY_METRE,RAIL_PROFILE.sleeperWidth/MUSEUM_METRE/GAGARIN_LEGACY_METRE,'timber','rail-sleepers');}
  railLine([[-25,40],[-25,94],[-30,138]],.3,'asphalt',1.2,'service-road');
  railLine([[26,39],[28,104],[34,138]],.3,'asphalt',1.2,'service-road');

  // 02 / PRIMARY CONCRETE ARCHITECTURE. A deep open undercroft held between
  // long concrete support piers; NOT a solid cuboid under the launch stand.
  const deckY=18,piers=[-36,36];
  for(const x of piers){
    block(x,9.3,-9,12,18,56,'concrete','bridge-concrete-pier');
    block(x,18.7,-8,15,3.1,76,'oldConcrete','bridge-superstructure');
    // Open side soffit, panel seams and rusty horizontal stiffeners.
    for(let k=0;k<7;k++){
      const z=-33+k*10;
      block(x+Math.sign(x)*6.1,7,z,.32,12,.34,'paleConcrete','pier-formwork-seams');
    }
    for(const y of [3.5,9.5,15.5]){
      block(x+Math.sign(x)*6.2,y,-8,.55,.58,56,'rust','pier-rust-rib');
    }
  }
  // The top is a U-shaped bridge rather than a continuous filled
  // rectangle: an axial opening reveals the suspended rocket socket.
  block(-30,20.8,14,28,3.2,48,'oldConcrete','launcher-upper-deck');
  block(30,20.8,14,28,3.2,48,'oldConcrete','launcher-upper-deck');
  block(0,20.9,36,42,3.0,10,'concrete','launcher-west-crosswalk');
  block(0,20.9,-17,72,3.0,7,'rust','launcher-red-crossbeam');
  for(const x of [-44,44]){
    // rust-red edge beam and pale corrugated fence seen in IMG_8447.
    block(x,23.1,-11,1.4,2.7,72,'rust','rust-red-deck-edge');
    for(let z=-39;z<=20;z+=3.2)block(x,18.0,z,.28,7.7,.35,'paleConcrete','corrugated-cladding');
    edgeRailLine([[x,-42],[x,-28],[x,-14],[x,0],[x,14],[x,25]],24.6,'paleSteel','deck-safety-railing');
  }
  // Under the elevated bridge the real site has suspended technological
  // rooms, cage-like grates and ladder flights, not a simple dark box.
  for(const x of [-26,26]){
    for(const y of [7.1,11.8,16.5]){
      block(x,y,-27,20,.7,9,'steel','underbridge-gallery');
      for(let z=-31;z<=-23;z+=1.7)bar([x-9,y+1.2,z],[x+9,y+1.2,z],.11,'paleSteel','underbridge-grating');
    }
    rungLadder([x,2,-40],[x,18,-18],2.1,'steel','underbridge-staircase',17);
    for(const y of [4,9,14]){
      bar([x, y,-42],[x,y,-19],.19,'steel','underbridge-cross-truss');
    }
  }
  // At the centre the rocket sits on an elevated plate spanning open void.
  for(const side of [-1,1]){
    block(side*17.2,20,-1.6,11,2.8,35,'concrete','launch-podium-ring-frame');
    block(side*20,22,-3,5,.8,41,'paleConcrete','launch-podium-rim');
  }

  // 03 / EAST DUCT — plan traced from the owner's overhead screenshot
  // 2026-10-27 20:41:25. Broad shoulders beside the launch bridge taper
  // EAST to a finite-width apron; the perimeter road returns around it.
  // These are image proportions, not a metric survey. Heights are schematic.
  const planScale=.50,planOrigin=[674,546];
  const fromPixel=(px,py,y)=>[(py-planOrigin[1])*planScale,y,-(px-planOrigin[0])*planScale];
  // px, north/south upper rim, north/south floor edge, floor elevation.
  // Both sides are traced independently; the satellite view is asymmetric.
  const ductPlan=[
    [750,267,810,455,580,.35],
    [780,271,813,447,590,.40],
    [825,278,814,442,600,.55],
    [880,290,806,445,606,.80],
    [950,313,783,461,609,1.40],
    [1030,346,750,482,604,2.60],
    [1110,379,714,503,593,4.40],
    [1190,410,677,515,582,7.10],
    [1260,435,650,518,578,10.10],
    [1340,466,623,516,579,13.80],
    [1405,487,608,506,581,16.60],
    [1435,505,593,507,581,18.00]
  ];
  const bankY=18.1,ductBatches=new Map();
  function ductQuad(a,b,c,d,material,key){
    const id=material+':'+key;
    let batch=ductBatches.get(id);
    if(!batch){batch={material,key,vertices:[]};ductBatches.set(id,batch)}
    batch.vertices.push(...a,...b,...c,...b,...d,...c);mark(key);
  }
  // The throat continues UNDER the launch deck into the chamber, avoiding
  // the old disconnected channel that started in front of the support ring.
  ductQuad([-24,.32,8],[24,.32,8],fromPixel(750,455,.35),fromPixel(750,580,.35),'cutFace','flame-channel');
  for(let i=0;i<ductPlan.length-1;i++){
    const a=ductPlan[i],b=ductPlan[i+1];
    const an=fromPixel(a[0],a[3],a[5]),as=fromPixel(a[0],a[4],a[5]);
    const bn=fromPixel(b[0],b[3],b[5]),bs=fromPixel(b[0],b[4],b[5]);
    ductQuad(an,bn,as,bs,i<2?'oldConcrete':'concrete','flame-channel');
    // Transverse expansion joints follow the actual sloping floor.
    bar([an[0],an[1]+.04,an[2]],[as[0],as[1]+.04,as[2]],.055,'cutFace','gas-duct-floor-panels');
    for(let j=1;j<7;j++){
      const f=j/7,p=V(...an).lerp(V(...as),f),q=V(...bn).lerp(V(...bs),f);
      p.y+=.05;q.y+=.05;bar(p.toArray(),q.toArray(),.04,'oldConcrete','gas-duct-floor-panels');
    }
    for(const side of [0,1]){
      const innerA=side?as:an,innerB=side?bs:bn;
      const rimA=fromPixel(a[0],a[side+1],bankY),rimB=fromPixel(b[0],b[side+1],bankY);
      // Two sloping concrete bands with an intermediate seam, not vertical
      // walls or buttresses invented from the old symmetric station model.
      const middleA=V(...innerA).lerp(V(...rimA),.53).toArray();
      const middleB=V(...innerB).lerp(V(...rimB),.53).toArray();
      ductQuad(innerA,innerB,middleA,middleB,side?'oldConcrete':'paleConcrete','flame-duct-bank');
      ductQuad(middleA,middleB,rimA,rimB,side?'concrete':'paleConcrete','flame-duct-bank');
      bar(middleA,middleB,.10,'cutFace','concrete-tile-seam');
      bar(rimA,rimB,.24,'oldConcrete','flame-duct-upper-coping');
      bar(innerA,innerB,.12,'cutFace','flame-duct-discolored-seam');
      // Radial panel seams run up each bank.
      bar(innerA,rimA,.06,'oldConcrete','concrete-tile-seam');
      const outerA=fromPixel(a[0],a[side+1]+(side?22:-22),bankY);
      const outerB=fromPixel(b[0],b[side+1]+(side?22:-22),bankY);
      ductQuad(rimA,rimB,outerA,outerB,'soil','flame-duct-embankment');
    }
  }
  // Curved western shoulders wrap around the bridge cheeks; they account
  // for the broad end of the excavation being beside the pad, not at its exit.
  const shoulders=[
    {rim:[[620,487],[619,355],[665,328],[715,310],[750,267]],inner:[750,455]},
    {rim:[[612,616],[613,711],[632,765],[686,796],[750,810]],inner:[750,580]}
  ];
  for(const [side,shoulder] of shoulders.entries()){
    const anchor=fromPixel(...shoulder.inner,.35);
    for(let i=0;i<shoulder.rim.length-1;i++){
      const a=fromPixel(...shoulder.rim[i],bankY),b=fromPixel(...shoulder.rim[i+1],bankY);
      // One triangle in the merged bank mesh for each headwall sector.
      const id=(side?'concrete':'paleConcrete')+':flame-duct-bank';
      const batch=ductBatches.get(id);batch.vertices.push(...a,...b,...anchor);mark('flame-duct-bank');
      bar(a,b,.24,'oldConcrete','flame-duct-upper-coping');
    }
  }
  // The far apron has an open, straight edge of nonzero width. It does not
  // converge to a zero-area point and is not closed with an artificial wall.
  const end=ductPlan[ductPlan.length-1];
  ductQuad(fromPixel(end[0],end[3],18),fromPixel(1450,508,18),
           fromPixel(end[0],end[4],18),fromPixel(1450,581,18),'concrete','flame-outlet-apron');
  const roadPixels=[
    [609,345],[669,306],[718,245],[803,251],[900,277],[1045,329],
    [1206,389],[1353,448],[1423,482],[1460,521],[1472,561],
    [1464,610],[1438,654],[1368,699],[1230,765],[1072,836],
    [928,891],[875,883],[848,845],[749,837],[658,820],[614,788],[591,727],[594,636]
  ];
  const roadPoints=roadPixels.map(([px,py])=>V(...fromPixel(px,py,.38)));
  // Catmull-Rom interpolation rounds the return road while the surveyed
  // chamber contour retains its trace points. One continuous U, not two stubs.
  const roadCurve=new THREE.CatmullRomCurve3(roadPoints,false,'centripetal');
  const road=roadCurve.getPoints(100);
  for(let i=0;i<road.length-1;i++){
    bar(road[i].toArray(),road[i+1].toArray(),1.75,'oldConcrete','duct-perimeter-road');
  }
  // Merge channel panels by material/component to keep museum navigation light.
  for(const batch of ductBatches.values()){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.vertices,3));
    geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,mats[batch.material]);
    mesh.userData.museumComponent=batch.key;mesh.receiveShadow=true;
    root.add(mesh);renderMeshCount++;
  }

  // 04 / R-7 SUPPORT RING, TULIP FLOWER, yellow roller drums.
  // Distinguish lower outward arms from central maintenance tower.
  const torus=new THREE.Mesh(new THREE.TorusGeometry(10.4,1.35,9,48),mats.steel);
  torus.rotation.x=Math.PI/2;torus.position.y=26.5;
  direct(torus,'steel','start-table');
  const inner=new THREE.Mesh(new THREE.RingGeometry(10.9,15.7,48),mats.olive);
  inner.rotation.x=-Math.PI/2;inner.position.y=26.5;direct(inner,'olive','start-table-support');
  for(let i=0;i<4;i++){
    const a=Math.PI/4+i*Math.PI/2,s=Math.sin(a),c=Math.cos(a);
    const tang=[-s,c];
    const rootP=[c*31,22,s*31],tip=[c*6.4,43,s*6.4];
    for(const side of [-1,1]){
      bar([rootP[0]+tang[0]*2*side,rootP[1],rootP[2]+tang[1]*2*side],
          [tip[0]+tang[0]*1.1*side,tip[1],tip[2]+tang[1]*1.1*side],
          side===-1?.77:.44,'green','tulip-arm');
    }
    for(let j=1;j<=5;j++){
      const t=j/6,x=rootP[0]+(tip[0]-rootP[0])*t,
            y=rootP[1]+(tip[1]-rootP[1])*t,z=rootP[2]+(tip[2]-rootP[2])*t;
      bar([x+tang[0]*2,y,z+tang[1]*2],[x-tang[0]*2,y+1.2,z-tang[1]*2],.24,'brightGreen','tulip-inner-bracing');
    }
    bar([c*36,19,s*36],[c*31,33,s*31],.61,'steel','tulip-counterweight-rod');
    // Drums at ends as observed in the visitor photograph.
    const cyl=new THREE.Mesh(new THREE.CylinderGeometry(3.3,3.3,5.5,14),mats.yellow);
    cyl.position.set(c*38,27.5,s*38);
    cyl.quaternion.setFromUnitVectors(up,new THREE.Vector3(-s,0,c));
    direct(cyl,'yellow','yellow-counterweight');
    block(c*6.4,43.2,s*6.4,1.6,1.1,1.5,'brightGreen','tulip-gripper',-a);
    // Small guide jaws at the central nose.
    bar([c*10,26.5,s*10],[c*6.2,31,s*6.2],.48,'steel','launcher-guide');
  }
  for(const x of [-13,13]){
    bar([x,24,7],[x*.55,36,3],.52,'steel','umbilical-connection');
  }

  // 05 / PHOTO-TRUE SILHOUETTE. Tall NARROW steel cage and working balconies
  // at top, with 4 tapering chassis legs from an elevated green service frame.
  // Primary IMG_5826 shows central height significantly above the lower V arms.
  const towerBottom=27,towerTop=106,zTower=0;
  const section=t=>{
    const half=10.9-4.2*t,depth=8.3-1.3*t,y=towerBottom+(towerTop-towerBottom)*t;
    return{half,depth,y};
  };
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const a=section(0),b=section(1);
    bar([sx*a.half,a.y,zTower+sz*a.depth],
        [sx*b.half,b.y,zTower+sz*b.depth],.45,'green','tower-main-leg');
  }
  for(let j=0;j<=24;j++){
    const t=j/24,s=section(t),hh=s.half,dep=s.depth,y=s.y;
    // 24 open lattice belts, not 6 huge solid apartment floors.
    for(const sz of [-1,1]){
      bar([-hh,y,zTower+sz*dep],[hh,y,zTower+sz*dep],.22,'steel','tower-story-ring');
    }
    for(const sx of [-1,1]){
      bar([sx*hh,y,zTower-dep],[sx*hh,y,zTower+dep],.22,'brightGreen','tower-story-ring');
    }
    if(j<24){
      const next=section((j+1)/24);
      for(const sz of [-1,1]){
        bar([-hh,y,zTower+sz*dep],[next.half,next.y,zTower+sz*next.depth],.18,'green','tower-x-lattice');
        bar([hh,y,zTower+sz*dep],[-next.half,next.y,zTower+sz*next.depth],.18,'olive','tower-x-lattice');
      }
      for(const sx of [-1,1]){
        bar([sx*hh,y,zTower-dep],[sx*next.half,next.y,zTower+next.depth],.19,'brightGreen','tower-x-lattice');
      }
    }
  }
  const levels=[42,54,67,80,91,101];
  for(let idx=0;idx<levels.length;idx++){
    const y=levels[idx],t=(y-towerBottom)/(towerTop-towerBottom),
        sec=section(t),w=sec.half+2.5,d=sec.depth+2.3;
    // Service decks are thin floors and an outside white railing.
    // Booster envelope is wider below y=70; upper decks surround the core.
    const clearance=y<=54?9.6:y<=67?8.4:5.2;
    openServiceDeck(w*2,d*2,y,.5,clearance,'steel','tower-service-deck');
    for(const sx of [-1,1]){
      bar([sx*w,y+2.4,zTower-d],[sx*w,y+2.4,zTower+d],.14,'paleSteel','tower-deck-rails');
      for(const sz of [-1,1])bar([sx*w,y,zTower+sz*d],[sx*w,y+2.4,zTower+sz*d],.16,'paleSteel','tower-deck-rails');
    }
    for(const sz of [-1,1])bar([-w,y+2.4,zTower+sz*d],[w,y+2.4,zTower+sz*d],.13,'paleSteel','tower-deck-rails');
    block(0,y+1.2,zTower+d+1.5,2.1,2.2,1.4,idx===5?'green':'yellow','tower-electrical-cabinet');
  }
  // Crown access deck with piping and a prominent side green utility chamber.
  openServiceDeck(21,18,106.5,.65,5.2,'brightGreen','tower-crown');
  // Keep the side equipment chamber outside the cylindrical rocket clearance.
  block(12.4,102,zTower,6.5,8.5,8,'green','tower-upper-equipment');
  registerFacilityBeacon(root,{id:'gagarin-service-tower',position:[12.4,106.25,zTower],kind:'service-tower'});
  for(const x of [-10,10])rungLadder([x,95,zTower+9],[x,108,zTower+9],2.0,'paleSteel','tower-crown-ladder',14);
  // Outer opposed inclined *open trusses* buttress narrow tower.
  for(const sign of [-1,1]){
    const toe=[sign*43,23,8],head=[sign*8.5,83,8];
    for(const dz of [-7.7,7.7]){
      const a=[toe[0],toe[1],toe[2]+dz],b=[head[0],head[1],head[2]+dz*.65];
      bar(a,b,1.18,'green','gantry-inclined-main');
      const a2=[a[0]-sign*3.2,a[1]+1.0,a[2]],b2=[b[0]-sign*2.0,b[1]-1,b[2]];
      bar(a2,b2,.60,'brightGreen','gantry-inclined-secondary');
      // Steel triangular web along the complete inclined boom.
      for(let j=0;j<13;j++){
        const t=j/13,t2=(j+1)/13;
        const p=V(...a).lerp(V(...b),t),q=V(...a2).lerp(V(...b2),t2);
        bar(p.toArray(),q.toArray(),.22,'olive','gantry-inclined-lattice');
        const p2=V(...a2).lerp(V(...b2),t),q2=V(...a).lerp(V(...b),t2);
        bar(p2.toArray(),q2.toArray(),.21,'brightGreen','gantry-inclined-lattice');
      }
    }
    // The yellow hinges project sideways, not at the top.
    const pivot=new THREE.Mesh(new THREE.CylinderGeometry(3.6,3.6,6,12),mats.fadedYellow);
    pivot.position.set(sign*47,33,zTower);
    pivot.rotation.x=Math.PI/2;direct(pivot,'fadedYellow','outer-yellow-hinge');
    for(const dz of [-6.0,6.0]){
      bar([sign*47,33,zTower+dz],[sign*32,54,zTower+dz*.5],.4,'green','buttress-actuator');
      bar([sign*43,24,zTower+dz],[sign*39,42,zTower+dz],.48,'paleSteel','hydraulic-strut');
    }
    // Wide fan-like low triangular access boom spreads down to front of tower.
    for(const z of [-13,13]){
      bar([sign*43,24,zTower+z],[sign*16,51,zTower+z*.4],.54,'green','lower-access-truss');
      bar([sign*43,24,zTower+z],[sign*16,27,zTower+z*.4],.36,'brightGreen','lower-access-truss');
      for(let j=1;j<6;j++){
        let t=j/6;
        bar([sign*(43-27*t),24+27*t,zTower+z*(1-.6*t)],
            [sign*(43-27*t),24+3*t,zTower+z*(1-.6*t)],
            .22,'olive','lower-access-truss-web');
      }
    }
  }
  // At the WEST face the ladder and equipment are asymmetric.
  rungLadder([-14,26,22],[-8.5,100,19],2.0,'steel','service-ladder',52);
  for(const y of [38,55,73]){
    bar([-12,y,18],[-25,y-6,32],.37,'steel','service-catwalk');
    block(-21,y-6,31,7,.45,5,'steel','service-catwalk-deck');
  }
  // Slender red-tinted steel handrails and an oblique stair near the undercroft.
  rungLadder([-38,2,-37],[-42,18,-20],2.2,'paleSteel','concrete-bridge-stairs',22);
  rungLadder([38,1,-41],[40,19,-19],2.2,'paleSteel','concrete-bridge-stairs',22);

  // 06 / PHOTOGRAPHIC CONTEXT: Light masts away from the tower,
  // compact blue-roof utility sheds, stairs, pipes, vents and guardrails.
  function floodTower(x,z,h){
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const a=[x+sx*3.6,0,z+sz*3.6],b=[x+sx*1.25,h,z+sz*1.25];
      bar(a,b,.23,'steel','lighting-tower');
      for(let j=0;j<12;j++){
        const t=j/12,t2=(j+1)/12,
            rad=3.6+(1.25-3.6)*t,rad2=3.6+(1.25-3.6)*t2;
        bar([x+sx*rad,h*t,z+sz*rad],[x-sx*rad2,h*t2,z+sz*rad2],.13,'paleSteel','lighting-tower-bracing');
      }
    }
    block(x,h+1.2,z,15,.9,1.1,'steel','lighting-array-head');
    for(let j=0;j<8;j++)block(x-6.7+j*1.85,h+2.1,z+.65,1.1,.8,.35,'white','floodlight-array');
    registerFacilityFloodlights(root,{id:`gagarin-flood-${x}-${z}`,target:[x,GAGARIN_LEGACY_RIM_Y,z+h*.55],
      beacon:[x,h+1.65+GAGARIN_LEGACY_RIM_Y,z],lamps:Array.from({length:8},(_,j)=>({
        position:[x-6.7+j*1.85,h+2.1+GAGARIN_LEGACY_RIM_Y,z+.825],normal:[0,0,1],size:[1.1,.8]}))});
  }
  [[-155,-125,52],[162,-147,54],[-71,87,47],[74,88,48]].forEach(p=>floodTower(...p));
  for(const [x,z] of [[-86,49],[86,22]]){
    bar([x,0,z],[x,68,z],.19,'steel','lightning-mast');
    bar([x,68,z],[x,76,z],.09,'paleSteel','lightning-mast-tip');
    registerFacilityBeacon(root,{id:`gagarin-lightning-${x}`,position:[x,76+GAGARIN_LEGACY_RIM_Y,z],kind:'lightning-mast'});
  }
  function outbuilding(x,z,w,l,h){
    block(x,h*.5,z,w,h,l,'concrete','utility-building');
    block(x,h+.4,z,w+1,.65,l+1,'blueRoof','utility-roof');
    block(x,2.0,z+l/2+.12,w*.34,3.4,.25,'steel','utility-door');
    for(const delta of [-w*.3,w*.3])block(x+delta,h*.58,z+l/2+.12,2.2,1.7,.22,'window','utility-window');
  }
  outbuilding(-63,106,23,26,9);
  outbuilding(57,96,18,22,7);
  outbuilding(-73,45,10,12,6);
  for(const sx of [-1,1]){
    for(const z of [10,17,24,32]){
      bar([sx*44,21,z],[sx*61,21,z],.3,'steel','fuel-utility-lines');
      bar([sx*60,21,z],[sx*60,23.5,z],.19,'brightGreen','fuel-utility-lines');
    }
  }
  for(const sx of [-1,1]){
    // The photo shows a weathered pipe gallery beneath red girders.
    for(let z=-43;z<-7;z+=5){
      bar([sx*34,16,z],[sx*34,20,z],.16,'paleSteel','gallery-safety-rail');
    }
    bar([sx*34,20,-43],[sx*34,20,-7],.14,'paleSteel','gallery-safety-rail');
  }
  // Reusable shadow texturing: fine concrete seam lines, dilute rust stains.
  for(let x=-32;x<=32;x+=9){
    bar([x,23.1,35],[x,23.1,50],.07,'cutFace','concrete-deck-seam');
  }

  // 07 / Metric holder for the owner's optimized Soyuz. It is deliberately
  // outside the legacy architecture conversion so the GLB stays full metres.
  const rocket=new THREE.Group();
  rocket.name='Союз · ракета-экспонат';rocket.position.fromArray(GAGARIN_ROCKET_MOUNT.position);
  rocket.rotation.set(...GAGARIN_ROCKET_MOUNT.rotation);rocket.visible=true;metricRoot.add(rocket);

  // Flush instanced beams/slabs into a few dozen GPU draw calls.
  for(const batch of buckets.values()){
    const geo=batch.kind==='rod'?rodGeometry:boxGeometry;
    const mesh=new THREE.InstancedMesh(geo,batch.material,batch.matrices.length);
    mesh.name='Пл.1 / '+batch.kind+' / '+batch.material.color.getHexString();
    for(let i=0;i<batch.matrices.length;i++)mesh.setMatrixAt(i,batch.matrices[i]);
    mesh.instanceMatrix.needsUpdate=true;
    mesh.frustumCulled=false;
    root.add(mesh);renderMeshCount++;
  }
  const metadata={
    version:'4.0-metric-soyuz',units:'metres',legacyMetresPerUnit:GAGARIN_LEGACY_METRE,
    terrainDatum:{rimY:0,baseSurfaceY:-2.755,channelFloorY:(.32-GAGARIN_LEGACY_RIM_Y)*GAGARIN_LEGACY_METRE,voidFollowsRotation:true},
    rocketPassage:{axis:[0,0],crownRadius:5.2*GAGARIN_LEGACY_METRE,serviceDecks:6,throughHole:true},
    rocketMount:GAGARIN_ROCKET_MOUNT,railPort:GAGARIN_RAIL_PORT,physicalRailGauge:GAGARIN_PHYSICAL_RAIL_GAUGE,
    railTransition:{fromZ:65,toZ:GAGARIN_RAIL_PORT[2],networkGaugeWorld:RAIL_PROFILE.gauge},
    serviceHeightMetres:(106-27)*GAGARIN_LEGACY_METRE,serviceHeightVerified:false,
    flameDuctReview:'Plan visually traced from owner overhead screenshot 2026-10-27 20:41:25; elevations unverified',
    ductPlan:{reference:'2026-10-27 20:41:25',imageSize:[1920,1297],origin:planOrigin,scale:planScale,stations:ductPlan,outletWidth:(end[4]-end[3])*planScale,roadReturnsAroundOutlet:true},
    name:"Gagarin's Start photo-grounded reconstruction",
    archiveFolder:'1JAaawXTM0I9P-0C6br3d_xSiaUsLMOpC',
    orientation:'West rail (+Z) → start at centre → broad western chamber tapering to eastern apron (-Z)',
    localFlameAzimuth:'-Z',
    photosUsed:['IMG_5826.jpeg','IMG_8447.jpeg','IMG_4933.jpeg','IMG_4948.jpeg','2026-10-27 17:49 overhead','2026-10-27 16:18 overhead','2026-10-27 20:41:25 overhead'],
    featureCounts:features,
    meshCount:primitiveCount,
    renderMeshCount,
    rocketExhibitDefault:true,
    status:'Metre-normalized photographic reconstruction; uniform architecture conversion, estimated structural heights. Rocket source geometry is full scale.'
  };
  metricRoot.name=root.name;metricRoot.userData.gagarinModel=metadata;
  metricRoot.userData.surfaceMaterials=root.userData.surfaceMaterials;
  return {rocket,rocketMount:GAGARIN_ROCKET_MOUNT,features,meshCount:primitiveCount};
}

