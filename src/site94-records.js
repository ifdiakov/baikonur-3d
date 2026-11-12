export const SITE94_VERSION='20261112-site94-94a-photo-v1';
export const SITE94_REFERENCES=Object.freeze({folder:'1BZCNhNKzwzju79xkCylUjpQmqHyjMcow',photos:['11IIV5uiSZJ9A6fMpUPRCPgE4jQQIlyAR','1tWZpEvnv0r0OQ_XzaAQZSotg2U37uPsu'],surveyed:false});
export const SITE94_SOURCE_CENTRES=Object.freeze({'pad-94':[62.8609924,46.0698491],'pad-94а':[62.8596474,46.0594117]});
export function canonicalSite94(id){return /^pad-94[aа]$/iu.test(id)?'pad-94':id;}
// Merge display records only. Never move transport anchors or rewrite the source catalogue.
export function mergeSite94Records(records){
 const north=records.find(r=>r.id==='pad-94'),south=records.find(r=>canonicalSite94(r.id)==='pad-94'&&r.id!=='pad-94');
 if(!north||!south)return records;
 const title='Площадки № 94 / 94А';
 const merged={...north,name:title,titleShort:'94 / 94А',titleFull:title,purposeShort:'Единый технический комплекс',purpose:'Единый технический комплекс',purposeLong:'Площадки 94 и 94А представлены одним музейным объектом.',
  note:'Площадки 94 и 94А объединены в одной карточке по указанию владельца макета. Обе территории сохранены на прежних местах. Фасады и характерные детали воссозданы по двум фотографиям из папки «пл. №94, 94А»; размеры, размещение отдельных корпусов и распределение фотосюжетов между территориями — музейная интерпретация, не обмерная реконструкция.',
  mergedMembers:[north,south].map(r=>({id:r.id,name:r.name,x:r.x,y:r.y,note:r.note})),mergedAliases:['pad-94а','pad-94a','pad-94А','pad-94A'],modelVersion:SITE94_VERSION};
 return records.filter(r=>r===north||canonicalSite94(r.id)!=='pad-94').map(r=>r===north?merged:r);
}
