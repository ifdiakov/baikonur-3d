import * as THREE from 'three';

/**
 * Гагаринский старт — площадка 1 / пусковая установка 5.
 * Museum-grade schematic reconstruction of the Soyuz/R-7 launch architecture.
 * Shape references: user's 2024 Baikonur archive and contemporary/historical
 * imagery of Site 1. It is NOT an engineering or georeferenced survey.
 * Default mode depicts the retired, empty launch pad (since 2019).
 */
export function buildGagarinPad(root) {
  const palette = {
    concrete: new THREE.MeshStandardMaterial({color:0xa9a79e,roughness:.98}),
    oldConcrete: new THREE.MeshStandardMaterial({color:0x85867f,roughness:1}),
    darkConcrete: new THREE.MeshStandardMaterial({color:0x595d59,roughness:1}),
    gravel: new THREE.MeshStandardMaterial({color:0x756d5f,roughness:1}),
    pit: new THREE.MeshStandardMaterial({color:0x272d2b,roughness:1}),
    metal: new THREE.MeshStandardMaterial({color:0x576b65,metalness:.43,roughness:.69}),
    darkMetal: new THREE.MeshStandardMaterial({color:0x354741,metalness:.54,roughness:.59}),
    green: new THREE.MeshStandardMaterial({color:0x486c56,metalness:.35,roughness:.72}),
    lightGreen: new THREE.MeshStandardMaterial({color:0x77917d,metalness:.35,roughness:.72}),
    rail: new THREE.MeshStandardMaterial({color:0x373b38,metalness:.6,roughness:.52}),
    sleepers: new THREE.MeshStandardMaterial({color:0x645f56,roughness:.9}),
    roof: new THREE.MeshStandardMaterial({color:0x8b9898,roughness:.83,metalness:.14}),
    silver: new THREE.MeshStandardMaterial({color:0xa8b2b3,metalness:.56,roughness:.48}),
    white: new THREE.MeshStandardMaterial({color:0xe9e5d9,roughness:.65}),
    stripe: new THREE.MeshStandardMaterial({color:0xca6752,roughness:.68}),
    warning: new THREE.MeshStandardMaterial({color:0xd5ad51,roughness:.8}),
    darkBlue: new THREE.MeshStandardMaterial({color:0x263a44,roughness:.66}),
    darkWindow: new THREE.MeshStandardMaterial({color:0x354b52,roughness:.45})
  };
  const features={};
  let count=0;
  function register(obj,key){
    if(key){obj.userData.museumComponent=key;features[key]=(features[key]||0)+1;}
    root.add(obj);count++;return obj;
  }
  function box(w,h,d,x,y,z,mat,key,parent=root){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;
    if(key){m.userData.museumComponent=key;features[key]=(features[key]||0)+1;}
    parent.add(m);count++;return m;
  }
  function tube(a,b,r,mat,key,r2=r,segments=8,parent=root){
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),axis=new THREE.Vector3().subVectors(to,from);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r2,r,axis.length(),segments),mat);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize());
    mesh.position.copy(from).add(to).multiplyScalar(.5);
    mesh.castShadow=true;mesh.receiveShadow=true;
    if(key){mesh.userData.museumComponent=key;features[key]=(features[key]||0)+1;}
    parent.add(mesh);count++;return mesh;
  }
  function plate(points,height,mat,key){
    const shape=new THREE.Shape();
    points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));
    shape.closePath();
    const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),mat);
    mesh.rotation.x=-Math.PI/2;mesh.position.y=height;mesh.receiveShadow=true;
    return register(mesh,key);
  }
  function trestle(a,b,half,mat,key){
    const x0=a[0],z0=a[2],x1=b[0],z1=b[2];
    const start=[x0-half,a[1],z0],end=[x1-half,b[1],z1],start2=[x0+half,a[1],z0],end2=[x1+half,b[1],z1];
    tube(start,end,.58,mat,key);tube(start2,end2,.58,mat,key);
    const steps=5;
    for(let i=0;i<=steps;i++){
      const t=i/steps,X=x0+(x1-x0)*t,Y=a[1]+(b[1]-a[1])*t,Z=z0+(z1-z0)*t;
      tube([X-half,Y,Z],[X+half,Y,Z],.3,mat,key);
      if(i<steps){
        const tt=(i+1)/steps;
        tube([X-half,Y,Z],[x0+(x1-x0)*tt+half,a[1]+(b[1]-a[1])*tt,z0+(z1-z0)*tt],.25,mat,key);
      }
    }
  }
  // Satellite-style irregular paved service compound rather than an enormous cube.
  plate([[-67,68],[-60,30],[-53,-9],[-44,-35],[-27,-59],[28,-59],[45,-37],[58,9],[66,64],[40,106],[-45,110]],.10,palette.oldConcrete,'apron');
  // Cracks, resurfacing strips and low seams of the old 1950s-era pavement.
  for(let k=-4;k<=4;k++){
    const x=k*12;
    box(.27,.06,84,x,.18,33,palette.darkConcrete,'pavement-joints');
  }
  for(const z of [15,42,69,96]){
    box(115,.07,.22,0,.18,z,palette.darkConcrete,'pavement-joints');
  }
  // Axial rail approach comes from the processing area at the south end of the site.
  for(const x of [-3.15,3.15]){
    tube([x,.54,15],[x,.54,160],.42,palette.rail,'rail-approach');
    box(.8,.42,147,x,.35,87,palette.rail,'rail-approach');
  }
  for(let z=15;z<=160;z+=4.2)box(11,.30,1.25,0,.19,z,palette.sleepers,'rail-sleepers');
  for(const x of [-12,12])box(2.4,.35,94,x,.28,92,palette.gravel,'rail-shoulder');
  // Flame trench south of central suspended rocket. The old pit is an open
  // slot with tapered sloping concrete banks; dark depth is represented in relief.
  plate([[-12,-9],[12,-9],[15,-27],[24,-91],[31,-141],[-31,-141],[-24,-91],[-15,-27]],.21,palette.pit,'flame-trench');
  plate([[-22,-26],[-14,-27],[-22,-95],[-33,-142],[-44,-142],[-28,-91]],.27,palette.concrete,'flame-trench-bank');
  plate([[14,-27],[22,-26],[28,-91],[44,-142],[33,-142],[22,-95]],.27,palette.concrete,'flame-trench-bank');
  // Reinforced sloped banks in visible 3D; the black slot is intentionally exposed.
  for(const side of [-1,1]){
    const a=[side*15,1,-17],b=[side*35,.8,-139];
    tube(a,b,1.1,palette.oldConcrete,'flame-trench-rim');
    for(let j=0;j<13;j++){
      const z=-20-j*9.3,x=side*(18+j*.85);
      tube([x,.2,z],[x+side*8,2.7,z-1],.45,palette.oldConcrete,'bank-ribs');
    }
  }
  // High deck suspended over the engine channel, with open center.
  for(const side of [-1,1]){
    box(17,3.0,39,side*22,2.1,0,palette.concrete,'launch-deck');
    box(2.0,6,45,side*33.5,2.8,-1,palette.oldConcrete,'deck-parapet');
    box(3.8,8,22,side*23,5.4,24,palette.darkConcrete,'pad-foundations');
  }
  for(const z of [-19,22])box(53,2.8,4,0,2.2,z,palette.concrete,'deck-bridges');
  // The steel start table, central engine slot and bolted ring.
  const baseRing=new THREE.Mesh(new THREE.TorusGeometry(11,1.5,8,32),palette.darkMetal);
  baseRing.rotation.x=Math.PI/2;baseRing.position.set(0,9.2,1);
  register(baseRing,'start-table');
  for(let a=0;a<12;a++){
    const t=a*Math.PI/6,x=Math.cos(t)*11,z=1+Math.sin(t)*11;
    box(1.15,.9,1.35,x,9,z,palette.rail,'start-table');
  }
  // Four 'tulip' petals: counterweighted diagonal suspension from the skirt of R-7.
  for(let a=0;a<4;a++){
    const angle=Math.PI/4+a*Math.PI/2,dx=Math.cos(angle),dz=Math.sin(angle);
    const pivot=[dx*31,7.3,dz*31+1],inner=[dx*9.2,25.5,dz*9.2+1];
    const pivot2=[dx*29,8.5,dz*29+1],inner2=[dx*11,24,dz*11+1];
    tube(pivot,inner,1.55,palette.green,'tulip-arm',1.1,10);
    tube(pivot2,inner2,.85,palette.lightGreen,'tulip-arm');
    const tangent=[-dz,0,dx];
    for(let t=0;t<4;t++){
      const u=(t+1)/5,cx=pivot[0]+(inner[0]-pivot[0])*u,cy=pivot[1]+(inner[1]-pivot[1])*u,cz=pivot[2]+(inner[2]-pivot[2])*u;
      tube([cx+tangent[0]*2,cy+1,cz+tangent[2]*2],[cx-tangent[0]*2,cy-1,cz-tangent[2]*2],.4,palette.darkMetal,'tulip-lattice');
    }
    tube([pivot[0]+dx*4,2,pivot[2]+dz*4],[pivot[0],13,pivot[2]],.6,palette.darkMetal,'tulip-counterweight');
    const cw=new THREE.Mesh(new THREE.CylinderGeometry(3.6,3.6,2.2,12),palette.darkMetal);
    cw.rotation.x=Math.PI/2;cw.position.set(pivot[0]+dx*5,5,pivot[2]+dz*5);
    register(cw,'tulip-counterweight');
    // Curved support plates near the body of R-7 form the iconic petal tips.
    tube([inner[0],inner[1],inner[2]],[dx*5.7,26.4,dz*5.7+1],1.18,palette.green,'tulip-top',.82,10);
  }
  // Twin hinged R-7/Soyuz service gantries: the iconic swept-back lattice
  // 'wings' visible at Pad 1, rather than two vertical container-like towers.
  // Museum default = retracted / launch configuration, no vehicle installed.
  // Each half has paired longitudinal chords, bracing, 8 access levels,
  // folding balconies, ladders, outriggers, pivot drums and counterweights.
  function serviceHalf(sign){
    const groupName=sign<0?'west':'east';
    const baseX=sign*18,topX=sign*92,baseY=5,topY=65,zCenter=19,zWidth=7.8;
    const deckLevelCount=8;
    const at=(t,zOffset=0,sideOffset=0)=>[
      baseX+(topX-baseX)*t+sign*sideOffset,
      baseY+(topY-baseY)*t,
      zCenter+zOffset
    ];
    // Heavy tapered paired diagonal beams with continuous rails. An elevated V
    // silhouette is the defining difference from modern enclosed Soyuz gantries.
    for(const z of [-zWidth,zWidth]){
      tube(at(0,z),at(1,z),1.02,palette.green,'service-gantry',.68,10);
      tube(at(0,z,3.5),at(1,z,3.5),.52,palette.darkMetal,'gantry-second-chord',.36);
      tube(at(0,z,-1.7),at(1,z,-1.7),.36,palette.lightGreen,'gantry-third-chord');
    }
    for(let i=0;i<deckLevelCount;i++){
      const t=i/(deckLevelCount-1),nT=Math.min(1,t+.095);
      const [x,y,z]=at(t,0);
      const [nx,ny,nz]=at(nT,0);
      // Zigzag steel compression/extension diagonals between both chords.
      for(const zz of [-zWidth,zWidth]){
        tube(at(t,zz),at(nT,-zz),.35,palette.lightGreen,'gantry-cross-bracing');
        tube(at(t,-zz),at(nT,zz),.35,palette.darkMetal,'gantry-cross-bracing');
        tube(at(t,zz,3.5),at(nT,zz,-1.7),.3,palette.green,'gantry-cross-bracing');
        tube(at(t,zz,-1.7),at(nT,zz,3.5),.3,palette.darkMetal,'gantry-cross-bracing');
      }
      tube([x,y,zCenter-zWidth],[x,y,zCenter+zWidth],.55,palette.darkMetal,'gantry-transverse-beam');
      // Narrow ribbed service balconies with cage-like working platforms, hinged
      // to the main gantry chord. In open configuration platforms point inward.
      if(i>0){
        const deckX=x-sign*10.4;
        box(23,.73,19,deckX,y+1.4,zCenter,palette.metal,'gantry-platform');
        box(24,.34,.8,deckX,y+2.8,zCenter-zWidth-1.2,palette.warning,'gantry-edge-rail');
        box(24,.34,.8,deckX,y+2.8,zCenter+zWidth+1.2,palette.warning,'gantry-edge-rail');
        for(const shift of [-9,-3,3,9]){
          tube([deckX+shift,y+1.8,zCenter-zWidth-1],[deckX+shift,y+3.8,zCenter-zWidth-1],.2,palette.lightGreen,'gantry-platform-post');
          tube([deckX+shift,y+1.8,zCenter+zWidth+1],[deckX+shift,y+3.8,zCenter+zWidth+1],.2,palette.lightGreen,'gantry-platform-post');
        }
        // Angled struts support each suspended balcony.
        tube([deckX-sign*9,y,zCenter-zWidth],[x,y+5.0,zCenter-zWidth],.45,palette.green,'gantry-balcony-bracket');
        tube([deckX-sign*9,y,zCenter+zWidth],[x,y+5.0,zCenter+zWidth],.45,palette.green,'gantry-balcony-bracket');
        for(const offset of [-5,5])tube([deckX-sign*7,y+1.3,zCenter+offset],[x,y+4,zCenter+offset],.24,palette.lightGreen,'gantry-balcony-diagonal');
      }
      if(i<deckLevelCount-1){
        const t0=t,t1=(i+1)/(deckLevelCount-1);
        const p0=at(t0,-zWidth-.9),p1=at(t1,-zWidth-.9);
        // Long flight of inclined ladders / narrow maintenance walkway.
        tube([p0[0],p0[1],p0[2]],[p1[0],p1[1],p1[2]],.4,palette.warning,'gantry-stairs');
        tube([p0[0],p0[1],p0[2]+2],[p1[0],p1[1],p1[2]+2],.4,palette.warning,'gantry-stairs');
        for(let step=0;step<7;step++){
          const u=(step+.5)/7;
          const xx=p0[0]+(p1[0]-p0[0])*u,yy=p0[1]+(p1[1]-p0[1])*u,zz=p0[2];
          tube([xx,yy,zz],[xx,yy,zz+2],.18,palette.lightGreen,'gantry-stair-steps');
        }
      }
    }
    // Massive pivot drums close to the start table, with paired structural braces.
    const hingeX=baseX-sign*1.5;
    const pivot=new THREE.Mesh(new THREE.CylinderGeometry(3.7,3.7,20,20),palette.darkMetal);
    pivot.rotation.x=Math.PI/2;pivot.position.set(hingeX,6,zCenter);
    register(pivot,'gantry-hinge');
    tube([hingeX,4,zCenter-16],[hingeX,4,zCenter+16],1.2,palette.darkMetal,'gantry-pivot-shaft');
    for(const z of [zCenter-11,zCenter+11]){
      box(12,8,7,hingeX+sign*2,4,z,palette.darkConcrete,'gantry-hinge-foundation');
      tube([hingeX+sign*5,5,z],[hingeX+sign*28,30,z],.72,palette.green,'gantry-hydraulic-actuator');
      tube([hingeX+sign*13,9,z],[hingeX+sign*38,26,z],.54,palette.silver,'gantry-hydraulic-piston');
      const counter=new THREE.Mesh(new THREE.CylinderGeometry(2.7,2.7,2.6,14),palette.warning);
      counter.rotation.x=Math.PI/2;counter.position.set(hingeX-sign*8,7,z);register(counter,'gantry-counterweight');
    }
    // A colored safety-light row emphasises the arm silhouette when zoomed in.
    for(let j=1;j<deckLevelCount;j++){
      const t=j/(deckLevelCount-1),p=at(t,0);
      box(1.6,.5,2,p[0],p[1]+2.3,zCenter,palette.warning,'gantry-safety-mark');
    }
  }
  serviceHalf(-1);serviceHalf(1);
  // Cable mast with longitudinal braces and landing at the top.
  trestle([-47,3,7],[-44,48,5],2.4,palette.darkMetal,'cable-mast');
  box(7,.7,8,-44,48,5,palette.metal,'cable-mast');
  for(let y=8;y<48;y+=5)box(7,.24,.45,-44,y,7.3,palette.warning,'cable-mast-ladder');
  // Floodlight towers and flagpole: tapered truss lattice with diagonal braces.
  function floodTower(x,z,id){
    const bottom=4.9,top=2.25,h=50,segments=8;
    const leg=(u,v,t)=>{const w=bottom+(top-bottom)*t;return [x+u*w,2+h*t,z+v*w]};
    for(const sx of [-1,1])for(const sz of [-1,1]){
      tube(leg(sx,sz,0),leg(sx,sz,1),.38,palette.silver,'lighting-tower');
      for(let k=0;k<segments;k++){
        const t=k/segments,t2=(k+1)/segments;
        tube(leg(sx,sz,t),leg(-sx,sz,t2),.19,k%2?palette.silver:palette.stripe,'lighting-truss');
        tube(leg(sx,sz,t),leg(sx,-sz,t2),.18,k%2?palette.stripe:palette.silver,'lighting-truss');
      }
    }
    for(let k=0;k<=segments;k++){const t=k/segments,w=bottom+(top-bottom)*t;for(const sx of [-1,1])tube([x+sx*w,2+h*t,z-w],[x+sx*w,2+h*t,z+w],.16,palette.darkMetal,'lighting-crossbar')}
    box(17,1.7,1.3,x,53,z,palette.darkMetal,'floodlight-array');
    for(let k=0;k<10;k++)for(let q=0;q<3;q++)box(1.12,1.05,.18,x-7.2+k*1.57,55+q*1.23,z+.7,palette.white,'floodlight-array');
  }
  floodTower(-70,-35,0);floodTower(70,-35,1);
  floodTower(-70,67,2);floodTower(70,67,3);
  // Low utility buildings: identifiable roofs, roller doors, vents, pipe galleries.
  function utilityBuilding(x,z,w,d,style){
    const height=style?7:5.5;
    box(w,height,d,x,height/2+.4,z,palette.concrete,'utility-building');
    box(w+1.2,.8,d+1.2,x,height+.8,z,palette.roof,'utility-roof');
    const door=box(Math.min(w*.46,7),3.5,.22,x,2.3,z+d/2+.18,palette.darkBlue,'utility-doors');
    for(let j=0;j<5;j++)box(1,.6,.20,x-w*.34+j*w*.17,height*.54,z+d/2+.19,palette.darkWindow,'utility-windows');
    for(let j=0;j<3;j++)box(1.2,1.2,1.2,x-w*.3+j*w*.27,height+1.9,z-d*.18,palette.silver,'utility-vents');
    return door;
  }
  utilityBuilding(-59,88,27,17,1);utilityBuilding(60,87,24,18,0);
  utilityBuilding(-57,0,18,16,0);
  for(const side of [-1,1]){
    // Fuel and oxygen engineering lines and horizontal cylindrical vessels.
    const tank=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,17,16),palette.silver);
    tank.rotation.z=Math.PI/2;tank.position.set(side*59,4.1,40);register(tank,'tank');
    for(const zz of [35,44])tube([side*42,1,zz],[side*56,1,zz],.43,palette.silver,'fuel-piping');
    for(const zz of [39,48])box(3,.4,1.3,side*59,1.7,zz,palette.darkConcrete,'tank-cradle');
  }
  // Fixed metal stairways alongside the trench and safety railings.
  for(const side of [-1,1]){
    trestle([side*27,2,-9],[side*35,1,-36],1,palette.metal,'trench-stairs');
    for(let z=-7;z>=-52;z-=5){
      tube([side*38,2,z],[side*38,4.4,z],.17,palette.lightGreen,'safety-railing');
    }
    tube([side*38,4.4,-7],[side*38,4.4,-52],.19,palette.lightGreen,'safety-railing');
  }
  // Optional R-7/Soyuz exhibit: never claim a rocket is currently standing here.
  const rocket=new THREE.Group();rocket.name='R-7/Soyuz — optional historical exhibit';
  rocket.position.set(0,0,1);root.add(rocket);
  function rocketCyl(top,bottom,height,y,mat,x=0,z=0,seg=18){
    const m=new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,height,seg),mat);
    m.position.set(x,y,z);m.castShadow=true;rocket.add(m);return m;
  }
  rocketCyl(3.4,3.4,43,46,palette.white);
  rocketCyl(3.4,3.4,7,72,palette.stripe);
  rocketCyl(3.4,3.4,11,81,palette.white);
  const nose=new THREE.Mesh(new THREE.ConeGeometry(3.45,12,20),palette.white);nose.position.y=92;rocket.add(nose);
  for(let k=0;k<4;k++){
    const a=Math.PI/4+k*Math.PI/2,x=Math.cos(a)*6.3,z=Math.sin(a)*6.3;
    rocketCyl(1.9,3.2,26,33,palette.white,x,z);
    rocketCyl(1.3,2.0,8,50,palette.stripe,x,z);
    const fin=new THREE.Mesh(new THREE.ConeGeometry(1.9,6,12),palette.white);fin.position.set(x,57,z);rocket.add(fin);
    rocketCyl(2.3,2.3,1,19,palette.darkMetal,x,z);
  }
  rocket.visible=false; // Actual 2026 memorial state, optional interpretation only.
  root.userData.gagarinModel={version:'1.0',mode:'historical-reconstruction',source:'Google Drive refs + published pad 1 surveys',featureCounts:features,meshCount:count,rocketExhibitDefault:false};
  return {rocket,features,meshCount:count};
}
