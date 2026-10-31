// Owner's new contour registered directly to OpenStreetMap, 28 October 2026.
// The narrow north-eastern spur is part of the source ring and is retained.
// Internal dividers are thematic lines from the owner's image, not surveyed
// enterprise ownership limits. Shared vertices are identical by construction.
// © OpenStreetMap contributors — https://www.openstreetmap.org/copyright
import {projectOsm} from './osm-geography.js?v=20261031-facilities-rails-lighting-v1';
export const FLANK_BOUNDARY_VERSION='contours-three-level-v5';
export const FLANK_COORDINATE_SYSTEM='osm-map';
const freezePoints=points=>Object.freeze(points.map(p=>Object.freeze(p)));
export const FLANK_REFERENCE=Object.freeze({
  "version": "owner-osm-outline-20261028-v2",
  "sourceFile": "контур и фланги.png",
  "imageAsset": "assets/references/cosmodrome-flanks-20261028.png",
  "sourceSha256": "c1a425ecefb82d17b046244ba2e6b7daceff55574bbcb3a40fb88772eeaac417",
  "imageSize": [
    1986,
    1632
  ],
  "matchedGroundPoints": 14,
  "independentCheckPoints": 6,
  "medianRegistrationErrorPixels": 1.781639704807601,
  "registrationRmsPixels": 1.9207175776453578,
  "maxRegistrationErrorPixels": 3.2157950375280513,
  "estimatedDividerUncertaintyMetres": 200,
  "basis": "Owner-supplied contour matched directly to OSM relation/6725906, main outer ring way/52101489. External vertices retain the source geographic coordinates; the two straight thematic dividers are registered from the image. No legacy schematic warp.",
  "boundarySource": {
    "relation": 6725906,
    "way": 52101489,
    "polygonIndex": 0,
    "ringIndex": 0,
    "url": "https://www.openstreetmap.org/relation/6725906",
    "snapshot": "data/osm/facilities.geojson",
    "snapshotDate": "2026-10-28"
  },
  "imageToMercator": [
    [
      76.49704397141458,
      0.17697271623183042,
      6988901.345017955
    ],
    [
      0.07566062284100862,
      -76.5544830432118,
      5829524.671885517
    ]
  ],
  "webMercatorRadiusMetres": 6378137.0,
  "registrationData": "data/osm/flank-registration.json"
});
export const FLANK_REFERENCE_OUTLINE=freezePoints([[68.57438131791102,677.5353280127872],[70.40929722519135,412.58187207089924],[1576.491646994075,442.5517516436838],[1605.5715066134687,128.06434503874428],[1629.4429480070776,134.03519022443578],[1601.5448938003522,422.78571408070434],[1632.2634084144715,444.39508169130943],[1767.560477279005,442.61310548717347],[1883.0604349107834,578.8152899790099],[1394.7757976059906,953.0114150184858],[956.6454476109127,1095.093149462691],[859.1707906798712,1292.2096669436546],[678.4755143533592,1330.4939305771534],[535.5616831509228,1042.5634934148807]]);
export const FLANK_REFERENCE_DIVIDERS=Object.freeze([[[578.4892835539873,422.69227274450964],[535.5616831509228,1042.5634934148807]],[[888.530118250474,428.86184672559057],[956.6454476109127,1095.093149462691]]].map(freezePoints));
export const FLANK_OUTLINE_LONLAT=freezePoints([[62.830811,45.983604],[62.8316178,46.1099723],[63.865663,46.0958025],[63.8867774,46.244493],[63.9011283,46.2429289],[63.8828911,46.1069922],[63.9062239,46.0955277],[63.9965463,46.0966001],[64.0787806,46.0310548],[63.7422214,45.8521824],[63.4410672,45.7841327],[63.3759993,45.688779],[63.2495278,45.6706509],[63.152161,45.807743]]);

// Pixel reference coordinates are interpreted in the original 1986×1632 image.
export function referenceToPlan([x,y]){
 const m=FLANK_REFERENCE.imageToMercator,r=FLANK_REFERENCE.webMercatorRadiusMetres;
 const east=m[0][0]*x+m[0][1]*y+m[0][2],north=m[1][0]*x+m[1][1]*y+m[1][2];
 return projectOsm(east/r*180/Math.PI,(2*Math.atan(Math.exp(north/r))-Math.PI/2)*180/Math.PI);
}
function onEdge(p,a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1],t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy);
 return [a[0]+dx*t,a[1]+dy*t];
}
export const FLANK_OUTLINE=freezePoints(FLANK_OUTLINE_LONLAT.map(projectOsm));
const topLeft=Object.freeze(onEdge(referenceToPlan(FLANK_REFERENCE_DIVIDERS[0][0]),FLANK_OUTLINE[1],FLANK_OUTLINE[2]));
const topRight=Object.freeze(onEdge(referenceToPlan(FLANK_REFERENCE_DIVIDERS[1][0]),FLANK_OUTLINE[1],FLANK_OUTLINE[2]));
const bottomLeft=FLANK_OUTLINE[13],bottomRight=FLANK_OUTLINE[10];
export const FLANK_BORDERS=Object.freeze([
 Object.freeze([topLeft,bottomLeft]),Object.freeze([topRight,bottomRight])
]);
export const FLANK_POLYGONS=Object.freeze([
 Object.freeze([FLANK_OUTLINE[0],FLANK_OUTLINE[1],topLeft,bottomLeft]),
 Object.freeze([topLeft,topRight,bottomRight,FLANK_OUTLINE[11],FLANK_OUTLINE[12],bottomLeft]),
 Object.freeze([topRight,...FLANK_OUTLINE.slice(2,11)])
]);
// The long northern edge is split at the two author-drawn divider endpoints.
// The external perimeter has 16 segments; each belongs to exactly one district.
export const FLANK_PERIMETER=Object.freeze([
 {key:'left',points:Object.freeze([topLeft,FLANK_OUTLINE[1],FLANK_OUTLINE[0],bottomLeft])},
 {key:'center',points:Object.freeze([bottomLeft,FLANK_OUTLINE[12],FLANK_OUTLINE[11],bottomRight])},
 {key:'right',points:Object.freeze([bottomRight,...FLANK_OUTLINE.slice(2,10).reverse(),topRight])},
 {key:'center',points:Object.freeze([topRight,topLeft])}
].map(Object.freeze));
export const FLANK_BOUNDS=Object.freeze({
 minX:Math.min(...FLANK_OUTLINE.map(p=>p[0])),maxX:Math.max(...FLANK_OUTLINE.map(p=>p[0])),
 minY:Math.min(...FLANK_OUTLINE.map(p=>p[1])),maxY:Math.max(...FLANK_OUTLINE.map(p=>p[1]))
});
function centroid(polygon){
 let twiceArea=0,x=0,y=0;
 polygon.forEach((a,i)=>{const b=polygon[(i+1)%polygon.length],cross=a[0]*b[1]-b[0]*a[1];twiceArea+=cross;x+=(a[0]+b[0])*cross;y+=(a[1]+b[1])*cross;});
 return Object.freeze([x/(3*twiceArea),y/(3*twiceArea)]);
}
// Focus the main body of each district; the narrow northern spur should not
// pull the right-hand card away from its actual facilities.
export const FLANK_CENTERS=Object.freeze({
 left:centroid(FLANK_POLYGONS[0]),center:centroid(FLANK_POLYGONS[1]),
 right:centroid([topRight,FLANK_OUTLINE[2],...FLANK_OUTLINE.slice(6,11)])
});
export function containsFlankPoint(key,[x,y]){
 const polygon=FLANK_POLYGONS[['left','center','right'].indexOf(key)];if(!polygon)return false;
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i],cross=(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]);
  if(Math.abs(cross)<1e-7&&x>=Math.min(a[0],b[0])-1e-8&&x<=Math.max(a[0],b[0])+1e-8&&y>=Math.min(a[1],b[1])-1e-8&&y<=Math.max(a[1],b[1])+1e-8)return true;
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
