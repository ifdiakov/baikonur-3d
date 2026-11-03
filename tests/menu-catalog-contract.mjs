import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {MUSEUM_SECTIONS,MUSEUM_LAUNCH_ENTRIES,MUSEUM_SILO_GROUP,MUSEUM_STORY_GROUPS,isMuseumSilo,museumCatalogueSection} from '../src/museum-menu.js';
import {SILO_SITE_IDS} from '../src/silo-sites.js';
import {MODEL_CATALOG,modelsForObject,modelsForKnowledge} from '../src/model-catalog.js';
import {ROCKET_MODELS} from '../src/rocket-exhibits.js';

const [html,catalogue,field,history,railPoints]=await Promise.all([
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  ...['catalog.json','field-research.json','history.json','osm/rail-points.geojson'].map(file=>readFile(new URL('../data/'+file,import.meta.url),'utf8').then(JSON.parse))
]);
const ids=['sitesAccordion','equipmentAccordion','reconstructionsAccordion','mythsAccordion','traditionsAccordion','graveyardAccordion'];
const titles=['СТАРТОВЫЕ КОМПЛЕКСЫ','РАКЕТЫ И ТЕХНИКА','ЦИФРОВЫЕ РЕКОНСТРУКЦИИ','МИФЫ И ЛЕГЕНДЫ','ТРАДИЦИИ И СУЕВЕРИЯ','КОСМИЧЕСКОЕ КЛАДБИЩЕ'];
assert.deepEqual(MUSEUM_SECTIONS.map(section=>section.id),ids);
assert.deepEqual(MUSEUM_SECTIONS.map(section=>section.title),titles);
const asideStart=html.indexOf('<aside id="ui"'),aside=html.slice(asideStart,html.indexOf('</aside>',asideStart));
assert.deepEqual([...aside.matchAll(/<details id="([^"]+)" class="sites-accordion museum-section">/g)].map(match=>match[1]),ids,'The actual HTML has exactly the six remaining menu sections in order');
assert.deepEqual([...aside.matchAll(/<span class="sites-accordion-title">([^<]+)<\/span>/g)].map(match=>match[1]),titles);
assert.match(aside,/<div class="museum-name">БАЙКОНУР<\/div>/);
assert.match(aside,/<span class="museum-subtitle-label">ИНТЕРАКТИВНЫЙ МУЗЕЙ<\/span><span class="museum-dimension">3D<\/span>/);
assert.doesNotMatch(html,/id="toursAccordion"/,'The removed tours section must not remain hidden in the document');
for(const id of ['museumRightStack','nextLaunchPanel'])assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,'One shared next-launch panel: '+id);
assert.match(aside,/assets\/rockettrip-logo\.svg/,'RocketTrip brand stays in the menu header');
assert.doesNotMatch(aside,/ЦИКЛОГРАММЫ|ПЛОЩАДКИ И ОБЪЕКТЫ/);
const dock=html.slice(html.indexOf('<footer id="timeDock"'),html.indexOf('</footer>'));
assert.match(dock,/id="year"[^>]+type="range"[^>]+min="1955"[^>]+max="2026"/);
assert.match(dock,/id="yearVal"/);assert.doesNotMatch(dock,/timeline-event|СОБЫТИЯ|timelineYearHint/);
for(const id of ['search','graveyardSearch','list','graveyardList'])assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,'One accessible catalogue control: '+id);

const sites=catalogue.sites.filter(record=>!record.aliasOf),groups={sitesAccordion:[],infrastructureAccordion:[]};
for(const record of sites){
  const before=JSON.stringify(record),section=museumCatalogueSection(record);
  assert.ok(Object.hasOwn(groups,section));groups[section].push(record.id);assert.equal(JSON.stringify(record),before,'Grouping does not rewrite the source catalogue');
}
assert.equal(groups.sitesAccordion.length,40);assert.equal(groups.infrastructureAccordion.length,59);
assert.equal(new Set(Object.values(groups).flat()).size,sites.length,'Every existing displayed site belongs to exactly one catalogue section');
assert.equal(catalogue.sites.find(s=>s.id==='pad-250а').aliasOf,'pad-250a','The old Cyrillic ID resolves to the single 250A compound');
const expectedLaunch=['pad-1','pad-31','pad-45','pad-81','pad-200','pad-90','pad-250','pad-110','pad-41'];
const expectedInfrastructure=['pad-5','pad-42','pad-112','pad-112a','pad-251','airfield','pad-23','pad-75','pad-3','pad-254','pad-182','pad-110a','pad-250a','city','pad-130','pad-175','kpp-7'];
assert.deepEqual(MUSEUM_LAUNCH_ENTRIES.map(entry=>entry.id),expectedLaunch,'The nine named launch complexes retain the requested order');
assert.equal(MUSEUM_SILO_GROUP.id,'siloInstallations');assert.equal(MUSEUM_SILO_GROUP.title,'Шахтные установки');
assert.deepEqual(MUSEUM_SILO_GROUP.siteIds,SILO_SITE_IDS,'The grouped menu uses the same silo roster as the existing models');
assert.equal(new Set(MUSEUM_SILO_GROUP.siteIds).size,31,'All 31 silo installations remain individually reachable');
assert.deepEqual(sites.filter(isMuseumSilo).map(record=>record.id).sort(),[...SILO_SITE_IDS].sort());
assert.deepEqual([...groups.sitesAccordion].sort(),[...expectedLaunch,...SILO_SITE_IDS].sort(),'The launch section contains nine named complexes and 31 grouped silos');
for(const id of expectedLaunch)assert.ok(groups.sitesAccordion.includes(id),id+' is a launch / silo / stand-start facility');
for(const id of expectedInfrastructure)assert.ok(groups.infrastructureAccordion.includes(id),id+' is support, technical, transport or accommodation infrastructure');
for(const record of sites.filter(record=>record.id.startsWith('sector-')))assert.ok(groups.infrastructureAccordion.includes(record.id),'An unidentified map sector is not promoted to a launch site');
const stations=railPoints.features.filter(feature=>['station','halt'].includes(feature.properties.tags?.railway));
assert.ok(stations.length>10);
for(const station of stations)assert.equal(museumCatalogueSection({id:'osm-station-'+station.properties.osmId,titleShort:station.properties.name}),'infrastructureAccordion','Source railway stations belong to infrastructure');
assert.equal(field.objects.length,7);assert.equal(new Set(field.objects.map(record=>record.id)).size,7);
assert.match(aside,/<details id="graveyardAccordion"[\s\S]*id="graveyardList"/);
const equipment=MUSEUM_SECTIONS.find(section=>section.id==='equipmentAccordion'),actions=equipment.items.map(item=>item.action);
assert.deepEqual([...actions].sort(),['cyclone-2','proton','n1','r16','mig25','zenit-3sl','r7','energia-polyus','energia-buran','energia','energia-m','tua','mriya','sprinter','silo'].sort(),'Physical exhibits remain in the equipment section while animations move to reconstructions');
const reconstructions=MUSEUM_SECTIONS.find(section=>section.id==='reconstructionsAccordion');
const reconstructionActions=reconstructions.items.map(item=>item.action);
assert.deepEqual([...reconstructionActions].sort(),['soyuz-launch-1','soyuz-launch-31','energia-reconstruction','buran-landing-reconstruction','buran-loading-reconstruction','flight-cycle','train-cycle','silo-cycle','aircraft','train'].sort(),
 'Active launches, landings, loading and transit animations have their own menu');
assert.ok(!reconstructionActions.includes('energia-polyus'),'A rocket exhibit is not an animation');
assert.ok(html.includes("case 'energia-reconstruction':openMenuSite('pad-250');break;"),'UKSS launch is entered through the site card, not a second launch button');
assert.ok(html.includes("case 'buran-landing-reconstruction':openMenuSite('pad-251');break;"));
assert.ok(html.includes("case 'buran-loading-reconstruction':openMenuSite('pad-251');break;"));
assert.equal(new Set([...actions,...reconstructionActions]).size,actions.length+reconstructionActions.length,'Physical exhibits and animated actions have no duplicates');
const groupedStories=Object.values(MUSEUM_STORY_GROUPS).flat();
assert.equal(groupedStories.length,6,'Six themed archival stories remain in visible categories');
assert.equal(new Set(groupedStories).size,6,'Visible archival stories have one unique home');
assert.deepEqual(Object.keys(MUSEUM_STORY_GROUPS),['mythsAccordion','traditionsAccordion','graveyardAccordion']);
assert.equal(MUSEUM_SECTIONS.find(section=>section.id==='heroesAccordion'),undefined);
assert.equal(MUSEUM_SECTIONS.find(section=>section.id==='infrastructureAccordion'),undefined);
assert.doesNotMatch(aside,/id="(?:heroesAccordion|infrastructureAccordion|infrastructureSearch|infrastructureList)"/,'Removed categories and their controls must be absent');
assert.equal(MUSEUM_SECTIONS.find(section=>section.id==='mythsAccordion').items.length,0,'Myths are injected from the reviewed story index');
assert.equal(MODEL_CATALOG.r16.asset,'rockets/r16.glb');assert.equal(MODEL_CATALOG.r16.kind,'rocket');assert(ROCKET_MODELS.r16,'The site exhibit loader accepts the same R-16 as the viewer');
assert.deepEqual(modelsForObject({id:'pad-41'}),['r16']);assert.deepEqual(modelsForKnowledge('r16'),['r16']);
assert(MUSEUM_SECTIONS.find(section=>section.id==='graveyardAccordion').items.some(item=>item.action==='r16-memorial'),'The memorial entry remains separate from the rocket exhibit');
assert.equal(actions[0],'zenit-3sl','The independently added source model is preserved as the first equipment item');
assert.ok(html.includes("case 'zenit-3sl':openMenuSite('pad-45');portalArchive.inspectSite45('rocket',camera,ctl);break;"),'Zenit opens its site card and the universal model inspector');
assert.equal(MUSEUM_SECTIONS.find(section=>section.id==='traditionsAccordion').items.length,0);
assert.equal(reconstructionActions.length,10);
assert.equal(MUSEUM_SECTIONS.find(section=>section.id==='graveyardAccordion').items.length,2);
assert.equal(MUSEUM_SECTIONS.find(section=>section.id==='toursAccordion'),undefined,'The menu data no longer publishes a tours section');

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
console.log('MENU_CATALOG_CONTRACT_PASS',JSON.stringify({sections:ids.length,launchEntries:expectedLaunch.length+1,launchComplexes:groups.sitesAccordion.length,silos:MUSEUM_SILO_GROUP.siteIds.length,infrastructureSites:groups.infrastructureAccordion.length,sourceStations:stations.length,fieldFinds:field.objects.length,equipmentActions:actions.length,reconstructions:reconstructionActions.length,archiveStories:groupedStories.length,historicalRecords:history.events.length,yearCases:calls.length}));
