import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const BURAN_LANDING_AIRCRAFT_VERSION='buran-landing-aircraft-v1';
export const BURAN_LANDING_CONTACTS=Object.freeze({
  main:Object.freeze([0,-5.2,-3]),nose:Object.freeze([0,-5.2,8.02]),mainTrack:7
});

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=value=>THREE.MathUtils.clamp(Number.isFinite(value)?value:0,0,1);
const smooth=value=>value*value*(3-2*value);
const radians=THREE.MathUtils.degToRad;
const SOURCE_SEPARATION_Z=-4.45;
// Authored rocket coordinates are metres, +Y nose, with the orbiter on -Z.
// This proper rotation preserves triangle winding: +Y up and +Z nose in flight.
const SOURCE_TO_FLIGHT=new THREE.Matrix4().set(1,0,0,0, 0,0,-1,-7.6, 0,1,0,-18, 0,0,0,1);
const RUDDER_HINGE=V(0,4.97291043496319,-12.82720947265625);
const RUDDER_AXIS=V(0,10.264034652709961, -16.712144513080272).sub(RUDDER_HINGE).normalize();

function ownMesh(geometry,material,name){
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.landingAircraft=true;return mesh;
}

// Everything added here owns its buffers. No source world-matrix update, material
// edit, geometry clone mutation, or source reparenting is needed for extraction.
function sourceMeshes(root){
  const result=[];
  function visit(node,parentMatrix){
    const local=node.matrixAutoUpdate
      ?new THREE.Matrix4().compose(node.position,node.quaternion,node.scale):node.matrix.clone();
    const matrix=parentMatrix.clone().multiply(local);
    if(node.isMesh&&node.geometry?.attributes.position)result.push({node,matrix});
    for(const child of node.children)visit(child,matrix);
  }
  visit(root,new THREE.Matrix4());return result;
}

function vertexAt(geometry,index,matrix,normalMatrix){
  const data={};
  for(const [name,attribute]of Object.entries(geometry.attributes)){
    // The supplied source is static. Skinning attributes cannot apply after
    // baking a vertex into the independent aircraft's coordinate frame.
    if(name==='skinIndex'||name==='skinWeight')continue;
    const values=[];for(let i=0;i<attribute.itemSize;i++){
      // GLTFLoader may preserve meshopt accessors as interleaved attributes.
      const value=attribute.getComponent?attribute.getComponent(index,i):attribute[['getX','getY','getZ','getW'][i]](index);
      values.push(value);
    }
    if(name==='position')V(...values).applyMatrix4(matrix).toArray(values);
    else if(name==='normal')V(...values).applyMatrix3(normalMatrix).normalize().toArray(values);
    else if(name==='tangent'){
      const tangent=V(...values).transformDirection(matrix);values[0]=tangent.x;values[1]=tangent.y;values[2]=tangent.z;
      if(matrix.determinant()<0)values[3]*=-1;
    }
    data[name]=values;
  }
  return data;
}

function interpolate(a,b,t){
  const out={};for(const name of Object.keys(a))out[name]=a[name].map((value,i)=>value+(b[name][i]-value)*t);
  return out;
}

function halfTriangle(vertices,side){
  // Split triangles, including their UVs and normals, instead of duplicating the
  // closed shell when the two rudder leaves / nose doors open.
  let polygon=vertices;const output=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],da=a.position[0]*side,db=b.position[0]*side;
    const ia=da>=0,ib=db>=0;if(ia)output.push(a);
    if(ia!==ib)output.push(interpolate(a,b,da/(da-db)));
  }
  const triangles=[];for(let i=1;i+1<output.length;i++){
    const t=[output[0],output[i],output[i+1]];
    if(V(...t[1].position).sub(V(...t[0].position)).cross(V(...t[2].position).sub(V(...t[0].position))).lengthSq()>1e-18)triangles.push(t);
  }
  return triangles;
}

function sourcePart(material,vertices){
  const name=material?.name||'',points=vertices.map(v=>v.position);
  if(name==='RNN.gif'||name==='RNV.gif')return 'rudder';
  // The archive batches untextured components into PaletteMaterial001. The
  // compact hinge/rib region belongs with the split rudder, not the fixed fin.
  if(name==='PaletteMaterial001'&&points.every(p=>Math.abs(p[0])<.36&&p[1]>4.69&&p[1]<10.44&&p[2]<-12.5))return 'rudder';
  if(name==='SSN.gif'||name==='Teploz.jpg')return 'nose-door';
  if(name==='SSO.gif')return 'main-door';
  return 'body';
}

function extractOrbiter(source,body,parts){
  const stats={sourceTriangles:0,retainedTriangles:0,rejectedTriangles:0,separationStraddlers:0,
    retainedMaterials:[],sourceMeshes:0,extractedMeshes:0,rudderSourceTriangles:0,doorSourceTriangles:0};
  const materialNames=new Set(),bounds=new THREE.Box3();
  for(const {node,matrix:sourceMatrix}of sourceMeshes(source)){
    stats.sourceMeshes++;const geometry=node.geometry,position=geometry.attributes.position;
    const matrix=SOURCE_TO_FLIGHT.clone().multiply(sourceMatrix),normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
    const cache=new Map(),buckets=new Map(),index=geometry.index;
    const count=index?index.count:position.count,start=Math.max(0,geometry.drawRange.start||0),end=Math.min(count,start+(geometry.drawRange.count??Infinity));
    const get=i=>{if(!cache.has(i))cache.set(i,vertexAt(geometry,i,matrix,normalMatrix));return cache.get(i);};
    const add=(part,material,triangle)=>{
      const key=part+':'+(material?.uuid||'none');let bucket=buckets.get(key);
      if(!bucket){bucket={part,material,attributes:{}};buckets.set(key,bucket);}
      for(const vertex of triangle)for(const [name,values]of Object.entries(vertex)){
        if(!bucket.attributes[name])bucket.attributes[name]={size:values.length,values:[]};
        bucket.attributes[name].values.push(...values);
      }
    };
    for(let at=start;at+2<end;at+=3){
      stats.sourceTriangles++;const ids=[0,1,2].map(j=>index?index.getX(at+j):at+j),vertices=ids.map(get);
      // Flight Y = -source Z - 7.6. Reject rocket and mount triangles that cross
      // the clear separation gap; never retain a rocket vertex in the orbiter.
      const inside=vertices.filter(v=>v.position[1]>-SOURCE_SEPARATION_Z-7.6).length;
      if(inside!==3){stats.rejectedTriangles++;if(inside)stats.separationStraddlers++;continue;}
      stats.retainedTriangles++;for(const vertex of vertices)bounds.expandByPoint(V(...vertex.position));
      const group=geometry.groups.find(g=>at>=g.start&&at<g.start+g.count);
      const material=Array.isArray(node.material)?node.material[group?.materialIndex||0]:node.material;
      materialNames.add(material?.name||'');
      if(matrix.determinant()<0)[vertices[1],vertices[2]]=[vertices[2],vertices[1]];
      const part=sourcePart(material,vertices);
      if(part==='body'){add(part,material,vertices);continue;}
      if(part==='rudder')stats.rudderSourceTriangles++;else stats.doorSourceTriangles++;
      const sum=vertices.reduce((s,v)=>s+v.position[0],0),min=Math.min(...vertices.map(v=>v.position[0])),max=Math.max(...vertices.map(v=>v.position[0]));
      if(min>=-1e-8||max<=1e-8){add(part+(sum<0?'-left':'-right'),material,vertices);continue;}
      for(const side of [-1,1])for(const triangle of halfTriangle(vertices,side))add(part+(side<0?'-left':'-right'),material,triangle);
    }
    for(const bucket of buckets.values()){
      const copied=new THREE.BufferGeometry();for(const [name,attribute]of Object.entries(bucket.attributes))copied.setAttribute(name,new THREE.Float32BufferAttribute(attribute.values,attribute.size));
      if(!copied.attributes.normal)copied.computeVertexNormals();
      copied.computeBoundingBox();copied.computeBoundingSphere();
      const mesh=ownMesh(copied,bucket.material,'Буран · исходная поверхность · '+bucket.material?.name+' · '+bucket.part);
      mesh.userData.sourceAircraftPart=bucket.part;mesh.userData.sourceMesh=node.name;mesh.userData.sourceMaterial=bucket.material?.name||'';
      const parent=bucket.part==='body'?body:parts[bucket.part];
      if(!parent)throw new Error('Unknown orbiter moving surface: '+bucket.part);
      // Its geometry is still in the flight frame. A translated pivot leaves
      // every source vertex in exactly its closed position at zero rotation.
      if(parent!==body)copied.translate(-parent.position.x,-parent.position.y,-parent.position.z);
      parent.add(mesh);stats.extractedMeshes++;
    }
  }
  if(stats.retainedTriangles<1000)throw new Error('The supplied scene does not contain the source Buran orbiter');
  stats.retainedMaterials=[...materialNames];stats.bounds={min:bounds.min.toArray(),max:bounds.max.toArray(),size:bounds.getSize(V()).toArray()};
  return stats;
}

function batch(root){
  const materials=new Map();
  return {
    add(geometry,material){
      const part=geometry.index?geometry.toNonIndexed():geometry;if(part!==geometry)geometry.dispose();
      if(!part.attributes.normal)part.computeVertexNormals();
      if(!part.attributes.uv)part.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(part.attributes.position.count*2),2));
      const list=materials.get(material)||[];list.push(part);materials.set(material,list);
    },
    finish(name){for(const [material,geometries]of materials){const mesh=ownMesh(mergeGeometries(geometries,false),material,name+' · '+material.name);root.add(mesh);for(const geometry of geometries)geometry.dispose();}}
  };
}

function box(width,height,depth,position){const g=new THREE.BoxGeometry(width,height,depth);g.translate(...position);return g;}
function cylinder(radius,height,position,axis='y',segments=12){
  const g=new THREE.CylinderGeometry(radius,radius,height,segments);if(axis==='x')g.rotateZ(Math.PI/2);else if(axis==='z')g.rotateX(Math.PI/2);g.translate(...position);return g;
}
function rod(a,b,radius){
  const from=V(...a),to=V(...b),g=new THREE.CylinderGeometry(radius,radius,from.distanceTo(to),8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),to.clone().sub(from).normalize()));g.translate(...from.add(to).multiplyScalar(.5).toArray());return g;
}

function buildGear(parent,materials){
  const definitions=[{id:'main-left',x:-3.5,z:-3,y:-2.65,radius:.63,wheelOffset:.29,tireWidth:.34},
    {id:'main-right',x:3.5,z:-3,y:-2.65,radius:.63,wheelOffset:.29,tireWidth:.34},
    {id:'nose',x:0,z:8.02,y:-2.62,radius:.46,wheelOffset:.215,tireWidth:.25}];
  return definitions.map(def=>{
    const group=new THREE.Group();group.name='Буран · стойка '+def.id;group.position.set(def.x,def.y,def.z);group.userData.gearId=def.id;parent.add(group);
    const pieces=batch(group),wheelY=-5.2+def.radius-def.y;
    pieces.add(rod([0,0,0],[0,wheelY,0],.105),materials.strut);
    pieces.add(rod([0,-.1,-.57],[0,wheelY+.24,0],.065),materials.strut);
    pieces.add(cylinder(.14,def.wheelOffset*2+.26,[0,wheelY,0],'x'),materials.strut);
    for(const side of [-1,1]){
      const x=side*def.wheelOffset,tire=cylinder(def.radius,def.tireWidth,[x,wheelY,0],'x',20);
      pieces.add(tire,materials.tire);pieces.add(cylinder(def.radius*.49,def.tireWidth+.022,[x,wheelY,0],'x',16),materials.strut);
      // Small axle caps remain a single metallic batch with the oleo and hubs.
      pieces.add(cylinder(def.radius*.17,def.tireWidth+.064,[x,wheelY,0],'x',10),materials.strut);
    }
    pieces.finish('Буран · шасси '+def.id);
    group.userData.wheels=[-1,1].map(side=>({center:[side*def.wheelOffset,wheelY,0],radius:def.radius,width:def.tireWidth}));
    return {group,definition:def};
  });
}

function canopyGeometry(radius,depth){
  const positions=[],colors=[],normals=[],uv=[],index=[],sectors=32,rings=9;
  const white=new THREE.Color(0xf0e7d7),orange=new THREE.Color(0xc85a2c);
  // Each gore owns its boundary vertices, giving crisp alternating fabric
  // panels while keeping a single material draw per canopy.
  for(let sector=0;sector<sectors;sector++){
    const color=(Math.floor(sector/2)%2?white:orange),base=positions.length/3;
    for(let ring=0;ring<=rings;ring++)for(const edge of [0,1]){
      const theta=(.075+(Math.PI/2-.075)*ring/rings),a=(sector+edge)*Math.PI*2/sectors;
      const x=radius*Math.sin(theta)*Math.cos(a),y=radius*Math.sin(theta)*Math.sin(a),z=-depth*Math.cos(theta);
      positions.push(x,y,z);colors.push(color.r,color.g,color.b);const n=V(x/(radius*radius),y/(radius*radius),z/(depth*depth)).normalize();normals.push(...n.toArray());uv.push((sector+edge)/sectors,ring/rings);
    }
    for(let ring=0;ring<rings;ring++){const a=base+ring*2,b=a+1,c=a+2,d=a+3;index.push(a,b,c,b,d,c);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);return g;
}

function buildParachutes(root){
  const fabric=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide,roughness:.95,metalness:0});fabric.name='ткань тормозного купола';
  const cord=new THREE.LineBasicMaterial({color:0xd1c8b7,transparent:true,opacity:.86});cord.name='стропы';
  const geometry=canopyGeometry(3.25,2.55),centres=[[-6.25,.2,-18.5],[0,3.15,-21],[6.25,.2,-18.5]];
  return centres.map((centre,index)=>{
    const group=new THREE.Group();group.name='Буран · тормозной парашют '+(index+1);group.position.set(0,.15,-14.5);group.userData.parachute=index+1;root.add(group);
    const canopy=ownMesh(geometry,fabric,'Тормозной купол '+(index+1));canopy.position.fromArray(centre);canopy.userData.parachuteCanopy=true;group.add(canopy);
    const lines=[];for(let i=0;i<16;i++){const a=i*Math.PI/8;lines.push(0,0,0,centre[0]+3.25*Math.cos(a),centre[1]+3.25*Math.sin(a),centre[2]);}
    const ropes=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(lines,3)),cord);ropes.name='Стропы купола '+(index+1);group.add(ropes);return group;
  });
}

function slab(points,thickness=.12,normal=V(0,1,0)){
  points=points.map(p=>[...p]);
  const winding=V();for(let i=0;i<points.length;i++)winding.add(V(...points[i]).cross(V(...points[(i+1)%points.length])));
  if(winding.dot(normal)<0)points.reverse();
  const positions=[],indices=[],n=points.length;
  for(const offset of [-thickness/2,thickness/2])for(const point of points)positions.push(point[0]+normal.x*offset,point[1]+normal.y*offset,point[2]+normal.z*offset);
  for(let i=1;i+1<n;i++){indices.push(0,i+1,i,n,n+i,n+i+1);}
  for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,n+i,j,n+j,n+i);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

function buildMig(){
  const root=new THREE.Group();root.name='МиГ-25ПУ-СОТН · ЛЛ22 · схематическая модель';
  root.userData.aircraft={type:'МиГ-25ПУ-СОТН',laboratory:'ЛЛ22',boardNumber:'22',schematic:true,unit:'metre',forward:'+Z',escortCount:1};
  const gray=new THREE.MeshStandardMaterial({color:0x9da6ab,roughness:.64,metalness:.36});gray.name='серый планер';
  const dark=new THREE.MeshStandardMaterial({color:0x252a2e,roughness:.83,metalness:.32});dark.name='воздухозаборники';
  const metal=new THREE.MeshStandardMaterial({color:0x5c6265,roughness:.49,metalness:.64});metal.name='сопла';
  const glass=new THREE.MeshStandardMaterial({color:0x29434d,roughness:.21,metalness:.16});glass.name='двухместная кабина';
  const red=new THREE.MeshStandardMaterial({color:0xa72d28,roughness:.7});red.name='борт 22';
  const b=batch(root),profile=[[-10.45,.62],[-9.7,1.18],[-3.5,1.38],[1.5,1.22],[5.5,.91],[8.2,.69],[10.8,.21],[11.25,0]].map(([z,r])=>new THREE.Vector2(r,z));
  const fuselage=new THREE.LatheGeometry(profile,14);fuselage.rotateX(Math.PI/2);b.add(fuselage,gray);
  for(const side of [-1,1]){
    b.add(cylinder(.78,6.2,[side*.94,-.2,-7.2],'z',16),gray);
    b.add(cylinder(.78,.58,[side*.94,-.2,-10.54],'z',16),metal);
    b.add(cylinder(.635,.025,[side*.94,-.2,-10.85],'z',16),dark);
    b.add(box(.78,1.48,4.65,[side*1.38,.12,1.12]),gray);
    b.add(box(.73,1.17,.025,[side*1.38,.06,3.46]),dark);
    b.add(slab([[side*1.05,.16,2.25],[side*6.97,.09,-2.2],[side*6.65,.09,-4.5],[side*1.15,.13,-5.1]],.2),gray);
    b.add(slab([[side*1.07,.25,-6.15],[side*4.33,.05,-8.21],[side*4.05,.05,-9.84],[side*.95,.2,-9.2]],.14),gray);
    b.add(slab([[side*1.4,.75,-6.1],[side*1.4,3.9,-8.1],[side*1.4,3.9,-9.45],[side*1.4,.75,-9.9]],.13,V(1,0,0)),gray);
    // Vector strokes avoid a DOM/canvas texture and remain crisp in the small
    // escort view. The aircraft is deliberately a schematic, not a new source asset.
    for(let digit=0;digit<2;digit++){
      const z=6.8-digit*.62,y=.05,width=.43,height=.76,stroke=.085;
      for(const [cy,cz,h,w]of [[height/2,z,stroke,width],[height/4,z-side*width/2,height/2,stroke],[0,z,stroke,width],[-height/4,z+side*width/2,height/2,stroke],[-height/2,z,stroke,width]])b.add(box(.025,h,w,[side*.91,y+cy,cz]),red);
    }
  }
  for(const [y,z,rx,ry,rz]of [[1.0,6.9,.69,.72,1.48],[1.45,4.45,.75,.79,1.46]]){
    const canopy=new THREE.SphereGeometry(1,12,8);canopy.scale(rx,ry,rz);canopy.translate(0,y,z);b.add(canopy,glass);
  }
  b.finish('МиГ-25ПУ · ЛЛ22');return root;
}

function renderCounts(root){
  let draws=0,triangles=0,lines=0;root.traverse(object=>{
    if(object.isMesh){draws+=Array.isArray(object.material)?object.material.length:1;triangles+=(object.geometry.index?.count||object.geometry.attributes.position.count)/3;}
    else if(object.isLine){draws++;lines+=object.geometry.attributes.position.count/2;}
  });return {draws,triangles,lines};
}

/** Independent metre-scale aircraft. The controller alone owns their world pose. */
export function buildLandingAircraft({sourceBuran}={}){
  if(!sourceBuran?.isObject3D)throw new Error('Landing Buran needs the loaded source scene');
  const buran=new THREE.Group();buran.name='Буран · посадка';
  buran.userData.aircraft={source:'energia-buran.glb',unit:'metre',forward:'+Z',sourcePreserved:true};
  const body=new THREE.Group();body.name='Буран · исходный планер';buran.add(body);
  const parts={};for(const side of [-1,1])for(const type of ['rudder','nose-door','main-door']){
    const group=new THREE.Group(),name=type+(side<0?'-left':'-right');group.name='Буран · '+name;
    if(type==='rudder')group.position.copy(RUDDER_HINGE);
    else if(type==='nose-door')group.position.set(side*.567,-2.64,8.0174);
    else group.position.set(side*4.25,-2.7,-2.55);
    group.userData.movingSurface=name;buran.add(group);parts[name]=group;
  }
  const extraction=extractOrbiter(sourceBuran,body,parts);
  const strut=new THREE.MeshStandardMaterial({color:0xb1b3af,roughness:.38,metalness:.68});strut.name='амортизаторы и диски';
  const tire=new THREE.MeshStandardMaterial({color:0x1f2223,roughness:.96,metalness:0});tire.name='шины';
  const gear=buildGear(buran,{strut,tire}),parachutes=buildParachutes(buran),mig=buildMig();
  let current={gear:0,pitchDeg:0,chute:0,airbrake:0,time:0};
  const budget={buran:renderCounts(buran),mig:renderCounts(mig)};
  function update({gear:extension=current.gear,pitchDeg=current.pitchDeg,chute=current.chute,airbrake,time=current.time}={}){
    const g=clamp(extension),c=clamp(chute),brake=clamp(airbrake??Math.max(g*.35,c));
    current={gear:g,pitchDeg:Number.isFinite(pitchDeg)?pitchDeg:0,chute:c,airbrake:brake,time:Number.isFinite(time)?time:0};
    for(const {group,definition}of gear){
      group.visible=g>.001;
      if(definition.id==='nose')group.rotation.x=(1-smooth(g))*Math.PI/2;
      else group.rotation.z=-Math.sign(definition.x)*(1-smooth(g))*Math.PI/2;
    }
    const door=smooth(Math.min(1,g*2));
    for(const side of [-1,1]){
      const suffix=side<0?'-left':'-right';
      parts['nose-door'+suffix].rotation.z=side*radians(86)*door;
      parts['main-door'+suffix].rotation.z=side*radians(82)*door;
      // Mirrored leaves swing out around the same inclined source hinge.
      parts['rudder'+suffix].quaternion.setFromAxisAngle(RUDDER_AXIS,-side*radians(32)*smooth(brake));
    }
    for(let i=0;i<parachutes.length;i++){
      const group=parachutes[i],open=smooth(c);group.visible=c>.001;
      group.scale.set(open,open,Math.sqrt(open));
      group.rotation.z=Math.sin(current.time*1.1+i*2.1)*.016*open;
      group.rotation.y=Math.sin(current.time*.83+i*1.9)*.012*open;
    }
    // pitchDeg is recorded for QA only. It must not pitch the root a second time;
    // the controller rotates about the returned physical contact references.
    buran.userData.landingPose={...current};return {...current};
  }
  function worldGearContacts(){
    buran.updateWorldMatrix(true,true);
    return gear.map(({group,definition})=>{
      let minimumY=Infinity,lowestPoint=null,visible=true;const point=V();
      for(let parent=group;parent;parent=parent.parent)if(!parent.visible){visible=false;break;}
      for(const mesh of group.children){if(!mesh.isMesh||mesh.material!==tire)continue;
        const position=mesh.geometry.attributes.position;
        for(let i=0;i<position.count;i++){
          point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
          if(point.y<minimumY){minimumY=point.y;lowestPoint=point.toArray();}
        }
      }
      return {id:definition.id,minimumY,lowestPoint,visible};
    });
  }
  function stats(){return {version:BURAN_LANDING_AIRCRAFT_VERSION,unit:'metre',forward:'+Z',
    source:{...extraction,separationZ:SOURCE_SEPARATION_Z,sourceToFlight:'[x,-z-7.6,y-18]',immutable:true},
    contacts:{main:[...BURAN_LANDING_CONTACTS.main],nose:[...BURAN_LANDING_CONTACTS.nose],mainTrack:BURAN_LANDING_CONTACTS.mainTrack},
    gearStruts:gear.length,gearWheels:gear.reduce((n,g)=>n+g.group.userData.wheels.length,0),
    rudderLeaves:2,parachuteCount:parachutes.length,deployedParachutes:current.chute>.001?parachutes.length:0,
    escort:{count:1,type:'МиГ-25ПУ-СОТН',laboratory:'ЛЛ22',boardNumber:'22',schematic:true},budget,pose:{...current},worldGearContacts:worldGearContacts()};}
  update();return {buran,mig,update,stats,worldGearContacts,mainContact:[...BURAN_LANDING_CONTACTS.main],noseContact:[...BURAN_LANDING_CONTACTS.nose]};
}
