import * as THREE from 'three';

// Emissive lenses and soft ground spill, batched rather than hundreds of lights.
export function createLightField(parent, records, {poles=false,pools=false,name='Огни',minPixels=2.8,maxCount=records.length}={}) {
 const root=new THREE.Group();root.name=name;root.userData.pickable=false;parent.add(root);
 const capacity=Math.max(maxCount,records.length,1),g=new THREE.BufferGeometry();
 const positions=new Float32Array(capacity*3),colors=new Float32Array(capacity*3),sizes=new Float32Array(capacity),visibility=new Float32Array(capacity);
 g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));
 g.setAttribute('lightSize',new THREE.BufferAttribute(sizes,1));g.setAttribute('enabled',new THREE.BufferAttribute(visibility,1));
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexColors:true,
  uniforms:{strength:{value:1},pixelRatio:{value:Math.min(globalThis.devicePixelRatio||1,2)},minPixels:{value:minPixels}},
  vertexShader:`attribute float lightSize;attribute float enabled;uniform float pixelRatio;uniform float minPixels;varying vec3 lightColor;varying float power;
   #include <common>
   #include <logdepthbuf_pars_vertex>
   void main(){lightColor=color;power=enabled;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
    gl_PointSize=clamp(lightSize*700./max(1.,-mvPosition.z),minPixels,34.)*pixelRatio;
    #include <logdepthbuf_vertex>
   }`,
  fragmentShader:`uniform float strength;varying vec3 lightColor;varying float power;
   #include <common>
   #include <logdepthbuf_pars_fragment>
   void main(){
    #include <logdepthbuf_fragment>
    float r=length(gl_PointCoord-.5)*2.;if(r>1.||power<.01)discard;
    float a=(exp(-r*r*6.)*.45+exp(-r*r*70.)*.8)*(1.-smoothstep(.75,1.,r));
    gl_FragColor=vec4(lightColor,a*strength*power);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`});
 const glow=new THREE.Points(g,material);glow.frustumCulled=false;glow.renderOrder=8;glow.name=name+' · свечение';root.add(glow);
 const metal=new THREE.MeshStandardMaterial({color:0x536173,roughness:.65,metalness:.55});
 const poleMesh=poles?new THREE.InstancedMesh(new THREE.CylinderGeometry(.045,.07,1,6),metal,capacity):null;
 const headMesh=poles?new THREE.InstancedMesh(new THREE.BoxGeometry(.58,.10,.24),metal,capacity):null;
 if(poles){root.add(poleMesh,headMesh);poleMesh.frustumCulled=headMesh.frustumCulled=false;}
 const poolMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  uniforms:{strength:{value:1}},vertexColors:true,
  vertexShader:`varying vec2 vUv;varying vec3 tint;
   #include <common>
   #include <logdepthbuf_pars_vertex>
   void main(){vUv=uv;tint=instanceColor;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
    #include <logdepthbuf_vertex>
   }`,
  fragmentShader:`uniform float strength;varying vec2 vUv;varying vec3 tint;
   #include <common>
   #include <logdepthbuf_pars_fragment>
   void main(){
    #include <logdepthbuf_fragment>
    float r=length(vUv-.5)*2.;if(r>1.)discard;float a=pow(1.-r*r,3.)*.24*strength;
    gl_FragColor=vec4(tint,a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`});
 const poolMesh=pools?new THREE.InstancedMesh(new THREE.PlaneGeometry(2,2),poolMat,capacity):null;
 if(poolMesh){poolMesh.setColorAt(0,new THREE.Color(0xffffff));poolMesh.frustumCulled=false;poolMesh.renderOrder=5;root.add(poolMesh);}
 const dummy=new THREE.Object3D(),color=new THREE.Color();let priorVisibility='';
 function refresh(next=records){
  if(next.length>capacity)throw Error('Light field capacity exceeded');records=next;g.setDrawRange(0,records.length);
  for(const mesh of [poleMesh,headMesh,poolMesh])if(mesh)mesh.count=records.length;
  records.forEach((r,i)=>{
   const h=r.height??7;positions.set([r.x,r.y+h,r.z],i*3);color.set(r.color??0xffc780);colors.set(color.toArray(),i*3);sizes[i]=r.size??7;
   if(poleMesh){dummy.position.set(r.x,r.y+h/2,r.z);dummy.rotation.set(0,0,0);dummy.scale.set(1,h,1);dummy.updateMatrix();poleMesh.setMatrixAt(i,dummy.matrix);
    dummy.position.y=r.y+h;dummy.rotation.y=r.yaw||0;dummy.scale.set(1,1,1);dummy.updateMatrix();headMesh.setMatrixAt(i,dummy.matrix);}
   if(poolMesh){dummy.position.set(r.poolX??r.x,(r.poolY??r.y)+.045,r.poolZ??r.z);dummy.rotation.set(-Math.PI/2,0,r.yaw||0);const rad=r.radius??h*1.45;dummy.scale.set(rad,rad,1);dummy.updateMatrix();poolMesh.setMatrixAt(i,dummy.matrix);poolMesh.setColorAt(i,color);}
  });
  for(const attr of Object.values(g.attributes))attr.needsUpdate=true;
  for(const mesh of [poleMesh,headMesh,poolMesh])if(mesh){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  priorVisibility='';sync();
 }
 function ownerVisible(r){for(let n=r.owner;n;n=n.parent)if(!n.visible)return false;return r.visible!==false;}
 function sync(){const key=records.map(r=>ownerVisible(r)?'1':'0').join('');if(key===priorVisibility)return;priorVisibility=key;
  records.forEach((r,i)=>{visibility[i]=key[i]==='1'?1:0;});g.attributes.enabled.needsUpdate=true;
  // Hidden historical sites may not leave luminous pools or poles behind.
  for(const mesh of [poleMesh,headMesh,poolMesh])if(mesh)records.forEach((r,i)=>{
   mesh.getMatrixAt(i,dummy.matrix);const e=dummy.matrix.elements;
   if(key[i]==='0'&&e[13]>-50000)e[13]-=100000;
   else if(key[i]==='1'&&e[13]<-50000)e[13]+=100000;
   mesh.setMatrixAt(i,dummy.matrix);mesh.instanceMatrix.needsUpdate=true;
  });
 }
 refresh();
 return {root,records,refresh,sync,setStrength(n){material.uniforms.strength.value=n;poolMat.uniforms.strength.value=n;},stats:()=>({count:records.length,drawCalls:1+(poles?2:0)+(pools?1:0)})};
}
