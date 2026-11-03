// Spatially partition the editor's source-pavement masks without discarding
// precise elevation changes at hills, overpasses or road-edge junctions.
// The 2048px mask is split into five local atlases; each atlas covers a much
// smaller range than the original continent-sized set of erasures.
import {ROAD_EDIT_SHOULDER_EXTRA} from './road-editor-style.js?v=20261103-road-parity-v1';
export const ROAD_MASK_TILE_COUNT=5;
export const ROAD_MASK_VISIBLE_MARGIN=.18;
export const ROAD_MASK_REPLACEMENT_MARGIN=.26;
export function roadMaskCoverageWidth(width,kind){
 return width+ROAD_EDIT_SHOULDER_EXTRA+(kind==='added'?ROAD_MASK_REPLACEMENT_MARGIN:ROAD_MASK_VISIBLE_MARGIN);
}
export const ROAD_MASK_GRADE_MIN=-16;
export const ROAD_MASK_GRADE_RANGE=48;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const lerp=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);

export function roadMaskTileIndex(point){
 const x=point[0],z=point[2];
 if(z>600)return 4;           // Northern facilities and elevated roads
 if(x<=175)return z<-450?0:1; // Western cosmodrome, two along-track sectors
 return x<790?2:3;            // Eastern cosmodrome, two cross-track sectors
}
function duplicateKey(road){
 const k=p=>p.map(n=>Math.round(n*1000)).join(',');
 const start=road.points.map(k).join(';');
 const reversed=road.points.slice().reverse().map(k).join(';');
 return road.sourceId+'|'+road.width+'|'+(start<reversed?start:reversed);
}
function segment(tile,a,b,width,kind,sourceId,isStart,isEnd){
 const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,z=(a[2]+b[2])/2;
 tile.push({a,b,width,kind,sourceId,
  grade:Math.round(clamp((y-ROAD_MASK_GRADE_MIN)/ROAD_MASK_GRADE_RANGE,0,1)*255),
  capStart:!isStart,capEnd:!isEnd,
  center:[x,y,z]});
}
export function partitionRoadMaskStrokes(hidden=[],added=[],{step=8,gradeStep=.20}={}){
 const tiles=Array.from({length:ROAD_MASK_TILE_COUNT},()=>[]),seen=new Set();
 let duplicateCuts=0,invalidSegments=0,partCount=0;
 for(const [kind,records]of [['hidden',hidden],['added',added]]){
  for(const road of records){
   if(!Array.isArray(road.points)||road.points.length<2)continue;
   if(kind==='hidden'){
    const key=duplicateKey(road);
    if(seen.has(key)){duplicateCuts++;continue;}
    seen.add(key);
   }
   for(let j=1;j<road.points.length;j++){
    const start=road.points[j-1],end=road.points[j];
    const length=Math.hypot(end[0]-start[0],end[2]-start[2]);
    if(length<1e-6){invalidSegments++;continue;}
    const pieces=Math.max(1,Math.ceil(length/step),Math.ceil(Math.abs(end[1]-start[1])/gradeStep));
    for(let k=0;k<pieces;k++){
     const a=lerp(start,end,k/pieces),b=lerp(start,end,(k+1)/pieces);
     const index=roadMaskTileIndex([(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2]);
     const width=Array.isArray(road.widths)?(road.widths[j-1]+road.widths[j])*.5:road.width;
     segment(tiles[index],a,b,width,kind,
      kind==='hidden'?road.sourceId:road.id,j===1&&k===0,j===road.points.length-1&&k===pieces-1);
     partCount++;
    }
   }
  }
 }
 return {tiles,stats:{partCount,duplicateCuts,invalidSegments,sectorParts:tiles.map(t=>t.length)}};
}
export function roadMaskTileBounds(parts,{padding=3,minSide=24}={}){
 if(!parts.length)return {left:0,bottom:0,side:minSide,metersPerPixel:minSide/2048};
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,margin=0;
 for(const part of parts){
  margin=Math.max(margin,part.width*.5);
  for(const p of [part.a,part.b]){
   minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);
   minZ=Math.min(minZ,p[2]);maxZ=Math.max(maxZ,p[2]);
  }
 }
 const side=Math.max(minSide,maxX-minX+2*(margin+padding),maxZ-minZ+2*(margin+padding));
 return {left:(minX+maxX-side)/2,bottom:(minZ+maxZ-side)/2,side,metersPerPixel:side/2048};
}
