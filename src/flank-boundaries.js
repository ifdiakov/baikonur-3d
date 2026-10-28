// Owner-drawn flank limits, registered to the existing 3D museum ground plane.
// The source is a cropped/rotated view with white margins, not a 1300×1045 map.
// Keep shared vertices identical so adjacent territories have no gaps/overlaps.
export const FLANK_BOUNDARY_VERSION='image-outline-territories-v4-relief';
export const FLANK_REFERENCE=Object.freeze({
 "version": "owner-outline-20261028",
 "sourceFile": "фланги.jpg",
 "sourceSha256": "e488999f89d31c401f82f15df6db239e82b2755568f2e69d58f4c709d50c0fd2",
 "imageSize": [
  2048,
  1738
 ],
 "matchedGroundPoints": 86,
 "medianRegistrationErrorPixels": 0.6898219585418701,
 "basis": "Owner-drawn outline registered to the published museum ground plane; white screenshot margins are excluded.",
 "imageToPlan": [
  [
   1.407801281076778,
   -0.13210744896168414,
   -39.84181868317976
  ],
  [
   0.1542014622645,
   1.4464748728556884,
   -128.5240561733
  ],
  [
   -8.311031294991645e-06,
   3.733958871786095e-05,
   1.0
  ]
 ]
});
const source={"outer":[[7.513,33.498],[1149.543,33.504],[1149.494,201.806],[651.844,565.5],[493.208,565.5],[7.496,214.878]],"left":[[269.459,33.5],[457.457,250.738],[348.911,461.336]],"right":[[597.927,33.501],[629.653,293.421],[907.348,378.772]]};
const freezePoints=points=>Object.freeze(points.map(p=>Object.freeze(p)));
function onEdge(p,a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1],t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy);
 return [a[0]+dx*t,a[1]+dy*t];
}
export function referenceToPlan([x,y]){
 const m=FLANK_REFERENCE.imageToPlan,d=m[2][0]*x+m[2][1]*y+m[2][2];
 return [(m[0][0]*x+m[0][1]*y+m[0][2])/d,(m[1][0]*x+m[1][1]*y+m[1][2])/d];
}
// Extend the small gaps in the hand-drawn dividers to the exact outer edges.
source.left[0]=onEdge(source.left[0],source.outer[0],source.outer[1]);
source.left[2]=onEdge(source.left[2],source.outer[5],source.outer[4]);
source.right[0]=onEdge(source.right[0],source.outer[0],source.outer[1]);
source.right[2]=onEdge(source.right[2],source.outer[2],source.outer[3]);
export const FLANK_REFERENCE_OUTLINE=freezePoints(source.outer);
export const FLANK_REFERENCE_DIVIDERS=Object.freeze([freezePoints(source.left),freezePoints(source.right)]);
export const FLANK_OUTLINE=freezePoints(source.outer.map(referenceToPlan));
export const FLANK_BORDERS=Object.freeze([freezePoints(source.left.map(referenceToPlan)),freezePoints(source.right.map(referenceToPlan))]);
const [nw,ne,east,se,sw,west]=FLANK_OUTLINE;
const [lt,lb,lj]=FLANK_BORDERS[0], [rt,rb,rj]=FLANK_BORDERS[1];
export const FLANK_POLYGONS=Object.freeze([
 Object.freeze([nw,lt,lb,lj,west]),
 Object.freeze([lt,rt,rb,rj,se,sw,lj,lb]),
 Object.freeze([rt,ne,east,rj,rb])
]);
// Four perimeter fragments: the central district also owns the top segment.
// Shared internal borders are rendered separately, exactly once per divider.
export const FLANK_PERIMETER=Object.freeze([
 {key:'left',points:Object.freeze([lt,nw,west,lj])},
 {key:'center',points:Object.freeze([lj,sw,se,rj])},
 {key:'right',points:Object.freeze([rj,east,ne,rt])},
 {key:'center',points:Object.freeze([rt,lt])}
].map(Object.freeze));
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
