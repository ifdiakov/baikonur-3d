// Site 254: owner's north-up overview and two exterior photographs, 3 Nov 2026.
// Main-hall dimensions are published in Novosti Kosmonavtiki 2/2005, p.60.
// Annexes, heights and compound registration are photo estimates, not a survey.
export const SITE254_VERSION='20261103-site254-se3';
export const SITE254_YAW=-Math.atan2(382,366);
export const SITE254_REFERENCE={folder:'1eXL7OGtY16sjzfgDk7Hrnb7-h5w1uQdo',
 satellite:'1eItBQplxA8O97mpOO_Bw_ZAU2sXT8rUe',photos:['1GYsVgqhDf94AJCjfEjqli7zac93lPIxQ','1xkmNVoP4hqST-vfuXE0BNDGA2_Emr6So'],
 dimensions:'https://epizodyspace.ru/bibl/nk/2005/2/nk2005-02.pdf',page:60,
 registration:'photo-estimate-within-existing-OSM-compound',date:'2026-11-03'};
// +Z runs southwest along the hall; +X is the southeast transport side.
// Keep the existing compound centroid; the hall is southwest of that centroid.
// Geographic distance is compressed separately from the enlarged exhibits.
export const SITE254_OFFSET_Z=-123;
export const SITE254_HALL={center:[0,18.5,73],size:[121,37,225]};
// The model relocation covers the former terminal spur; join its parent line.
export const SITE254_RAIL={sourceBranchWayId:'172571383',door:[60.5,.55,104],end:[110,.55,104],outward:[1,0,0],gauge:1.52};
export const SITE254_ACCESS={scale:.14,elevation:-2.72,yaw:SITE254_YAW,
 road:[-155,.12,37],roadOutward:[-1,0,0],roadWidth:7,
 railConnections:[{id:'site254-transport-gate',position:SITE254_RAIL.end,outward:SITE254_RAIL.outward,sourceWayId:'172571298',sourceTarget:[145,.55,80]}],physicalRailGauge:1.52};
export const SITE254_MASK={center:[-30,0,73],halfX:105,minZ:-142,maxZ:132};
export const SITE254_VIEWS={
 all:{target:[-20,10,73],eye:[-280,235,367]},
 entrance:{target:[-78,12,147],eye:[-214,115,254]},
 roof:{target:[0,25,70],eye:[180,230,227]},
 rail:{target:[68,12,104],eye:[202,120,222]},
 top:{target:[-25,0,72],eye:[-25,430,72.01]}
};
