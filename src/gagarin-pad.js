import * as THREE from 'three';

/**
 * GAGARIN'S START — SITE 1, launch position 5
 * PHOTO-GROUNDED MUSEUM STUDY v3.1, not engineering drawings.
 * v3.1: real coaxial openings through all service decks and crown.
 * Flame-duct contour remains v3 pending visual verification of the overheads.
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
 *  Y = elevation, with launch deck around y=18
 * Parent rotation -PI/2 maps local -Z to global +X (east).
 * Schematized positions/sizes; do not treat as a surveyed facility.
 */

export function buildGagarinPad(root) {
  root.name='Пл. 1 — Гагаринский старт / Фотографическая реконструкция 3.1';
  const colors={
    concrete:0x9d9c94, oldConcrete:0x817f76, paleConcrete:0xc0b9ac,
    cutFace:0x756e64, soot:0x44403a, duct:0x4e473e,
    soil:0x988b78, asphalt:0x77746d, rust:0x924e37,
    green:0x426e57, brightGreen:0x659078, olive:0x324b3b,
    steel:0x4b5e56, shadowSteel:0x2f3d37,
    paleSteel:0xa3b5ad, white:0xd1d2c8,
    yellow:0xd3b04d, fadedYellow:0xa98539,
    rail:0x3f4242, timber:0x766c5c, window:0x344852,
    blueRoof:0x698c97, grass:0x777d65, sky:0xa3a7a3
  };
  const mats={};
  for(const [k,c] of Object.entries(colors))mats[k]=new THREE.MeshStandardMaterial({
    color:c,roughness:['green','brightGreen','olive','steel','shadowSteel','paleSteel','rail','yellow'].includes(k)?.65:.94,
    metalness:['green','brightGreen','olive','steel','shadowSteel','paleSteel','rail','yellow'].includes(k)?.32:.04,
    side:THREE.DoubleSide
  });
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
  function block(x,y,z,w,h,d,material,name,rotate=0) {
    tmpQuat.setFromAxisAngle(up,rotate);tmpS.set(w,h,d);
    tmpM.compose(tmpP.set(x,y,z),tmpQuat,tmpS);
    bucket(material,'box').matrices.push(tmpM.clone());mark(name);
  }
  function bar(a,b,r,material,name){
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
  surface([[-10,17],[10,17],[10,171],[-10,171]],.24,'soil','ballast-bed');
  for(const x of [-3.65,3.65]){
    block(x,1.0,90,.77,.42,159,'rail','rail-approach');
    bar([x,1.3,11],[x,1.3,172],.33,'rail','rail-approach');
  }
  for(let z=16;z<174;z+=3.6)block(0,.62,z,11.4,.34,1.05,'timber','rail-sleepers');
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

  // 03 / EAST DUCT — the actual overhead is a broad leaf/fan-shaped
  // earthwork lined with tan concrete and rounded at the far eastern end.
  // Local axis -Z; upper banks slope inward down to soot-dark channel.
  const stations=[
    {z:-23,b:16,t:25,h:18},
    {z:-38,b:19,t:31,h:15.5},
    {z:-58,b:23,t:42,h:13},
    {z:-82,b:26,t:54,h:11},
    {z:-105,b:27,t:61,h:9},
    {z:-130,b:27,t:66,h:7},
    {z:-152,b:23,t:59,h:5},
    {z:-170,b:15,t:39,h:3.8},
    {z:-180,b:0,t:0,h:2.5}
  ];
  const leftFloor=stations.map(p=>[-p.b,p.z]),rightFloor=stations.slice().reverse().map(p=>[p.b,p.z]);
  surface([...leftFloor,...rightFloor],.22,'soot','flame-channel');
  // Floor variations, burnt islands, longitudinal drainage trenches.
  for(let z=-33;z>=-155;z-=11){
    let st=stations.find((s,i)=>i<stations.length-1&&z<=s.z&&z>=stations[i+1].z);
    let w=st?st.b:19;
    block(0,.29,z,Math.max(2,w*1.35),.08,2.6,z>-63?'cutFace':'duct','gas-duct-floor-panels');
    if(z%22>-12)block(w*.33,.37,z-2,w*.27,.09,5,'rust','gas-duct-staining');
  }
  for(const sign of [-1,1]){
    // Slanted masonry wall as a sequence of true 3D faces (not a black
    // polygon pretending to be a deep excavation).
    for(let i=0;i<stations.length-1;i++){
      const a=stations[i],b=stations[i+1];
      const innerA=[sign*a.b,.4,a.z],innerB=[sign*b.b,.4,b.z];
      const upperA=[sign*a.t,a.h,a.z],upperB=[sign*b.t,b.h,b.z];
      faceStrip(innerA,innerB,upperA,upperB,'paleConcrete','flame-duct-bank');
      // separate upper cutting beyond the wall, in earth-coloured materials
      faceStrip(upperA,upperB,[sign*(a.t+14),.25,a.z],[sign*(b.t+14),.25,b.z],
                'soil','flame-duct-embankment');
      bar(upperA,upperB,.55,'cutFace','flame-duct-upper-coping');
      bar(innerA,innerB,.42,'rust','flame-duct-discolored-seam');
      if(i<7){
        const midX=sign*(a.b+a.t)*.5;
        bar([midX,.4,a.z],[sign*a.t,a.h,a.z],.37,'oldConcrete','retaining-buttress');
      }
      if(i<5){
        for(let j=1;j<=3;j++){
          const t=j/4;
          const p1=[sign*(a.b+(a.t-a.b)*t),a.h*t,a.z];
          const p2=[sign*(b.b+(b.t-b.b)*t),b.h*t,b.z];
          bar(p1,p2,.095,'concrete','concrete-tile-seam');
        }
      }
    }
    // 2 curved outer perimeter roads and subtle gravel shoulders
    const track=stations.slice(0,-1).map(p=>[sign*(p.t+20),p.z]);
    railLine(track,.34,'oldConcrete',2.0,'duct-perimeter-road');
    const rim=stations.slice(0,-1).map(p=>[sign*(p.t+15.5),p.z]);
    railLine(rim,.38,'rust',.28,'duct-road-guard');
  }
  // Widened river-like outlet, with an end rounded to a pointed leaf.
  surface([[-32,-173],[-19,-180],[0,-185],[19,-180],[32,-173],[15,-172],
    [0,-180],[-15,-172]],.33,'cutFace','flame-outlet-fan');

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
    const rootP=[c*31,22,s*31],tip=[c*9.0,43,s*9.0];
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
    block(c*8.3,43.2,s*8.3,4.0,2.7,3.7,'brightGreen','tulip-gripper',-a);
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
  }
  [[-75,-6,52],[76,-5,54],[-71,87,47],[74,88,48]].forEach(p=>floodTower(...p));
  for(const [x,z] of [[-86,49],[86,22]]){
    bar([x,0,z],[x,68,z],.19,'steel','lightning-mast');
    bar([x,68,z],[x,76,z],.09,'paleSteel','lightning-mast-tip');
  }
  function outbuilding(x,z,w,l,h){
    block(x,h*.5,z,w,h,l,'concrete','utility-building');
    block(x,h+.4,z,w+1,.65,l+1,'blueRoof','utility-roof');
    block(x,2.0,z+l/2+.12,w*.34,3.4,.25,'steel','utility-door');
    for(const delta of [-w*.3,w*.3])block(x+delta,h*.58,z+l/2+.12,2.2,1.7,.22,'window','utility-window');
  }
  outbuilding(-63,106,23,26,9);
  outbuilding(57,96,18,22,7);
  outbuilding(-73,-38,10,12,6);
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

  // 07 / optional rocket exhibit (kept empty for the 2026 state).
  const rocket=new THREE.Group();
  rocket.name='Историческая ракета Р-7 / Союз (экспонат, не реальное состояние)';
  root.add(rocket);
  const cylinder=(rTop,rBottom,h,x,y,z,material)=>{
    const m=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBottom,h,16),mats[material]);
    m.position.set(x,y,z);rocket.add(m);
  };
  cylinder(3.1,3.1,46,0,60,0,'white');
  cylinder(3.1,3.1,7,0,87,0,'warning');
  const tip=new THREE.Mesh(new THREE.ConeGeometry(3.2,10,16),mats.white);
  tip.position.y=96;rocket.add(tip);
  for(let k=0;k<4;k++){
    const a=Math.PI/4+k*Math.PI/2,x=Math.cos(a)*6.4,z=Math.sin(a)*6.4;
    cylinder(1.6,2.7,26,x,50,z,'white');
    cylinder(1.2,1.7,7,x,66,z,'warning');
  }
  rocket.visible=false;

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
    version:'3.1',
    rocketPassage:{axis:[0,0],crownRadius:5.2,serviceDecks:6,throughHole:true},
    flameDuctReview:'Pending: v3 contour has not yet been checked visually against the overhead images',
    name:"Gagarin's Start photo-grounded reconstruction",
    archiveFolder:'1JAaawXTM0I9P-0C6br3d_xSiaUsLMOpC',
    orientation:'West rail (+Z) → start at centre → East fan-shaped duct (-Z)',
    localFlameAzimuth:'-Z',
    photosUsed:['IMG_5826.jpeg','IMG_8447.jpeg','IMG_4933.jpeg','IMG_4948.jpeg','2026-10-27 17:49 overhead','2026-10-27 16:18 overhead'],
    featureCounts:features,
    meshCount:primitiveCount,
    renderMeshCount,
    rocketExhibitDefault:false,
    status:'interpretative model: plan-layout and structural shapes photo-referenced; dimensions unverified'
  };
  root.userData.gagarinModel=metadata;
  return {rocket,features,meshCount:primitiveCount};
}
