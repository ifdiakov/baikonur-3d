// Museum adaptations approved as one silver palette. Only match the explicitly
// attributed enterprise, never infer site ownership from its rocket programme.
const logos = [
  ['tsenki', 'ЦЭНКИ', /цэнки|центр эксплуатации объектов наземной космической инфраструктуры/iu],
  ['energia', 'РКК «Энергия»', /энергия/iu],
  ['cpc', 'ЦПК имени Ю. А. Гагарина', /цпк|центр подготовки космонавтов/iu],
  ['roscosmos', 'Роскосмос', /роскосмос/iu],
  ['khrunichev', 'Центр Хруничева', /хруничев/iu],
  ['lavochkin', 'НПО Лавочкина', /лавочкин/iu],
  ['progress', 'РКЦ «Прогресс»', /ркц.*прогресс|прогресс.*ркц/iu],
  ['energomash', 'НПО Энергомаш', /энергомаш/iu],
];

export function organisationLogo(organisation) {
  // Several enterprises may be listed with different roles. Brand the first
  // named enterprise while keeping the complete attribution in the card text.
  const match = logos.map(logo => ({logo, index: (organisation || '').search(logo[2])}))
    .filter(item => item.index >= 0).sort((a, b) => a.index - b.index)[0]?.logo;
  return match ? {id: match[0], name: match[1], src: `./assets/org-logos/${match[0]}.png`} : null;
}

export function setOrganisationBrand(container, organisation, fallback = organisation) {
  const logo = organisationLogo(organisation);
  container.replaceChildren();
  container.classList.toggle('has-org-logo', Boolean(logo));
  container.removeAttribute('data-org-logo');
  container.title = organisation || fallback || '';
  if (!logo) { container.textContent = organisation || fallback || ''; return false; }
  container.dataset.orgLogo = logo.id;
  const image = document.createElement('img');
  image.className = 'org-logo';
  image.alt = logo.name;
  image.width = 1280;
  image.height = 480;
  image.decoding = 'async';
  image.addEventListener('error', () => {
    if (!container.contains(image)) return;
    container.classList.remove('has-org-logo');
    container.removeAttribute('data-org-logo');
    container.textContent = organisation || fallback || logo.name;
  }, {once: true});
  image.src = logo.src;
  container.append(image);
  return true;
}

