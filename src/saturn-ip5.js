import * as THREE from 'three';

/**
 * Baikonur Site 23: IP-5 Saturn-MS measuring station — museum reconstruction.
 *
 * Grounded in RocketTrip Drive: "пл. №23 ИП Сатурн":
 *   IMG_6181.JPG — front view; the tall concrete/brick tower with a black
 *                  25m P-200 mesh dish, second dish and white radome
 *   IMG_5342.JPG — aerial view of the site, access road and building layout
 *   IMG_3645.JPG — distance/silhouette of the full antenna field
 *   ajU0...jpg — near view of the umbrella-like receiver/transmitter truss
 *   IMG_7396.jpeg, IMG_7403.jpeg, IMG_5711.jpeg, IMG_2352.jpeg,
 *   IMG_5528.jpeg, IMG_5863.jpeg, IMG_5861.jpeg — October 27, 2026
 *   additional views for shape, truss density, tower features and material study.
 *   IMG_6657.MOV — supplementary walkthrough reference (not yet frame-verified).
 *
 * NOT a survey; all relative footprints, building heights and azimuths are
 * visual reconstructions. Both giant dishes are ~25m diameter, per public
 * Roscosmos/Saturn-MS documentation. Do not use this geometry for navigation.
 */
export function buildSaturnIP5(root,terrain={}) {
  root.name='Пл. №23 · ИП-5 «Сатурн-МС»';
  const mat={
    steppe:new THREE.MeshStandardMaterial({color:0x9d8e76,roughness:1}),
    berm:new THREE.MeshStandardMaterial({color:0x837560,roughness:1}),
    asphalt:new THREE.MeshStandardMaterial({color:0x4e4f4c,roughness:.99}),
    roadEdge:new THREE.MeshStandardMaterial({color:0xb3ab97,roughness:1}),
    concrete:new THREE.MeshStandardMaterial({color:0xa6a399,roughness:.99}),
    brick:new THREE.MeshStandardMaterial({color:0xa98775,roughness:.96}),
    brickDark:new THREE.MeshStandardMaterial({color:0x86665a,roughness:.99}),
    shadow:new THREE.MeshStandardMaterial({color:0x444c4d,metalness:.28,roughness:.73}),
    window:new THREE.MeshStandardMaterial({color:0x3e6570,metalness:.18,roughness:.40}),
    roof:new THREE.MeshStandardMaterial({color:0x7d8b8d,metalness:.16,roughness:.74}),
    railing:new THREE.MeshStandardMaterial({color:0xc0c5c1,metalness:.35,roughness:.58}),
    steel:new THREE.MeshStandardMaterial({color:0x4e5758,metalness:.58,roughness:.62}),
    steelDark:new THREE.MeshStandardMaterial({color:0x292e31,metalness:.60,roughness:.63,side:THREE.DoubleSide}),
    dish:new THREE.MeshStandardMaterial({color:0x353839,metalness:.36,roughness:.82,side:THREE.DoubleSide}),
    dishRim:new THREE.MeshStandardMaterial({color:0x616466,metalness:.49,roughness:.58}),
    light:new THREE.MeshStandardMaterial({color:0xe1e2de,roughness:.68}),
    radome:new THREE.MeshStandardMaterial({color:0xd9ddd9,metalness:0,roughness:.86}),
    trim:new THREE.MeshStandardMaterial({color:0xc3b3a1,roughness:.94}),
    gravel:new THREE.MeshStandardMaterial({color:0x8a8273,roughness:1}),
    vegetation:new THREE.MeshStandardMaterial({color:0x797d59,roughness:1,flatShading:true}),
    signal:new THREE.MeshStandardMaterial({color:0xcab56e,roughness:.88}),
    oxidized:new THREE.MeshStandardMaterial({color:0x747a79,metalness:.38,roughness:.86}),
    railPaint:new THREE.MeshStandardMaterial({color:0xc1c9c7,metalness:.31,roughness:.68})
  };
  const features={},objects=[];
  let primitives=0;
  function add(mesh,label,parent=root) {
    if(label){features[label]=(features[label]||0)+1;mesh.userData.museumComponent=label;}
    mesh.castShadow=false;mesh.receiveShadow=true;parent.add(mesh);objects.push(mesh);
    primitives++;return mesh;
  }
  function box(w,h,d,x,y,z,m,label,parent=root) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat[m]);mesh.position.set(x,y,z);
    return add(mesh,label,parent);
  }
  // Instanced antenna-frame beams: hundreds of real open-truss components
  // cost only one GPU draw call per material and dish subassembly.
  const rodGeometry=new THREE.CylinderGeometry(1,1,1,6,1);
  const rodBatches=new Map();
  function rod(a,b,r,m,label,parent=root,n=6) {
    const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),dir=q.clone().sub(p);
    const length=dir.length();if(length<.001)return null;
    const key=m+':'+parent.uuid;
    let batch=rodBatches.get(key);
    if(!batch){batch={material:m,parent,matrices:[]};rodBatches.set(key,batch);}
    const matrix=new THREE.Matrix4(),orient=new THREE.Quaternion();
    orient.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
    matrix.compose(p.add(q).multiplyScalar(.5),orient,new THREE.Vector3(r,length,r));
    batch.matrices.push(matrix);
    if(label)features[label]=(features[label]||0)+1;
    primitives++;return null;
  }
  function cylinder(radTop,radBottom,h,x,y,z,m,label,sides=12,parent=root){
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radTop,radBottom,h,sides),mat[m]);
    mesh.position.set(x,y,z);return add(mesh,label,parent);
  }
  function groundPatch(){
    // A broad 100-world-unit Murguduk mountain, fading into the real procedural
    // steppe, not a big raised rectangular slab.
    const N=100,extent=1250,vertices=[],colors=[],uv=[],indices=[];
    for(let z=0;z<=N;z++)for(let x=0;x<=N;x++){
      const xx=(x/N-.5)*extent,zz=(z/N-.5)*extent,
        radius=Math.sqrt((xx/560)**2+(zz/515)**2),
        r=(Math.sin(xx*.085+zz*.035)+Math.sin(xx*.038-zz*.076))*.22,
        t=Math.max(0,Math.min(1,(radius-.68)/.49)),
        fade=1-t*t*(3-2*t),
        height=-190.476+(198.2*fade)+1.35*Math.sin(Math.min(radius,1)*Math.PI)*fade+r*fade;
      vertices.push(xx,height-.22,zz);
      const world=root.localToWorld(new THREE.Vector3(xx,0,zz));
      uv.push(.5+world.x/(terrain.terrainWidth||4420),.5-world.z/(terrain.terrainHeight||3553));
      const patina=(Math.sin(xx*.055+zz*.03)*.055+Math.cos(xx*.012-zz*.083)*.04+
        Math.sin(xx*.21+zz*.34)*.012)*fade;
      const color=new THREE.Color(0x9d8e76).multiplyScalar(1+patina);
      // Feather alpha from the raised center into the exact underlying map.
      const edgeAlpha=Math.max(0,Math.min(1,(1.12-radius)/.28));
      const alpha=edgeAlpha*edgeAlpha*(3-2*edgeAlpha);
      colors.push(1,1,1,alpha);
      if(x<N&&z<N){
        const a=z*(N+1)+x,b=a+1,c=a+N+1,d=c+1;
        indices.push(a,c,b,b,c,d);
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));
    geo.setIndex(indices);geo.computeVertexNormals();
    const groundMaterial=new THREE.MeshStandardMaterial({
      map:terrain.terrainTexture||null,
      color:terrain.terrainTexture?0xffffff:0x9d8e76,
      vertexColors:true,transparent:true,depthWrite:false,roughness:1,metalness:0,
      side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2
    });
    const hill=add(new THREE.Mesh(geo,groundMaterial),'murguduk-hill');
    // The shared satellite overlay uses renderOrder=2. Render the relief AFTER
    // that layer: otherwise the overlay visually flattens and hides the hill.
    hill.renderOrder=3;
    hill.userData.terrainElevationWorld=100;
  }
  groundPatch();

  // Engineering area and curved approach. North edge connects to highway
  // as seen in the aerial photograph; internal service loop faces the radomes.
  // Preserve natural hill soil between separately modelled buildings and roads;
  // a single 170×126m rectangle used to look like a container depot.
  // Stop the paved entrance at its junction with the internal north-south service lane.
  // The former 147m strip continued past the junction into empty steppe.
  box(90,.23,10,-35,7.42,74,'asphalt','internal-access-road');
  box(9,.25,106,10,7.48,14,'asphalt','service-lane');
  box(7,.24,86,-92,7.47,9,'asphalt','antenna-service-access');
  // The external approach is now drawn in the shared road network,
  // from the real schematic trunk route to the western edge of this apron.
  // This avoids disconnected or duplicated road meshes on the site model.

    // Main long flat-roof control/processing buildings in the aerial centre.
  function offices({x,z,w,d,h,levels=2,brick=false}){
    const baseY=7.6,base=brick?'brick':'concrete',countW=Math.max(4,Math.floor(w/5));
    box(w,h,d,x,baseY+h/2,z,base,'control-building');
    box(w+1,.7,d+1,x,baseY+h+.35,z,'roof','control-building-roof');
    for(let row=0;row<levels;row++){
      const windowY=baseY+2.6+row*(h-3.5)/Math.max(1,levels);
      for(let j=0;j<countW;j++){
        const xx=x-w/2+(j+.5)*w/countW;
        for(const side of [-1,1])
          box(Math.min(2.6,w/countW*.56),1.8,.2,xx,windowY,z+side*(d/2+.15),'window','control-building-windows');
      }
    }
    for(let k=0;k<Math.max(3,Math.floor(w/7));k++){
      const xx=x-w/2+(k+.5)*w/Math.floor(w/7);
      box(.42,h+.1,.55,xx,baseY+h/2,z+d/2+.3,'trim','building-buttress');
    }
    box(Math.min(5,w*.15),3.3,.32,x,baseY+1.65,z+d/2+.28,'shadow','main-entrance');
    const ventilator=cylinder(1.2,1.2,1.4,x-w*.31,baseY+h+1.6,z,'steel','roof-fan');
    return ventilator;
  }
  // A sequence of separated low technical blocks, rather than two enormous
  // generic office slabs. Positions remain approximate pending a scaled plan.
  offices({x:-44,z:39,w:43,d:14,h:8,levels:2,brick:false});
  offices({x:31,z:45,w:33,d:13,h:7,levels:1,brick:false});
  offices({x:-46,z:-16,w:30,d:12,h:7,levels:1,brick:true});
  offices({x:53,z:-43,w:21,d:11,h:6,levels:1,brick:true});
  offices({x:-11,z:54,w:22,d:10,h:5,levels:1});
  for(const [x,z,w,d,h] of [[-78,41,15,12,6],[-72,-46,13,11,6],[-15,-55,13,12,7],[66,57,18,14,6]]){
    box(w,h,d,x,7.6+h/2,z,'brick','service-annex');
    box(w+.6,.5,d+.8,x,7.9+h,z,'roof','service-annex-roof');
  }

  // Octagonal, five/seven-section cylindrical masonry support, with
  // turquoise shafts and little horizontal cornices clearly seen in IMG_6181.
  function tallPedestal(cx,cz,baseRadius,height,secondary=false){
    const floor=7.7,n=secondary?4:6;
    // Photographs: pale sand concrete, a 12-sided tapered vertical cylinder,
    // strong stepped cornices at each storey, and narrow turquoise glazing.
    cylinder(baseRadius*.88,baseRadius+1.1,height*.84,cx,floor+height*.42,cz,
      'concrete','antenna-pedestal',12);
    for(let i=0;i<n;i++){
      const y=floor+2+(i+1)*height*.78/(n+1);
      cylinder(baseRadius+.85,baseRadius+.65,.70,cx,y,cz,'trim','tower-horizontal-cornice',12);
      const levelHeight=height*.78/(n+1);
      for(let j=0;j<8;j++){
        const a=j*Math.PI/4;
        const xx=cx+Math.cos(a)*(baseRadius+.08),zz=cz+Math.sin(a)*(baseRadius+.08);
        const pilaster=box(.7,levelHeight*.82,.42,xx,y-levelHeight*.5,zz,'trim','tower-pilaster');
        pilaster.rotation.y=-a;
        if(j%2===0){
          const win=box(1.25,levelHeight*.38,.18,cx+Math.cos(a)*(baseRadius+.52),
            y+levelHeight*.04,cz+Math.sin(a)*(baseRadius+.52),'window','tower-narrow-window');
          win.rotation.y=-a;
        }
      }
    }
    const crownY=floor+height*.85;
    cylinder(baseRadius+1.4,baseRadius+1.4,.8,cx,crownY,cz,'trim','antenna-tower-crown',12);
    cylinder(baseRadius*.8,baseRadius*.9,height*.16,cx,crownY+height*.08,cz,'steel','antenna-yoke-base',12);
    box(baseRadius*2+4,1.0,baseRadius*2+3,cx,floor+height+2,cz,'shadow','yoke-platform');
    // Top bearing machinery is set on a massive rectangular cantilever deck.
    // The older model lacked this characteristic silhouette.
    box(baseRadius*2+8,1.25,baseRadius*2+9,cx,floor+height+1.3,cz,'concrete','cantilever-bearing-deck');
    for(const side of [-1,1]){
      box(baseRadius*2+7,.2,.18,cx,floor+height+2.2,cz+side*(baseRadius+4),'railing','upper-deck-guardrail');
      for(let j=-3;j<=3;j++)
        rod([cx+j*2.3,floor+height+2,cz+side*(baseRadius+4)],
            [cx+j*2.3,floor+height+3.4,cz+side*(baseRadius+4)],.07,'railPaint','upper-deck-railing-post');
    }
    // Narrow vertical window strips run down the photograph-facing sides.
    for(let k=0;k<n;k++){
      const yy=floor+4+k*(height*.77/n);
      for(const a of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
        const radius=baseRadius*.94;
        const glass=box(1.05,Math.max(1.9,height*.77/n*.55),.13,
          cx+Math.cos(a)*radius,yy,cz+Math.sin(a)*radius,
          'window','vertical-glass-block-window');
        glass.rotation.y=-a;
      }
    }
    // Visible balcony rails on top of the pedestal.
    for(const side of [-1,1])for(let k=-2;k<=2;k++){
      const z=cz+k*baseRadius*.42;
      rod([cx+side*(baseRadius+1.3),floor+height+2,z],
          [cx+side*(baseRadius+1.3),floor+height+4,z],.12,'railing','crown-handrail');
    }
    return floor+height+4;
  }

  // The reflector is a real paraboloid with 25m mouth, faceted dark concave
  // panel, radial ribs and circumferential structural hoops. Focus supports
  // are above the rim; a solid cone is visually incorrect.
  function parabolicAntenna({x,z,baseHeight,azimuth=0,tilt=.22,name}){
    const group=new THREE.Group();group.name=name;group.position.set(x,baseHeight,z);
    group.rotation.y=azimuth;group.rotation.x=tilt;root.add(group);
    // Dish shape: bottom at y=0 and R=12.5 at dish edge y=5.6.
    const R=12.5,depth=5.6,segments=56,rings=13,vertices=[],normals=[],indices=[];
    for(let row=0;row<=rings;row++){
      const r=R*row/rings,y=depth*(r/R)**2;
      for(let col=0;col<=segments;col++){
        const a=col*2*Math.PI/segments;
        vertices.push(Math.cos(a)*r,y,Math.sin(a)*r);
      }
    }
    for(let row=0;row<rings;row++)for(let col=0;col<segments;col++){
      const a=row*(segments+1)+col,b=a+1,c=a+segments+1,d=c+1;
      indices.push(a,c,b,b,c,d);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geo.setIndex(indices);geo.computeVertexNormals();
    add(new THREE.Mesh(geo,mat.dish),'25m-parabolic-reflector',group);
    for(let ring=1;ring<=7;ring++){
      const r=R*ring/7,yy=depth*(r/R)**2,pts=[];
      for(let i=0;i<=56;i++){
        const a=i*Math.PI*2/56;pts.push(new THREE.Vector3(Math.cos(a)*r,yy-.14,Math.sin(a)*r));
      }
      add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts.slice(0,-1)),
        new THREE.LineBasicMaterial({color:0x939695,transparent:true,opacity:.67,depthTest:true})
      ),'dish-concentric-truss',group);
    }
    for(let k=0;k<36;k++){
      const a=k*Math.PI/18,c=Math.cos(a),s=Math.sin(a);
      for(let row=0;row<7;row++){
        const ra=R*row/7,rb=R*(row+1)/7;
        const ya=depth*(ra/R)**2-.26,yb=depth*(rb/R)**2-.26;
        rod([ra*c,ya,ra*s],[rb*c,yb,rb*s],row%3===0?.14:.08,
            row%2===0?'steel':'dishRim','dish-radial-rib',group);
      }
    }
    // Fine open-grid reflector: real P-200 surface reads as a metal mesh,
    // not an opaque satellite television dish. Added from the new close-ups.
    // Segments are batched into instanced rods for browser performance.
    for(let ring=2;ring<=13;ring++){
      const r=R*ring/13, yy=depth*(r/R)**2+.035;
      for(let k=0;k<72;k++){
        const a=k*2*Math.PI/72,b=(k+1)*2*Math.PI/72;
        rod([r*Math.cos(a),yy,r*Math.sin(a)],
            [r*Math.cos(b),yy,r*Math.sin(b)],.018,'oxidized','reflector-mesh-rings',group);
      }
    }
    for(let k=0;k<72;k++){
      const a=k*2*Math.PI/72,c=Math.cos(a),ss=Math.sin(a);
      for(let j=0;j<12;j++){
        const r0=R*j/13,r1=R*(j+1)/13;
        rod([r0*c,depth*(r0/R)**2+.04,r0*ss],
            [r1*c,depth*(r1/R)**2+.04,r1*ss],.018,'oxidized','reflector-mesh-spokes',group);
      }
    }
    // Cross-braces under bowl: triangular lattice narrowing at the mounting.
    for(let k=0;k<24;k++){
      const a=2*Math.PI*k/24,c=Math.cos(a),s=Math.sin(a);
      rod([R*c,depth-.24,R*s],[c*2,-1.4,s*2],.10,'steel','dish-support-web',group);
      if(k%2===0)rod([R*c,depth-.24,R*s],
        [R*Math.cos(a+Math.PI/12),depth-.24,R*Math.sin(a+Math.PI/12)],
        .12,'dishRim','dish-rim-strut',group);
    }
    // Stiff continuous circle at mouth rim.
    const torus=new THREE.Mesh(new THREE.TorusGeometry(R,.16,6,64),mat.dishRim);
    torus.rotation.x=Math.PI/2;torus.position.y=depth;
    add(torus,'dish-outer-rim',group);
    const collar=new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.7,3.5,16),mat.steel);
    collar.position.y=-1.9;add(collar,'antenna-central-hub',group);
    // Focus: quadrupod reaching above dish, feed platform and central aerial.
    for(const a of [Math.PI/4,3*Math.PI/4,5*Math.PI/4,7*Math.PI/4]){
      rod([Math.cos(a)*R*.9,depth-.25,Math.sin(a)*R*.9],[0,depth+10,0],
        .18,'steel','feed-support-truss',group);
      rod([Math.cos(a)*R*.9,depth-.25,Math.sin(a)*R*.9],
          [Math.cos(a+Math.PI/2)*R*.9,depth-.25,Math.sin(a+Math.PI/2)*R*.9],
        .09,'steel','feed-upper-crossbracing',group);
    }
    box(2.6,.85,2.9,0,depth+10,0,'steel','antenna-feed-platform',group);
    cylinder(.7,.7,1.6,0,depth+11.2,0,'light','antenna-feed',10,group);
    const mast=rod([0,depth+11.7,0],[0,depth+15.2,0],.09,'railing','antenna-feed-mast',group);
    // The dish moves around this historical two-axis gimbal.
    const yoke=new THREE.Mesh(new THREE.TorusGeometry(4.2,.57,8,32),mat.steel);
    yoke.rotation.z=Math.PI/2;yoke.position.y=-2.5;
    add(yoke,'antenna-azimuth-elevation-yoke',group);
    return group;
  }

  // Ground-floor wing is physically integrated with the main tower, with
  // broad flat canopies and large green glass-block/service openings.
  box(33,5,14,43,10.1,-16,'concrete','main-tower-base-pavilion');
  box(37,.9,16,43,13.1,-16,'concrete','pavilion-cantilever-roof');
  for(let i=0;i<8;i++)
    box(2.8,2.6,.12,29+i*4,10,-8.85,'window','green-glass-block-facade');
  box(2.9,3.4,.2,53,9.6,-8.8,'steelDark','pavilion-service-door');
  const mainHeight=tallPedestal(43,-16,7.2,34,false);
  parabolicAntenna({x:43,z:-16,baseHeight:mainHeight,azimuth:.15,tilt:.18,
    name:'П-200 · основная башенная антенна Ø25 м'});
  // The distant second 25m dish stands farther west: photographic perspective
  // makes it appear smaller, but its mouth diameter is kept exactly the same.
  const secondHeight=tallPedestal(-68,-37,5.8,23,true);
  parabolicAntenna({x:-68,z:-37,baseHeight:secondHeight,azimuth:-.52,tilt:-.14,
    name:'П-200 · вторая антенна Ø25 м'});

  // White protective radome behind the principal pedestal.
  cylinder(11,11,1.5,65,8.5,16,'concrete','radome-base',24);
  const radome=new THREE.Mesh(new THREE.SphereGeometry(10.6,28,16,0,2*Math.PI,0,Math.PI/2),mat.radome);
  radome.position.set(65,10.0,16);add(radome,'white-radome');
  for(let a=0;a<8;a++){
    const angle=a*2*Math.PI/8;
    rod([65+Math.cos(angle)*10.8,10.0,16+Math.sin(angle)*10.8],
        [65+Math.cos(angle)*10.8,13,16+Math.sin(angle)*10.8],
        .10,'railing','radome-service-rail');
  }

  // Additional small radar/optical aerials and sparse instrumentation posts,
  // visible in distance panorama. Avoid implausible forest of giant antennas.
  function auxiliaryDish(x,z,r,height,az=0){
    const pole=cylinder(.55,.85,height,x,7.4+height/2,z,'steel','auxiliary-antenna-pole',12);
    const b=new THREE.Mesh(new THREE.SphereGeometry(r,24,12,0,2*Math.PI,0,Math.PI*.42),mat.dishRim);
    b.position.set(x,8.1+height,z);b.rotation.x=Math.PI/2-.3;b.rotation.y=az;
    add(b,'auxiliary-antenna');
    const support=rod([x,8.1+height,z],[x,8.1+height+r*.45,z],.12,'steel','auxiliary-receiver');
    return {pole,support};
  }
  auxiliaryDish(-26,56,3.5,10,.1);
  auxiliaryDish(48,57,2.8,6,.15);
  auxiliaryDish(-87,13,4.0,12,-.45);
  for(const [x,z] of [[-96,-29],[-36,-63],[10,-65],[85,-46],[95,49]]){
    rod([x,7.8,z],[x,24,z],.18,'steel','telemetry-mast');
    rod([x,24,z],[x+2.6,19,z],.09,'railing','antenna-guy');
  }

  // Sparse service lighting, repair yards and realistic low steppe growth.
  for(const [x,z] of [[-88,38],[-15,69],[87,24],[-52,-57]]){
    const lamp=rod([x,7.5,z],[x,19,z],.16,'steel','streetlight');
    rod([x,19,z],[x+3,20,z],.11,'steel','streetlight-arm');
    box(2,.4,.95,x+3,20,z,'light','streetlight-head');
  }
  const fenceCoords=[];
  for(let x=-101;x<=102;x+=10){fenceCoords.push([x,-79],[x,75]);}
  for(let z=-68;z<=70;z+=9){fenceCoords.push([-103,z],[104,z]);}
  for(const [x,z] of fenceCoords){
    if(z>49&&x>10&&x<37)continue;
    rod([x,6.9,z],[x,9.3,z],.075,'steel','perimeter-fence-post');
  }
  // A few isolated dry scrub tufts around, not over the antennas or roads.
  for(let i=0;i<105;i++){
    const a=i*2.39996,r=70+((i*47)%51),x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(x>19&&x<54&&z>25)continue;
    const shrub=new THREE.Mesh(new THREE.IcosahedronGeometry(.8+(i%4)*.28,0),mat.vegetation);
    shrub.position.set(x,.4+((i%7)*.06),z);
    add(shrub,'semi-desert-scrub');
  }
  for(const batch of rodBatches.values()){
    const mesh=new THREE.InstancedMesh(rodGeometry,mat[batch.material],batch.matrices.length);
    for(let i=0;i<batch.matrices.length;i++)mesh.setMatrixAt(i,batch.matrices[i]);
    mesh.instanceMatrix.needsUpdate=true;
    mesh.frustumCulled=false;mesh.name='Сатурн-МС · ферменные элементы';
    add(mesh,'instanced-antenna-steel',batch.parent);
  }
  root.userData.saturnModel={
    version:'1.4-visible-hill-connected-access',siteNumber:23,siteName:'Сатурн-МС / ИП-5',
    sourceFolder:'1nweD3hi2MRaeVuNOY2GflKtEMQ1RoDXk',
    photosUsed:['IMG_6181.JPG','IMG_5342.JPG','IMG_3645.JPG','ajU0...jpg','IMG_7396.jpeg','IMG_7403.jpeg','IMG_5711.jpeg','IMG_2352.jpeg','IMG_5528.jpeg','IMG_5863.jpeg','IMG_5861.jpeg'],
    antennaType:'П-200',largeAntennaCount:2,dishDiameterMetres:25,
    profile:'two 25m open-grid dishes, concrete ring-storey towers with turquoise window strips and cantilever bearing decks; integrated ground-floor pavilion; separated service blocks',
    modelReliability:'photo-informed, structure dimensions and footprint illustrative',
    featureCounts:features,primitiveCount:primitives,meshCount:objects.length,instancedFrameBatches:rodBatches.size,
    confidence:'relative layout from aerial photograph, approximate 3-anchor external geolocation'
  };
  return root.userData.saturnModel;
}
