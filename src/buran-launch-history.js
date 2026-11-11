// Museum chronology of the initial Energia–Buran ascent, 15 November 1988.
// T=0 is the recorded liftoff contact at 06:00:01.25 Moscow time, not the
// rounded 06:00 launch time. This module supplies captions, never a trajectory.
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const BURAN_LAUNCH_VERSION = 'energia-buran-1988-v1';
export const START = -90;
export const END = 75;

export const SOURCES = freeze({
  chronology: {
    title: 'Архив buran.ru: циклограмма полёта 15 ноября 1988 года',
    url: 'https://www.buran.ru/htm/cikloniz.htm'
  },
  gubanov: {
    title: 'Б. И. Губанов: «Триумф и трагедия „Энергии“», книга 3',
    url: 'https://www.buran.ru/htm/25-3.htm'
  },
  platforms: {
    title: 'Под ред. И. В. Бармина: наземная инфраструктура, книга 2, §2.8.4.1',
    url: 'https://rvsn.ruzhany.info/0_2023/barmin_02_02.html'
  },
  couplings: {
    title: 'Под ред. И. В. Бармина: наземная инфраструктура, книга 2, §6.2.3',
    url: 'https://rvsn.ruzhany.info/0_2023/barmin_02_06.html'
  }
});

// The five documented marks below are converted from the published clocks:
// 05:59:09, 05:59:50.10, 05:59:56.30, 05:59:59.50 and 06:00:01.25.
// Other boundaries are narrative intervals chosen for the museum presentation.
// They do not claim exact archival times for water, platform motion or ascent.
export const EVENTS = freeze([
  {
    at: START,
    phase: 'preparation',
    timing: 'visual-interval',
    title: 'Площадка 110 · левый старт',
    caption: '15 ноября 1988 года · 06:00 МСК. Последние полторы минуты перед взлётом «Энергии — Бурана». Большая башня обслуживания уже отведена до начала заправки.',
    source: SOURCES.gubanov
  },
  {
    at: -52.25,
    phase: 'aiming-release',
    timing: 'documented',
    title: 'Отвод системы прицеливания',
    caption: '05:59:09 МСК. Отводится площадка обслуживания; от ракеты отстыковывается переходник системы прицеливания.',
    source: SOURCES.chronology
  },
  {
    at: -35,
    phase: 'service-clearance',
    timing: 'visual-interval',
    title: 'Площадки обслуживания',
    caption: 'Поворотные площадки заправочно-дренажной мачты отходят по технологической последовательности. Показанный промежуточный интервал восстановлен приблизительно; ствол мачты остаётся неподвижным.',
    source: SOURCES.platforms
  },
  {
    at: -16,
    phase: 'water-deluge',
    timing: 'visual-interval',
    title: 'Вода перед зажиганием',
    caption: 'Перед запуском двигателей вода поступает в зону пламени, снижая акустические нагрузки. Начало подачи в реконструкции показано приблизительно.',
    source: SOURCES.gubanov
  },
  {
    at: -11.15,
    phase: 'core-ignition',
    timing: 'documented',
    title: 'Запуск РД-0120',
    caption: '05:59:50,10 МСК. Начинается запуск двигателей РД-0120 центрального блока «Энергии».',
    source: SOURCES.chronology
  },
  {
    at: -4.95,
    phase: 'booster-ignition',
    timing: 'documented',
    title: 'Запуск РД-170',
    caption: '05:59:56,30 МСК. Начинается запуск двигателей РД-170 четырёх боковых блоков.',
    source: SOURCES.chronology
  },
  {
    at: -1.75,
    phase: 'main-thrust',
    timing: 'documented',
    title: 'Режим «Главная»',
    caption: '05:59:59,50 МСК. Подаётся главная команда РД-170.',
    source: SOURCES.chronology
  },
  {
    at: 0,
    phase: 'liftoff',
    timing: 'documented',
    title: 'Подъём «Энергии — Бурана»',
    caption: '06:00:01,25 МСК. Зафиксирован контакт подъёма. От этой отметки отсчитывается время реконструкции.',
    source: SOURCES.chronology
  },
  {
    at: 2,
    phase: 'drain-clearance',
    timing: 'visual-interval',
    title: 'Последняя дренажная площадка',
    caption: 'После запуска двигателей и начала движения ракеты отходит последняя площадка с магистралью дренажа водорода. Её движение показано в приблизительном визуальном интервале.',
    source: SOURCES.gubanov
  },
  {
    at: 7,
    phase: 'ascent',
    timing: 'visual-interval',
    title: 'Три газоотвода',
    caption: 'Газопламенный поток под стартом распределяется по трём газоотводам. «Энергия» с «Бураном» поднимается над площадкой.',
    source: SOURCES.gubanov
  },
  {
    at: 20,
    phase: 'ascent',
    timing: 'visual-interval',
    title: 'Начальный набор высоты',
    caption: 'Связка «Энергия — Буран» продолжает подъём с четырьмя боковыми блоками. В эпизоде показан начальный участок взлёта.',
    source: SOURCES.chronology
  }
]);

export function sampleBuranHistory(time) {
  const boundedTime = Math.max(START, Math.min(END, Number.isFinite(time) ? time : START));
  let event = EVENTS[0];
  for (const candidate of EVENTS) {
    if (candidate.at > boundedTime) break;
    event = candidate;
  }
  return {
    time: boundedTime,
    phase: event.phase,
    title: event.title,
    caption: event.caption,
    source: event.source
  };
}
