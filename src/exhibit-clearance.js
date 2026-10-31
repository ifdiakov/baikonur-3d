import * as THREE from 'three';

function inside(x,z,polygon){let value=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
 const a=polygon[i],b=polygon[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])value=!value;
}return value;}

// Apply to standing poles and unrelated placeholder buildings only. Low runway
// edge/approach lights remain part of the airport's own measured light layout.
export function createExhibitClearance(objects){
 const areas=[];
 const mik=objects.find(o=>o.record.id==='pad-112');
 if(mik)areas.push({id:'mik112-hall',root:mik.g,polygon:[[-98,-123],[98,-123],[98,123],[-98,123]]});
 const airport=objects.find(o=>o.g.userData.airport?.key==='yubileiny');
 if(airport)areas.push({id:'yubileiny-runway',root:airport.g,polygon:airport.g.userData.airport.runwayClearancePolygon});
 const point=new THREE.Vector3();
 function areaAt(x,z){return areas.find(area=>{
  area.root.updateWorldMatrix(true,false);point.set(x,0,z);area.root.worldToLocal(point);
  return inside(point.x,point.z,area.polygon);
 });}
 const suppressed=[],checkedObstructions=[];
 if(airport){
  const runway=areas.find(a=>a.id==='yubileiny-runway');
  const runwayBounds={minX:Math.min(...runway.polygon.map(p=>p[0])),maxX:Math.max(...runway.polygon.map(p=>p[0])),
   minZ:Math.min(...runway.polygon.map(p=>p[1])),maxZ:Math.max(...runway.polygon.map(p=>p[1]))};
  airport.g.updateWorldMatrix(true,false);
  for(const object of objects){
   if(object===airport)continue;
   const geometryRoot=object.geometryRoot||object.g;
   // Retain the catalogue entry and its anchor/card, remove only generic
   // decorative geometry that would obstruct the actual runway.
   if(geometryRoot.userData.archiveModel||object.record.id==='pad-112')continue;
   geometryRoot.updateWorldMatrix(true,true);const bounds=new THREE.Box3().setFromObject(geometryRoot);if(bounds.isEmpty())continue;
   const footprint={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
   for(const x of [bounds.min.x,bounds.max.x])for(const z of [bounds.min.z,bounds.max.z]){
    point.set(x,bounds.min.y,z);airport.g.worldToLocal(point);
    footprint.minX=Math.min(footprint.minX,point.x);footprint.maxX=Math.max(footprint.maxX,point.x);
    footprint.minZ=Math.min(footprint.minZ,point.z);footprint.maxZ=Math.max(footprint.maxZ,point.z);
   }
   const overlap=footprint.minX<runwayBounds.maxX&&footprint.maxX>runwayBounds.minX&&footprint.minZ<runwayBounds.maxZ&&footprint.maxZ>runwayBounds.minZ;
   if(!overlap)continue;
   checkedObstructions.push({id:object.record.id,footprint});
   const removed=[];geometryRoot.traverse(m=>{if(m.isMesh){m.visible=false;m.userData.pickable=false;removed.push(m);}});
   if(removed.length){geometryRoot.userData.runwayClearanceSuppressed=true;suppressed.push({id:object.record.id,meshes:removed.length,footprint});}
  }
 }
 return {isPoleAllowed:(x,z)=>!areaAt(x,z),stats:()=>({version:'exhibit-clearance-v2',areas:areas.map(a=>({id:a.id,polygon:a.polygon})),checkedObstructions,suppressed})};
}
