import * as THREE from 'three';

export const ROAD_SIGN_VERSION='two-readable-faces-four-aimed-floodlights-v1';
export const ROAD_SIGN_DIMENSIONS=Object.freeze({width:76,height:38,centerY:39,depth:1.1,faceZ:.64});

// Each face has its own correctly oriented lettering. Reusing a double-sided
// plane would mirror the back text and put it behind the solid backplate.
export function createRoadSignTexture(spec,arrowSign){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
 const ctx=canvas.getContext('2d');
 ctx.fillStyle='#19538e';ctx.fillRect(0,0,1024,512);
 ctx.strokeStyle='#eff7ff';ctx.lineWidth=13;ctx.strokeRect(14,14,996,484);
 ctx.font='600 24px Montserrat,Arial,sans-serif';ctx.fillStyle='#c7e2f7';ctx.textAlign='center';
 ctx.fillText('ОТ БАЙКОНУРА · ≈ ПО АВТОДОРОГЕ',512,67);
 const left=arrowSign<0;
 for(const [i,route]of spec.destinations.entries()){
  const y=168+i*170,a=left?66:962,b=left?136:892;
  ctx.strokeStyle='#ffffff';ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(b,y);ctx.lineTo(a,y);
  ctx.moveTo(a,y);ctx.lineTo(a+(left?25:-25),y-24);
  ctx.moveTo(a,y);ctx.lineTo(a+(left?25:-25),y+24);ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='700 46px Montserrat,Arial,sans-serif';
  ctx.textAlign='left';ctx.fillText(route.city,182,y+15,558);
  ctx.textAlign='right';ctx.font='600 39px Montserrat,Arial,sans-serif';
  ctx.fillText('≈'+route.distanceKm+' км',875,y+15,240);
  if(i===0){ctx.strokeStyle='#c5def5a8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(48,254);ctx.lineTo(976,254);ctx.stroke();}
 }
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 texture.anisotropy=8;texture.minFilter=THREE.LinearMipmapLinearFilter;
 texture.userData={direction:spec.direction,arrowSign,readableFace:true};
 return texture;
}

// Project the two real fixture directions onto their own sign face. The
// museum already batches its lighting; this keeps eight small sign lamps
// from adding eight global light calculations to every distant building.
function illuminatedFace(texture,lamps,night){
 const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.FrontSide});
 material.userData.keepBrightness=true;
 const positions=lamps.map(l=>l.position),directions=lamps.map(l=>l.target.clone().sub(l.position).normalize());
 material.onBeforeCompile=shader=>{
  shader.uniforms.signNight=night;
  shader.uniforms.signLampPosition={value:positions};
  shader.uniforms.signLampDirection={value:directions};
  shader.fragmentShader=`uniform float signNight;uniform vec3 signLampPosition[2];uniform vec3 signLampDirection[2];\n`+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   vec3 signPoint=vec3((vMapUv.x-.5)*76.,(vMapUv.y-.5)*38.,0.);
   float signIllumination=.20;
   for(int i=0;i<2;i++){
    vec3 ray=signPoint-signLampPosition[i];float lampDistance=max(length(ray),.01);
    float beam=smoothstep(.57,.78,dot(ray/lampDistance,signLampDirection[i]));
    float incidence=max(0.,-ray.z/lampDistance);
    signIllumination+=beam*incidence*1.74*pow(22./max(lampDistance,4.),2.);
   }
   vec3 litSign=vec3(1.03,1.,.90)*clamp(signIllumination,.20,1.30);
   diffuseColor.rgb*=mix(vec3(1.),litSign,signNight);
  `);
 };
 material.customProgramCacheKey=()=>ROAD_SIGN_VERSION;
 return material;
}

/** Virtual roadside signs; distances remain approximate routes from the city. */
export function buildHighwaySigns({data,point,parent,roads=[],textureFactory=createRoadSignTexture}){
 const signs=[],lenses=[],night={value:1};
 const blue=new THREE.MeshStandardMaterial({color:0x21558c,roughness:.8,metalness:.08});
 const steel=new THREE.MeshStandardMaterial({color:0x8b9696,roughness:.51,metalness:.65});
 const housing=new THREE.MeshStandardMaterial({color:0x35434a,roughness:.6,metalness:.55});
 const lensMaterial=new THREE.MeshBasicMaterial({color:0xfff1cf});lensMaterial.userData.keepBrightness=true;
 const {width,height,centerY,depth,faceZ}=ROAD_SIGN_DIMENSIONS;
 function rod(group,a,b,radius=.19){
  const delta=b.clone().sub(a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),8),steel);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());group.add(mesh);return mesh;
 }
 function createSign(spec){
  const group=new THREE.Group();group.name='Указатель '+spec.direction.toUpperCase();
  group.position.copy(point(spec.x,spec.y));
  let nearest=Infinity,tangent=new THREE.Vector3(1,0,0);
  const routes=roads.filter(r=>r.id===(spec.direction==='west'?'r-south-west':'r-south-east'));
  for(const road of routes)for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],line=new THREE.Line3(a,b),p=line.closestPointToPoint(group.position,true,new THREE.Vector3()),d=p.distanceToSquared(group.position);
   if(d<nearest){nearest=d;tangent.copy(b).sub(a).setY(0).normalize();}
  }
  // Both panels use an eastward local X axis, independent of source-way order.
  if(tangent.x<0)tangent.negate();
  group.rotation.y=-Math.atan2(tangent.z,tangent.x);
  group.userData={id:spec.id,direction:spec.direction,source:'data/road-signs.json',roadTangent:tangent.toArray(),
   approximateFromCity:true,destinations:spec.destinations.map(d=>({name:d.city,km:d.distanceKm})),faces:[],floodlights:[]};
  const backplate=new THREE.Mesh(new THREE.BoxGeometry(width+1.8,height+1.2,depth),blue);
  backplate.name='Двусторонний корпус указателя';backplate.position.y=centerY;group.add(backplate);
  for(const side of [-1,1]){
   const pole=new THREE.Mesh(new THREE.CylinderGeometry(.54,.68,36,9),steel);
   pole.position.set(side*24,18,0);group.add(pole);
  }
  const base=new THREE.Mesh(new THREE.BoxGeometry(63,.9,5),steel);base.position.y=.6;group.add(base);
  rod(group,new THREE.Vector3(-width/2,centerY+height/2+.8,0),new THREE.Vector3(width/2,centerY+height/2+.8,0),.28);
  for(const face of [1,-1]){
   const faceName=face===1?'front':'back',arrowSign=(spec.direction==='west'?-1:1)*face;
   const lamps=[];
   for(const x of [-20,20]){
    const position=new THREE.Vector3(x,centerY+height/2+5.5,face*9.5);
    const target=new THREE.Vector3(x*.7,centerY,face*faceZ);
    const bracket=new THREE.Group();bracket.name='Кронштейн прожектора · '+faceName;group.add(bracket);
    const anchor=new THREE.Vector3(x,centerY+height/2+.8,0),elbow=new THREE.Vector3(x,position.y,0);
    rod(bracket,anchor,elbow,.23);rod(bracket,elbow,position,.23);
    rod(bracket,new THREE.Vector3(x,centerY+height/2-2,0),new THREE.Vector3(x,position.y,face*6.8),.16);
    const head=new THREE.Group();head.name='Прожектор указателя · '+faceName;
    head.position.copy(position);head.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),target.clone().sub(position).normalize());
    head.userData={component:'sign-floodlight',face:faceName,targetLocal:target.toArray(),bracket:true};group.add(head);
    const body=new THREE.Mesh(new THREE.BoxGeometry(3.8,2.4,1.9),housing);head.add(body);
    const lens=new THREE.Mesh(new THREE.PlaneGeometry(3.05,1.65),lensMaterial);lens.position.z=.96;head.add(lens);lenses.push(lens);
    for(const side of [-1,1]){
     const hinge=new THREE.Mesh(new THREE.CylinderGeometry(.30,.30,.28,10),steel);
     hinge.rotation.z=Math.PI/2;hinge.position.x=side*2.02;head.add(hinge);
    }
    const record={face:faceName,position:position.toArray(),target:target.toArray(),direction:target.clone().sub(position).normalize().toArray()};
    group.userData.floodlights.push(record);
    // Convert to the readable face's coordinate frame, including the back rotation.
    lamps.push({position:new THREE.Vector3(position.x*face,position.y-centerY,Math.abs(position.z)-faceZ),
     target:new THREE.Vector3(target.x*face,target.y-centerY,0)});
   }
   const texture=textureFactory(spec,arrowSign),panel=new THREE.Mesh(new THREE.PlaneGeometry(width,height),illuminatedFace(texture,lamps,night));
   panel.name='Читаемые надписи · '+faceName;panel.position.set(0,centerY,face*faceZ);panel.rotation.y=face===1?0:Math.PI;
   panel.userData={component:'road-sign-face',face:faceName,arrowSign,independentTexture:true};group.add(panel);
   group.userData.faces.push({face:faceName,arrowSign,position:panel.position.toArray(),rotationY:panel.rotation.y});
  }
  parent.add(group);signs.push(group);
 }
 createSign(data.west);createSign(data.east);
 function setEvening(value){night.value=value?1:0;lensMaterial.color.set(value?0xfff1cf:0x9ea6a4);}
 return {signs,setEvening,stats:()=>({version:ROAD_SIGN_VERSION,signCount:signs.length,faceCount:signs.length*2,
  floodlightCount:lenses.length,floodlightsPerFace:2,evening:!!night.value,lighting:'two-directional-fixtures-per-readable-face',
  locations:signs.map(s=>({id:s.userData.id,direction:s.userData.direction,x:s.position.x,z:s.position.z,yaw:s.rotation.y,
   roadTangent:s.userData.roadTangent,faces:s.userData.faces,floodlights:s.userData.floodlights})),
  cities:signs.flatMap(s=>s.userData.destinations),distancesFrom:'Baikonur city',approximate:true})};
}
