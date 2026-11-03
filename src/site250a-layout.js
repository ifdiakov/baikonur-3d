// Plan registration follows the owner's overhead image. The image has no scale
// bar: dimensions/heights are a museum reconstruction, not a measured survey.
export const SITE250A_VERSION='20261103-site250a-photo-v1';
export const SITE250A_YAW=-Math.atan2(.6,.8);
export const SITE250A_REFERENCE={
 folder:'1VR-1c2uUQAI2rdH_Sn8g7gyq_GKeeVHr',
 satellite:'1gX5-lh5ewnw2uvpft_PmiJROyjN36b4J',
 sitePlan:'1U9cGf3p8_XMFvRhxT8860-GxK65TWUxT',
 bunker:'1yltRCa2AREtHICEefzvfVHJr8MMnVfm6',
 entrance:'1GNyPUfXZdno9SZeprpPr1SekchqdZuyd',
 facade:'1KhaDijnDl37s3NAlkv8tivdoJoT_UiVA',
 registration:'owner-anchor-preserved; satellite-relative-plan; approximate-metre-scale',
 date:'2026-11-03'
};
export function site250aPixel([u,v]){
 const x=u-900,z=v-700;return [(.8*x+.6*z)*.22,(-.6*x+.8*z)*.22];
}
export const SITE250A_ACCESS={scale:.14,elevation:-2.72,yaw:SITE250A_YAW,
 road:[165,.12,-16],roadOutward:[1,0,0],roadWidth:6};
export const SITE250A_BUNKER={x:49,z:10,width:43,depth:65,height:9.5,topInset:10};
export const SITE250A_ROADS=[
 [[-133,-6],[-127,-18],[-6,-18],[92,-18],[120,-16],[165,-16]],
 [[-127,-18],[-127,87],[-112,98],[28,98],[82,98],[88,86],[88,-18]],
 [[-48,-18],[-48,77],[81,77]],
 [[-48,77],[-48,151],[27,151],[27,98]],
 [[8,-18],[8,77]],
 [[-6,-18],[-6,-115],[-16,-126],[-69,-126],[-69,-40]],
 [[88,77],[150,77],[150,8],[120,8],[120,-16]]
];
export const SITE250A_VIEWS={
 all:{target:[5,3,10],eye:[260,260,300]},
 bunker:{target:[43,5,12],eye:[-46,70,110]},
 entrance:{target:[20,4,22],eye:[-47,37,78]},
 cryo:{target:[-27,4,-50],eye:[-125,116,40]},
 top:{target:[5,0,10],eye:[5,380,10.01]}
};
