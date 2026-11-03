// Public-facing object cards should show history and purpose, not recurring
// model-registration or source-audit boilerplate. Preserve the original
// catalogue/geoSource metadata unchanged for research, QA and attribution.
const PROCESS_NOTE=/(?:^|\b)(?:openstreetmap|геопривязк|геодезическ|координат(?:ы|ам)?\s*\(|обмерн(?:ые|ыми|ых)|атрибуци(?:и|я|ю)|схематическ(?:ой|ая|ого|ую)\s+(?:модел|план|русла)|положение\s+(?:модел|метки|точки)\s+(?:приблизительн|предварительн)|размеры\s+(?:модели|сооружений|архитектуры)\s+(?:приблизительн|ориентировочн))/iu;
const PROCESS_OPENING=/^(?:Положение\s+(?:точки|метки|приблизительное)|Точное\s+положение\s+объекта|Расположение\s+(?:привязано|и\s+направление\s+аэродрома|на\s+тр[её]хмерной)|Название\s+станции\s+и\s+расположение|Название\s+определено\s+по\s+железнодорожной|Станционные\s+здания\s+показаны|Номер\s+\d+\s+прочитан\s+на\s+исходной|Геометрия\s+(?:модели|и\s+положение)|Привязка\s+к\s+исторической|Глобальная\s+геопривязка|План\s+и\s+характер\s+сооружений\s+восстановлены|Комплекс\s+уменьшен\s+вдвое|Первый\s+проход\s+по\s+спутниковому\s+снимку|Модель\s+v\d+\s+выстроена|В\s+проверенных\s+открытых\s+перечнях|Для\s+атрибуции\s+необходим|Назначение,\s+историческая\s+программа|Исторические\s+сведения\s+и\s+даты\s+эксплуатации\s+требуют|Точные\s+координаты\s+пока|Точка\s+не\s+размещена\s+на\s+3D-)/iu;

/** Remove standalone editorial caveats; never change source records. */
export function museumCardCopy(raw) {
 if (typeof raw !== 'string') return '';
 return raw
  .split(/(?<=[.!?])\s+|\n{2,}/u)
  .map(sentence => sentence.trim())
  .filter(sentence => sentence && !PROCESS_OPENING.test(sentence) && !PROCESS_NOTE.test(sentence))
  .join(' ')
  .replace(/\s+/gu,' ')
  .trim();
}
