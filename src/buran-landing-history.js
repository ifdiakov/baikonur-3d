// Short factual records, not a copy of the archive's prose or a telemetry file.
// The radar positions are selected, explicitly identified observations. Any
// continuous path, bank angle or camera movement between them is reconstruction.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const seconds=clock=>clock.split(':').map(Number).reduce((total,n)=>total*60+n,0);

export const BURAN_LANDING_HISTORY_VERSION='buran-landing-history-v1';
export const BURAN_LANDING_SOURCES=freeze({
 pk:{title:'Посадочный комплекс Байконура: схема и пояснения',url:'https://www.buran.ru/htm/pk.htm',kind:'archive-site-plan'},
 report:{title:'«Вымпел»: экспресс-отчёт, общие результаты',url:'https://www.buran.ru/htm/vympel03.htm',kind:'primary-report'},
 landingSystem:{title:'«Вымпел»: всепогодная система автоматической посадки',url:'https://www.buran.ru/htm/vympel05.htm',kind:'primary-report'},
 radar:{title:'«Вымпел»: фактическая радиолокационная проводка 15.11.1988',url:'https://www.buran.ru/htm/vympel07.htm',kind:'primary-radar-records'},
 support:{title:'«Вымпел»: контроль технического состояния и полёты Ту-134БВ',url:'https://www.buran.ru/htm/vympel09.htm',kind:'primary-report'},
 chronology:{title:'Циклограмма полёта 15 ноября 1988 года',url:'https://www.buran.ru/htm/cikloniz.htm',kind:'archive-chronology'},
 eyewitness:{title:'Сергей Грачев: «Мы посадили эту птицу»',url:'https://www.buran.ru/htm/memory39.htm',kind:'eyewitness'},
 escortPhoto:{title:'Сергей Грачев: второй взлёт МиГ-25 ЛЛ22',url:'https://www.buran.ru/htm/foto24.htm',kind:'dated-photo-caption'},
 flight:{title:'Полёт орбитального корабля 11Ф35 «Буран»',url:'https://www.buran.ru/htm/flight.htm',kind:'archive-analysis'},
 flightText:{title:'Полёт «Бурана»: текстовая редакция',url:'https://www.buran.ru/htm/flightex.htm',kind:'archive-analysis'},
 algorithms:{title:'Алгоритмы автоматического управления и разбор посадки',url:'https://www.buran.ru/htm/algoritm.htm',kind:'archive-analysis'},
 video:{title:'Опись исходных видеозаписей полёта и сопровождения',url:'https://www.buran.ru/htm/video12.htm',kind:'archival-film-catalogue'},
 okdp:{title:'«Крылья Родины»: посадочный комплекс и ОКДП',url:'https://www.buran.ru/htm/str.htm',kind:'contemporary-publication'}
});

export const BURAN_LANDING_RECONSTRUCTION_NOTICE='Историческая реконструкция по документам и радиолокационным отметкам. Между отметками движение восстановлено; дальний манёвр сжат для масштаба макета. Это не полная телеметрия.';

export const BURAN_LANDING_PARAMETERS=freeze({
 date:'1988-11-15',timeZone:'Europe/Moscow',timeLabel:'ДМВ — московское время',
 runway:{lengthM:4500,widthM:84,designators:['06','24'],nominalMagneticCoursesDeg:[60,240],
  landingDesignator:'24',diamondDistanceFromThresholdM:1000,endSafetyLengthM:250,
  sourceIds:['pk'],preserveSourceAirportHeading:true},
 touchdown:{clock:'09:24:42',secondsOfDay:seconds('09:24:42'),sourceIds:['chronology','flightText'],
  reportedSpeedKph:263,reportedVerticalSpeedMps:-.3,speedSourceId:'flightText',speedIsPrimaryRadarSample:false},
 parachutes:{count:3,afterTouchdownSeconds:9.2,approximate:true,sourceIds:['flightText'],
  timingNote:'Задержка 9.2 с приведена в описании; её согласование с указанным там временем носовой стойки неоднозначно.'},
 noseWheel:{clock:'09:24:52',secondsOfDay:seconds('09:24:52'),afterTouchdownSeconds:10,approximate:true,sourceIds:['flightText']},
 stop:{clock:'09:25:24',secondsOfDay:seconds('09:25:24'),afterTouchdownSeconds:42,rolloutM:1620,
  sourceIds:['chronology','flightText'],lateralOffsetMagnitudeM:.8,lateralOffsetSourceId:'report',lateralOffsetSignKnown:false},
 primaryReport:{touchdownLateralErrorUpperBoundM:3,stopLateralOffsetMagnitudeM:.8,
  landingNavigationFromAltitudeM:6200,sourceIds:['report','landingSystem']},
 escort:{count:1,type:'МиГ-25ПУ-СОТН',laboratory:'ЛЛ22',boardNumber:'22',
  pilot:'Магомед Толбоев',cameraOperator:'Сергей Жадовский',
  takeoffClock:'08:57:00',takeoffPrecision:'minute',takeoffAirport:'Юбилейный',
  approximateJoinAltitudeM:8200,reportedMinimumSeparationM:200,reportedTelevisionDurationSeconds:127,
  formationPathIsReconstruction:true,leavesCloseFormationBeforeCloudEntry:true,
  postLandingFlyby:{documented:true,exactClockKnown:false,sourceId:'eyewitness'},
  sourceIds:['escortPhoto','flight','video','eyewitness']},
 reserve:{type:'МиГ-25',boardNumber:'9210',pilot:'Султанов',role:'резерв СОТН',
  showInLandingFormation:false,sourceIds:['eyewitness']},
 calibrationAircraft:{type:'Ту-134БВ',boardNumber:'65931',role:'контроль комплекса до посадки',
  flights:[['03:30','05:50'],['06:15','08:20']],showInLandingFormation:false,sourceIds:['support']},
 observationFrame:{origin:'центр ВПП',eastAxis:'X',northAxis:'Y',heightAxis:'H',units:'metres',
  clock:'московское время',sourceId:'radar',completeTelemetry:false},
 reconstruction:{interpolation:'interpretive-between-observations',distantFlightScale:'display-compressed',
  runwayScale:'same-as-existing-airport',missingAttitudeTelemetry:true,escortTrajectoryMeasured:false,
  touchdownPositionPreciselySurveyed:false}
});

// Selected original rows. The first numeric column is MMSSd at 09 hours;
// e.g. 24404 means 09:24:40.4. Do not reinterpret it as elapsed flight time.
// The source itself describes a radar-source/possible chase-plane acquisition
// artefact near 09:23; those inconsistent course 24°/42° rows are not path anchors.
const observations=[
 ['09:18:23.0',-16550,-5800,20100,108,622,-90],
 ['09:18:53.0',-3200,-7825,17900,92,500,-100],
 ['09:19:13.6',5225,-3900,15880,69,438,-100],
 ['09:19:44.0',9250,6375,13080,19,344,-80],
 ['09:20:08.4',4675,13025,11700,347,261,-49],
 ['09:20:34.7',6925,19750,10140,26,259,-65],
 ['09:20:55.1',12350,20950,8760,73,234,-66],
 ['09:21:06.8',14650,18225,8270,102,199,-41],
 ['09:21:30.4',16575,14375,7500,152,158,-34],
 ['09:22:00.0',17225,10625,6490,176,140,-36],
 ['09:22:23.4',16572,7700,5650,198,118,-35],
 ['09:22:52.5',13788,6013,4470,240,110,-41],
 ['09:23:11.0',11553,4897,3038,245,124,-80],
 ['09:24:01.9',5463,2325,856,247,121,-40],
 ['09:24:10.3',4525,1947,504,247,117,-39],
 ['09:24:14.7',4041,1750,344,248,118,-38],
 ['09:24:34.7',2019,881,12,247,105,-4],
 ['09:24:39.0',1678,725,14,246,97,-1],
 ['09:24:40.4',1619,703,24,246,92,-1]
];
export const BURAN_LANDING_RADAR_SAMPLES=freeze(observations.map(([clock,eastM,northM,heightM,courseDeg,speedMps,verticalSpeedMps])=>({
 clock,secondsOfDay:seconds(clock),eastM,northM,heightM,courseDeg,speedMps,verticalSpeedMps,sourceId:'radar'
})));

export const BURAN_LANDING_EVENTS=freeze([
 {id:'energy-management',clock:'09:18:23',timePrecision:'radar-observation',title:'Предпосадочный манёвр',
  text:'Отметки «Вымпела» фиксируют снижение и манёвр перед выходом на посадочную прямую.',sourceIds:['radar']},
 {id:'escort',clock:null,timePrecision:'altitude-based',altitudeM:8200,title:'Самолёт сопровождения',
  text:'МиГ-25 ЛЛ22: Магомед Толбоев пилотирует, Сергей Жадовский передаёт телевизионное изображение.',sourceIds:['escortPhoto','flight']},
 {id:'navigation',clock:null,timePrecision:'altitude-based',altitudeM:6200,title:'Посадочная система «Вымпел»',
  text:'Наземные радиомаяки дают навигационные измерения; кораблём управляет бортовая автоматика.',sourceIds:['landingSystem']},
 {id:'touchdown',clock:'09:24:42',timePrecision:'reported-second',title:'Касание ВПП',
  text:'«Буран» приземляется автоматически, без экипажа.',sourceIds:['chronology','report']},
 {id:'parachutes',clock:null,timePrecision:'approximate-relative',afterTouchdownSeconds:9.2,title:'Тормозные парашюты',
  text:'На пробеге раскрываются три тормозных купола. Момент в реконструкции приблизительный.',sourceIds:['flightText']},
 {id:'nose-wheel',clock:'09:24:52',timePrecision:'approximate-reported-second',title:'Носовая стойка',
  text:'Носовая стойка опускается на полосу; точность опубликованной отметки ограничена.',sourceIds:['flightText']},
 {id:'stop',clock:'09:25:24',timePrecision:'reported-second',title:'Полная остановка',
  text:'Пробег длился 42 секунды; в циклограмме указано 1620 метров.',sourceIds:['chronology']}
].map(event=>({...event,secondsOfDay:event.clock?seconds(event.clock):null})));

export const BURAN_LANDING_DISCREPANCIES=freeze([
 {id:'speed',sourceIds:['radar','flightText'],
  values:{lastRadarSpeedMps:92,lastRadarClock:'09:24:40.4',narrativeTouchdownSpeedKph:263},
  note:'92 м/с относится к последней допосадочной радиолокационной отметке,263 км/ч — к описанию касания. Это не одна измеренная величина; промежуточная скорость не документирована.'},
 {id:'position',sourceIds:['report','algorithms','flightText'],
  values:{reportStopMagnitudeM:.8,laterPhotoInterpretationAboutM:5},
  note:'Для результата системы выбран первичный отчёт: 0.8 м по модулю. Более поздний фотоанализ оценивает около 5 м; направление первичный отчёт не задаёт.'},
 {id:'parachute-timing',sourceIds:['flightText','video'],
  values:{narrativeDelaySeconds:9.2,noseWheelClock:'09:24:52',claimedLeadBeforeNoseWheelSeconds:2},
  note:'Числа в описании арифметически не согласуются. Сохраняются как приблизительные; точная синхронная запись выпуска парашютов здесь не заявлена.'},
 {id:'radar-height',sourceIds:['radar'],
  note:'Последние отметки высоты 12→14→24 м и переключение источника около 09:23 нельзя превращать в буквальные рывки модели. Сглаживание и сведение с касанием — реконструкция.'},
 {id:'touchdown-point',sourceIds:['pk','algorithms'],
  note:'Ромбы обозначают расчётные точки в 1000 м от торцов. Точная фактическая точка касания спорна; маркер не выдаётся за измеренное место приземления.'},
 {id:'escort-time',sourceIds:['escortPhoto','radar','flight'],
  note:'Подпись к поздней компьютерной иллюстрации даёт «около 09:18», но радиолокационная высота 8.2 км достигается около 09:21. Сближение привязано к высоте, не к минуте иллюстрации.'}
]);
