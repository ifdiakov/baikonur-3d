# Mriya / Buran exhibit

Source: user-provided `MriyaBuran.7z`, main `model.obj` (2016 3ds Max export).
Converted to GLB; welded, simplified, material batches joined and Meshopt compressed.

| Asset | Bytes | Triangles | Mesh draws |
| --- | ---: | ---: | ---: |
| near-v1.glb | 1,429,676 | 286,422 | 5 |
| far-v1.glb | 585,748 | 91,080 | 5 |

Metre-based coordinates, Y up, nose toward -X. The exhibit recentres the asset,
rotates it to +Z and uses the airport's existing 0.28 scale. No runway, airport
placement, map or other exhibit scale is changed. Ground clearance and a separate
32-wheel parked undercarriage are interpretive additions for the museum scene.

The source export has no diffuse texture bindings. Its preliminary grey / coloured
materials are retained; original photographic paint and thermal-tile materials
still need reconstruction. The supplied TGA bump image was converted to a browser
compatible PNG normal map, then compressed to WebP. Both assets validate with no
glTF errors and require EXT_meshopt_compression, EXT_texture_webp and
KHR_mesh_quantization. The decoder and its MIT licence are in src/vendor.

The detailed asset loads progressively, retaining the procedural aircraft if
loading fails. Three.js LOD selects the near mesh within approximately 100 world
units, with hysteresis to avoid flicker. Only one detail level is drawn at a time.
