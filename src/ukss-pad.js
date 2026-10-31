import * as THREE from 'three';
import {RAIL_METRES} from './rail-profile.js?v=20261031-facilities-rails-lighting-v1';
import {registerFacilityFloodlights,registerFacilityBeacon} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';
import {createSurfacePalette} from './surface-materials.js';

/**
 * Site 250 / UKSS: architectural museum study, v1.0.
 * Visually checked against the owner's 16 images in the dedicated Drive folder.
 * IMG_3883: overall layout, retracted 17T113 service tower and transverse trench.
 * IMG_0998: bridge, piers, fixed fuelling mast and service galleries.
 * IMG_1004 / IMG_7999: service tower, open decks, sheet sides and rail bogies.
 * IMG_2893 / IMG_2894 / IMG_2906: trench lining, sump, rail deck and pipe trestle.
 * Local +Z is the rail approach; ONE petal-shaped flame channel opens toward +X.
 * y=0 is ground level. The trench is genuinely below grade, down to y=-32.
 * Dimensions and schematic orientation are interpretative, not surveyed.
 */
export const UKSS_YAW=-.56;
export const UKSS_TRENCH = [
 // One elongated petal, traced from the owner's overhead photograph.
 [-64,2,1,-32],[-45,34,8,-32],[0,59,16,-32],[35,76,26,-31],
 [70,79,35,-28],[110,65,30,-21],[160,45,22,-11],[215,23,12,-4],[280,1,.7,0]
];

// The imported asset supplies the actual opening at grade, in the same local X/Z
// frame as the model. A null contour retains the procedural fallback's stations.
export function normalizeUkssContour(contour) {
  if(!Array.isArray(contour))throw new TypeError('UKSS terrain contour must be an array');
  const ring=[];
  for(const p of contour){
    if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw new TypeError('UKSS terrain contour contains an invalid point');
    if(!ring.length||Math.hypot(p[0]-ring.at(-1)[0],p[1]-ring.at(-1)[1])>1e-7)ring.push([...p]);
  }
  if(ring.length>1&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<1e-7)ring.pop();
  const area=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
  if(ring.length<3||ring.length>512||Math.abs(area)<1e-6)throw new TypeError('UKSS terrain contour must have 3–512 vertices and non-zero area');
  return ring;
}

// Cut only the terrain and schematic overlays, leaving the real 3D trench visible.
// Keep preceding terrain shader hooks and include the contour in the program key.
export function maskUkssTerrain(material, origin, scale, enabled={value:1}, contour=null) {
  if(material.userData.ukssGroundCutout)return;
  const polygon=contour==null?null:normalizeUkssContour(contour);
  const previousKey=material.customProgramCacheKey();
  const number=n=>Number(n).toFixed(7);
  const polygonBounds=polygon?{minX:Math.min(...polygon.map(p=>p[0])),maxX:Math.max(...polygon.map(p=>p[0])),minZ:Math.min(...polygon.map(p=>p[1])),maxZ:Math.max(...polygon.map(p=>p[1]))}:null;
  const polygonCode=polygon?.map((a,i)=>{
    const b=polygon[(i+1)%polygon.length];if(number(a[1])===number(b[1]))return '';
    return `if(((up.y>${number(a[1])})!=(up.y>${number(b[1])}))&&up.x<(${number((b[0]-a[0])/(b[1]-a[1]))})*(up.y-(${number(a[1])}))+(${number(a[0])}))ukssInside=!ukssInside;`;
  }).join('\n');
  material.userData.ukssGroundCutout=true;
  const prior=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    prior.call(material,shader,renderer);
    shader.uniforms.ukssCutout={value:new THREE.Vector3(origin.x,origin.z,scale)};
    shader.uniforms.ukssCutoutEnabled=enabled;
    shader.vertexShader=shader.vertexShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vUkssWorld;').replace('#include <project_vertex>',
      '#include <project_vertex>\nvUkssWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    const widthCode=UKSS_TRENCH.slice(1).map((s,i)=>{
      const a=UKSS_TRENCH[i];
      return `${i?'else ':''}if(ax<=${s[0].toFixed(1)})hw=mix(${a[1].toFixed(1)},${s[1].toFixed(1)},clamp((ax-(${a[0].toFixed(1)}))/${(s[0]-a[0]).toFixed(1)},0.0,1.0));`;
    }).join('\n');
    const test=polygon?`if(ukssCutoutEnabled>0.5&&up.x>=${number(polygonBounds.minX)}&&up.x<=${number(polygonBounds.maxX)}&&up.y>=${number(polygonBounds.minZ)}&&up.y<=${number(polygonBounds.maxZ)}){bool ukssInside=false;\n${polygonCode}\nif(ukssInside)discard;}`:
      `float ax=up.x;float hw=0.0;\n${widthCode}\nif(ukssCutoutEnabled>0.5&&ax>-63.98&&ax<279.98&&abs(up.y)<hw-0.02)discard;`;
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vUkssWorld;\nuniform vec3 ukssCutout;\nuniform float ukssCutoutEnabled;').replace('#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>\nvec2 up=(vUkssWorld.xz-ukssCutout.xy)/ukssCutout.z;\nup=mat2(0.84725511,-0.53118620,0.53118620,0.84725511)*up;\n${test}`);
  };
  material.customProgramCacheKey=()=>previousKey+'|'+(polygon?'ukss-polygon-v1:'+JSON.stringify(polygon):'ukss-single-petal-v2');
  material.needsUpdate=true;
}

export function buildUkssPad(root) {
  root.name='Пл. 250 — УКСС «Энергия» / один лепестковый газоотвод';root.rotation.y=UKSS_YAW;
  const colors={concrete:0xa8a59b,edge:0xc4bfb2,oldConcrete:0x77766c,
    steel:0x6c786d,green:0x6f7e59,dark:0x353e3a,rust:0x85513e,
    sheet:0x87928f,rail:0x454844,pipe:0xb3b5a9,gravel:0x969182,yellow:0xc1a04e,
    white:0xd7d5c9,red:0x9e5442,glass:0x34484b,water:0x405d57};
  const mats=createSurfacePalette(root,colors,{
    concrete:'concrete',edge:'concrete',oldConcrete:'concrete',
    steel:'metal',green:'paint',dark:'metal',rust:'rust',sheet:'sheet',
    rail:'metal',pipe:'paint',yellow:'paint',white:'paint',red:'paint'
  },{water:{roughness:.38},glass:{roughness:.3}});
  mats.concrete.side=THREE.DoubleSide;mats.oldConcrete.side=THREE.DoubleSide;
  const geometries={box:new THREE.BoxGeometry(1,1,1),rod:new THREE.CylinderGeometry(1,1,1,6)};
  const batches=new Map(),surfaces=new Map(),features={};let primitives=0;
  const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),matrix=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0);
  function count(key){features[key]=(features[key]||0)+1;primitives++}
  function instance(kind,mat,key,pos,size,rotation){
    const id=kind+':'+mat;let b=batches.get(id);if(!b){b={kind,mat,matrices:[]};batches.set(id,b)}
    matrix.compose(p.fromArray(pos),rotation||q.identity(),s.fromArray(size));b.matrices.push(matrix.clone());count(key);
  }
  function box(x,y,z,w,h,d,mat,key,rotation=0){instance('box',mat,key,[x,y,z],[w,h,d],new THREE.Quaternion().setFromAxisAngle(up,rotation))}
  function bar(a,b,r,mat,key){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),dir=bv.clone().sub(av),len=dir.length();if(len<.001)return;instance('rod',mat,key,av.add(bv).multiplyScalar(.5).toArray(),[r,len,r],new THREE.Quaternion().setFromUnitVectors(up,dir.divideScalar(len)))}
  function quad(a,b,c,d,mat,key){
    const id=mat+':'+key;let f=surfaces.get(id);if(!f){f={mat,key,vertices:[]};surfaces.set(id,f)}
    f.vertices.push(...a,...b,...c,...a,...c,...d);count(key);
  }
  function railing(a,b,mat='yellow',height=1.3){
    bar([a[0],a[1]+height,a[2]],[b[0],b[1]+height,b[2]],.11,mat,'guardrails');
    bar([a[0],a[1]+height*.5,a[2]],[b[0],b[1]+height*.5,b[2]],.07,mat,'guardrails');
    const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/3));
    for(let j=0;j<=n;j++){const t=j/n,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=a[1]+(b[1]-a[1])*t;bar([x,y,z],[x,y+height,z],.08,mat,'guardrails')}
  }
  function lattice(x,z,y0,height,width,depth,levels,key,mat='steel'){
    for(let level=0;level<levels;level++){
      const y=y0+height*level/levels,yn=y0+height*(level+1)/levels;
      for(const sign of [-1,1]){
        bar([x+sign*width/2,y,z-depth/2],[x+sign*width/2,yn,z-depth/2],.38,mat,key);
        bar([x+sign*width/2,y,z+depth/2],[x+sign*width/2,yn,z+depth/2],.38,mat,key);
        bar([x-width/2,y,z+sign*depth/2],[x+width/2,y,z+sign*depth/2],.24,mat,key);
        bar([x+sign*width/2,y,z-depth/2],[x+sign*width/2,y,z+depth/2],.24,mat,key);
        bar([x-width/2,y,z+sign*depth/2],[x+width/2,yn,z+sign*depth/2],.18,mat,key);
        bar([x+width/2,y,z+sign*depth/2],[x-width/2,yn,z+sign*depth/2],.18,mat,key);
        bar([x+sign*width/2,y,z-depth/2],[x+sign*width/2,yn,z+depth/2],.18,mat,key);
      }
    }
  }

  // One deep petal: broad rounded chamber and a long tapering outlet.
  for(const side of [1])for(let i=0;i<UKSS_TRENCH.length-1;i++){
    const a=UKSS_TRENCH[i],b=UKSS_TRENCH[i+1],x0=side*a[0],x1=side*b[0];
    quad([x0,a[3],-a[2]],[x1,b[3],-b[2]],[x1,b[3],b[2]],[x0,a[3],a[2]],'oldConcrete','flame-floor');
    for(const bank of [-1,1]){
      quad([x0,a[3],bank*a[2]],[x1,b[3],bank*b[2]],[x1,0,bank*b[1]],[x0,0,bank*a[1]],'concrete','trench-banks');
      // Photo-visible grid of concrete lining slabs, with seams following the slope.
      const steps=Math.ceil((b[0]-a[0])/5);
      for(let j=0;j<=steps;j++){
        const t=j/steps,x=x0+(x1-x0)*t,y=a[3]+(b[3]-a[3])*t,inner=a[2]+(b[2]-a[2])*t,outer=a[1]+(b[1]-a[1])*t;
        bar([x,y+.06,bank*inner],[x,.06,bank*outer],.075,'oldConcrete','lining-seams');
      }
      for(let j=1;j<9;j++){const t=j/9;bar([x0,a[3]*(1-t)+.07,bank*(a[2]+(a[1]-a[2])*t)],[x1,b[3]*(1-t)+.07,bank*(b[2]+(b[1]-b[2])*t)],.075,'oldConcrete','lining-seams')}
      bar([x0,.25,bank*a[1]],[x1,.25,bank*b[1]],.65,'edge','trench-rim');
      railing([x0,.6,bank*(a[1]+1.3)],[x1,.6,bank*(b[1]+1.3)],'steel');
    }
  }
  // Recessed rectangular catch basins visible in IMG_2894 / IMG_1002.
  for(const side of [1]){
    box(side*48,-30.32,0,20,.1,26,'water','sumps');
    for(const z of [-13.5,13.5])box(side*48,-30.12,z,22,.5,.7,'edge','sumps');
    for(const x of [-11,11])box(side*48+x,-30.12,0,.7,.5,27,'edge','sumps');
  }
  // Curved central deflector redirects the exhaust into the single outlet.
  for(let i=0;i<12;i++){
    const x0=-20+i*3.75,x1=x0+3.75,y0=-32+20*(1-Math.sin((x0+20)/45*Math.PI/2)),y1=-32+20*(1-Math.sin((x1+20)/45*Math.PI/2));
    quad([x0,y0,-12],[x1,y1,-12],[x1,y1,12],[x0,y0,12],'dark','flame-deflector');
  }

  // Six concrete piers in two rows, carrying a bridge with a real open exhaust bay.
  for(const x of [-52,24])for(const z of [-26,0,26]){
    box(x,-15,z,8,34,9,'edge','bridge-piers');
    box(x,-30.5,z,11,2,13,'oldConcrete','pier-footings');
    for(let y=-27;y<1;y+=4)box(x+(x<0?-.1:.1),y,z,8.3,.2,9.3,'concrete','pier-joints');
  }
  for(const side of [-1,1]){
    const outer=side<0?-64:30;
    box(side<0?-40:23,2.8,0,side<0?48:13,5.6,114,'concrete','bridge-deck');
    box(outer,5.5,0,.8,2,114,'edge','bridge-parapets');
    if(side<0)for(const z of [-47,47])box(-17,2.8,z,94,5.6,20,'concrete','bridge-deck');
    for(let z=-55;z<=55;z+=3)box(outer,3.2,z,.18,3.8,.15,'oldConcrete','bridge-panel-seams');
    railing([outer,4.8,-56],[outer,4.8,56]);
    // Approach slab reaches the retracted mobile service tower.
    box(side*18,.2,141,17,.4,166,'concrete','rail-apron');
  }
  for(const x of [-14,14])for(const z of [-13,13]){
    box(x,7.2,z,5,4.3,5,'steel','launch-supports');
    box(x,9.6,z,6,.6,6,'yellow','launch-supports');
  }
  for(const z of [-30,30]){
    box(0,4.5,z,34,2.4,4,'dark','launch-frame');
    railing([-16,5.8,z],[16,5.8,z]);
  }

  // Track-pair spacing is authored; each running track uses the shared profile.
  for(const center of [-18,18]){
    box(center,.9,156.5,RAIL_METRES.ballastWidth,.8,141,'gravel','rail-beds');
    for(let z=86;z<=225;z+=3.2)box(center,1.38,z,RAIL_METRES.sleeperLength,RAIL_METRES.sleeperHeight,RAIL_METRES.sleeperWidth,'oldConcrete','sleepers');
    quad([center-8,5.6,56.5],[center+8,5.6,56.5],[center+8,1.2,86],[center-8,1.2,86],'concrete','rail-ramp');
    for(const dx of [-RAIL_METRES.gauge/2,RAIL_METRES.gauge/2]){
      const x=center+dx,half=RAIL_METRES.headWidth/2,h=RAIL_METRES.railHeight;
      quad([x-half,6.05,56.5],[x-half,1.73,86],[x+half,1.73,86],[x+half,6.05,56.5],'rail','rail-ramp');
      for(const side of [-1,1])quad([x+side*half,6.05,56.5],[x+side*half,6.05-h,56.5],[x+side*half,1.73-h,86],[x+side*half,1.73,86],'rail','rail-ramp');
      box(x,1.73-h/2,156.5,RAIL_METRES.headWidth,h,141,'rail','approach-rails');
      box(x,6.05-h/2,0,RAIL_METRES.headWidth,h,113,'rail','bridge-rails');
    }
  }

  // Retracted mobile service tower 17T113. The rocket envelope stays empty.
  const gz=166;
  for(const x of [-23,23]){
    box(x,4.2,gz,8,5.4,37,'dark','gantry-bogies');
    for(const z of [-14,-7,7,14])for(const side of [-1,1])bar([x+side*3.3,2.5,gz+z],[x+side*3.9,2.5,gz+z],1.45,'rail','gantry-wheels');
    lattice(x,gz,7,95,5,30,12,'mobile-gantry','green');
    box(x+Math.sign(x)*3.2,58,gz,1.1,88,31,'sheet','gantry-side-sheets');
    for(let y=16;y<102;y+=5)box(x+Math.sign(x)*3.85,y,gz,.12,.16,31,'oldConcrete','sheet-joints');
    for(let z=-14;z<=14;z+=3.5)bar([x+Math.sign(x)*3.9,14,gz+z],[x+Math.sign(x)*3.9,101,gz+z],.055,'steel','sheet-joints');
    lattice(x,gz-17,7,103,3.8,3.5,14,'gantry-front-posts','green');
  }
  const decks=[];
  for(let n=0;n<11;n++){
    const y=14+n*8,r=n<5?12.5:n<8?10:7.5;
    const shape=new THREE.Shape();shape.moveTo(-20,-16);shape.lineTo(20,-16);shape.lineTo(20,16);shape.lineTo(-20,16);shape.closePath();
    const hole=new THREE.Path();hole.absarc(0,0,r,0,Math.PI*2,true);shape.holes.push(hole);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.65,bevelEnabled:false,curveSegments:32});
    geo.rotateX(-Math.PI/2);geo.translate(0,y,gz);
    const mesh=new THREE.Mesh(geo,n%2?mats.green:mats.rust);mesh.name='17T113 / ярус '+(n+1);
    mesh.userData.museumComponent='open-service-decks';mesh.userData.aperture={axis:[0,gz],radius:r,y};root.add(mesh);decks.push({y,radius:r});count('open-service-decks');
    for(const side of [-1,1]){
      bar([side*20,y-.7,gz-16],[side*20,y-.7,gz+16],.65,n%2?'green':'rust','gantry-deck-trusses');
      bar([side*20,y-2.7,gz-16],[side*20,y-2.7,gz+16],.35,'steel','gantry-deck-trusses');
      for(let z=-16;z<15;z+=5.3)bar([side*20,y-.8,gz+z],[side*20,y-2.7,gz+z+5.3],.16,'rust','gantry-deck-trusses');
      railing([side*20,y+.65,gz-16],[side*20,y+.65,gz+16],'steel');
      // Alternating flights on the side, with real treads and handrails.
      if(n<10){const za=n%2?gz+12:gz-12,zb=n%2?gz-12:gz+12;
        for(let k=0;k<=18;k++)box(side*18,y+k*8/18,za+(zb-za)*k/18,2.4,.18,1.2,'steel','gantry-stairs');
        bar([side*16.6,y+1.3,za],[side*16.6,y+9.3,zb],.1,'yellow','gantry-stairs');
      }
    }
    // Round guardrail around the opening, with individually modelled posts.
    for(let k=0;k<28;k++){
      const a=k*Math.PI/14,b=(k+1)*Math.PI/14;
      bar([Math.cos(a)*r,y+1.9,gz+Math.sin(a)*r],[Math.cos(b)*r,y+1.9,gz+Math.sin(b)*r],.075,'steel','deck-aperture-rail');
      if(k%2===0)bar([Math.cos(a)*r,y+.65,gz+Math.sin(a)*r],[Math.cos(a)*r,y+1.9,gz+Math.sin(a)*r],.075,'steel','deck-aperture-rail');
    }
  }
  box(0,104,gz+10,43,4,9,'steel','gantry-crown');
  box(0,108,gz+10,12,4,7,'sheet','gantry-crane-cab');
  registerFacilityBeacon(root,{id:'ukss-mobile-gantry',position:[0,110,gz+10],kind:'service-tower'});
  for(const x of [-4,0,4])box(x,108.6,gz+6.45,2.6,1.7,.15,'glass','gantry-crane-cab');
  for(const x of [-15,15])box(x,103,gz+2,6,2,24,'rust','gantry-crown');
  railing([-21,106,gz+6],[21,106,gz+6],'steel');

  // Fixed fuelling/umbilical mast: narrower, asymmetric and separate from the mobile tower.
  const mx=-46,mz=0;
  box(mx,3,mz,24,6,29,'concrete','mast-foundation');
  lattice(mx,mz,6,81,15,19,10,'fuelling-mast');
  registerFacilityBeacon(root,{id:'ukss-fuelling-mast',position:[mx+7.5,87,mz+9.5],kind:'service-tower'});
  for(let n=0;n<10;n++){
    const y=10+n*7.6,w=n>=6&&n<=8?27:15;
    box(mx+(w-15)/2,y,mz,w,.7,20,'steel','mast-platforms');
    railing([mx-8,y+.4,mz-10],[mx+w-8,y+.4,mz-10],'steel');
    railing([mx+w-8,y+.4,mz-10],[mx+w-8,y+.4,mz+10],'steel');
    box(mx-3,y+2,mz+7,5,3,5,'sheet','mast-equipment');
  }
  for(const y of [18,48,65,73]){
    box(-21,y,0,35,1.8,4,'green','umbilical-arms');
    bar([-38,y-4,0],[-4,y,0],.3,'steel','umbilical-arms');
    for(let x=-35;x<-5;x+=4)bar([x,y,1.8],[x+4,y+2,1.8],.14,'steel','umbilical-arms');
    railing([-38,y+1,2],[-4,y+1,2],'steel');
    for(let x=-11;x<=-5;x+=2)bar([x,y,1],[x,y-3,1],.14,'dark','hanging-hoses');
  }
  for(const z of [-8,0,8])bar([mx-6,5,z],[mx-6,81,z],.48,'pipe','vertical-pipes');

  // Four tall light screens, with open lattice stems and a regular array of lamps.
  const lights=[[-116,-84],[116,-84],[-116,84],[116,84]];
  for(const [x,z] of lights){
    const lamps=[];
    box(x,1,z,10,2,10,'concrete','light-foundations');
    lattice(x,z,2,52,5.5,5.5,9,'light-tower');
    lattice(x,z,44,31,17,3.5,8,'light-screen');
    for(let row=0;row<14;row++)for(let col=0;col<8;col++){
      box(x-7+col*2,46+row*2,z-2.1,1.0,.85,.45,'white','floodlights');
      box(x-7+col*2,46+row*2,z-1.7,1.4,1.25,.7,'dark','lamp-housings');
      lamps.push({position:[x-7+col*2,46+row*2,z-2.325],normal:[0,0,-1],size:[1,.85]});
    }
    registerFacilityFloodlights(root,{id:`ukss-flood-${x}-${z}`,lamps,target:[x,0,z-34],beacon:[x+8.5,75,z+1.75]});
  }
  // Two red/white tapered lightning towers, distinct from the light screens.
  for(const [x,z] of [[-76,-106],[76,102]]){
    box(x,.8,z,19,1.6,19,'concrete','lightning-footings');
    for(let n=0;n<18;n++){
      const ya=1.6+n*7.7,yb=ya+7.7,wa=15*(1-n/20),wb=15*(1-(n+1)/20),mat=Math.floor(n/3)%2?'red':'white';
      for(const side of [-1,1]){
        for(const t of [-1,1])bar([x+side*wa/2,ya,z+t*wa/2],[x+side*wb/2,yb,z+t*wb/2],.30,mat,'lightning-tower');
        bar([x-wa/2,ya,z+side*wa/2],[x+wa/2,ya,z+side*wa/2],.20,mat,'lightning-tower');
        bar([x-wa/2,ya,z+side*wa/2],[x+wb/2,yb,z+side*wb/2],.16,mat,'lightning-tower');
        bar([x+wa/2,ya,z+side*wa/2],[x-wb/2,yb,z+side*wb/2],.16,mat,'lightning-tower');
        bar([x+side*wa/2,ya,z-wa/2],[x+side*wb/2,yb,z+wb/2],.16,mat,'lightning-tower');
      }
    }
    bar([x,139,z],[x,148,z],.18,'steel','lightning-spire');
    registerFacilityBeacon(root,{id:`ukss-lightning-${x}`,position:[x,148,z],kind:'lightning-mast'});
  }

  // Pipe trestle enters the fixed mast from the north; repeated bays remain open.
  for(let z=-142;z<=-21;z+=11){
    for(const x of [-51,-42]){
      box(x,.2,z,3,.4,3,'concrete','pipe-footings');
      bar([x,0,z],[x,9,z],.22,'steel','pipe-trestle');
      bar([x,1,z],[x,9,z+11],.14,'steel','pipe-trestle');
    }
    bar([-51,9,z],[-42,9,z],.28,'steel','pipe-trestle');
  }
  for(let x=-50;x<=-43;x+=1.4)bar([x,9.8,-142],[x,9.8,-9],.40,'pipe','feed-pipelines');
  for(const x of [-51.5,-41.5])railing([x,10,-142],[x,10,-20],'steel');
  // Modest photographed equipment buildings at the mast base / approach.
  for(const [x,z,w,d,h] of [[-67,84,22,17,7],[43,66,16,11,5],[-37,195,14,10,5]]){
    box(x,h/2,z,w,h,d,'edge','equipment-buildings');box(x,h+.35,z,w+1,.7,d+1,'sheet','equipment-roofs');
    for(let dx=-w/2+3;dx<w/2-1;dx+=4)box(x+dx,h*.62,z+d/2+.05,2.2,1.6,.1,'glass','equipment-windows');
    box(x-w*.28,1.5,z+d/2+.1,2.3,3,.15,'dark','equipment-doors');
  }
  for(let z=75;z<222;z+=7)box(0,.025,z,11,.05,6.7,'oldConcrete','approach-paving');

  for(const b of batches.values()){
    const mesh=new THREE.InstancedMesh(geometries[b.kind],mats[b.mat],b.matrices.length);
    b.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;
    mesh.name='УКСС / '+b.kind+' / '+b.mat;root.add(mesh);
  }
  for(const f of surfaces.values()){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(f.vertices,3));g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,mats[f.mat]);mesh.name='УКСС / '+f.key;mesh.userData.museumComponent=f.key;root.add(mesh);
  }
  const metadata={version:'2.0-single-petal',site:'250',name:'Универсальный комплекс стенд-старт «Энергия»',
    archiveFolder:'1e8kuX4iVjO6N5nHknJ8zKJClJCpLv7Ku',referenceImageCount:16,
    configuration:'empty launch position; mobile service tower retracted along approach rails',
    positionBasis:'existing historical schematic; not georeferenced',dimensionsVerified:false,
    trench:{axis:'X',belowGrade:true,depth:32,stations:UKSS_TRENCH,branches:1,outline:'one broad chamber tapering into a southeast outlet',yaw:UKSS_YAW},
    bridge:{piers:6,openExhaustBay:true},serviceTower:{parkedZ:gz,decks,openDecks:true},
    lightScreens:4,lightningTowers:2,featureCounts:features,primitiveCount:primitives,renderMeshCount:root.children.length,
    references:['IMG_3883.WEBP','IMG_0998.WEBP','IMG_1004.JPG','IMG_7999.jpeg','IMG_2893.jpeg','IMG_2894.jpeg','IMG_2906.jpeg']};
  root.userData.ukssModel=metadata;
  return {metadata};
}
