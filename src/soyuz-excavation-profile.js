// One photographic plan serves the existing Gagarin excavation and the
// owner's requested Gagarin-style reconstruction at Site 31. Metres below
// already include the old drawing's uniform 0.5 conversion.
export const GAGARIN_DUCT_ORIGIN=Object.freeze([674,546]);
export const GAGARIN_DUCT_PLAN=Object.freeze([
 [750,267,810,455,580,.35],[780,271,813,447,590,.40],
 [825,278,814,442,600,.55],[880,290,806,445,606,.80],
 [950,313,783,461,609,1.40],[1030,346,750,482,604,2.60],
 [1110,379,714,503,593,4.40],[1190,410,677,515,582,7.10],
 [1260,435,650,518,578,10.10],[1340,466,623,516,579,13.80],
 [1405,487,608,506,581,16.60],[1435,505,593,507,581,18.00]
].map(Object.freeze));
export const GAGARIN_SHOULDERS=Object.freeze([
 {rim:[[620,487],[619,355],[665,328],[715,310],[750,267]],inner:[750,455]},
 {rim:[[612,616],[613,711],[632,765],[686,796],[750,810]],inner:[750,580]}
]);
const north=[[620,487],[619,355],[665,328],[715,310],...GAGARIN_DUCT_PLAN.map(p=>[p[0],p[1]]),[1450,508]];
const south=[[1450,581],...GAGARIN_DUCT_PLAN.slice().reverse().map(p=>[p[0],p[2]]),[686,796],[632,765],[613,711],[612,616]];
export const gagarinPlanPoint=([u,v])=>[(v-546)*.25,-(u-674)*.25];
export const GAGARIN_RIM_METRES=Object.freeze([...north,...south].map(p=>Object.freeze(gagarinPlanPoint(p))));

// Parallel offsets with bounded mitres retain the original bank contour. The
// outer concrete collar covers the terrain cut, with a real vertical fascia.
export function offsetExcavationPolygon(polygon,distance){
 const area=polygon.reduce((a,p,i)=>{const q=polygon[(i+1)%polygon.length];return a+p[0]*q[1]-q[0]*p[1];},0),sign=Math.sign(area);
 return polygon.map((p,i)=>{
  const a=polygon[(i+polygon.length-1)%polygon.length],b=polygon[(i+1)%polygon.length];
  const edge=(u,v)=>{const dx=v[0]-u[0],dz=v[1]-u[1],l=Math.hypot(dx,dz);return [sign*dz/l,-sign*dx/l];};
  const n=edge(a,p),m=edge(p,b),length=Math.hypot(n[0]+m[0],n[1]+m[1]);
  const bis=length>1e-8?[(n[0]+m[0])/length,(n[1]+m[1])/length]:n;
  const reach=Math.min(distance*2,distance/Math.max(.1,bis[0]*m[0]+bis[1]*m[1]));
  return [p[0]+bis[0]*reach,p[1]+bis[1]*reach];
 });
}
export const excavationCutout=polygon=>({polygon:offsetExcavationPolygon(polygon,.65),shape:'polygon',rimY:0,collarWidth:1.2});
