import {mergeSite94Records} from './site94-records.js?v=20261112-site94-94a-photo-v1';
// Owner-requested removal of nine provisional blocks, not of real sites or roads.
// Source registration/transport anchors stay intact; only display records change.
export const REMOVED_MAP_GROUPS=Object.freeze([
 ['sector-east-center','Восточно-центральный сектор'],
 ['sector-west-center','Западно-центральный сектор'],
 ['sector-citynorth','Северная городская инфраструктура'],
 ['sector-north','Северный протяжённый комплекс'],
 ['sector-nw1','Северо-западный сектор — группа А'],
 ['sector-nw2','Северо-западный сектор — группа Б'],
 ['sector-south-east','Юго-восточный сектор'],
 ['sector-south','Южная техническая группа'],
 ['sector-south-junction','Южная транспортная группа']
].map(Object.freeze));
const removedIds=new Set(REMOVED_MAP_GROUPS.map(([id])=>id));
const site91Purpose='Техническая площадка Байконура с заправочно-нейтрализационной станцией (ЗНС). Наземная инфраструктура комплекса обеспечивает подготовку космических аппаратов и разгонных блоков: заправку компонентами ракетного топлива и сжатыми газами, контроль рабочей среды, сбор и нейтрализацию паров и промышленных стоков.';
// Editorial update only. Do not infer a new building, alias, foundation date,
// operating status or road anchor from the historical station description.
export const SITE91_EDITORIAL=Object.freeze({
 titleShort:'ЗНС',
 titleFull:'пл. №91 · Заправочно-нейтрализационная станция',
 purposeShort:'Заправочно-нейтрализационная станция',
 purpose:site91Purpose,
 purposeLong:site91Purpose,
 note:'91 и 91А — отдельно обозначенные площадки заправочной инфраструктуры; их номера не являются взаимозаменяемыми. Заправочная станция 11Г141 в сообщении о её вводе после реконструкции отнесена к площадке 91А.\n\n8–9 ноября 2011 года на 91А выполнили заправку баков высокого давления разгонного блока «Бриз-М» для запуска «Протон / АзиаСат-7». Эта операция завершила ввод реконструированной станции в эксплуатацию. После заправки блок вернули в МИК площадки 92А-50 для дальнейшей подготовки.\n\nЦЭНКИ сообщает о полной реконструкции ЗНС на площадке 91: модернизированы 14 и введены 11 новых технологических систем, в том числе газового контроля, сбора и нейтрализации паров и промышленных стоков, контроля условий в рабочих помещениях. Это сведения о назначении и модернизации комплекса, а не обмерное описание представленного здания.',
 publicReferences:Object.freeze([
  'https://www.russian.space/kosmodromy/kosmodrom-baykonur/',
  'https://portal.baikonuradm.ru/index.php?mod=all%2Fnews&page=963',
  'https://portal.baikonuradm.ru/index.php?mod=npb1&npbid=38',
  'https://sdelanounas.ru/blogs/9320/'
 ]),
 contentReviewedOn:'2026-11-12'
});
export function visibleMapSites(records){
 if(!Array.isArray(records))throw new TypeError('Expected registered site records');
 return mergeSite94Records(records.filter(record=>!removedIds.has(record.id))).map(record=>record.id==='pad-91'
  ?{...record,...SITE91_EDITORIAL,publicReferences:[...SITE91_EDITORIAL.publicReferences]}:record);
}
