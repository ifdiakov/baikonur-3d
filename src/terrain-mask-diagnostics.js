import * as THREE from 'three';

// Opt-in CI instrumentation. This does not change a material or a terrain mask.
// The index creates it only for ?gas-diagnostic=1, on an isolated QA branch.
export function createTerrainMaskDiagnostics({scene,renderer,camera,controls,sources,voids}){
 const records=Object.entries(sources).map(([id,mesh])=>({id,mesh,visible:mesh.visible,after:mesh.onAfterRender}));
 const byMesh=new Map(records.map(record=>[record.mesh,record])),programs=new Map();
 let requested=new Set();
 const visible=mesh=>{for(let object=mesh;object;object=object.parent)if(!object.visible)return false;return true;};
 const value=v=>v==null||typeof v!=='object'?v:ArrayBuffer.isView(v)?Array.from(v):v.toArray?v.toArray():v.isTexture?{name:v.name,texture:true}:null;
 function capture(record,material){
  const gl=renderer.getContext(),properties=renderer.properties.get(material),compiled=properties.currentProgram;
  if(!compiled?.program)return {available:false};
  const program=compiled.program,uniforms={},bindings={};
  for(let i=0;i<gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS);i++){
   const uniform=gl.getActiveUniform(program,i),location=gl.getUniformLocation(program,uniform.name);
   uniforms[uniform.name]={type:uniform.type,size:uniform.size,value:value(gl.getUniform(program,location))};
  }
  for(const [name,binding]of Object.entries(properties.uniforms||{}))
   if(/museumVoid|ukssCutout/.test(name))bindings[name]=value(binding.value);
  const source=shader=>shader&&gl.isShader(shader)?gl.getShaderSource(shader):null;
  return {available:true,programId:compiled.id,linked:gl.getProgramParameter(program,gl.LINK_STATUS),
   vertexSource:source(compiled.vertexShader),fragmentSource:source(compiled.fragmentShader),
   uniforms,bindings,worldMatrix:record.mesh.matrixWorld.toArray(),modelViewMatrix:record.mesh.modelViewMatrix.toArray()};
 }
 for(const record of records)record.mesh.onAfterRender=function(...args){
  record.after?.apply(this,args);
  if(!requested.delete(record.id))return;
  try{programs.set(record.id,capture(record,args[4]||record.mesh.material));}
  catch(error){programs.set(record.id,{available:false,error:error.message});}
 };
 function setHidden(ids=[]){
  if(ids.some(id=>!records.some(record=>record.id===id)))throw new Error('Unknown diagnostic terrain layer');
  for(const record of records)record.mesh.visible=record.visible&&!ids.includes(record.id);
 }
 function pinCamera({position,target}){
  controls.enableDamping=false;controls.update();controls.enabled=false;
  controls.target.fromArray(target);camera.position.fromArray(position);controls.update();camera.updateMatrixWorld(true);
 }
 function snapshot({probes=[],includePrograms=false,includeRays=false}={}){
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const cameraState={position:camera.position.toArray(),target:controls.target.toArray(),projection:camera.projectionMatrix.toArray(),worldInverse:camera.matrixWorldInverse.toArray()};
  const layers=records.map(({id,mesh})=>{const material=mesh.material;return {id,name:mesh.name,visible:visible(mesh),
   position:mesh.position.toArray(),worldY:mesh.getWorldPosition(new THREE.Vector3()).y,worldMatrix:mesh.matrixWorld.toArray(),
   renderOrder:mesh.renderOrder,vertices:mesh.geometry.attributes.position.count,geometryBounds:new THREE.Box3().setFromObject(mesh).min.toArray().concat(new THREE.Box3().setFromObject(mesh).max.toArray()),
   material:{name:material.name,type:material.type,color:material.color?.getHexString(),side:material.side,opacity:material.opacity,transparent:material.transparent,
    depthWrite:material.depthWrite,depthTest:material.depthTest,polygonOffset:material.polygonOffset,polygonOffsetFactor:material.polygonOffsetFactor,
    vertexColors:material.vertexColors,map:material.map?.name||null},...(includePrograms?{program:programs.get(id)||{available:false}}:{})};});
  const result={version:'site110-gas-owner-diagnostic-v1',camera:cameraState,layers,voids:voids.stats(),
   render:{drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles},shadowMapEnabled:renderer.shadowMap.enabled};
  if(includeRays){
   const ray=new THREE.Raycaster(),size=renderer.getSize(new THREE.Vector2());
   result.rays=probes.map(pixel=>{
    ray.setFromCamera(new THREE.Vector2(pixel[0]/size.x*2-1,1-pixel[1]/size.y*2),camera);
    const hits=ray.intersectObject(scene,true).filter(hit=>visible(hit.object)).slice(0,14);
    return {pixel,hits:hits.map(hit=>({source:byMesh.get(hit.object)?.id||null,name:hit.object.name,
     ancestors:(()=>{const names=[];for(let p=hit.object.parent;p;p=p.parent)if(p.name)names.push(p.name);return names;})(),
     point:hit.point.toArray(),distance:hit.distance,faceIndex:hit.faceIndex,normal:hit.face?.normal.toArray(),
     material:(Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material)?.name}))};
   });
  }
  return result;
 }
 return {setHidden,pinCamera,requestProgramCapture(){requested=new Set(records.map(record=>record.id));},snapshot,
  restore(){setHidden([]);requested.clear();},dispose(){setHidden([]);for(const record of records)record.mesh.onAfterRender=record.after;requested.clear();}};
}
