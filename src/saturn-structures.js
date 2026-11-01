import * as THREE from 'three';
import {createSurfacePalette} from './surface-materials.js?v=20261031-facilities-rails-lighting-v1';
import {registerFacilityFloodlights} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';
import {SATURN_ACCESS,saturnTerrainSample} from './saturn-access.js?v=20261030-river-roads-signs-v1';
export const SATURN_MODEL_VERSION='saturn-photo-20261101-v2';
// Two P-200 installations, the spherical radome and the service antenna field.
// Eight new owner-supplied photographs, including two aerial/archival views.
// The 25 m mirrors are the scale anchor; all other dimensions are photo estimates.
export function buildSaturnIP5(root,terrain={}){
 root.name='Пл. №23 · ИП-5 «Сатурн-МС»';
 const colors={concrete:0xc6b99f,trim:0xd2c7b0,brick:0xbba58c,roof:0x666863,asphalt:0x555751,glass:0x2f695e,frame:0x414846,edge:0x727b75,metal:0x929a91,dish:0x8c8b62,radome:0xe3e5dc,black:0x343d3b,vegetation:0x777e50,trunk:0x655342,lamp:0xe5e2cb};
 const mat=createSurfacePalette(root,colors,{concrete:'concrete',trim:'concrete',brick:'concrete',roof:'sheet',frame:'metal',edge:'metal',metal:'metal'},{glass:{roughness:.35,metalness:.12},radome:{roughness:.86},dish:{roughness:.89,metalness:.18}});
 // Pale masonry and grey roofs in the references have fine wear, not coarse pits.
 for(const key of ['concrete','trim','brick','roof']){const m=mat[key],compile=m.onBeforeCompile;m.onBeforeCompile=shader=>{compile(shader);shader.uniforms.museumRelief.value=key==='roof'?.012:.018;shader.uniforms.museumWear.value=key==='roof'?.12:.22;if(key==='roof')shader.uniforms.museumStain.value.setHex(0x535750);};}
 const features={},objects=[],bins=new Map(),geometry=new Map();let primitives=0;
 const V=(x,y,z)=>new THREE.Vector3(x,y,z),identity=new THREE.Quaternion(),up=V(0,1,0);
 const shared=(key,create)=>{if(!geometry.has(key))geometry.set(key,create());return geometry.get(key)};
 const count=label=>{if(label)features[label]=(features[label]||0)+1;primitives++;};
 function add(mesh,label,parent=root){count(label);mesh.userData.museumComponent=label;mesh.name=label;mesh.receiveShadow=true;parent.add(mesh);objects.push(mesh);return mesh;}
 function instance(geo,material,p,scale,label,parent=root,q=identity){
  count(label);const key=geo.uuid+':'+material+':'+parent.uuid;
  if(!bins.has(key))bins.set(key,{geo,material,parent,matrices:[],labels:new Set()});
  const b=bins.get(key);b.labels.add(label);b.matrices.push(new THREE.Matrix4().compose(p,q,scale));
 }
 function box(w,h,d,x,y,z,m,label,parent=root,yaw=0){instance(shared('box',()=>new THREE.BoxGeometry(1,1,1)),m,V(x,y,z),V(w,h,d),label,parent,new THREE.Quaternion().setFromAxisAngle(up,yaw));}
 function rod(a,b,r,m,label,parent=root){const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),delta=q.clone().sub(p),length=delta.length();if(length<1e-5)return;instance(shared('rod',()=>new THREE.CylinderGeometry(1,1,1,6,1)),m,p.add(q).multiplyScalar(.5),V(r,length,r),label,parent,new THREE.Quaternion().setFromUnitVectors(up,delta.normalize()));}
 function cylinder(rt,rb,h,x,y,z,m,label,n=24,parent=root,rotation=null){
  const key=`cyl-${rt/rb}-${n}`,g=shared(key,()=>new THREE.CylinderGeometry(rt/rb,1,1,n));
  instance(g,m,V(x,y,z),V(rb,h,rb),label,parent,rotation?new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)):identity);
 }
 function ring(radius,y,tube,m,label,parent=root,segments=64){const g=shared(`ring-${radius}-${tube}-${segments}`,()=>new THREE.TorusGeometry(radius,tube,5,segments));instance(g,m,V(0,y,0),V(1,1,1),label,parent,new THREE.Quaternion().setFromAxisAngle(V(1,0,0),Math.PI/2));}
 function rail(a,b,height=1.1,parent=root){for(const y of [.18,height])rod([a[0],a[1]+y,a[2]],[b[0],b[1]+y,b[2]],.035,'metal','guardrail',parent);const length=Math.hypot(b[0]-a[0],b[2]-a[2]),steps=Math.max(1,Math.ceil(length/1.6));for(let i=0;i<=steps;i++){const t=i/steps,x=THREE.MathUtils.lerp(a[0],b[0],t),z=THREE.MathUtils.lerp(a[2],b[2],t);rod([x,a[1],z],[x,a[1]+height,z],.045,'metal','guardrail-post',parent);}}
 function rectangularRail(x,y,z,w,d,parent=root){rail([x-w/2,y,z-d/2],[x+w/2,y,z-d/2],1.05,parent);rail([x-w/2,y,z+d/2],[x+w/2,y,z+d/2],1.05,parent);rail([x-w/2,y,z-d/2],[x-w/2,y,z+d/2],1.05,parent);rail([x+w/2,y,z-d/2],[x+w/2,y,z+d/2],1.05,parent);}
  function groundPatch(){
    // A low, broad hill uses the same height field as its graded access road.
    const N=128,extent=600,vertices=[],colors=[],uv=[],indices=[];
    for(let z=0;z<=N;z++)for(let x=0;x<=N;x++){
      const xx=(x/N-.5)*extent,zz=(z/N-.5)*extent;
      const {height,opacity}=saturnTerrainSample(xx,zz);
      vertices.push(xx,height,zz);
      const world=root.localToWorld(new THREE.Vector3(xx,0,zz));
      uv.push(.5+world.x/(terrain.terrainWidth||4420),.5-world.z/(terrain.terrainHeight||3553));
      // The same earth texture continues across the hill. Keep relief shading
      // subtle: a strong fixed gradient painted a dark oval band on the old
      // slope and made the whole mound look like a separate raised pedestal.
      const dx=(saturnTerrainSample(xx+2,zz).height-saturnTerrainSample(xx-2,zz).height)/4;
      const dz=(saturnTerrainSample(xx,zz+2).height-saturnTerrainSample(xx,zz-2).height)/4;
      const diffuse=(-dx*.7+dz*.5)/Math.sqrt(1+dx*dx+dz*dz);
      const shade=1+THREE.MathUtils.clamp(diffuse*.10,-.055,.035)*opacity;
      colors.push(shade,shade,shade,opacity);
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
    // Match the actual map surface: identical texture, world UVs and unlit
    // colour response. Lit soil changed the palette into a visible brown patch.
    const groundMaterial=terrain.terrainMaterial?.clone()||new THREE.MeshBasicMaterial({
      map:terrain.terrainTexture||null,color:terrain.terrainTexture?0xffffff:0x9d8e76,
      side:THREE.DoubleSide
    });
    Object.assign(groundMaterial,{vertexColors:true,transparent:true,depthWrite:true,alphaTest:.001,
      polygonOffset:true,polygonOffsetFactor:-2});
    const hill=add(new THREE.Mesh(geo,groundMaterial),'murguduk-hill');
    // The shared satellite overlay uses renderOrder=2. Render the relief AFTER
    // that layer: otherwise the overlay visually flattens and hides the hill.
    hill.renderOrder=3;
    hill.userData.terrainElevationWorld=SATURN_ACCESS.verticalRaise;
    hill.userData.surfaceStyle='shared-steppe-world-uv';
    hill.userData.reliefStyle='soft-irregular-steppe-v2';
  }
  groundPatch();

 const floor=7.72;
 // Connected internal perimeter lane keeps the approved northwest gate port.
 box(7,.23,90.5,-92,7.475,16.25,'asphalt','antenna-service-access');
 box(194,.23,7,1.5,7.475,65,'asphalt','internal-access-road');
 box(7,.23,121.5,95,7.475,.75,'asphalt','service-lane');
 box(194,.23,6,1.5,7.475,-63,'asphalt','internal-access-road');
 box(6,.23,87,22,7.475,-16.5,'asphalt','service-lane');
 box(75,.23,6,-51,7.475,-1,'asphalt','internal-access-road');
 box(66.5,.23,6,58.25,7.475,24,'asphalt','internal-access-road');
 function building({x,z,w,d,h,levels=2,raised=false,hip=false,windowRatio=.69}){
  box(w+.6,.46,d+.6,x,7.48,z,'trim','building-foundation');
  box(w,h,d,x,floor+h/2,z,'concrete','control-building');
  box(w+.65,.38,d+.65,x,floor+h+.19,z,'trim','control-building-roof');
  box(w-.2,.12,d-.2,x,floor+h+.44,z,'roof','roof-surface');
  for(const [edge,length,depth]of [['front',w,d],['side',d,w]]){
   const n=Math.max(2,Math.floor(length/3.35)),step=length/n;
   for(const sign of [-1,1])for(let row=0;row<levels;row++)for(let i=0;i<n;i++){
    const t=-length/2+(i+.5)*step,yy=floor+1.25+(row+.5)*(h-1.5)/levels,wh=(h-1.5)/levels*.58,ww=step*windowRatio;
    const px=edge==='front'?x+t:x+sign*(depth/2+.035),pz=edge==='front'?z+sign*(depth/2+.035):z+t;
    box(edge==='front'?ww:.09,wh,edge==='front'?.09:ww,px,yy,pz,'black','window-recess');
    box(edge==='front'?ww-.22:.12,wh-.18,edge==='front'?.12:ww-.22,px,yy,pz,'glass','control-building-windows');
    box(edge==='front'?.075:.14,wh,edge==='front'?.14:.075,px,yy,pz,'trim','window-mullion');
   }
   for(const sign of [-1,1])for(let i=0;i<=n;i++){
    const t=-length/2+i*step;
    box(edge==='front'?.2:.16,h,edge==='front'?.16:.2,edge==='front'?x+t:x+sign*(depth/2+.09),floor+h/2,edge==='front'?z+sign*(depth/2+.09):z+t,'trim','facade-pier');
   }
  }
  for(let row=1;row<levels;row++)box(w+.15,.22,d+.15,x,floor+row*h/levels,z,'trim','facade-horizontal-band');
  box(2.3,2.8,.19,x-w*.28,floor+1.4,z+d/2+.16,'black','main-entrance');
  box(3.5,.18,2.5,x-w*.28,floor+3.1,z+d/2+.9,'trim','entrance-canopy');
  for(let i=0;i<3;i++)box(3.3,.18*(i+1),.45,x-w*.28,7.25+.09*(i+1),z+d/2+1.8-i*.45,'concrete','entrance-step');
  for(let i=0;i<Math.max(1,Math.floor(w/18));i++)box(1.4,.9,1.6,x-w*.25+i*13,floor+h+.8,z-d*.25,'metal','roof-vent');
  if(raised)rectangularRail(x,floor+h+.5,z,w+.2,d+.2);
  if(hip){const cap=new THREE.Mesh(new THREE.CylinderGeometry(2.9,Math.min(w,d)*.59,3.8,4),mat.roof);cap.position.set(x,floor+h+2.4,z);cap.rotation.y=Math.PI/4;add(cap,'hipped-antenna-roof');rectangularRail(x,floor+h+.5,z,w+.3,d+.3);}
  return floor+h+.5;
 }
 // Main processing block with a taller end bay, and a separate L-shaped block.
 building({x:-4,z:-11,w:19,d:45,h:10.8,levels:3,raised:true});
 building({x:-21,z:11,w:53,d:13,h:9.6,levels:3});
 building({x:-4,z:8,w:19.6,d:14,h:12.2,levels:3});
 building({x:-29,z:52,w:54,d:13,h:8.3,levels:2});
 building({x:-56,z:36,w:14,d:32,h:8.3,levels:2});
 for(const b of [{x:-72,z:-14,w:23,d:10,h:3.7},{x:-69,z:-53,w:21,d:9,h:4.1},{x:9,z:-52,w:35,d:9,h:3.6},{x:54,z:-57,w:17,d:7,h:3.3}])building({...b,levels:1});
 function tower(x,z){
  box(18,.48,18,x,7.49,z,'concrete','antenna-foundation');
  const base=building({x,z,w:14.8,d:14.8,h:3.8,levels:1});
  box(17,.55,17,x,base+.1,z,'trim','pavilion-cantilever-roof');
  // Six belts frame five identical storeys; pale faceted masonry and green slots.
  const start=base+.35,storey=3.55,r=4.75,sides=12;
  cylinder(r,r,5*storey,x,start+2.5*storey,z,'concrete','antenna-pedestal',sides);
  for(let i=0;i<=5;i++)cylinder(r+.43,r+.34,.33,x,start+i*storey,z,'trim','tower-horizontal-cornice',sides);
  for(let level=0;level<5;level++)for(let k=0;k<sides;k++){
   const a=(k+.5)*Math.PI*2/sides,rr=r*Math.cos(Math.PI/sides)+.025,xx=x+Math.sin(a)*rr,zz=z+Math.cos(a)*rr;
   if(k%2===0){box(.58,2.68,.10,xx,start+(level+.5)*storey,zz,'black','tower-window-recess',root,a);box(.40,2.5,.14,xx,start+(level+.5)*storey,zz,'glass','vertical-glass-block-window',root,a);
    for(let j=1;j<8;j++)box(.43,.035,.16,xx,start+level*storey+.58+j*.29,zz,'edge','glass-block-seam',root,a);}
   box(.10,3.15,.12,x+Math.sin(k*Math.PI/6)*r,start+(level+.5)*storey,z+Math.cos(k*Math.PI/6)*r,'trim','tower-pilaster',root,k*Math.PI/6);
  }
  const crown=start+5*storey;
  cylinder(2.65,r+.20,2.4,x,crown+1.3,z,'roof','tapered-tower-crown',12);
  cylinder(2.45,2.8,1.7,x,crown+3.3,z,'concrete','azimuth-pedestal',24);
  cylinder(2.75,2.75,.30,x,crown+4.2,z,'metal','azimuth-bearing-ring',48);
  const axis=crown+6.4;
  box(11.6,.65,7.1,x,axis-1.55,z,'metal','cantilever-bearing-deck');
  box(8.5,1.45,4.8,x,axis-.65,z,'edge','bearing-machinery-housing');
  rectangularRail(x,axis-1.15,z,12.1,7.6);
  for(const side of [-1,1]){
   // Visible half-ring elevation sectors replace the old generic torus.
   const g=new THREE.TorusGeometry(2.75,.25,5,40,Math.PI),m=new THREE.Mesh(g,mat.edge);m.position.set(x+side*3.2,axis-.25,z);m.rotation.set(0,Math.PI/2,Math.PI);add(m,'elevation-gear-sector');
   for(let i=0;i<=18;i++){const a=i*Math.PI/18,yy=axis-.25-Math.sin(a)*2.75,zz=z+Math.cos(a)*2.75;rod([x+side*3.2,axis-.25,z],[x+side*3.2,yy,zz],.04,'frame','sector-spoke');box(.42,.21,.23,x+side*3.2,yy,zz,'metal','sector-tooth');}
   cylinder(.9,.9,.50,x+side*3.65,axis+.2,z,'metal','elevation-trunnion',24,root,[0,0,Math.PI/2]);
  }
  // Service ladder and cable trunk on the rear face.
  for(const dx of [-.48,.48])rod([x+dx,floor,z-7.55],[x+dx,base+1,z-7.55],.045,'metal','tower-ladder');
  for(let y=floor+.35;y<base+1;y+=.30)rod([x-.48,y,z-7.55],[x+.48,y,z-7.55],.035,'metal','tower-ladder-rung');
  rod([x+4.7,base,z],[x+4.7,crown,z],.16,'edge','tower-cable-trunk');
  return axis;
 }
 function antenna({x,z,axis,r=12.5,azimuth=0,tilt=0,main=false,name}){
  const group=new THREE.Group();group.name=name;group.userData.antenna={diameter:r*2,main,axis,azimuth,tilt};group.position.set(x,axis,z);group.rotation.set(tilt,azimuth,0,'YXZ');root.add(group);
  const s=r/12.5,back=9*s,depth=2.7*s,ribs=main?48:24,rings=main?10:6;
  const front=rr=>back-depth+depth*(rr/r)**2;
  const lower=rr=>.25*s+(back-.45*s)*(rr/r);
  const ps=[],cs=[],ids=[],segments=96,rows=20;
  for(let j=0;j<=rows;j++)for(let k=0;k<=segments;k++){const rr=r*j/rows,a=k*Math.PI*2/segments,tone=1+(Math.floor(k/4)%3-1)*.022;ps.push(Math.sin(a)*rr,front(rr),Math.cos(a)*rr);cs.push(tone,tone,tone);if(j<rows&&k<segments){const i=j*(segments+1)+k;ids.push(i,i+1,i+segments+1,i+1,i+segments+2,i+segments+1);}}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(cs,3));geo.setIndex(ids);geo.computeVertexNormals();
  const surface=mat.dish.clone();surface.vertexColors=true;surface.side=THREE.DoubleSide;const dish=add(new THREE.Mesh(geo,surface),main?'25m-parabolic-reflector':'auxiliary-reflector',group);dish.userData.diameter=r*2;
  const at=(rr,y,a)=>[Math.sin(a)*rr,y,Math.cos(a)*rr];
  for(let k=0;k<ribs;k++){
   const a=k*2*Math.PI/ribs,next=(k+1)*2*Math.PI/ribs;
   for(let j=1;j<=rings;j++){
    const r0=r*(j-1)/rings,r1=r*j/rings;
    rod(at(r0,lower(r0),a),at(r1,lower(r1),a),.065*s,'frame','dish-radial-rib',group);
    rod(at(r0,lower(r0),a),at(r1,lower(r1),next),.038*s,'edge','dish-diagonal-web',group);
    rod(at(r1,lower(r1),a),at(r1,lower(r1),next),.055*s,'frame','dish-concentric-truss',group);
    if(j%2===0)rod(at(r1,lower(r1),a),at(r1,front(r1)-.10*s,a),.045*s,'edge','dish-depth-brace',group);
    rod(at(r0,front(r0)+.018*s,a),at(r1,front(r1)+.018*s,a),.018*s,'edge','reflector-panel-seam',group);
   }
  }
  for(const rr of [r*.25,r*.5,r*.75])ring(rr,front(rr)+.025*s,.021*s,'edge','reflector-panel-ring',group);
  for(const yy of [back-.30*s,back+.10*s])ring(r,yy,.08*s,'edge','dish-outer-rim',group,96);
  cylinder(1.8*s,2.5*s,1.2*s,0,.15*s,0,'metal','antenna-central-hub',32,group);
  // Four paired, cross-braced legs carry a secondary reflector and the feed cage.
  const height=back+9.4*s;
  for(let k=0;k<4;k++){
   const a=Math.PI/4+k*Math.PI/2,radial=V(Math.sin(a),0,Math.cos(a)),tangent=V(Math.cos(a),0,-Math.sin(a));
   const start=radial.clone().multiplyScalar(r*.65).setY(front(r*.65)),end=radial.clone().multiplyScalar(.75*s).setY(height);
   for(const side of [-1,1])rod(start.clone().addScaledVector(tangent,side*.28*s).toArray(),end.clone().addScaledVector(tangent,side*.28*s).toArray(),.075*s,'edge','feed-support-truss',group);
   for(let j=0;j<12;j++){
    const p=start.clone().lerp(end,j/12),q=start.clone().lerp(end,(j+1)/12);
    rod(p.clone().addScaledVector(tangent,-.28*s).toArray(),p.clone().addScaledVector(tangent,.28*s).toArray(),.031*s,'edge','feed-lattice-rung',group);
    rod(p.clone().addScaledVector(tangent,(j%2?1:-1)*.28*s).toArray(),q.clone().addScaledVector(tangent,(j%2?-1:1)*.28*s).toArray(),.031*s,'edge','feed-lattice-diagonal',group);
   }
  }
  cylinder(1.32*s,1.42*s,.18*s,0,height-3.05*s,0,'dish','cassegrain-secondary-reflector',32,group);
  for(const x of [-.7,.7])rod([x*s,height-3*s,0],[x*s,height-.1*s,0],.04*s,'metal','secondary-suspension',group);
  cylinder(.58*s,1.05*s,1.45*s,0,front(0)+.73*s,0,'metal','primary-feed-horn',24,group);
  box(2.65*s,.22*s,2.65*s,0,height,0,'metal','antenna-feed-platform',group);
  rectangularRail(0,height+.13*s,0,2.7*s,2.7*s,group);
  box(1.35*s,.80*s,1.35*s,0,height+.52*s,0,'concrete','antenna-feed-housing',group);
  return group;
 }
 const primary=[{x:38,z:38},{x:-50,z:-39}];
 for(const [i,p]of primary.entries())antenna({...p,axis:tower(p.x,p.z),main:true,name:`П-200 · башня ${i+1} · Ø25 м`});
 // A full sphere on a small collar, not the previous hemispherical cap.
 const dome={x:51,z:-3,r:9.2};cylinder(5.8,6.3,1.1,dome.x,7.80,dome.z,'concrete','radome-base',32);
 const sphere=new THREE.Mesh(new THREE.SphereGeometry(dome.r,48,32),mat.radome);sphere.position.set(dome.x,8.35+dome.r*.94,dome.z);add(sphere,'white-radome');
 const seamMaterial=new THREE.LineBasicMaterial({color:0xb6bdb9,transparent:true,opacity:.48});
 for(let k=0;k<12;k++){
  const a=k*Math.PI/6,pts=[];for(let i=0;i<=48;i++){const t=.08+(Math.PI-.24)*i/48;pts.push(V(dome.x+Math.sin(t)*Math.sin(a)*(dome.r+.015),sphere.position.y+Math.cos(t)*(dome.r+.015),dome.z+Math.sin(t)*Math.cos(a)*(dome.r+.015)));}
  add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),seamMaterial),'radome-panel-seam');
 }
 box(1.9,2.25,1.2,dome.x,8.8,dome.z+dome.r*.54,'trim','radome-service-door');
 // Smaller antennas visible on the new ЦЭСС photographs and site panoramas.
 const auxRoofA=building({x:73,z:-38,w:20,d:15,h:7.6,levels:2,hip:true,windowRatio:.40});
 const auxRoofB=building({x:74,z:48,w:18,d:15,h:5.8,levels:1,hip:true,windowRatio:.45});
 for(const p of [{x:73,z:-38,roof:auxRoofA},{x:74,z:48,roof:auxRoofB}]){
  cylinder(1.35,1.8,2.3,p.x,p.roof+4.6,p.z,'metal','auxiliary-roof-pedestal',24);
  antenna({x:p.x,z:p.z,axis:p.roof+6,r:6,tilt:.03,name:'ЦЭСС · антенна на павильоне'});
 }
 function mastDish(x,z,r,h,tilt,az){
  box(5,.4,5,x,7.45,z,'concrete','auxiliary-foundation');cylinder(1.0,1.45,h,x,floor+h/2,z,'frame','auxiliary-antenna-pole',12);
  for(let y=floor+3;y<floor+h;y+=3){box(3.6,.18,3.6,x,y,z,'metal','mast-balcony');rectangularRail(x,y+.1,z,3.6,3.6);}
  for(let y=floor+.3;y<floor+h;y+=.35)rod([x-.45,y,z+1.55],[x+.45,y,z+1.55],.035,'metal','mast-ladder-rung');
  antenna({x,z,axis:floor+h+.7,r,tilt,azimuth:az,name:'Малая антенна на металлической опоре'});
 }
 mastDish(82,2,4.5,10,.9,-.8);mastDish(-73,23,4.5,10,1.12,-.8);mastDish(-32,-51,3.3,7,.04,0);
 function offsetDish(x,y,z,r){const geometry=new THREE.SphereGeometry(r,24,12,0,2*Math.PI,0,.42*Math.PI),mesh=new THREE.Mesh(geometry,mat.metal);mesh.position.set(x,y,z);mesh.rotation.set(1.08,-.65,0);add(mesh,'small-offset-dish');rod([x,y-3,z],[x,y,z],.12,'metal','offset-dish-support');rod([x,y,z],[x-1.3,y+.3,z+1.5],.045,'frame','offset-feed');}
 offsetDish(62,13,-41,2.3);offsetDish(60,16.5,-35,2.3);
 // Label and facade from the ЦЭСС photo, kept as one local canvas texture.
 let signMap=null;if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');if(ctx){ctx.fillStyle='#193970';ctx.fillRect(0,0,512,128);ctx.fillStyle='#f1f2e9';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 105px Arial';ctx.fillText('ЦЭСС',256,68);signMap=new THREE.CanvasTexture(c);signMap.colorSpace=THREE.SRGBColorSpace;}}
 const sign=new THREE.Mesh(new THREE.PlaneGeometry(6.1,1.52),new THREE.MeshStandardMaterial({map:signMap,color:signMap?0xffffff:0x193970,roughness:.75}));sign.position.set(73,14.25,-30.42);add(sign,'cess-facade-sign');
 // Four existing powered fixtures keep their established lighting anchors.
 for(const [x,z]of [[-88,38],[-15,69],[87,24],[-52,-57]]){
  rod([x,7.5,z],[x,19,z],.16,'frame','streetlight');rod([x,19,z],[x+3,20,z],.11,'frame','streetlight-arm');box(2,.4,.95,x+3,20,z,'lamp','streetlight-head');
  registerFacilityFloodlights(root,{id:`saturn-service-lamp-${x}-${z}`,target:[x+3,7.5,z],lamps:[{position:[x+3,19.8,z],normal:[0,-1,0],size:[2,.95]}]});
 }
 for(const [x,z]of [[-82,-43],[10,-48],[88,-14]]){
  for(const dx of [-.45,.45])rod([x+dx,floor,z],[x+dx,28,z],.055,'metal','telemetry-mast');
  for(let y=8;y<28;y+=1.5)rod([x-.45,y,z],[x+.45,y+1.5,z],.028,'edge','mast-diagonal');
  for(const a of [0,2.1,4.2])rod([x,26,z],[x+Math.sin(a)*7,7.4,z+Math.cos(a)*7],.018,'edge','mast-guy');
 }
 // Perimeter and sparse courtyard tree rows, based on the wider views.
 for(const z of [-79,75])for(let x=-103;x<104;x+=9){if(z===-79&&x<-87)continue;rod([x,7.25,z],[x,9.55,z],.055,'frame','perimeter-fence-post');rod([x,8.25,z],[Math.min(x+9,104),8.25,z],.022,'edge','fence-wire');rod([x,9.35,z],[Math.min(x+9,104),9.35,z],.022,'edge','fence-wire');}
 for(const x of [-103,104])for(let z=-79;z<75;z+=9){rod([x,7.25,z],[x,9.55,z],.055,'frame','perimeter-fence-post');rod([x,9.35,z],[x,9.35,Math.min(z+9,75)],.022,'edge','fence-wire');}
 const foliage=shared('foliage',()=>new THREE.IcosahedronGeometry(1,1));
 for(let i=0;i<13;i++){const x=i<6?-21:33,z=i<6?-40+i*6:-56+(i-6)*5.1;rod([x,7.3,z],[x,10.6,z],.18,'trunk','courtyard-tree-trunk');instance(foliage,'vegetation',V(x,11.6,z),V(1.9,2.6,1.8),'courtyard-tree');}
 for(let i=0;i<65;i++){const a=i*2.39996,r=112+(i*17)%55,x=Math.cos(a)*r,z=Math.sin(a)*r*.82,y=saturnTerrainSample(x,z).height;instance(foliage,'vegetation',V(x,y+.30,z),V(.45+(i%3)*.2,.4,.5),'semi-desert-scrub');}
 // Matrices for every repeated bolt, pane and truss share a few GPU batches.
 for(const b of bins.values()){
  const mesh=new THREE.InstancedMesh(b.geo,mat[b.material],b.matrices.length);b.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.computeBoundingBox();mesh.name='Сатурн · '+b.material;mesh.userData.museumComponent=b.material==='asphalt'?'internal-access-road':'saturn-structure-batch';mesh.userData.components=[...b.labels];mesh.receiveShadow=true;b.parent.add(mesh);objects.push(mesh);
 }
 root.updateMatrixWorld(true);
 root.userData.saturnModel={version:SATURN_MODEL_VERSION,siteNumber:23,siteName:'Сатурн-МС / ИП-5',sourceFolder:'1nweD3hi2MRaeVuNOY2GflKtEMQ1RoDXk',
  photosUsed:['96fee43a9dd117a0fab4162faab61b70.jpg','image-7-5.jpg','1718114126-3321-large.webp','e187e8es-1920.jpg','saturn-ms3.jpg','704FAC587F000101075B9C7632F8CA94.jpg','id3hck0ijps5eyyq6t.jpg.webp','xgbfnhhio4tnwiidsm.jpg.webp','IMG_5342.JPG','IMG_6181.JPG'],
  antennaType:'П-200',largeAntennaCount:2,dishDiameterMetres:25,primaryPositions:primary,auxiliaryAntennaCount:7,radome:{radius:dome.r,shape:'sphere',center:sphere.position.toArray()},towerStoreys:5,
  profile:'paired belt-storey towers; deep open reflector backing; four lattice feed legs; secondary reflector; spherical radome; L-shaped buildings and CESS antenna field',
  modelReliability:'photo reconstruction; non-survey dimensions and relative layout',featureCounts:features,primitiveCount:primitives,meshCount:objects.length,instancedFrameBatches:bins.size,confidence:'eight new Drive images plus two earlier site references'};
 return root.userData.saturnModel;
}
