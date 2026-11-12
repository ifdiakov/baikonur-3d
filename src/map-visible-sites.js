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
export function visibleMapSites(records){
 if(!Array.isArray(records))throw new TypeError('Expected registered site records');
 return mergeSite94Records(records.filter(record=>!removedIds.has(record.id)));
}
