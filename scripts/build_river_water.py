#!/usr/bin/env python3
"""Export genuine Syr Darya water polygons and their island holes, offline.

Uses the existing OSM snapshot plus four complete official OSM API relation
extracts. No buffer, smoothing, invented island, or coordinate adjustment is
applied. The unnamed relations fill gaps in the old name-filtered snapshot.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.dont_write_bytecode = True
from import_osm_layout import feature

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "osm"
SUPPLEMENTS = [3144105, 12609114, 12609482, 12614520]


def api_relation(path, relation_id):
    raw = gzip.decompress(path.read_bytes())
    document = ET.fromstring(raw)
    nodes = {int(e.attrib["id"]): {"lon": float(e.attrib["lon"]), "lat": float(e.attrib["lat"])}
             for e in document if e.tag == "node"}
    ways = {int(e.attrib["id"]): e for e in document if e.tag == "way"}
    source = next(e for e in document if e.tag == "relation" and int(e.attrib["id"]) == relation_id)
    members = []
    for member in source.findall("member"):
        if member.attrib["type"] != "way":
            raise ValueError("Unexpected non-way water polygon member")
        way_id = int(member.attrib["ref"])
        geometry = [nodes[int(node.attrib["ref"])] for node in ways[way_id].findall("nd")]
        members.append({"type": "way", "ref": way_id, "role": member.attrib["role"], "geometry": geometry})
    element = {"type": "relation", "id": relation_id, "members": members,
               "tags": {e.attrib["k"]: e.attrib["v"] for e in source.findall("tag")}}
    evidence = {"id": f"relation/{relation_id}", "archive": path.name,
                "url": f"https://api.openstreetmap.org/api/0.6/relation/{relation_id}/full",
                "osmUrl": f"https://www.openstreetmap.org/relation/{relation_id}",
                "version": int(source.attrib["version"]), "elementTimestamp": source.attrib["timestamp"],
                "sha256": hashlib.sha256(raw).hexdigest()}
    return element, evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify the committed layer without rewriting it")
    args = parser.parse_args()
    raw = gzip.decompress((DATA / "source-overpass.json.gz").read_bytes())
    snapshot = json.loads(raw)
    elements = {e["id"]: e for e in snapshot["elements"]
                if e["type"] == "relation" and e.get("tags", {}).get("water") == "river"}
    snapshot_time = snapshot["osm3s"]["timestamp_osm_base"]
    evidence = [{"archive": "source-overpass.json.gz", "osmBaseTimestamp": snapshot_time,
                 "url": "https://overpass-api.de/api/interpreter", "sha256": hashlib.sha256(raw).hexdigest(),
                 "relationIds": sorted(elements)}]
    extra_evidence = {}
    for relation_id in SUPPLEMENTS:
        element, record = api_relation(DATA / f"river-source-{relation_id}.osm.gz", relation_id)
        elements[relation_id] = element
        evidence.append(record)
        extra_evidence[relation_id] = record
    features = []
    for relation_id, element in sorted(elements.items()):
        item = feature(element)
        item["properties"]["sourceIslandWayIds"] = [m["ref"] for m in element["members"] if m["role"] == "inner"]
        item["properties"]["sourceArchive"] = extra_evidence.get(relation_id, {}).get("archive", "source-overpass.json.gz")
        if relation_id in extra_evidence:
            item["properties"]["sourceVersion"] = extra_evidence[relation_id]["version"]
            item["properties"]["sourceElementTimestamp"] = extra_evidence[relation_id]["elementTimestamp"]
        else:
            item["properties"]["sourceDatasetTimestamp"] = snapshot_time
        features.append(item)
    polygons = [polygon for item in features for polygon in item["geometry"]["coordinates"]]
    result = {"type": "FeatureCollection", "version": "syrdarya-water-polygons-v1",
              "attribution": "© OpenStreetMap contributors", "license": "https://opendatacommons.org/licenses/odbl/1-0/",
              "geometryPolicy": "Original WGS84 water-area rings; inner rings are actual mapped islands. No smoothing or buffers.",
              "coverage": "Syr Darya across the museum region; source polygons continue beyond both map edges.",
              "sourceEvidence": evidence, "polygonCount": len(polygons),
              "islandCount": sum(len(polygon) - 1 for polygon in polygons), "features": features}
    encoded = json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n"
    if args.check:
        if (DATA / "river-water.geojson").read_text() != encoded:
            raise ValueError("River layer does not match the preserved source rings")
    else:
        (DATA / "river-water.geojson").write_text(encoded)
    print(json.dumps({"features": len(features), "polygons": result["polygonCount"], "islands": result["islandCount"]}))


if __name__ == "__main__":
    main()
