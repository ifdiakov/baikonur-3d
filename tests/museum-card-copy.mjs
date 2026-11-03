import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {museumCardCopy} from '../src/museum-card-copy.js';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
const site=id=>catalog.sites.find(item=>item.id===id);

const examples=[
 ['Положение приблизительное: перенесено с музейной схемы по соседним объектам с известными координатами.',''],
 ['Схематическая модель · проверяй статус атрибуции объекта',''],
 ['Расположение привязано к OpenStreetMap. Название станции и расположение путей взяты из OpenStreetMap. Станционные здания показаны условно; размеры архитектуры не являются обмерными данными.',''],
 ['24 октября 1960 года здесь произошла катастрофа Р-16. План и характер сооружений восстановлены по фотографиям; размеры модели приблизительные.','24 октября 1960 года здесь произошла катастрофа Р-16.'],
 ['Входила в группировку орбитальных ракет; индивидуальная история требует уточнения.','Входила в группировку орбитальных ракет.'],
 ['Первый спутник Земли стартовал здесь 4 октября 1957 года. Размеры модели приблизительные.','Первый спутник Земли стартовал здесь 4 октября 1957 года.'],
 ['Гостиница относится к инфраструктуре ЦЭНКИ. Пользователь идентифицировал ранее ошибочно подписанную пл. №17 как площадку №75 — гостиница «7 ветров».','Гостиница относится к инфраструктуре ЦЭНКИ.']
];
for(const [input,expected]of examples)assert.equal(museumCardCopy(input),expected,'Unwanted editorial copy must not leak into visitor card');
assert.equal(museumCardCopy(null),'');
assert.equal(museumCardCopy(undefined),'');
assert.match(museumCardCopy(site('pad-1').purposeLong),/4 октября 1957 года/,'Keep historic site achievements');
assert.match(museumCardCopy(site('pad-41').note),/24 октября 1960 года/,'Preserve catastrophe history');
assert.equal(museumCardCopy(site('city').purposeLong),'','Remove city registration notes');
assert.equal(museumCardCopy(site('pad-203').note),'','Unknown-site workflow notes belong in research, not cards');
assert.equal(museumCardCopy(site('sector-nw1').purposeLong),'','Placeholder sector disclaimer does not crowd visitor view');
assert.equal(museumCardCopy(site('pad-75').purposeLong),'Гостиница «7 ветров» принадлежит ЦЭНКИ.');
assert.match(site('pad-1').note,/координаты и размеры архитектуры пока ориентировочны/,
 'Keep original research metadata intact in catalog');
assert.ok(html.includes("museumCardCopy(r.purposeLong||r.purpose)"),'Use clean text in hover and site cards');
assert.ok(html.includes('museumCardCopy(knowledge.summary)'),'Clean fallback knowledge text');
assert.ok(html.includes('museumNote(r)'),'Clean raw site notes before display');
assert.doesNotMatch(html,/positionDescription\(/,'Generated positional disclaimer must not be displayed');
assert.doesNotMatch(html,/Схематическая модель · проверяй статус атрибуции объекта/);
assert.doesNotMatch(html,/"Источник позиции: "/);
assert.doesNotMatch(html,/"Привязка: "/);
assert.doesNotMatch(html,/"3D-модель: музейная реконструкция; обмерные размеры не подтверждены\."/);
assert.match(html,/© OpenStreetMap contributors/,'Keep licensing credit for map source outside the card');
console.log('MUSEUM_CARD_COPY_PASS',JSON.stringify({examples:examples.length,sites:catalog.sites.length}));
