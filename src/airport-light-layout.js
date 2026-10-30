import * as THREE from 'three';

export const AIRPORT_LIGHT_LAYOUT_VERSION='airport-length-derived-lights-v1';

// One local-space layout feeds the actual renderer and the shoreline check.
// Approach stations follow the airport's displayed longitudinal scale;
// reducing a display runway cannot leave the old approach array behind it.
export function airportLocalLightLayout(spec){
 const runway=[],apron=[],H=spec.length/2,W=spec.width;
 const add=(x,z,color,size,kind)=>runway.push({x,y:2.1,z,height:0,color,size,kind});
 for(let z=-H+15;z<=H-15;z+=60)for(const x of [-W/2-1,W/2+1])add(x,z,0xffefc5,2.2,'runway-edge');
 for(let x=-W/2;x<=W/2;x+=W/8){add(x,H-10,0x64ffbc,3,'threshold');add(x,-H+10,0xff4c42,3,'runway-end');}
 for(let z=-H+20;z<H;z+=45)add(0,z,z< -H+600?0xffb76b:0xf4f3dd,1.8,'runway-centre');
 const taxiX=spec.key==='yubileiny'?-150:100;
 for(let z=-H+60;z<H-60;z+=70)add(taxiX,z,0x68aaff,2,'taxiway');
 const approachLength=spec.approachLength??480,approachStations=spec.approachStations??8;
 for(const side of [-1,1])for(let station=1;station<=approachStations;station++){
  const d=approachLength*station/approachStations;
  add(0,side*(H+d),0xffeac0,2.5,'approach');
  if(station===5)for(const x of [-16,-8,8,16])add(x,side*(H+d),0xffeac0,2.5,'approach-crossbar');
 }
 for(const side of [-1,1])for(let i=0;i<4;i++)add(-W/2-18-i*3,side*(H-(spec.papiSetback??300)),i<2?0xff3930:0xfff6e0,2.6,'papi');
 for(const dx of [-110,110])for(const dz of [-185,185])apron.push({
  x:spec.apron[0]+dx,y:1.8,z:spec.apron[1]+dz,height:6,radius:23,color:0xffdba4,kind:'apron-pole'
 });
 return {runway,apron,version:AIRPORT_LIGHT_LAYOUT_VERSION,approachLength,approachStations};
}

export function buildAirportLightRecords(field){
 field.updateWorldMatrix(true,false);
 const layout=airportLocalLightLayout(field.userData.airport);
 const world=record=>{
  const p=field.localToWorld(new THREE.Vector3(record.x,record.y,record.z));
  return {...record,local:[record.x,record.y,record.z],x:p.x,y:p.y,z:p.z,owner:field,airport:field.userData.airport.key};
 };
 return {...layout,runway:layout.runway.map(world),apron:layout.apron.map(world)};
}
