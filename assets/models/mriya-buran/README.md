# Mriya / Buran exhibit

Source: user-provided `MriyaBuran.7z`, main `model.obj` (2016 3ds Max export).
Converted to GLB; welded, simplified, material batches joined and Meshopt compressed.

| Asset | Bytes | Triangles | Mesh draws |
| --- | ---: | ---: | ---: |
| near-v2.glb | 2,176,700 | 294,643 | 36 |
| far-v2.glb | 1,188,432 | 109,952 | 36 |

Metre-based coordinates, Y up, nose toward -X. The exhibit recentres the asset,
rotates it to +Z and uses the airport's existing 0.28 scale. No runway, airport
placement, map or other exhibit scale is changed. Ground clearance and a separate
32-wheel parked undercarriage are interpretive additions for the museum scene.

The v2 material reconstruction restores the supplied UV textures: white An-225,
red fuselage stripe, 387 / USSR registration, cockpit, nacelles and tail markings.
Buran has white upper surfaces, dark nose and thermal underside, modelled tiles,
Cyrillic title and USSR flag. The parked-aircraft photograph in the owner's
Yubileiny reference folder is the principal colour reference; exact source links
and asset statistics are recorded in `paint-v2.json`. Some small thermal areas are
interpreted from the photographs. Original v1 files are retained for old links.

Assets use EXT_meshopt_compression, EXT_texture_webp and KHR_mesh_quantization.
The decoder and its MIT licence are in src/vendor. Textures are at most 2048 px
near / 1024 px far. Material restoration adds texture batches while keeping each
detail level at 36 mesh draws.

`scripts/build-mriya-materials.mjs` takes the unsimplified GLB converted from the
original OBJ, the extracted archive directory, and an output GLB path. It depends
on `@gltf-transform/core` and `sharp`; mesh indices refer to that original export.
Then run glTF Transform 4.5.1 `optimize` with Meshopt and WebP: near uses
`--texture-size 2048 --simplify-error 0.0005 --simplify-ratio 0.12`, far uses
`--texture-size 1024 --simplify-error 0.002 --simplify-ratio 0.03`.

The detailed asset loads progressively, retaining the procedural aircraft if
loading fails. Three.js LOD selects the near mesh within approximately 100 world
units, with hysteresis to avoid flicker. Only one detail level is drawn at a time.

Browser verification covers both loaded levels, dimensions, selection, mobile
layout, day/evening presentation, shader diagnostics and load errors.
