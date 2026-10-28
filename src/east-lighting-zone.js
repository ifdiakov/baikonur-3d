// Owner-requested unlit continuation of the eastern road beyond Site 42.
// This is a museum lighting choice, not a claim about electrical infrastructure.
export function createEastLightingZone({facilities,project}){
 const site=facilities.features.find(f=>f.id==='way/454782178');
 if(!site||site.geometry.type!=='Polygon')throw Error('Site 42 boundary is required for the lighting cutoff');
 const ring=site.geometry.coordinates[0];
 const north=Math.max(...ring.map(p=>p[1]));
 const west=Math.min(...ring.map(p=>p[0]))-.015;
 const [x,z]=project(west,north);
 return {isPowered:(worldX,worldZ)=>!(worldX>=x&&worldZ<z),
  stats:()=>({version:'after-site42-east-branch-v1',source:'way/454782178',northLatitude:north,westLongitude:west,worldBoundary:{x,z}})};
}
