// Owner photographs and the supplied overhead view, 31 October 2026.
// Building details use metres; distances within the compact exhibit are
// interpreted from the image and are not a geodetic survey.
export const SITE41_VERSION='site41-photo-plan-v2';
export const SITE41_DISPLAY_SHIFT_MAP=30;
export const SITE41_ACCESS_AXIS=Object.freeze([-.1378443602811132,-.9904539021775273]);
export const SITE41_DISPLAY_OFFSET=Object.freeze(SITE41_ACCESS_AXIS.map(v=>v*SITE41_DISPLAY_SHIFT_MAP));
export const SITE41_ACCESS=Object.freeze({
 scale:.14,yaw:0,elevation:-2.72,
 road:Object.freeze([-13,.12,221]),roadOutward:Object.freeze([.04,0,1]),roadWidthMetres:6,
 sourceWayId:'172837000',sourceAxisNodes:Object.freeze(['1836853647','1836853974']),
 sourceCompoundId:'169401013',displayShiftMap:SITE41_DISPLAY_SHIFT_MAP,
 modelBoundsMetres:Object.freeze([-205,255,-270,225])
});
export const SITE41_REFERENCE=Object.freeze({
 folder:'1D1u03D5QlkxHJRsHtvsuAPzV1yEhiVId',
 satellite:'1zGG6SWGEht9G7_PzKEl1qqRxX2cwdNY8',satelliteDate:'2026-10-31',
 photographs:Object.freeze(['DSC_7587.JPG','DSC_7588.JPG','DSC_7593.JPG','DSC_7595.JPG','DSC_7598.JPG','DSC_7602.JPG','DSC_7605.JPG']),
 sourceCompound:'https://www.openstreetmap.org/way/169401013',
 sourceMemorial:'https://www.openstreetmap.org/node/12191875275',
 history:'https://vks.spb.ru/pamyatnye-daty/31-katastrofy-na-kosmodrome-baykonur.html',
 memorial:'https://portal.baikonuradm.ru/index.php?ID=10106&mod=all/news&page=94',
 frame:Object.freeze({origin:Object.freeze([1225,595]),metresPerPixel:.52}),
 confidence:'satellite-plan-and-owner-ground-photographs',surveyed:false
});
export const site41ImagePoint=([x,z])=>[(x-1225)*.52,(z-595)*.52];
export const SITE41_VIEWS=Object.freeze({
 all:{target:[20,0,-35],eye:[450,510,530]},
 top:{target:[20,0,-25],eye:[20,640,-24.99]},
 memorial:{target:[-160,1.6,-128],eye:[-132,28,-85]},
 command:{target:[-138,1.7,-100],eye:[-111,27,-66]},
 ruins:{target:[115,2.5,-123],eye:[165,44,-60]},
 access:{target:[-13,0,195],eye:[105,130,350]}
});
