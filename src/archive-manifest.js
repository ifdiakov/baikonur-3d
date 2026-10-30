import {SILO_SITE_IDS} from './silo-sites.js?v=20261029-all-silos-v2';
import {SITE31_YAW,SITE31_REFERENCE} from './site31-trench-profile.js?v=20261028-museum4-osm-live-v2';
// Scope is ONLY the confirmed owner folder, never the whole Google Drive.
export const PORTAL_ROOT={id:'1icCqS39u4lNhiC6phSECwj_qMVX5dCci',name:'_для портала Байконур',satelliteFolder:'13945qa4Yp9IOGmxexgLAMyW9-Ez6VIuc'};
export const ARCHIVE_VERSION='1.0-portal-photo-pass';
export const ARCHIVE_MAP=[
 {id:'pad-75',kind:'seven-winds',title:'Гостиница «7 ветров»',scale:.28,yaw:0,folder:'1P7P9qFCcGwdm4-FG0s_WsdAcrHIfByRf',orientation:'schematic-access-axis-photo-interpreted',modelVersion:'seven-winds-photo-v1'},
 ...SILO_SITE_IDS.map(id=>({id,kind:'silo',title:'Шахтная пусковая установка · пл.'+id.slice(4),scale:.28,yaw:0,orientation:'shared-museum-interpretation',references:['https://rvsn.ruzhany.info/kbu_002_03_2.html','https://habr.com/ru/articles/87341/'],modelVersion:'museum-silos-v2'})),
 {id:'pad-81',kind:'proton',title:'Два старта «Протона» · пл.81',scale:.20,yaw:0,satellite:'1vcxpuL94AAEsfmwW0hDPCc5vQH0qIcdZ',folder:'199muXRaZ0iCvWuHWVvLoEypkrDeJGfrd',orientation:'image-traced',reviewImage:[1300,1000]},
 {id:'pad-200',kind:'proton',title:'Два старта «Протона» · пл.200',scale:.20,yaw:0,satellite:'1txB3LDU8wx-fP_hJngeWH3nIGvNlE0Zb',folder:'199muXRaZ0iCvWuHWVvLoEypkrDeJGfrd',orientation:'image-traced',reviewImage:[1300,1000]},
 {id:'pad-92',kind:'proton-halls',title:'МИК «Протон» · пл.92',scale:.14,yaw:0,satellite:'1eVJZ3hWXMuNqe-zMPDXJzRMUUfNS5KQs',orientation:'image-traced',reviewImage:[1300,1000]},
 {id:'pad-95',kind:'settlement',title:'Городок · пл.95',scale:.14,yaw:0,satellite:'1kYur_BaNa6xrjT-iuhdipTElHMJPsTNR',orientation:'image-traced',reviewImage:[1400,1000]},
 {id:'pad-110',kind:'energia',title:'Два старта «Энергии» · пл.110',scale:.33,yaw:0,satellite:'1eYjF4gq89TBHBkKu_1r8VZt9xRU5EI8F',folder:'1G7BvhrGYZrnXHjuHsDiGsnVBxi7jrnn7',orientation:'image-traced',reviewImage:[1125,1000]},
 {id:'pad-251',kind:'yubileiny',title:'Аэродром Юбилейный',scale:.28,yaw:1.948,satellite:'19t1sFdi7uFk5tAe7gQ5AAYEUjvyTnHIE',folder:'15WuQR5kx9kWrsKp-DORaRxWapXQolNPl',orientation:'image-traced',axis:'WSW-ENE'},
 {id:'pad-31',kind:'soyuz',title:'Стартовый комплекс «Союз» · пл.31/6',scale:.28,yaw:SITE31_YAW,folder:'17i2Dk4D9D5tjRDXTI1tmO15UzhlqTWII',orientation:'satellite-traced-local-plan',satelliteReference:SITE31_REFERENCE,photo:'1zSC1DyLBfQotgBUz5G8gKS1yrfcly4LO',modelVersion:'site31-satellite-trench-v3'},
 {id:'pad-45',kind:'zenit',title:'СК «Зенит» / «Байтерек» · пл.45',scale:.28,yaw:0,folder:'1UD2cFm-qIJjWK6CcjF7V7zGnjVpS5H3i',orientation:'not-verified-no-overhead',photo:'1H4sLmBqg1EbUZ0jWRNFC72T0FtQ0X7lp'},
 {id:'pad-41',kind:'nedelin',title:'Площадка №41 · исторический старт Р-16',scale:.28,yaw:0,folder:'1D1u03D5QlkxHJRsHtvsuAPzV1yEhiVId',photo:'1nE_A8ap4TGei3fnXVSzWDCjb2mf9_fiP',orientation:'not-verified-ground-photo-only'},
 {id:'pad-42',kind:'mik42',title:'Технический комплекс · пл.42',scale:.28,yaw:0,folder:'1nhy66WCjZaGYK8VsVlEQHRre4IjkzzDZ',orientation:'not-verified-no-overhead',photo:'1r6uD1fJtqkjFbk6eoR4rrJ981SVr8whK'},
 {id:'pad-112a',kind:'mzk',title:'МЗК и СДИ · пл.112А',scale:.14,yaw:-Math.PI/4,folder:'1a4VpXEGG-mpSwTvBy-Nb0GBIY4KUKR09',orientation:'osm-component-centres-and-axes-photo-facades',photo:'1VhiQ85kYW0ZEfYMEZnxHgEurrrA0HesJ',modelVersion:'mzk-sdi-photo-v3',photoSetDate:'2026-10-30'},
 {id:'city',kind:'city',title:'Город Байконур · спутниковый план',scale:.20,yaw:0,satellite:'1URocxjo-ZAYAWIIrBhBGMfwx1BKhKkGT',orientation:'image-traced',completeness:'first-pass'}
];
export const ARCHIVE_GALLERY=[
 {id:'np-rockettrip',kind:'observation',title:'НП RocketTrip',folder:'1WO0cKko5TsAK26X1xpR9-sOo5auDDtGR',photo:'1X6ZPCmt5y2xr0dQnyc2rFHyljd8r9eF_',note:'Модель двух укрытий. Точная точка и азимут на карте не подтверждены.'},
 {id:'kpp-7',kind:'checkpoint',title:'КПП №7',folder:'1Q-MRnlsJmvVGdW78jIqdnuI9UoJlVCZl',photo:'1WS2Ofp7NbMl4CV65HqNEWpfST-bfzivk',note:'Видимый фасад по фотографии. Привязка к карте ожидает опорных точек.'},
 {id:'pad-41-study',kind:'nedelin',title:'Площадка №41 · руины',folder:'1D1u03D5QlkxHJRsHtvsuAPzV1yEhiVId',photo:'1nE_A8ap4TGei3fnXVSzWDCjb2mf9_fiP',note:'Фотоэтюд руин. Площадка также размещена на макете по подписанному контуру OpenStreetMap.'},
 {id:'pad-2-study',kind:'buran',title:'Площадка №2 · музейный «Буран»',folder:'1sxMZCp2P-IHgOY9tg2XggRX15m_HF3sO',photo:'1Qtezy9yYrK5Fvv4ZBtlRCB8FvomKeYlO',note:'Отдельный экспонат. Не смешивается с обозначениями площадок 2А и 2Б.'},
 {id:'interior-study',kind:'cleanroom',title:'Интерьеры · сборочный зал',folder:'1zyWfNQ5x8PKWMVAsWbUQWiZkx2GYy036',photo:'1iIiV9eThfoMOy36tcHijib0awmCsTBcK',note:'Один интерьерный фотоэтюд. Принадлежность помещения конкретному зданию не установлена.'}
];
export const EXISTING_ARCHIVE=[
 {id:'pad-1',folder:'1JAaawXTM0I9P-0C6br3d_xSiaUsLMOpC',status:'existing-detailed; below-grade corrected'},
 {id:'pad-3',folder:'1xqTo-hcQ61D_DV6JDZfqF_L-HoYFRnoM',status:'existing-detailed; preserve user-approved layout'},
 {id:'pad-23',folder:'1nweD3hi2MRaeVuNOY2GflKtEMQ1RoDXk',status:'existing-detailed; preserve hill and northwestern access'},
 {id:'pad-250',folder:'1e8kuX4iVjO6N5nHknJ8zKJClJCpLv7Ku',status:'existing-detailed; satellite comparison pending precise registration',satellite:'1trxKwfRxSPO7YuoezOjEmHTA8OAKhqU0'},
 {id:'pad-112',folder:'1XTQD9tVRTeWIUVF-uzdAMIXLXh5SuVTk',status:'existing half-scale NE transporter model; source axis checked',satellite:'1hz1YQ7bgab_0TYAWTqupU8IZMCCq7i_A'},
 {id:'pad-112-tua',folder:'1y-yzVIkCtzPMEaksDM70qWyD8K8PZnE3',status:'part of pad-112; no duplicate exhibit'},
 {id:'kpp-1',folder:'1u-kSZnax4NfFC7qtzaalS1kW1U8YoNYH',status:'empty source folder; no fictional model'}
];
