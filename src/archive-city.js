import * as THREE from 'three';
import {archiveKit,imageFrame} from './archive-kit.js?v=20261031-facilities-rails-lighting-v1';

// A small set of representative blocks keeps the photo-derived city legible at
// museum scale. Its real road network is rendered by the OSM transport layer.
export function photoCity(root){
 const k=archiveKit(root),P=imageFrame([600,490],1);
 const palette={
  cityWall:0xd8d2c5,cityWallCool:0xcfd4cd,cityRoof:0xd9dcd6,
  cityWindow:0x9eafa9,cityDoor:0xb4bcb3,cityStone:0xe1ddd2,
  cityGrass:0x9da98e,cityTrack:0xb99d87
 };
 for(const[name,color]of Object.entries(palette)){
  k.mat[name]=new THREE.MeshStandardMaterial({name,color,roughness:.96,metalness:0});
 }

 // Twenty-five residential blocks preserve the northern, central and western
 // neighbourhoods, with generous empty space between the light roof masses.
 const neighbourhoods=[
  {xs:[650,700],zs:[85,145,205],w:40,d:14,h:10.5},
  {xs:[755],zs:[90,175],w:43,d:16,h:10.5},
  {xs:[840],zs:[270,340,410],w:44,d:17,h:12},
  {xs:[650,700],zs:[365,430],w:40,d:18,h:12},
  {xs:[655,710],zs:[550,700],w:47,d:19,h:10},
  {xs:[270,365],zs:[535,635,735],w:54,d:21,h:12}
 ];
 let buildingBlocks=0,residentialBlocks=0,civicBlocks=0;
 function block(x,z,w,d,h,civic=false){
  const [px,pz]=P([x,z]);
  const wall=buildingBlocks%3===1?'cityWallCool':'cityWall';
  k.box(w,h,d,px,h/2,pz,wall,civic?'photo-city-civic':'photo-city-residential');
  k.box(w+.8,.65,d+.8,px,h+.325,pz,'cityRoof','city-roof');
  // Three muted panes on one facade, without dense multi-floor window grids,
  // projecting piers or roof seams that turn into dark noise from a distance.
  for(const side of [-1,0,1]){
   k.box(civic?6:4.4,1.75,.12,px+side*w*.25,h*.58,pz+d/2+.08,'cityWindow','city-window');
  }
  if(civic){
   k.box(3.1,2.6,.14,px,1.3,pz+d/2+.12,'cityDoor','city-civic-entrance');
   k.box(7,.35,3.2,px,3.0,pz+d/2+1.35,'cityStone','city-civic-canopy');
   civicBlocks++;
  }else residentialBlocks++;
  buildingBlocks++;
 }
 for(const row of neighbourhoods)for(const x of row.xs)for(const z of row.zs){
  block(x,z,row.w,row.d,row.h);
 }
 for(const[x,z,w,d,h]of [
  [475,355,54,28,9],[480,530,58,30,10],[505,695,54,30,9],
  [850,545,55,28,10],[850,700,49,28,8]
 ])block(x,z,w,d,h,true);

 // Retain the stadium as the eastern landmark, with a simple pale track and
 // two seating tiers on each side. There are no photo-traced streets below it.
 const p=P([947,655]);
 k.box(28,.12,53,p[0],.22,p[1],'cityGrass','stadium-pitch');
 k.box(28,.03,.45,p[0],.30,p[1],'cityStone','stadium-centre-line');
 const track=[];
 for(let i=0;i<=32;i++){
  const a=i/32*Math.PI*2;track.push([p[0]+24*Math.cos(a),p[1]+39*Math.sin(a)]);
 }
 k.path(track,3,.25,'cityTrack','athletics-track');
 for(const side of[-1,1])for(let tier=0;tier<2;tier++){
  k.box(4,.8,48,p[0]+side*(30+tier*3),.5+tier*.7,p[1],'cityStone','stadium-seating');
 }

 root.userData.cityTrace={
  version:'simplified-osm-city-v2',
  source:'город.jpg',sourceId:'1URocxjo-ZAYAWIIrBhBGMfwx1BKhKkGT',reviewImage:[1200,1043],
  buildingBlocks,residentialBlocks,civicBlocks,roofCentres:buildingBlocks,streetTraces:0,
  roadSource:'OSM transport layer',stadiumRetained:true,
  completeness:'Simplified representative blocks from the original photo reference; not every building. Heights remain interpretive.'
 };
 return k.finish();
}
