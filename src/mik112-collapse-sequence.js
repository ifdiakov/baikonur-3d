// Museum interpretation, NOT an engineering failure simulation.
// Date and affected bays: https://buran.ru/htm/foto7.htm (commission release reproduced there).
export const MIK112_COLLAPSE_VERSION='mik112-collapse-20261110-v1';
export const COLLAPSE_DURATION=32;
export const COLLAPSE_SOURCE='https://buran.ru/htm/foto7.htm';
export const COLLAPSE_NOTICE='Условная визуальная реконструкция. Порядок падения конструкций и темп анимации не являются записью события или инженерным расчётом. Вечернее оформление музея сохранено; оно не передаёт время суток аварии.';
export const COLLAPSE_PHASES=Object.freeze([
 {at:0,title:'До обрушения',text:'12 мая 2002 года. В четвёртом пролёте МИК‑112 находился первый лётный «Буран» в составе демонстрационного комплекса «Энергия—Буран».'},
 {at:6,title:'Обрушение кровли',text:'Кровля трёх высоких пролётов — 3, 4 и 5 — обрушилась внутрь корпуса. Здесь показана условная последовательность падения секций, а не установленный ход аварии.'},
 {at:16,title:'Пыль оседает',text:'Под строительными конструкциями оказались корабль и ракетные блоки. Пожар или взрыв в этой реконструкции не изображаются.'},
 {at:25,title:'Гибель «Бурана»',text:'Корабль 1.01, выполнивший орбитальный полёт 15 ноября 1988 года, был утрачен. Памяти людей, погибших при обрушении.'}
]);
const clamp=x=>Math.max(0,Math.min(1,x));
export const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export function collapsePhase(seconds){return [...COLLAPSE_PHASES].reverse().find(p=>seconds>=p.at)||COLLAPSE_PHASES[0];}
export function roofSectionPose(bay,section,seconds){
 if(!Number.isInteger(bay)||bay<0||bay>2||!Number.isInteger(section)||section<0||section>11||!Number.isFinite(seconds))throw new Error('Invalid reconstruction sample');
 const start=6+section*.39+bay*.46,progress=clamp((seconds-start)/2.8),fall=progress*progress;
 const seed=(section*17+bay*11)%13;
 return {bay,section,start,progress,position:[-75+bay*40+(seed-6)*.20*fall,55.9-(49.8+seed*.15)*fall,-110+section*20+(seed-6)*.42*fall],rotation:[(seed-6)*.035*fall,((seed%3)-1)*.07*fall,((section+bay)%2?1:-1)*(.08+seed*.025)*fall]};
}
