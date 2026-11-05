# Cached transport load for the main museum entrance

## Architecture (November 5, 2026)

- OSM source data and all geometry-authoring algorithms remain untouched.
- \`scripts/build-road-lod.mjs\` compiles the two deterministic overview
  networks into \`data/osm/road-lod-prebuilt-v1.json\` (645,170 bytes).
- \`scripts/build-transport-bake.mjs\` runs the *real* live renderer in Chromium
  and extracts transportation routes, ground-protection corridors, object
  metadata, station anchors and train/car paths. No 3D mesh arrays are carried
  in the runtime metadata.
- \`data/osm/transport-geometry-bake-v1.json.gz\` (463,071 bytes) replaces the
  first version's oversized 61 MB 3D JSON. This lean cache is conditionally
  restored by \`src/transport-bake.js\`.
- The fast route-cache entrance runs in a tested **opt-in mode** (`?fastRoads=1`).
  Normal visits still use full `buildOsmTransportNetwork` until the compiled
  surface matches all exact owner road cutouts and material masks.
- At close range, the exact source renderer can build the full geometric
  roads, railheads, terminals and bridges. The cinematic introduction must not
  be interrupted by this operation.
- Normal visits and direct links retain the original full-detail startup.
  The first auto-enabled version was reverted when the road-editor browser
  test detected absent source asphalt and shoulder cutouts.
- If the gzip asset is unavailable, outdated, cannot be decompressed, or its
  metadata fails structural checks, startup automatically uses the original
  full road renderer.
- Emergency rollback for the experimental mode: \`?legacyRoads=1\`.
- Debug fast path for direct inspection: \`?fastRoads=1\`.

## Verified baseline

CI cold-load measurements in Chromium, separate runs:
- previous full transport startup ~48.8 s until first frame;
- compact-cached route implementation measured ~27.3 s (earlier version)
  and passed end-to-end browser verification after reducing cache size.
This is not a controlled browser/network A/B test, so treat figures as
preliminary until additional repeated CI measurements are available.

## Source invalidation

Rebuild the cached transportation metadata after edits to OSM files,
authoritative owner road edits, display positions, site geometry placement
or any source-road algorithm. Do not republish the generated cache under the
old fingerprint if the source network has changed. The complete OSM GeoJSON
remains the authoritative source for close detail.
