import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {MUSEUM_SECTIONS,museumCatalogueSection} from '../src/museum-menu.js';

const [html,catalogue,field,history,railPoints]=await Promise.all([
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  ...['catalog.json','field-research.json','history.json','osm/rail-points.geojson'].map(file=>readFile(new URL('../data/'+file,import.meta.url),'utf8').then(JSON.parse))
]);
const ids=['sitesAccordion','equipmentAccordion','infrastructureAccordion','mythsAccordion','graveyardAccordion','toursAccordion'];
const titles=['СТАРТОВЫЕ КОМПЛЕКСЫ','РАКЕТЫ И ТЕХНИКА','ИНФРАСТРУКТУРА','МИФЫ И ЛЕГЕНДЫ','КОСМИЧЕСКОЕ КЛАДБИЩЕ','ПУСКОВЫЕ ТУРЫ'];
assert.deepEqual(MUSEUM_SECTIONS.map(section=>section.id),ids);
assert.deepEqual(MUSEUM_SECTIONS.map(section=>section.title),titles);
const aside=html.slice(html.indexOf('<aside id="ui"'),html.indexOf('</aside>'));
assert.deepEqual([...aside.matchAll(/<details id="([^"]+)" class="sites-accordion museum-section">/g)].map(match=>match[1]),ids,'The actual HTML has exactly the six requested sections in order');
assert.deepEqual([...aside.matchAll(/<span class="sites-accordion-title">([^<]+)<\/span>/g)].map(match=>match[1]),titles);
assert.match(aside,/<div class="museum-name">Байконур<\/div>/);
assert.match(aside,/<div class="museum-subtitle">интерактивный музей 3d<\/div>/);
assert.doesNotMatch(aside,/rockettrip-logo|RocketTrip|ЦИКЛОГРАММЫ|ПЛОЩАДКИ И ОБЪЕКТЫ/);
const dock=html.slice(html.indexOf('<footer id="timeDock"'),html.indexOf('</footer>'));
assert.match(dock,/id="year"[^>]+type="range"[^>]+min="1955"[^>]+max="2026"/);
assert.match(dock,/id="yearVal"/);assert.doesNotMatch(dock,/timeline-event|СОБЫТИЯ|timelineYearHint/);
for(const id of ['search','infrastructureSearch','graveyardSearch','list','infrastructureList','graveyardList'])assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,'One accessible catalogue control: '+id);

const sites=catalogue.sites.filter(record=>!record.aliasOf),groups={sitesAccordion:[],infrastructureAccordion:[]};
for(const record of sites){
  const before=JSON.stringify(record),section=museumCatalogueSection(record);
  assert.ok(Object.hasOwn(groups,section));groups[section].push(record.id);assert.equal(JSON.stringify(record),before,'Grouping does not rewrite the source catalogue');
}
assert.equal(groups.sitesAccordion.length,42);assert.equal(groups.infrastructureAccordion.length,56);
assert.equal(new Set(Object.values(groups).flat()).size,sites.length,'Every existing displayed site belongs to exactly one catalogue section');
const expectedLaunch=['pad-1','pad-31','pad-41','pad-45','pad-70','pad-81','pad-90','pad-109','pad-110','pad-130','pad-131','pad-175','pad-200','pad-250'];
const expectedInfrastructure=['pad-5','pad-42','pad-112','pad-112a','pad-251','airfield','pad-23','pad-75','pad-3','pad-254','pad-182','pad-110a','pad-250а','city'];
for(const id of expectedLaunch)assert.ok(groups.sitesAccordion.includes(id),id+' is a launch / silo / stand-start facility');
for(const id of expectedInfrastructure)assert.ok(groups.infrastructureAccordion.includes(id),id+' is support, technical, transport or accommodation infrastructure');
for(const record of sites.filter(record=>record.id.startsWith('sector-')))assert.ok(groups.infrastructureAccordion.includes(record.id),'An unidentified map sector is not promoted to a launch site');
const stations=railPoints.features.filter(feature=>['station','halt'].includes(feature.properties.tags?.railway));
assert.ok(stations.length>10);
for(const station of stations)assert.equal(museumCatalogueSection({id:'osm-station-'+station.properties.osmId,titleShort:station.properties.name}),'infrastructureAccordion','Source railway stations belong to infrastructure');
assert.equal(field.objects.length,7);assert.equal(new Set(field.objects.map(record=>record.id)).size,7);
assert.match(aside,/<details id="graveyardAccordion"[\s\S]*id="graveyardList"/);
const equipment=MUSEUM_SECTIONS.find(section=>section.id==='equipmentAccordion'),actions=equipment.items.map(item=>item.action);
assert.deepEqual([...actions].sort(),['proton','n1','mig25','zenit-3sl','r7','energia-polyus','energia-buran','energia','energia-m','tua','mriya','aircraft','train','silo','flight-cycle','train-cycle','silo-cycle'].sort(),'All original exhibits and three animations remain available');
assert.equal(actions[0],'zenit-3sl','The independently added source model is preserved as the first equipment item');
assert.ok(html.includes("case 'zenit-3sl':openMenuSite('pad-45');portalArchive.inspectSite45('rocket',camera,ctl);break;"),'Zenit opens its site card and the universal model inspector');
const tours=MUSEUM_SECTIONS.find(section=>section.id==='toursAccordion');assert.deepEqual(tours.items,[]);assert.equal(tours.empty,'Программы пусковых туров в музее не опубликованы.');

// Run the actual extracted year setter, not a duplicate of its logic. Removing
// the event DOM must not leave null accesses or change historical visibility.
const yearStart=html.indexOf('function setMuseumYear(year)'),yearEnd=html.indexOf('\nsetMuseumYear(2026);',yearStart);
assert.ok(yearStart>0&&yearEnd>yearStart);
const elements={year:{value:'2026'},yearVal:{textContent:'2026'}},objects=[1955,1967,1988,undefined].map(from=>({from,g:{visible:true}}));
const calls=[],context={document:{getElementById:id=>elements[id]},objects,mik112Exhibit:{setYear:year=>calls.push(year)},mik112Rail:{group:{visible:true}},camera:{updateMatrixWorld(){}},updateLabels(){}};
vm.createContext(context);vm.runInContext(html.slice(yearStart,yearEnd),context);
for(const input of [1900,1955,1966,1967,1988,2026,2100]){
  context.setMuseumYear(input);const year=Math.max(1955,Math.min(2026,input));
  assert.equal(elements.year.value,String(year));assert.equal(elements.yearVal.textContent,String(year));assert.equal(calls.at(-1),year);
  assert.equal(context.mik112Rail.group.visible,year>=1967);
  objects.forEach(object=>assert.equal(object.g.visible,object.from===undefined||year>=object.from));
}
assert.equal(history.events.length,18,'Original historical records remain intact');
assert.ok(history.events.every(event=>/^\d{4}-\d{2}-\d{2}$/.test(event.date)&&event.source?.startsWith('https://')));
console.log('MENU_CATALOG_CONTRACT_PASS',JSON.stringify({sections:ids.length,launchComplexes:groups.sitesAccordion.length,infrastructureSites:groups.infrastructureAccordion.length,sourceStations:stations.length,fieldFinds:field.objects.length,equipmentActions:actions.length,historicalRecords:history.events.length,yearCases:calls.length}));
