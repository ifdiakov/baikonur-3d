// Traced from the owner's north-up overview (1092 x 1000 review image).
// Photo ratios are interpretive; the museum's approved site anchor is unchanged.
export const SITE2_VERSION='20261102-site2-photo-v3';
export const SITE2_REFERENCE={folder:'1sxMZCp2P-IHgOY9tg2XggRX15m_HF3sO',panorama:'https://www.360pano.eu/space/baikonur/site2/',
 plan:'1fz73z9HxJ_sLWqgxKqMAsjfBwn9-cCvF',stair:'1MRCsI-e1SQ_LhweR7LmRx0EvmhBpY-EW',starboard:'1YByMODYZarewrEA2ddOftKqXCavLnYKr',facade:'1u1b0yojSBfrGYdkxHcSJBfLPiYxulZDF',photoCount:25,photoDate:'2026-11-02',additionalPhotos:['1541236','1536768','1536716','1536465','1536203','1535874','1535386','1535026','1534772','1534543','1534451','1534049'],dimensionBasis:'photo-ratios-not-surveyed'};
export const site2Point=([x,z])=>[(x-600)*.30,(z-510)*.30];
export const SITE2_ACCESS={scale:.14,elevation:-2.72,yaw:0,road:[-126,.1,-31.5],roadOutward:[-8.4/Math.hypot(8.4,5.7),0,5.7/Math.hypot(8.4,5.7)],roadWidth:6};
export const SITE2_BURAN={position:[34.8,4.55,.6],yaw:Math.atan2(-118,8),forward:'+Z',starboard:'-X',source:'energia-buran.glb',gear:0};
export const SITE2_STAIR={bottom:[-14,.14,7.6],top:[-2.92,5.1,7.6],width:1.75,headroom:2.1,steps:28,side:'starboard'};
export const SITE2_VIEWS={all:{target:[-9,5,14],eye:[-145,195,245]},buran:{target:[35,7,0],eye:[-30,58,-84]},stairs:{target:[33,5,-8],eye:[-5,29,-51]},museum:{target:[24,4,46],eye:[-60,48,19]},top:{target:[-9,0,14],eye:[-9,265,14.01]}};
