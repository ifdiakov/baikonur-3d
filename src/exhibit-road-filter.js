// Display-only simplification of service-road webs around four exhibits.
// Boundaries describe the museum's cleanup areas, not cadastral properties.
// Source node IDs, source edges and route topology are never modified.
export const EXHIBIT_ROAD_FILTER_VERSION = 'exhibit-access-only-v1';
export const EXHIBIT_ACCESS_NODE_IDS = Object.freeze(['1834605413', '11928484224']);
export const EXHIBIT_ROAD_AREAS = Object.freeze([
  Object.freeze({id: 'pad-75', name: 'Площадка 75', source: 'node/4395821037',
    center: [63.3209869, 45.8705206], radiusMeters: 1200}),
  Object.freeze({id: 'napornaya', name: 'Станция Напорная', source: 'node/2620204214',
    center: [63.3190158, 45.7225079], radiusMeters: 1500, destinationNode: '1834605413'}),
  Object.freeze({id: 'krayniy', name: 'Аэродром Крайний', source: 'way/46410994',
    bbox: [63.1806645, 45.6073903, 63.2407211, 45.6359043], paddingMeters: 350,
    destinationNode: '11928484224', destinationSource: 'way/173450632'}),
  Object.freeze({id: 'yubileiny', name: 'Аэродром Юбилейный', source: 'way/241008130',
    bbox: [63.2044718, 46.0374145, 63.2916394, 46.0695165], paddingMeters: 450})
]);

const ARTERIAL = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const kind = edge => edge.tags.highway?.replace('_link', '');
const namedStreet = edge => !!(edge.tags.name || edge.tags.ref) &&
  ['unclassified', 'residential', 'living_street'].includes(kind(edge));
const requiredStreet = edge => ARTERIAL.has(kind(edge)) || namedStreet(edge) ||
  edge.tags.bridge && edge.tags.bridge !== 'no' || edge.tags.tunnel && edge.tags.tunnel !== 'no';
const cost = edge => edge.length * (ARTERIAL.has(kind(edge)) ? .65 : namedStreet(edge) ? .8 :
  kind(edge) === 'unclassified' ? 1 : kind(edge) === 'track' ? 5 : 1.6);

class Heap {
  constructor() { this.items = []; }
  push(entry) {
    const a = this.items; let i = a.length; a.push(entry);
    while (i) { const parent = (i - 1) >> 1; if (a[parent][0] <= entry[0]) break; a[i] = a[parent]; i = parent; }
    a[i] = entry;
  }
  pop() {
    const a = this.items, first = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let child = i * 2 + 1;
        if (child + 1 < a.length && a[child + 1][0] < a[child][0]) child++;
        if (a[child][0] >= last[0]) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return first;
  }
  get length() { return this.items.length; }
}

function areaGeometry(spec) {
  const center = spec.center || [(spec.bbox[0] + spec.bbox[2]) / 2, (spec.bbox[1] + spec.bbox[3]) / 2];
  const metersLat = 111195.0802, metersLon = metersLat * Math.cos(center[1] * Math.PI / 180);
  const local = p => [(p[0] - center[0]) * metersLon, (p[1] - center[1]) * metersLat];
  const padding = spec.paddingMeters || 0;
  const bounds = spec.bbox ? [
    (spec.bbox[0] - center[0]) * metersLon - padding,
    (spec.bbox[1] - center[1]) * metersLat - padding,
    (spec.bbox[2] - center[0]) * metersLon + padding,
    (spec.bbox[3] - center[1]) * metersLat + padding
  ] : [-spec.radiusMeters, -spec.radiusMeters, spec.radiusMeters, spec.radiusMeters];
  const contains = node => {
    const [x, y] = local(node.coord);
    return spec.radiusMeters ? x * x + y * y <= spec.radiusMeters ** 2 :
      x >= bounds[0] && y >= bounds[1] && x <= bounds[2] && y <= bounds[3];
  };
  const intersects = edge => {
    const a = local(edge.a.coord), b = local(edge.b.coord), dx = b[0] - a[0], dy = b[1] - a[1];
    if (spec.radiusMeters) {
      const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy || 1)));
      return (a[0] + t * dx) ** 2 + (a[1] + t * dy) ** 2 <= spec.radiusMeters ** 2;
    }
    let lo = 0, hi = 1;
    for (const [p, q] of [[-dx, a[0] - bounds[0]], [dx, bounds[2] - a[0]], [-dy, a[1] - bounds[1]], [dy, bounds[3] - a[1]]]) {
      if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue; }
      const r = q / p; if (p < 0) lo = Math.max(lo, r); else hi = Math.min(hi, r);
      if (lo > hi) return false;
    }
    return true;
  };
  return {center, contains, intersects, geographicBounds: [
    center[0] + bounds[0] / metersLon, center[1] + bounds[1] / metersLat,
    center[0] + bounds[2] / metersLon, center[1] + bounds[3] / metersLat
  ]};
}

/**
 * Retain a compact source-node tree between the local area's external road
 * entries, named/arterial roads, working vehicle routes and physical ports.
 * Interior parking loops and empty dead ends have no terminal and disappear.
 * Boundary edges remain whole, so an arbitrary cleanup boundary cannot cut
 * a through-road. Existing higher-level pruning is passed via `available`.
 */
export function buildExhibitRoadFilter(graph, {
  protectedEdges = new Set(), protectedTrafficWays = new Set(),
  available = () => true, excludedEdges = new Set(), geography, point, areas = EXHIBIT_ROAD_AREAS
} = {}) {
  const removed = new Set(), retained = new Set(), reports = [];
  for (const spec of areas) {
    const area = areaGeometry(spec), inside = new Map();
    const isInside = node => {
      if (!inside.has(node)) inside.set(node, area.contains(node));
      return inside.get(node);
    };
    const rawEdges = graph.edges.filter(edge => area.intersects(edge));
    const edges = rawEdges.filter(available), adjacency = new Map();
    const mandatory = new Set(), terminals = new Set(), boundaryNodes = new Set();
    for (const edge of edges) {
      if (excludedEdges.has(edge)) continue;
      for (const node of [edge.a, edge.b]) {
        if (!adjacency.has(node)) adjacency.set(node, []);
        adjacency.get(node).push(edge);
      }
      const boundary = !isInside(edge.a) || !isInside(edge.b);
      if (boundary || requiredStreet(edge) || protectedEdges.has(edge) || protectedTrafficWays.has(edge.wayId)) {
        mandatory.add(edge); terminals.add(edge.a); terminals.add(edge.b);
      }
      if (boundary) { boundaryNodes.add(edge.a); boundaryNodes.add(edge.b); }
    }
    const destination = spec.destinationNode ? graph.nodes.get(spec.destinationNode) : null;
    if (destination && adjacency.has(destination)) terminals.add(destination);
    const keep = new Set(mandatory), seen = new Set();
    let keptComponents = 0, orphanComponents = 0, connectedTerminals = 0;
    for (const start of adjacency.keys()) {
      if (seen.has(start)) continue;
      const nodes = [start]; seen.add(start);
      for (let i = 0; i < nodes.length; i++) {
        for (const edge of adjacency.get(nodes[i])) {
          const next = edge.a === nodes[i] ? edge.b : edge.a;
          if (!seen.has(next)) { seen.add(next); nodes.push(next); }
        }
      }
      const ends = nodes.filter(node => terminals.has(node));
      if (!ends.length) { orphanComponents++; continue; }
      // Prefer a major-road root so branches lead outward to the main access.
      const root = ends.find(node => adjacency.get(node).some(requiredStreet)) || ends[0];
      const heap = new Heap(), distances = new Map([[root, 0]]), previous = new Map();
      heap.push([0, root]);
      while (heap.length) {
        const [distance, node] = heap.pop();
        if (distance !== distances.get(node)) continue;
        for (const edge of adjacency.get(node)) {
          const next = edge.a === node ? edge.b : edge.a, candidate = distance + cost(edge);
          if (candidate < (distances.get(next) ?? Infinity)) {
            distances.set(next, candidate); previous.set(next, {node, edge}); heap.push([candidate, next]);
          }
        }
      }
      for (const end of ends) {
        let node = end;
        while (node !== root) {
          const previousStep = previous.get(node);
          if (!previousStep) throw Error('Exhibit road terminal lost source-node connectivity: ' + spec.id);
          keep.add(previousStep.edge); node = previousStep.node;
        }
      }
      connectedTerminals += ends.length; keptComponents++;
    }
    const hidden = edges.filter(edge => !keep.has(edge));
    for (const edge of hidden) removed.add(edge);
    for (const edge of keep) retained.add(edge);
    const sourceWayIds = [...new Set(edges.map(edge => edge.wayId))];
    const keptWayIds = [...new Set([...keep].map(edge => edge.wayId))];
    const keptWays = new Set(keptWayIds), hiddenWayIds = sourceWayIds.filter(id => !keptWays.has(id));
    const reducedWayIds = [...new Set(hidden.map(edge => edge.wayId))];
    const map = geography && point ? coord => { const p = point(...geography.project(...coord), 0); return [p.x, p.z]; } : coord => [...coord];
    reports.push({
      id: spec.id, name: spec.name, source: spec.source,
      profile: 'main-access-and-through-routes',
      center: map(area.center), centerLonLat: area.center,
      bounds: {kind: spec.radiusMeters ? 'circle' : 'source-bbox-with-margin',
        radiusMeters: spec.radiusMeters ?? null, paddingMeters: spec.paddingMeters ?? null,
        lonLat: area.geographicBounds, world: [map(area.geographicBounds.slice(0, 2)), map(area.geographicBounds.slice(2))]},
      rawSourceWayCount: new Set(rawEdges.map(edge => edge.wayId)).size,
      rawSourceEdgeCount: rawEdges.length,
      sourceWayCount: sourceWayIds.length, sourceEdgeCount: edges.length,
      keptWayIds, hiddenWayIds, reducedWayIds,
      keptEdgeCount: keep.size, hiddenEdgeCount: hidden.length,
      keptLength: [...keep].reduce((sum, edge) => sum + edge.length, 0),
      hiddenLength: hidden.reduce((sum, edge) => sum + edge.length, 0),
      preservedTrafficWayIds: keptWayIds.filter(id => protectedTrafficWays.has(id)),
      preservedPortWayIds: [...new Set([...keep].filter(edge => protectedEdges.has(edge)).map(edge => edge.wayId))],
      boundaryNodeCount: boundaryNodes.size, connectedTerminalCount: connectedTerminals,
      keptComponents, removedInteriorComponents: orphanComponents,
      access: destination ? {source: spec.destinationSource || spec.source, nodeId: destination.id,
        connected: terminals.has(destination) && [...keep].some(edge => edge.a === destination || edge.b === destination)} : null
    });
  }
  // Areas currently do not overlap; this additionally makes overlap safe if
  // an explicit port or through-route belongs to a future adjacent area.
  for (const edge of retained) removed.delete(edge);
  return {removed, retained, stats: {
    version: EXHIBIT_ROAD_FILTER_VERSION,
    sourceGraphUnchanged: true, lightingSource: 'retained-rendered-road-runs',
    removedEdgeCount: removed.size, regions: reports
  }};
}

// The airport models use an enlarged museum presentation. A source road can
// therefore fall under the displayed runway despite being outside the real
// runway. These helpers only construct an explicitly synthetic display
// clearance; they do not rewrite the OSM road graph or geographic anchors.
export function rectangleSegmentInterval(a, b, rectangle) {
  let lo = 0, hi = 1;
  const dx = b[0] - a[0], dz = b[2] - a[2];
  for (const [p, q] of [[-dx, a[0] - rectangle.minX], [dx, rectangle.maxX - a[0]],
    [-dz, a[2] - rectangle.minZ], [dz, rectangle.maxZ - a[2]]]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
    const r = q / p; if (p < 0) lo = Math.max(lo, r); else hi = Math.min(hi, r);
    if (lo > hi) return null;
  }
  if (hi - lo < 1e-10) return null;
  const t = (lo + hi) / 2, x = a[0] + dx * t, z = a[2] + dz * t;
  // Travel exactly along the perimeter is the clearance path itself.
  if (x <= rectangle.minX + 1e-8 || x >= rectangle.maxX - 1e-8 ||
      z <= rectangle.minZ + 1e-8 || z >= rectangle.maxZ - 1e-8) return null;
  return [lo, hi];
}

export function clipRoadOutsideRectangle(points, rectangle) {
  const runs = [], cuts = [];
  if (points.length < 2) return {runs, cuts};
  const mix = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);
  const same = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]) < 1e-8;
  const boundary = p => p[0] >= rectangle.minX - 1e-8 && p[0] <= rectangle.maxX + 1e-8 &&
    p[2] >= rectangle.minZ - 1e-8 && p[2] <= rectangle.maxZ + 1e-8 &&
    (Math.abs(p[0] - rectangle.minX) < 1e-8 || Math.abs(p[0] - rectangle.maxX) < 1e-8 ||
      Math.abs(p[2] - rectangle.minZ) < 1e-8 || Math.abs(p[2] - rectangle.maxZ) < 1e-8);
  let run = [];
  const add = p => { if (!run.length || !same(run.at(-1), p)) run.push(p); };
  const flush = () => { if (run.length > 1) runs.push(run); run = []; };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], interval = rectangleSegmentInterval(a, b, rectangle);
    if (!interval) { add(a); add(b); continue; }
    const [lo, hi] = interval;
    if (lo > 1e-9) { const p = mix(a, b, lo); add(a); add(p); cuts.push(p); }
    else if (boundary(a)) cuts.push(a);
    flush();
    if (hi < 1 - 1e-9) { const p = mix(a, b, hi); cuts.push(p); add(p); add(b); }
    else if (boundary(b)) cuts.push(b);
  }
  flush();
  return {runs, cuts};
}

/** Shortest connected portion of one rectangular perimeter joining all cuts. */
export function airportPerimeterBypass(cuts, rectangle) {
  if (cuts.length < 2) return [];
  const {minX, maxX, minZ, maxZ} = rectangle, width = maxX - minX, depth = maxZ - minZ;
  const perimeter = 2 * (width + depth);
  const along = p => {
    const distances = [Math.abs(p[2] - minZ), Math.abs(p[0] - maxX), Math.abs(p[2] - maxZ), Math.abs(p[0] - minX)];
    const side = distances.indexOf(Math.min(...distances));
    return [p[0] - minX, width + p[2] - minZ, width + depth + maxX - p[0], 2 * width + depth + maxZ - p[2]][side];
  };
  const points = cuts.map(p => ({at: along(p), point: p})).sort((a, b) => a.at - b.at)
    .filter((p, i, a) => !i || p.at - a[i - 1].at > 1e-7);
  if (points.length < 2) return [];
  let gap = -1, gapIndex = 0;
  for (let i = 0; i < points.length; i++) {
    const distance = (i + 1 < points.length ? points[i + 1].at : points[0].at + perimeter) - points[i].at;
    if (distance > gap) { gap = distance; gapIndex = i; }
  }
  const start = points[(gapIndex + 1) % points.length].at, span = perimeter - gap;
  const y = points.reduce((sum, p) => sum + p.point[1], 0) / points.length;
  const events = [...points, {at: 0, point: [minX, y, minZ]}, {at: width, point: [maxX, y, minZ]},
    {at: width + depth, point: [maxX, y, maxZ]}, {at: 2 * width + depth, point: [minX, y, maxZ]}]
    .map(p => ({...p, at: (p.at - start + perimeter) % perimeter}))
    .filter(p => p.at <= span + 1e-7).sort((a, b) => a.at - b.at)
    .filter((p, i, a) => !i || p.at - a[i - 1].at > 1e-7);
  return events.map(p => p.point);
}
