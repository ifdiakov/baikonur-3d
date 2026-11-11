import assert from 'node:assert/strict';

// Shared by Node and page.evaluate: metadata identifies a vertex/probe, while
// actual loaded buffers, matrices and triangle intersections supply the result.
export function measureSite118(options={}){
  const d=globalThis.__SITE118_TEST,T=options.THREE||d?.THREE;
  const record=d?.objects.find(o=>o.record.id==='pad-118'),root=options.root||record?.g;
  const manifest=options.manifest||root?.userData.site118Model?.manifest;
  if(!T||!root||!manifest)throw Error('The real Site 118 geometry is unavailable');
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),meshes=[],geometry=[],bounds=new T.Box3(),above=new T.Box3();
  const point=new T.Vector3(),materials=new Set();let triangles=0,finite=true;
  const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
  const fingerprint=array=>{let h=2166136261;for(const byte of new Uint8Array(array.buffer,array.byteOffset,array.byteLength))h=Math.imul(h^byte,16777619);return(h>>>0).toString(16);};
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;meshes.push(mesh);const g=mesh.geometry,p=g.attributes.position;
    const matrix=new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
    for(const attribute of Object.values(g.attributes))for(const value of (attribute.data?.array||attribute.array))if(!Number.isFinite(value))finite=false;
    if(g.index)for(const index of g.index.array)if(index>=p.count)finite=false;
    if(!matrix.elements.every(Number.isFinite)||Math.abs(matrix.determinant())<1e-10)finite=false;
    const meshBounds=new T.Box3();for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(matrix);meshBounds.expandByPoint(point);bounds.expandByPoint(point);if(point.y>=0)above.expandByPoint(point);}
    const count=(g.index?.count||p.count)/3;triangles+=count;for(const m of [mesh.material].flat())materials.add(m);
    geometry.push({name:mesh.name,part:mesh.userData.sourcePart||mesh.name,component:mesh.userData.museumComponent,
      visible:visible(mesh),vertices:p.count,triangles:count,position:fingerprint(p.data?.array||p.array),indices:g.index?fingerprint(g.index.array):null,
      matrix:matrix.elements.map(n=>Math.round(n*1e12)/1e12),bounds:{min:meshBounds.min.toArray(),max:meshBounds.max.toArray()}});
  });
  const groundMeshes=(options.groundMeshes||d?.groundMeshes||[]).filter(m=>m.isMesh&&visible(m));
  for(const mesh of groundMeshes)mesh.updateWorldMatrix(true,false);
  const groundAt=world=>{
    const ray=new T.Raycaster(new T.Vector3(world.x,world.y+200,world.z),new T.Vector3(0,-1,0));
    const hit=ray.intersectObjects(groundMeshes,false)[0];return hit?{y:hit.point.y,name:hit.object.name}:null;
  };
  const scale=root.getWorldScale(new T.Vector3()).y;
  const contacts=manifest.contacts.map(sample=>{
    const mesh=meshes.find(m=>(m.userData.sourcePart||m.name)===sample.mesh);
    if(!mesh||!Number.isInteger(sample.vertex)||sample.vertex<0||sample.vertex>=mesh.geometry.attributes.position.count)throw Error('Missing real contact vertex '+sample.id);
    const world=new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,sample.vertex).applyMatrix4(mesh.matrixWorld);
    const local=world.clone().applyMatrix4(inverse),ground=groundAt(world);
    return {id:sample.id,mesh:sample.mesh,role:sample.role,vertex:sample.vertex,local:local.toArray(),world:world.toArray(),
      referenceError:local.distanceTo(new T.Vector3(...sample.point)),ground,
      gapMetres:ground?(world.y-ground.y)/scale:null};
  });
  const negativeProbes=manifest.groundNegativeProbes.map(sample=>{
    const local=new T.Vector3(...sample.point),world=root.localToWorld(local.clone());
    const origin=root.localToWorld(local.clone().add(new T.Vector3(0,5,0)));
    const hits=new T.Raycaster(origin,new T.Vector3(0,-1,0),0,5.25*scale).intersectObjects(meshes,false)
      .filter(h=>visible(h.object)&&(h.object.userData.sourcePart||h.object.name)!=='Cylinder_3')
      .map(h=>({mesh:h.object.name,local:root.worldToLocal(h.point.clone()).toArray(),world:h.point.toArray()}));
    return {id:sample.id,world:world.toArray(),hits,ground:groundAt(world)};
  });
  let picking=null;
  if(d?.clickable){const index=d.objects.indexOf(record),picked=d.clickable.filter(m=>m.userData.idx===index);
    picking={index,records:d.objects.filter(o=>o.record.id==='pad-118').length,picked:picked.length,
      unique:new Set(picked).size,missing:meshes.filter(m=>!picked.includes(m)).map(m=>m.name),
      stale:picked.filter(m=>!meshes.includes(m)).map(m=>m.name),wrongIndex:meshes.filter(m=>m.userData.idx!==index).map(m=>m.name)};}
  return {version:root.userData.site118Model?.version,asset:root.userData.site118Model?.asset,
    root:{position:root.position.toArray(),scale:root.scale.toArray(),yaw:root.rotation.y,matrix:root.matrixWorld.toArray()},
    finite,meshes:meshes.length,materials:materials.size,triangles,geometry,
    bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},aboveGroundBounds:{min:above.min.toArray(),max:above.max.toArray()},
    contacts,negativeProbes,picking};
}

export function assertSite118Measurement(result,{manifest,ground=false,picking=false}={}){
  assert.equal(result.version,'site118-drive-20261111-v1');assert.equal(result.asset.status,'ready');
  assert(result.finite);assert.equal(result.meshes,4);assert.equal(result.triangles,10669);assert.equal(result.materials,1);
  assert.equal(result.asset.sha256,manifest.asset.sha256);
  assert.deepEqual(result.geometry.map(g=>g.part).sort(),['Cube_0','Cylinder_3','Gate_2','Siding_1']);
  assert(result.geometry.every(g=>g.visible&&g.component==='site118-source-structure'),'Only the complete visible source structures remain');
  for(const part of result.geometry){const expected=manifest.retained.find(p=>p.name===part.part);assert(expected);assert.equal(part.triangles,expected.triangles);assert.equal(part.vertices,expected.vertices);
    for(const side of ['min','max'])for(let i=0;i<3;i++)assert(Math.abs(part.bounds[side][i]-expected.bounds[side][i])<2e-5,part.part+' actual bounds');}
  assert.deepEqual(result.root.scale,[.14,.14,.14]);assert.equal(result.root.yaw,-2.106);
  assert(Math.abs(result.root.position[0]+371.94137309308445)<1e-7);assert(Math.abs(result.root.position[2]+407.6606911252946)<1e-7);
  assert(Math.abs(result.root.position[1]+2.755)<1e-9,'The preserved underground pipes must not redefine the surface datum');
  assert.equal(result.contacts.length,15);assert.equal(result.negativeProbes.length,6);
  assert.deepEqual(new Set(result.contacts.map(p=>p.role)),new Set(['building-foundation','equipment-base','fence-foundation']));
  for(const contact of result.contacts){const expected=manifest.contacts.find(p=>p.id===contact.id);assert(contact.referenceError<2e-5,'The actual source vertex differs: '+contact.id);
    assert(contact.world.every(Number.isFinite));
    if(ground){assert(contact.ground,'No museum ground below '+contact.id);
      assert(contact.gapMetres<=expected.maximumGap+1e-5,'Floating real foundation: '+JSON.stringify(contact));
      assert(contact.gapMetres>=-expected.maximumEmbedDepth-1e-5,'Terrain buries the real source base too deeply: '+JSON.stringify(contact));}}
  for(const probe of result.negativeProbes){assert.deepEqual(probe.hits,[],'A removed source lawn/yard slab is still rendered: '+probe.id);if(ground)assert(probe.ground,'The existing museum ground remains visible below '+probe.id);}
  if(picking){assert(result.picking);assert.equal(result.picking.records,1);assert.equal(result.picking.picked,4);assert.equal(result.picking.unique,4);
    for(const key of ['missing','stale','wrongIndex'])assert.deepEqual(result.picking[key],[],key+' source picking');}
}

// The failed candidate showed the medium-road ribbon over this small source
// exhibit. Limit visibility rays to its real footprint/above-ground vertices
// and visible road/LOD roots; this is not a scene-wide collision scan.
export function measureSite118RoadOcclusion(options={}){
  const d=globalThis.__SITE118_TEST,T=options.THREE||d?.THREE,root=options.root||d?.objects.find(o=>o.record.id==='pad-118')?.g;
  const camera=options.camera||d?.camera,roadRoots=options.roadRoots||d?.roadRoots?.(),ground=new Set(options.groundMeshes||d?.groundMeshes||[]);
  if(!T||!root||!camera||!roadRoots)throw Error('Site 118 road visibility inputs are unavailable');
  root.updateWorldMatrix(true,true);camera.updateWorldMatrix(true,false);
  const inverse=root.matrixWorld.clone().invert(),bounds=new T.Box3(),point=new T.Vector3(),own=new Set(),parts=[];
  root.traverse(m=>{own.add(m);if(!m.isMesh)return;const vertices=[],p=m.geometry.attributes.position;
    for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld).applyMatrix4(inverse);if(point.y>=0){vertices.push({vertex:i,point:point.clone()});bounds.expandByPoint(point);}}
    if(vertices.length)parts.push({mesh:m.name,vertices});
  });
  const samples=[];
  for(const u of [0,.5,1])for(const v of [0,.5,1])samples.push({id:`footprint-${u}-${v}`,local:new T.Vector3(T.MathUtils.lerp(bounds.min.x,bounds.max.x,u),.25,T.MathUtils.lerp(bounds.min.z,bounds.max.z,v))});
  for(const part of parts){const middle=(Math.min(...part.vertices.map(v=>v.point.x))+Math.max(...part.vertices.map(v=>v.point.x)))/2;
    for(const side of [-1,1]){const candidates=part.vertices.filter(v=>side<0?v.point.x<=middle:v.point.x>middle);if(!candidates.length)continue;
      const top=candidates.reduce((a,b)=>b.point.y>a.point.y?b:a);samples.push({id:`${part.mesh}-upper-${side}`,mesh:part.mesh,vertex:top.vertex,local:top.point});}
  }
  const eye=camera.getWorldPosition(new T.Vector3()),region=new T.Box3().expandByPoint(eye),visible=m=>{for(let p=m;p;p=p.parent)if(!p.visible)return false;return true;};
  for(const sample of samples){sample.world=root.localToWorld(sample.local.clone());region.expandByPoint(sample.world);}region.expandByScalar(.05);
  const candidates=[],seen=new Set();
  for(const group of roadRoots){group.updateWorldMatrix(true,true);group.traverse(m=>{
    if(!m.isMesh||seen.has(m)||own.has(m)||ground.has(m)||!visible(m)||m.userData.roadKind==='rails'||!m.layers.test(camera.layers))return;
    seen.add(m);if(![m.material].flat().some(mat=>mat.visible!==false&&!mat.transparent&&mat.opacity>=.95))return;
    const box=new T.Box3().setFromObject(m);if(box.intersectsBox(region))candidates.push({mesh:m,box});
  });}
  const ray=new T.Raycaster(),probe=new T.Vector3();
  const probes=samples.map(sample=>{
    const distance=eye.distanceTo(sample.world),direction=sample.world.clone().sub(eye).normalize();
    // Trace the vertex-to-camera segment from the camera end so FrontSide
    // materials obey the same face-culling rule as the visible rendering.
    ray.set(eye,direction);ray.near=camera.near;ray.far=Math.max(camera.near,distance-.001);
    const nearby=candidates.filter(c=>ray.ray.intersectBox(c.box,probe)).map(c=>c.mesh);
    const hit=ray.intersectObjects(nearby,false).find(h=>{const m=Array.isArray(h.object.material)?h.object.material[h.face?.materialIndex||0]:h.object.material;return m?.visible!==false&&!m?.transparent&&m?.opacity>=.95;});
    let occluder=null;if(hit){const mesh=hit.object,mat=Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex||0]:mesh.material,parents=[];
      for(let p=mesh.parent;p;p=p.parent)parents.push({name:p.name,type:p.type,component:p.userData.museumComponent||null});
      occluder={name:mesh.name,component:mesh.userData.museumComponent||null,roadKind:mesh.userData.roadKind||null,
        world:hit.point.toArray(),distance:hit.distance,instanceId:hit.instanceId??null,parents,
        material:{name:mat.name,type:mat.type,color:mat.color?'#'+mat.color.getHexString():null,side:mat.side,opacity:mat.opacity,transparent:mat.transparent,depthTest:mat.depthTest,depthWrite:mat.depthWrite}};
    }
    return {id:sample.id,mesh:sample.mesh||null,vertex:sample.vertex??null,local:sample.local.toArray(),world:sample.world.toArray(),occluder};
  });
  return {camera:eye.toArray(),candidateMeshes:candidates.length,rays:probes.length,blocked:probes.filter(p=>p.occluder).length,probes};
}
