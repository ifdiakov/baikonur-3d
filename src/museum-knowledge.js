// The text corpus is deliberately separate from scene geometry and menu wiring.
// Every factual item carries source IDs, resolved to original external pages.
export const MUSEUM_KNOWLEDGE_VERSION = 'museum-buran-20261030-v1';

const STYLE_ID = 'museum-knowledge-styles';
const CSS = `
.museum-knowledge{margin:16px 0 6px;padding-top:15px;border-top:1px solid rgba(172,198,207,.22);font-size:13px;line-height:1.6;color:inherit}
.museum-knowledge h3{font-size:16px;line-height:1.35;margin:0 0 7px;color:#f1eee3;letter-spacing:.01em}
.museum-knowledge h4{font-size:12px;line-height:1.4;margin:17px 0 8px;color:#d5dedb;text-transform:uppercase;letter-spacing:.06em}
.museum-knowledge p{margin:8px 0 11px}
.museum-knowledge-subtitle{color:#abbec0;font-size:11px;margin-bottom:8px}
.museum-knowledge-badge{display:inline-block;padding:3px 7px;border:1px solid #5b7979;border-radius:4px;color:#d2e5dd;font-size:10px;font-weight:700;letter-spacing:.025em;margin-bottom:9px}
.museum-knowledge-badge[data-evidence="recollection"]{border-color:#938357;color:#e4d6a8}
.museum-knowledge-badge[data-evidence="disputed"],.museum-knowledge-badge[data-evidence="hoax"]{border-color:#a17260;color:#edbea4}
.museum-knowledge-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:13px 0}
.museum-knowledge-metric{padding:9px 10px;background:rgba(148,178,181,.075);border:1px solid rgba(172,198,207,.16);border-radius:5px;min-width:0}
.museum-knowledge-value{display:block;color:#f0dec1;font-size:19px;line-height:1.3;font-variant-numeric:tabular-nums}
.museum-knowledge-label{display:block;font-size:11px;color:#b5c7c6;line-height:1.4;margin-top:3px}
.museum-knowledge-metric small{display:block;font-size:10px;line-height:1.45;color:#99aead;margin-top:5px}
.museum-knowledge-facts,.museum-knowledge-timeline{list-style:none;margin:0;padding:0}
.museum-knowledge-facts li{margin:0 0 12px}
.museum-knowledge-facts b{display:block;font-weight:600;color:#e1e8e2;margin-bottom:2px}
.museum-knowledge-timeline li{border-left:2px solid #596e71;margin:0;padding:0 0 13px 11px}
.museum-knowledge-timeline time{display:block;font-size:11px;font-weight:700;color:#dcbd91}
.museum-knowledge-ref{font-size:10px;color:#a6ccc9!important;white-space:nowrap;text-decoration:none;margin-left:4px;display:inline!important}
.museum-knowledge-ref:hover,.museum-knowledge-ref:focus-visible{text-decoration:underline;color:#fff!important}
.museum-knowledge-note{border-left:2px solid #a28c62;padding:7px 10px;background:rgba(162,140,98,.08);font-size:11px;color:#c7c5b6;margin:13px 0}
.museum-knowledge-stories{display:flex;flex-direction:column;gap:6px}
.museum-knowledge-story{border:1px solid #456163;border-radius:4px;background:rgba(72,109,111,.12);color:#cce4df;padding:8px 10px;text-align:left;font:inherit;font-size:12px;line-height:1.4;cursor:pointer}
.museum-knowledge-story:hover,.museum-knowledge-story:focus-visible{background:rgba(91,134,137,.25);border-color:#87b1ad}
.museum-knowledge-story small{display:block;color:#a8b9b4;font-size:10px;margin-top:3px}
.museum-knowledge-sources{margin-top:14px;font-size:10px;color:#9aafae}
.museum-knowledge-sources summary{cursor:pointer;color:#b7c9c5;padding:5px 0}
.museum-knowledge-sources ol{padding-left:20px;margin:7px 0;list-style:decimal}
.museum-knowledge-sources li{margin-bottom:7px;overflow-wrap:anywhere}
.museum-knowledge-sources a{color:#a6ccc9;display:inline!important}
.museum-knowledge-sources small{display:block;color:#91a3a1;font-size:10px}
@media(max-width:380px){.museum-knowledge-metrics{grid-template-columns:1fr}}
`;

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

/**
 * Pure DOM renderer: no network calls, no scene mutations and no HTML injection.
 * render* appends one section to container; the caller owns clearing/opening it.
 * onNavigate receives the same `story:<id>` action returned by storiesMenu().
 */
export function createMuseumKnowledge(data, { onNavigate } = {}) {
  const sources = data?.sources || {};
  const sites = data?.sites || {};
  const rockets = data?.rockets || {};
  const stories = data?.stories || {};
  const evidenceTypes = data?.evidenceTypes || {};

  function render(record, container, kind, options = {}) {
    if (!record || !container?.append) return null;
    const doc = container.ownerDocument || globalThis.document;
    if (!doc) return null;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      (doc.head || doc.documentElement).append(style);
    }
    const node = (tag, className, text) => {
      const el = doc.createElement(tag);
      if (className) el.className = className;
      if (text != null) el.textContent = String(text);
      return el;
    };
    const section = node('section', 'museum-knowledge');
    section.dataset.knowledgeKind = kind;
    section.dataset.knowledgeId = record.id;
    section.setAttribute('aria-label', record.title);
    const used = new Map();
    function appendRefs(parent, ids = []) {
      for (const id of [...new Set(ids)]) {
        const source = sources[id];
        const url = safeUrl(source?.url);
        if (!source || !url) continue;
        if (!used.has(id)) used.set(id, used.size + 1);
        const ref = node('a', 'museum-knowledge-ref', '[' + used.get(id) + ']');
        ref.href = url;
        ref.target = '_blank';
        ref.rel = 'noopener noreferrer';
        ref.title = source.title;
        ref.setAttribute('aria-label', 'Источник: ' + source.title);
        parent.append(ref);
      }
    }
    function paragraph(item, className = '') {
      const p = node('p', className, item?.text || '');
      appendRefs(p, item?.sources);
      return p;
    }
    if (options.includeTitle !== false) section.append(node('h3', '', record.title));
    if (record.subtitle) section.append(node('div', 'museum-knowledge-subtitle', record.subtitle));
    if (record.evidenceType) {
      const evidence = evidenceTypes[record.evidenceType];
      const badge = node('span', 'museum-knowledge-badge', evidence?.label || record.evidenceType);
      badge.dataset.evidence = record.evidenceType;
      if (evidence?.description) badge.title = evidence.description;
      section.append(badge);
    }
    if (record.summary) {
      section.append(paragraph({ text: record.summary, sources: record.summarySources }));
    }
    if (record.metrics?.length) {
      const metrics = node('div', 'museum-knowledge-metrics');
      for (const item of record.metrics) {
        const metric = node('div', 'museum-knowledge-metric');
        metric.append(node('strong', 'museum-knowledge-value', item.value));
        const label = node('span', 'museum-knowledge-label', item.label);
        appendRefs(label, item.sources);
        metric.append(label);
        if (item.text) metric.append(node('small', '', item.text));
        metrics.append(metric);
      }
      section.append(metrics);
    }
    if (record.facts?.length) {
      const list = node('ul', 'museum-knowledge-facts');
      for (const fact of record.facts) {
        const item = node('li');
        if (fact.title) item.append(node('b', '', fact.title));
        const text = node('span', '', fact.text);
        appendRefs(text, fact.sources);
        item.append(text);
        list.append(item);
      }
      section.append(list);
    }
    for (const item of record.paragraphs || []) section.append(paragraph(item));
    if (record.timeline?.length) {
      section.append(node('h4', '', 'Вехи истории'));
      const timeline = node('ol', 'museum-knowledge-timeline');
      for (const item of record.timeline) {
        const row = node('li');
        row.append(node('time', '', item.date));
        const text = node('span', '', item.text);
        appendRefs(text, item.sources);
        row.append(text);
        timeline.append(row);
      }
      section.append(timeline);
    }
    if (record.caveat) section.append(paragraph(record.caveat, 'museum-knowledge-note'));
    if (record.modelCredit) section.append(paragraph(record.modelCredit, 'museum-knowledge-note'));
    const relatedStories = (record.stories || []).map(id => stories[id]).filter(Boolean);
    if (relatedStories.length && typeof onNavigate === 'function') {
      section.append(node('h4', '', 'Истории этого места'));
      const list = node('div', 'museum-knowledge-stories');
      for (const story of relatedStories) {
        const button = node('button', 'museum-knowledge-story', story.title);
        button.type = 'button';
        button.dataset.museumAction = 'story:' + story.id;
        button.append(node('small', '', evidenceTypes[story.evidenceType]?.label || 'История'));
        button.addEventListener('click', event => {
          event.stopPropagation();
          onNavigate('story:' + story.id);
        });
        list.append(button);
      }
      section.append(list);
    }
    const relatedRockets = (record.relatedRockets || []).map(id => rockets[id]).filter(Boolean);
    if (relatedRockets.length && typeof onNavigate === 'function') {
      section.append(node('h4', '', 'Ракеты и техника'));
      const list = node('div', 'museum-knowledge-stories');
      for (const rocket of relatedRockets) {
        const button = node('button', 'museum-knowledge-story', rocket.title);
        button.type = 'button';button.dataset.museumAction = 'rocket:' + rocket.id;
        button.addEventListener('click', event => {event.stopPropagation();onNavigate('rocket:' + rocket.id);});
        list.append(button);
      }
      section.append(list);
    }
    if (used.size) {
      const details = node('details', 'museum-knowledge-sources');
      details.append(node('summary', '', 'Источники · ' + used.size));
      const list = node('ol');
      for (const [id] of used) {
        const source = sources[id];
        const item = node('li');
        const link = node('a', '', source.title + ' ↗');
        link.href = safeUrl(source.url);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.append(link);
        if (source.author) item.append(node('small', '', source.author));
        list.append(item);
      }
      details.append(list);
      section.append(details);
    }
    container.append(section);
    return section;
  }

  return Object.freeze({
    renderSite: (id, container, options) => render(sites[id], container, 'site', options),
    renderRocket: (id, container, options) => render(rockets[id], container, 'rocket', options),
    renderStory: (id, container, options) => render(stories[id], container, 'story', options),
    getSite: id => sites[id] || null,
    getRocket: id => rockets[id] || null,
    getStory: id => stories[id] || null,
    siteSummary: id => sites[id]?.summary || '',
    rocketSummary: id => rockets[id]?.summary || '',
    storiesMenu: () => Object.values(stories).map(story => ({
      action: 'story:' + story.id,
      title: story.title,
      description: (evidenceTypes[story.evidenceType]?.label || 'История') + ' · ' + story.subtitle
    })),
    stats: () => ({
      version: MUSEUM_KNOWLEDGE_VERSION,
      edition: data?.edition || null,
      sites: Object.keys(sites).length,
      rockets: Object.keys(rockets).length,
      stories: Object.keys(stories).length,
      sources: Object.keys(sources).length,
      sourceConflicts: data?.sourceConflicts?.length || 0
    })
  });
}
