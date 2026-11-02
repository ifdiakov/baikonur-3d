/** A topology reference, not a measured map. Geographic track geometry stays
 * attached to the archived OSM source nodes; the supplied drawing determines
 * which station connections and industrial yards must remain visible. */
export const RAIL_SCHEME_REFERENCE=Object.freeze({
 title:'Схема подъездного пути космодрома Байконур',
 url:'https://drive.google.com/file/d/1gONZXQYrHThNCu7M8wwifIM05SIdF7_6/view',
 fileName:'Схема_подъездного_пути_космодрома_Байконур-2.png',
 sha256:'78cd7e691cc97d7719e32cdad33279855eb34628661d49f66ab1145d44303c04',
 interpretation:'Black railway lines and named yards; red road lines are excluded. The drawing is not to scale.'
});

export const RAIL_SCHEME_LINKS=Object.freeze([
 ['gorodskaya-tyuratam','Городская','Торетам','1833283984','271091726'],
 ['tyuratam-bp3','Торетам','БП 3 км','271091726','1833284245'],
 ['bp3-napornaya','БП 3 км','Напорная','1833284245','1834605419'],
 ['napornaya-razezd','Напорная','Разъезд','1834605419','1833640133'],
 ['razezd-severnaya','Разъезд','Северная','1833640133','1833468317'],
 ['razezd-tomskaya','Разъезд','Томская','1833640133','439812257'],
 ['tomskaya-minskaya','Томская','Минская','439812257','2620204313'],
 ['minskaya-donskaya','Минская','Донская','2620204313','439816425'],
 ['minskaya-vostochnaya','Минская','Восточная','2620204313','1836852861'],
 ['razezd-bratskaya','Разъезд','Братская','1833640133','1834606298'],
 ['bratskaya-gornaya','Братская','Горная','1834606298','1834612703'],
 ['gornaya-almaznaya','Горная','Алмазная','1834612703','1834614111'],
 ['almaznaya-zhiguli','Алмазная','Жигули','1834614111','1834614729'],
 ['zhiguli-zapadnaya','Жигули','Западная','1834614729','1834615520'],
 ['zhiguli-ivanovskaya','Жигули','Ивановская','1834614729','1834615317'],
 ['ivanovskaya-yasnaya','Ивановская','Ясная','1834615317','1834617701'],
 ['zapadnaya-yasnaya','Западная','Ясная','1834615520','1834617701'],
 ['gornaya-yubileinaya','Горная','Юбилейная','1834612703','2486834188'],
 ['bratskaya-peschanaya','Братская','Песчаная','1834606298','1835823607'],
 ['peschanaya-severnaya','Песчаная','Северная','1835823607','1833468317']
].map(([id,fromName,toName,from,to])=>Object.freeze({id,fromName,toName,from,to})));

export const RAIL_SCHEME_STATIONS=Object.freeze([
 {id:'scheme-station-kosmotrans',name:'Космотранс',purpose:'Железнодорожный парк',sourceNodeId:'1833639773',coordinates:[63.3222126,45.8329122],
  sourceWayIds:['172458466','1274581180'],positionBasis:'Схема: парк Космотранс / ЛВД перед Разъездом; привязка к входу существующего двенадцатипутного парка'},
 {id:'scheme-station-kuban',name:'Кубань',purpose:'Железнодорожная станция',sourceNodeId:'439824809',coordinates:[63.5889088,45.9931708],
  sourceWayIds:['37549732'],positionBasis:'Схема: ответвление Кубань у Донской; привязка к существующему тупиковому пути'},
 {id:'scheme-station-predobektnaya',name:'Предобъектная',purpose:'Железнодорожная станция',sourceNodeId:'1834615531',coordinates:[63.1993085,46.050037],
  sourceWayIds:['172571320','676662220'],positionBasis:'Схема: предаэродромный парк на ветви Горная — Юбилейная; приблизительная привязка к западной горловине существующих путей'},
 {id:'scheme-station-bp9',name:'БП 9 км',purpose:'Железнодорожный блокпост',sourceNodeId:'1834612445',coordinates:[63.3062673,45.9478166],
  sourceWayIds:['37546649','172571402'],positionBasis:'Схема: разветвление перед площадками 112, 110 и 250; приблизительная привязка к существующей горловине'}
].map(row=>Object.freeze({...row,confidence:'scheme-derived-approximate',coordinates:Object.freeze(row.coordinates),sourceWayIds:Object.freeze(row.sourceWayIds)})));
export const RAIL_SCHEME_YARDS=Object.freeze([
 {id:"napornaya-industrial-parks",name:"Напорная · промышленные парки",sourceWayIds:["37543654","37545138","172441882","172441884","172441885","172514372","172571064","172571184","172571200","172571203","172571208","172571209","172571317"]},
 {id:"razezd-sidings",name:"Разъезд · служебные пути",sourceWayIds:["172458481"]},
 {id:"severnaya-south-access",name:"Южные подъезды между Братской и Северной",sourceWayIds:["37548027","172571259","172571280","172571368"]},
 {id:"tomskaya-spur",name:"Томская · боковой подъезд",sourceWayIds:["37549117"]},
 {id:"west-92-parallel-park",name:"Западный параллельный парк у площадки 92",sourceWayIds:["172571053","172571098","172571099","172571122","172571167","172571244","172571281","172571333","172571341","172571342","172571369","172571398"]},
 {id:"gornaya-site75",name:"Горная · служебный парк площадки 75",sourceWayIds:["172571065","172571221","172571270","172571307"]},
 {id:"yubileinaya-251",name:"Юбилейная · подъезды площадки 251",sourceWayIds:["172571069","241008030"]},
 {id:"site200-local-spurs",name:"Площадка 200 · местные тупики",sourceWayIds:["172571282","172571292","172571356"]},
 {id:"peschanaya-west-park",name:"Песчаная · западный парк",sourceWayIds:["172704343","172704344","172704345","172704346","172704351","172704368","172704376","172704378","172704381"]},
 {id:"site114b-approach",name:"Подъезд площадки 114Б",sourceWayIds:["172704363","172704366"]},
 {id:"east-42-industrial-spurs",name:"Восточная · промышленные подъезды в направлении 42",sourceWayIds:["172836870","676659155","676659156","676659157","676659158","676659159"]},
 {id:"kosmotrans",name:"Космотранс · парк по пользовательской схеме",sourceWayIds:["172458466","1274581180","172458470","172458471","172458472","172458473","172458474","172458475","172458476","172458477","172458478","172458479","172458480","172458482"]},
 {id:"kuban",name:"Кубань · ответвление от Донской",sourceWayIds:["37549732"]},
 {id:"site81-access",name:"Площадка 81 · подъезд из Ясной",sourceWayIds:["172571302","172571230","172571373","172571357"]},
 {id:"site200-access",name:"Площадка 200 · подъезд из Ивановской",sourceWayIds:["172571230","172571292","172571242"]},
 {id:"site92-access",name:"Площадка 92 · подъезд из Западной",sourceWayIds:["172571343","172571380","172458468","172571290"]},
 {id:"predobektnaya-legacy",name:"Исторические пути предаэродромного парка",sourceWayIds:["676662219","676662220"],includeAbandoned:true},
 {id:"northwest-legacy",name:"Северо-западные исторические тупики · номер не установлен",sourceWayIds:["514299107","514299108","514299109"],includeAbandoned:true},
].map(row=>Object.freeze({...row,sourceWayIds:Object.freeze(row.sourceWayIds)})));

export function createRailSchemePlan(graph){
 const protectedEdges=new Set(),connections=RAIL_SCHEME_LINKS.map(link=>{
  const from=graph.nodes.get(link.from),to=graph.nodes.get(link.to);
  if(!from||!to)throw new Error('Railway scheme source anchor is missing: '+link.id);
  const route=graph.route(from,to);
  for(const edge of route.edges)protectedEdges.add(edge);
  return {...link,nodeIds:route.nodes.map(node=>node.id),sourceWayIds:[...new Set(route.edges.map(edge=>edge.wayId))],edges:route.edges};
 });
 const protectedWays=new Set([...RAIL_SCHEME_YARDS.flatMap(yard=>yard.sourceWayIds),...RAIL_SCHEME_STATIONS.flatMap(station=>station.sourceWayIds)]);
 const historicalWays=new Set(RAIL_SCHEME_YARDS.filter(yard=>yard.includeAbandoned).flatMap(yard=>yard.sourceWayIds));
 for(const edge of graph.edges)if(protectedWays.has(edge.wayId)&&(!edge.abandoned||historicalWays.has(edge.wayId)))protectedEdges.add(edge);
 const stations=RAIL_SCHEME_STATIONS.map(station=>{
  const node=graph.nodes.get(station.sourceNodeId);
  if(!node)throw new Error('Railway scheme station anchor is missing: '+station.id);
  return {...station,coordinates:[...node.coord],position:node.position.clone()};
 });
 return {protectedEdges,stations,connections,stats:{version:'baikonur-rail-scheme-v1',reference:RAIL_SCHEME_REFERENCE,
  sourceTopologyPreserved:true,connectionCount:connections.length,
  connections:connections.map(({edges,...row})=>row),
  yards:RAIL_SCHEME_YARDS,protectedEdges:protectedEdges.size,protectedWayIds:[...new Set([...protectedEdges].map(edge=>edge.wayId))],
  stations:stations.map(({position,...row})=>row)}};
}
