import * as THREE from 'three';
const V=(x,y,z)=>new THREE.Vector3(x,y,z),SCALE=.28;
// Connect to the actual western trunk, not obsolete JSON points for the
// Gagarin feeder (that feeder is replaced by its own runtime spline).
export function connectMik112Rails(root,{data,point,parent}){
 root.updateWorldMatrix(true,true);
 const route=data.routes.rail.find(r=>r.id==='t-central-north');
 if(!route)return {connected:false};
 const base=new THREE.CatmullRomCurve3(route.points.map(([x,z])=>point(x,z,.75)),false,'centripetal',.3);
 const profileScale=.43*.28/1.5,mainGauge=7.3*profileScale/2;
 const mainHeadY=.75+1.3*profileScale;
 const throat=root.localToWorld(V(-45,4.25,340));throat.y=1.04;
 let near=0,best=Infinity;
 for(let i=0;i<=1600;i++){
  const t=i/1600,p=base.getPoint(t),d=(p.x-throat.x)**2+(p.z-throat.z)**2;
  if(d<best){best=d;near=t;}
 }
 const join=base.getPoint(near);join.y=mainHeadY;
 const forward=V(0,0,1).applyQuaternion(root.quaternion).normalize();
 const tangent=base.getTangent(near);tangent.y=0;tangent.normalize();
 const distance=throat.distanceTo(join);
 const control1=throat.clone().addScaledVector(forward,Math.min(26,distance*.30));
 const control2=join.clone().addScaledVector(tangent,-Math.min(26,distance*.30));
 const stem=new THREE.CubicBezierCurve3(throat,control1,control2,join);
 const group=new THREE.Group();group.name='МИК112 · веер и западное примыкание';parent.add(group);
 const railMat=new THREE.MeshStandardMaterial({color:0x626a66,metalness:.55,roughness:.7});
 const tieMat=new THREE.MeshStandardMaterial({color:0x827c6d,roughness:1});
 const ballastMat=new THREE.MeshStandardMaterial({color:0x958977,roughness:1});
 const matrices=[],unit=new THREE.BoxGeometry(1,1,1),reports=[];
 function draw(curve,g0,g1){
  const n=100,vertices=[],indices=[],tracks=[[],[]];
  for(let i=0;i<=n;i++){
   const t=i/n,p=curve.getPoint(t),dir=curve.getTangent(t),normal=V(-dir.z,0,dir.x).normalize();
   const gauge=THREE.MathUtils.lerp(g0,g1,t),half=gauge+.22;
   for(const side of [-1,1]){
    vertices.push(p.x+normal.x*side*half,p.y-.11,p.z+normal.z*side*half);
    tracks[side<0?0:1].push(p.clone().addScaledVector(normal,side*gauge));
   }
   if(i<n){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
  const ballast=new THREE.Mesh(geo,ballastMat);ballast.name='MIK112 rail ballast';group.add(ballast);
  for(const pts of tracks){const mesh=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),100,.027,5,false),railMat);mesh.name='MIK112 rail';group.add(mesh);}
  const length=curve.getLength();
  for(let d=0;d<length-.1;d+=.9){
   const t=d/length,p=curve.getPointAt(t),dir=curve.getTangentAt(t),g=THREE.MathUtils.lerp(g0,g1,t);
   p.y-=.075;const q=new THREE.Quaternion().setFromAxisAngle(V(0,1,0),Math.atan2(dir.x,dir.z));
   matrices.push(new THREE.Matrix4().compose(p,q,V(2*g+.28,.065,.12)));
  }
 }
 // Four short approaches converge gradually into a compact turnout throat.
 for(const x of [-82.4,-59.6,-30.4,-7.6]){
  const start=root.localToWorld(V(x,4.25,258));
  const c1=start.clone().addScaledVector(forward,10);
  const c2=throat.clone().addScaledVector(forward,-9);
  const fan=new THREE.CubicBezierCurve3(start,c1,c2,throat);
  draw(fan,.76*SCALE,mainGauge);
  reports.push({start:start.toArray(),end:join.toArray(),throat:throat.toArray(),junctionGap:0});
 }
 draw(stem,mainGauge,mainGauge);
 const ties=new THREE.InstancedMesh(unit,tieMat,matrices.length);
 matrices.forEach((m,i)=>ties.setMatrixAt(i,m));ties.instanceMatrix.needsUpdate=true;group.add(ties);
 return {connected:true,sourceRoute:route.id,tracks:reports,group,
  version:'clean-western-trunk-v2',joinGap:0,railGauge:mainGauge*2,stemLength:stem.getLength()};
}
