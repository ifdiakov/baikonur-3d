// City limits traced from the user's OpenStreetMap screenshot, 2026-11-03.
// The municipal territory is DISTINCT from the much larger cosmodrome and
// from the smaller OSM place=city residential footprint (way/39209179).
// Includes Krayniy airport, the north rail/industrial estate, urban Baikonur
// and the south bank-side boundary on the Syr Darya. Not a legal survey.
// Coordinates were fitted to OSM runway way/37591623 (endpoints) and the
// Tyuratam place node/3653353377 in the supplied map image.
// © OpenStreetMap contributors — https://www.openstreetmap.org/copyright
import {projectOsm} from './osm-geography.js?v=20261103-city-territory-v1';

export const CITY_TERRITORY_COLOR=0x9e78df;
export const CITY_TERRITORY_REFERENCE=Object.freeze({
 version:'owner-baikonur-city-screenshot-20261103-v1',
 source:'Owner-provided Baikonur city/Tyuratam map screenshot, 2026-11-03',
 mapSource:'OpenStreetMap',
 screenshotSize:[2048,1103],
 normalizedImageSize:[1663,896],
 registration:'Approximate local image-to-WGS84 alignment via Krayniy runway 05/23 and Tyuratam',
 referenceRunway:'https://www.openstreetmap.org/way/37591623',
 referenceTown:'https://www.openstreetmap.org/node/3653353377',
 coverage:'City and Krayniy airfield, south to Syr Darya; does not include Akai or Tyuratam proper',
 status:'cartographic reconstruction, not a surveyed cadastral boundary'
});
// Screen-coordinate contour, stored so the owner's reference can be inspected
// independently of render scale, projection or museum layout.
export const CITY_TERRITORY_IMAGE_POINTS=Object.freeze([
 [159,606],
 [161,589],
 [181,550],
 [240,506],
 [239,400],
 [289,400],
 [289,472],
 [400,393],
 [558,297],
 [581,332],
 [586,356],
 [611,382],
 [667,404],
 [687,397],
 [807,317],
 [835,328],
 [853,324],
 [868,305],
 [875,252],
 [897,209],
 [931,207],
 [943,191],
 [962,192],
 [978,181],
 [991,159],
 [1070,163],
 [1078,214],
 [1268,164],
 [1269,201],
 [1328,210],
 [1326,244],
 [1340,285],
 [1372,291],
 [1354,319],
 [1345,346],
 [1339,401],
 [1339,467],
 [1320,539],
 [1262,620],
 [1218,649],
 [1190,659],
 [1123,665],
 [1055,654],
 [1032,660],
 [1012,668],
 [997,701],
 [983,718],
 [911,744],
 [875,748],
 [755,729],
 [699,706],
 [637,695],
 [608,683],
 [597,676],
 [582,610],
 [573,596],
 [561,584],
 [519,568],
 [485,545],
 [469,540],
 [384,553],
 [340,565],
 [301,583],
 [260,590],
 [226,590],
 [194,596],
 [165,608]
].map(p=>Object.freeze(p)));
export function cityImageToLonLat([x,y]){
 return [63.1941252+(x-265)/7800,45.6143654+(535-y)/11100];
}
export const CITY_TERRITORY_LONLAT=Object.freeze(CITY_TERRITORY_IMAGE_POINTS.map(p=>Object.freeze(cityImageToLonLat(p))));
export const CITY_TERRITORY_OUTLINE=Object.freeze(CITY_TERRITORY_LONLAT.map(p=>Object.freeze(projectOsm(p))));
