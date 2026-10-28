#!/usr/bin/env python3
"""Import a reproducible, unwarped OSM geographic source for the museum.

This does not replace the museum's schematic coordinates or infer model anchors.
Input is the complete JSON response to data/osm/baikonur.overpassql.
For exported features, source coordinates, node references and tags are preserved.
The complete response is retained in the source archive.
"""
from __future__ import annotations

import argparse
import collections
import gzip
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BBOX = [62.75, 45.58, 64.25, 46.25]  # GeoJSON order: west, south, east, north.
COPYRIGHT = "© OpenStreetMap contributors"
LICENSE = "https://opendatacommons.org/licenses/odbl/1-0/"
MOTOR_ROADS = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified",
    "residential", "service", "living_street", "track", "road", "construction",
}
PEDESTRIAN_ROADS = {"footway", "path", "steps", "pedestrian", "cycleway", "bridleway"}
RAIL_WAYS = {"rail", "narrow_gauge", "light_rail", "tram", "disused", "abandoned", "construction", "razed"}
AIRPORT_KINDS = {"aerodrome", "runway", "taxiway", "apron", "hangar", "terminal", "helipad", "navigationaid"}
SPACE_KINDS = {"spaceport", "launch_complex", "launchpad", "flame_trench"}


def lonlat(p):
    return [p["lon"], p["lat"]]


def is_area(element):
    tags = element.get("tags", {})
    points = element.get("geometry", [])
    if len(points) < 4 or points[0] != points[-1]:
        return False
    if tags.get("area") == "no":
        return False
    return tags.get("area") == "yes" or bool(tags.get("building") or tags.get("landuse") or tags.get("place")) or any(tags.get(k) in SPACE_KINDS for k in ("disused:aeroway", "abandoned:aeroway", "historic")) or tags.get("aeroway") in {
        "aerodrome", "apron", "hangar", "terminal", "spaceport", "launch_complex", "launchpad", "flame_trench"
    }


def inside(point, ring):
    x, y = point
    hit = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            hit = not hit
    return hit


def join_rings(parts):
    """Join only exact common source endpoints; never bridge a missing segment."""
    pending = [part[:] for part in parts if len(part) > 1]
    rings = []
    while pending:
        chain = pending.pop(0)
        while chain[0] != chain[-1]:
            found = False
            for index, part in enumerate(pending):
                if chain[-1] == part[0]:
                    chain.extend(part[1:])
                elif chain[-1] == part[-1]:
                    chain.extend(reversed(part[:-1]))
                elif chain[0] == part[-1]:
                    chain = part[:-1] + chain
                elif chain[0] == part[0]:
                    chain = list(reversed(part[1:])) + chain
                else:
                    continue
                pending.pop(index)
                found = True
                break
            if not found:
                raise ValueError("Unclosed relation ring: missing source geometry")
        if len(chain) < 4:
            raise ValueError("Degenerate relation ring")
        rings.append(chain)
    return rings


def geometry(element):
    kind = element["type"]
    if kind == "node":
        return {"type": "Point", "coordinates": lonlat(element)}
    if kind == "way":
        pts = [lonlat(p) for p in element.get("geometry", [])]
        if len(pts) < 2:
            raise ValueError("Missing way geometry")
        if len(pts) != len(element.get("nodes", [])):
            raise ValueError("Way geometry and source node IDs differ in length")
        return {"type": "Polygon", "coordinates": [pts]} if is_area(element) else {"type": "LineString", "coordinates": pts}
    if kind == "relation" and element.get("tags", {}).get("type") in {"multipolygon", "boundary"}:
        parts = collections.defaultdict(list)
        for member in element.get("members", []):
            if member["type"] != "way":
                continue
            pts = [lonlat(p) for p in member.get("geometry", [])]
            if not pts:
                raise ValueError("Missing relation member geometry")
            parts[member.get("role") or "outer"].append(pts)
        outer = join_rings(parts["outer"])
        polygons = [[ring] for ring in outer]
        for hole in join_rings(parts["inner"]):
            owners = [i for i, ring in enumerate(outer) if inside(hole[0], ring)]
            if len(owners) != 1:
                raise ValueError("Ambiguous relation hole")
            polygons[owners[0]].append(hole)
        if not polygons:
            raise ValueError("No relation outer rings")
        return {"type": "MultiPolygon", "coordinates": polygons}
    raise ValueError("Unsupported source geometry")


def feature(element):
    tags = element.get("tags", {})
    identity = f'{element["type"]}/{element["id"]}'
    props = {
        "osmType": element["type"], "osmId": element["id"],
        "osmUrl": "https://www.openstreetmap.org/" + identity,
        "name": tags.get("name:ru") or tags.get("name") or tags.get("name:en") or "",
        "tags": tags,
    }
    if "nodes" in element:
        props["sourceNodeIds"] = element["nodes"]
    if "members" in element:
        props["sourceMembers"] = [{k: m[k] for k in ("type", "ref", "role") if k in m} for m in element["members"]]
    return {"type": "Feature", "id": identity, "properties": props, "geometry": geometry(element)}


def feature_groups(element):
    tags = element.get("tags", {})
    highway, railway, aeroway = (tags.get(k) for k in ("highway", "railway", "aeroway"))
    if element["type"] == "way" and highway in MOTOR_ROADS:
        yield "roads"
    if element["type"] == "way" and highway in PEDESTRIAN_ROADS:
        yield "walking-paths"
    if element["type"] == "way" and railway in RAIL_WAYS:
        yield "railways"
    if railway in {"station", "halt", "switch", "buffer_stop", "level_crossing", "crossing"}:
        yield "rail-points"
    if aeroway in AIRPORT_KINDS:
        yield "airports"
    if aeroway in SPACE_KINDS or any(tags.get(k) in SPACE_KINDS for k in ("disused:aeroway", "abandoned:aeroway", "historic")) or tags.get("landuse") in {"military", "industrial", "brownfield"}:
        yield "facilities"
    if tags.get("place") in {"city", "town", "village", "hamlet", "neighbourhood", "isolated_dwelling", "locality"}:
        yield "places"
    if tags.get("building") and any(k in tags for k in ("name", "name:ru", "name:en", "ref")):
        yield "named-buildings"


def all_coords(geo):
    def descend(value):
        if value and isinstance(value[0], (int, float)):
            yield value
        else:
            for child in value:
                yield from descend(child)
    yield from descend(geo["coordinates"])


def haversine(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [*a, *b])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(h)))


def line_length(f):
    geo = f["geometry"]
    if geo["type"] != "LineString":
        return 0
    return sum(haversine(a, b) for a, b in zip(geo["coordinates"], geo["coordinates"][1:]))


def write_json(path, value, pretty=False):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2 if pretty else None, separators=None if pretty else (",", ":")) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Complete Overpass JSON response")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "osm")
    parser.add_argument("--endpoint", default="https://overpass-api.de/api/interpreter")
    args = parser.parse_args()
    raw = args.input.read_bytes()
    if args.input.suffix == ".gz":
        raw = gzip.decompress(raw)
    doc = json.loads(raw)
    if doc.get("remark"):
        raise ValueError("Partial/error Overpass response: " + doc["remark"])
    if not doc.get("elements") or not doc.get("osm3s", {}).get("timestamp_osm_base"):
        raise ValueError("No complete timestamped OSM source")
    groups = collections.defaultdict(list)
    for element in doc["elements"]:
        names = list(feature_groups(element))
        if not names:
            continue
        item = feature(element)
        for lon, lat in all_coords(item["geometry"]):
            if not (math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90):
                raise ValueError("Invalid WGS84 coordinates in " + item["id"])
        for name in names:
            groups[name].append(item)
    args.output.mkdir(parents=True, exist_ok=True)
    summaries = {}
    for name, features in sorted(groups.items()):
        features.sort(key=lambda f: (f["properties"]["osmType"], f["properties"]["osmId"]))
        points = [p for f in features for p in all_coords(f["geometry"])]
        extent = [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]
        collection = {
            "type": "FeatureCollection", "name": "Baikonur OSM " + name,
            "bbox": extent, "attribution": COPYRIGHT, "license": LICENSE,
            "osmBaseTimestamp": doc["osm3s"]["timestamp_osm_base"], "features": features,
        }
        filename = name + ".geojson"
        write_json(args.output / filename, collection)
        summaries[name] = {
            "file": filename, "features": len(features),
            "geometryTypes": dict(collections.Counter(f["geometry"]["type"] for f in features)),
            "vertices": len(points), "lineLengthKm": round(sum(map(line_length, features)) / 1000, 3),
            "sha256": hashlib.sha256((args.output / filename).read_bytes()).hexdigest(),
        }
    source = {
        "version": 1,
        "sourceUrl": "https://www.openstreetmap.org/#map=11/45.9256/63.4598",
        "endpoint": args.endpoint,
        "osmBaseTimestamp": doc["osm3s"]["timestamp_osm_base"],
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "sourceArchive": "source-overpass.json.gz",
        "sourceElementCount": len(doc["elements"]),
        "attribution": COPYRIGHT, "attributionUrl": "https://www.openstreetmap.org/copyright",
        "license": "ODbL-1.0", "licenseUrl": LICENSE,
        "queryFile": "baikonur.overpassql", "selectionBBoxWsen": BBOX,
        "coordinateSystem": "WGS84 longitude, latitude (GeoJSON); source coordinates are unchanged",
        "wayGeometryPolicy": "Whole selected OSM ways are retained, including endpoints beyond the selection bbox. No smoothing, snapping, geometric intersection or gap repair was applied.",
        "topologyPolicy": "Use sourceNodeIds for road/rail junctions; preserve bridge, tunnel, layer, service, disused and abandoned tags. A visual crossing alone is not a junction.",
        "museumIntegration": "Geographic source only. Existing schematic catalogue, model transforms, ownership corrections, runway display lengths, flight cycle and authored flank boundaries are not overwritten.",
        "coverageLimits": [
            "The query retrieves roads, railway, aeroway, named/ref-tagged objects, military/industrial areas and selected structures; it does not retrieve all unnamed building footprints.",
            "OSM facility outlines and names do not establish the exact anchor, orientation, dimensions or elevation of a detailed 3D model.",
            "Runway area and centerline are separate features; do not count them as two physical runways.",
            "The spaceport outline is an OSM feature, not the owner's authored flank boundary.",
            "No ownership or historical narrative was inferred from this source.",
        ],
        "layers": summaries,
    }
    write_json(args.output / "source.json", source, pretty=True)
    print(json.dumps({"osmBaseTimestamp": source["osmBaseTimestamp"], "layers": summaries}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
