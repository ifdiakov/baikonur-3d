# TUA: native source recovery and museum preparation

The transporter model originates from the user's
`Transporter_railroad_assambly.MAX`. The offline converter preserves the full
assembly and creates a separate, auditable raw GLB. A later preparation stage
selects the transporter and compresses a shared museum asset. The current detailed profile restores the source railings, ladders and walkway outlines requested by the owner.
The original MAX is unchanged.

## Source and pinned tools

| Item | Recorded value |
|---|---|
| Original filename | `Transporter_railroad_assambly.MAX` |
| Source bytes | 7,610,880 |
| Source SHA256 | `304c2317d335a4787d3748fb4e52ae8f537e48e04cf63057e4374f975b6a650e` |
| Source nodes | 2,786 |
| Repeated display names | 606 names occur more than once; identity uses numeric source indices |
| Blender | 4.2.23 LTS, build `d0cbe84903e8` |
| Importer | `io_scene_max` 1.9.2 |
| Importer commit | `37db107126f956f7219152671443080360565691` |

The pinned Blender archive is available from the
[official Blender download server](https://download.blender.org/release/Blender4.2/blender-4.2.23-linux-x64.tar.xz).
Its SHA256 is
`bea0eb3146be13eae6225409a117b215184f41b7f79e799f97cb3abb8f6dc404`.
The importer comes from the
[upstream repository at the pinned commit](https://github.com/nrgsille76/io_scene_max/tree/37db107126f956f7219152671443080360565691).
The repository already vendors it once under
[`scripts/source-models/ukss/io_scene_max/`](../scripts/source-models/ukss/io_scene_max/).

The TUA configuration checks all three importer source/manifest hashes. It also
pins the exact shared parser, transform and primitive helper files. No software
is downloaded by the converter. Python 3.11 or newer launches the stages;
Blender supplies its own NumPy dependency. Every Blender invocation uses
`--background --factory-startup --disable-autoexec --threads 4`.

## Reproduce the full recovery

From the repository root:

```sh
python3 scripts/source-models/tua/convert.py \
  --source "../private-source/Transporter_railroad_assambly.MAX" \
  --output "../private-output/tua" \
  --blender "../tools/blender-4.2.23-linux-x64/blender"
```

All paths are CLI arguments. The input may be renamed, and input/output paths
may contain spaces. The content hash must match the documented source. An
output directory inside `scripts/source-models/` is rejected to keep model
payloads outside the converter sources.

The baseline import is saved before recovery. To repeat just source geometry
recovery, place the matching `tua_import_base.blend` and
`tua_import_report.json` in the output directory and add `--reuse-checkpoint`.
The source file is still required, because its saved modifier and primitive
parameters are used again.

For a read-only geometry validation without the source MAX or a new import:

```sh
python3 scripts/source-models/tua/convert.py \
  --validate-only \
  --output "../private-output/tua" \
  --blender "../tools/blender-4.2.23-linux-x64/blender"
```

Validation reads `tua_recovered_raw.glb` and
`tua_recovered_raw_report.json`, then writes `tua_glb_validation.json` and a
validation log. The recovered model itself is not modified.

To package the code and its required shared dependencies:

```sh
python3 scripts/source-models/tua/bundle.py \
  --output "../private-output/tua-converter.tar.gz"
```

The portable archive retains sibling `tua/` and `ukss/` directories. After
extracting it, run `python3 tua/convert.py` from `tua-converter/` with the same
arguments. The bundle has a fixed allowlist, sorted members, normalized archive
metadata and a SHA256 manifest. It contains no model, checkpoint, thumbnail,
large per-node report, private source URL or temporary download credential.

## What the converter recovers

The inventory reads the OLE compound document, dynamic class directory and
bounded numeric/string chunks. Embedded scene scripts are not executed.
Editable Mesh and Editable Poly geometry is imported by the pinned importer.
Unsupported primitive and spline geometry is initially represented by explicit
placeholders, then recovered from source parameters through the Blender data
API. The final stage requires zero remaining deferred nodes.

| Geometry or source operation | Recovered count | Method |
|---|---:|---|
| Box | 78 | Saved dimensions and subdivisions; source base datum |
| Cylinder | 305 | Saved radius, height, radial/axial segmentation and end caps |
| Sphere | 4 | Two direct and two under Mirror; saved radius and segments |
| Tube | 1 | Hollow annular tube with saved inner/outer radii and height |
| Renderable Line / SplineShape | 966 | Saved knots, Bezier handles, thickness, radial sides and interpolation steps |
| Mirror | 56 | Saved gizmo and ModContext; reflected winding corrected |
| Extrude | 10 | Saved closed spline, height, end caps and ModContext |
| Smooth | 13 | Saved angle boundary applied to mesh normals |
| Boolean | 2 | Stored operand A and its PRS; neither source node has operand B |

The 966 direct spline nodes are actual renderable geometry in this source.
Their sections are mostly 0.03 source units across with three radial sides;
six use four sides. They contribute 48,008 triangles to the full raw file.
They are preserved at this stage even though many are candidates for later
display simplification.

All nodes are bound by source scene index. Repeated names therefore do not
overwrite objects or change parenting. Saved PRS, mesh pivots and source parent
relationships are retained. The 184 nontrivial ScaleValue bases are represented
by helper nodes whose two local TRS matrices multiply to the saved transform.
This preserves the source hierarchy without substituting a bounding-box
normalization or flattening all transforms.

The shared helpers are reused from the sibling UKSS converter by selecting
reviewed function/class declarations from hash-pinned files. TUA replaces the
source-specific constructor and uses its own inventory. UKSS stage entry points
and UKSS-specific node/count assertions are not run.

## Coordinates and placement

The author's physical scene uses **Y as vertical** and **+Z along the assembly**.
Source numeric coordinates, poses and units remain unchanged in the recovered
Blender checkpoint. The glTF exporter performs its standard conversion
`(X, Y, Z) → (X, Z, −Y)`.

Consequently, a raw Three.js preview uses a root X rotation of `+π/2` to restore
the author's physical orientation. Museum preparation must account for that
basis conversion before applying its own uniform scale and placement. No
museum placement is baked into the raw GLB.

The complete assembly's actual exported vertex span is approximately
25.300000 × 100.000000 × 35.188294 in glTF coordinates. This includes the payload,
locomotives and source rails; it must not be used as the transporter-only
placement anchor.

## Full raw result and validation

| Measurement | Full recovered source |
|---|---:|
| Source node identities preserved | 2,786 / 2,786 |
| Scale-basis helper nodes | 184 |
| Total glTF nodes | 2,970 |
| Blender mesh datablocks | 2,768 |
| Nonempty glTF mesh nodes | 2,767 |
| glTF mesh primitives | 6,211 |
| Triangles | 137,269 |
| Named source materials | 20 |
| External images | 0 |
| Raw GLB bytes | 8,071,444 |
| Maximum Blender/source world-matrix error | 4.77 × 10⁻⁷ |
| Maximum exported glTF/manifest world-matrix error | 3.88 × 10⁻⁶ |

The recovered raw GLB SHA256 is
`1105ff79202b2b42e86cc3150e41e2d4d01667d0b6ae25a72283aabea43c065a`.
The counts above describe full preservation, before selecting or simplifying
the museum exhibit.

The independent validator parses the GLB directly. It checks the file header
and buffer bounds, finite vertex attributes, triangle index ranges, unique
source IDs, full source-ID coverage, all exported world matrices, triangle
counts and absence of external image dependencies. Source SHA256 is checked
before and after conversion. Source identities and transform tests are
separate from the visual inspection of the full assembly and vehicle-only
views.

Expected outputs in the chosen private directory include:

- `source-inventory.json`, `source-classes.json` and an embedded thumbnail when
  available;
- `tua_import_base.blend`, `tua_import_base.glb` and `tua_import_report.json`;
- source geometry audit plus primitive and modifier recovery reports;
- `tua_recovered_raw.blend`, `tua_recovered_raw.glb` and its per-node report;
- `tua_glb_validation.json` and stage logs.

## Recovery qualifications

This is an audited local recovery of this particular source, not an Autodesk
evaluation of every modifier or a general-purpose MAX converter.

The spline centerlines, saved handles, diameters and radial side counts are
source-based. Ring frames use parallel transport, and sampling uses the saved
interpolation steps. Exact native MAX cross-section orientation and optimizer
tessellation are not claimed. No polygon reduction is applied to the raw file.

Smooth modifier angles and flags are decoded. Blender sharp-edge normals
implement the angle boundaries; native MAX smoothing-group IDs and its
`preventIndirect` propagation are not reproduced. Materials are converted to
glTF-compatible Principled/PBR properties, so shader appearance is not a claim
of pixel equivalence to the old MAX renderer.

`VIFS1031`, source ID **35591**, consists of two vertices and one original face
`[0, 1, 0]`. Its zero-area face cannot provide visible surface geometry. The
original node is retained in glTF without a mesh. This explains the one-object
difference between Blender mesh datablocks and nonempty glTF mesh nodes.

Eight meshes have no assigned source material: **11686, 10461, 11234, 12111,
12563, 13336, 21383, 23463**. The raw file retains their unassigned slots.
The first six belong to the locomotive assemblies; the final two form a
mirrored pair of transporter details. A display material for those retained
details is a museum decision and should be recorded in its manifest.

Object-level source hidden/renderable flags have not been reliably decoded.
The raw conversion retains all original identities rather than treating a
missing flag as proof of visibility. The explicitly decoded spline renderable
parameters are a separate, verified fact.

## Museum preparation

The separate [`scripts/prepare-tua-asset.mjs`](../scripts/prepare-tua-asset.mjs)
stage creates the actual museum asset. Its reviewed selection and calibration
are stored in [`scripts/tua-detail-policy.json`](../scripts/tua-detail-policy.json).
It requires the validated raw GLB SHA256 listed above.

Install the pinned preparation dependencies outside the source converter:

```sh
npm install --prefix "../tools/tua-assets" --no-save --package-lock=false \
  @gltf-transform/core@4.5.1 \
  @gltf-transform/extensions@4.5.1 \
  @gltf-transform/functions@4.5.1 \
  meshoptimizer@0.25.0
```

Then run from the repository root:

```sh
node scripts/prepare-tua-asset.mjs \
  --source "../private-output/tua/tua_recovered_raw.glb" \
  --output "assets/models/tua" \
  --deps "../tools/tua-assets/node_modules" \
  --detail full
```

`full` is the default and the current production profile. It retains all selected transporter
geometry while excluding the payload, locomotives and source rails. The optional
`--detail macro` is still available for comparison in a separate output directory.
The complete original assembly remains in the recovered raw GLB.
The preparation script writes `model-v2.glb` and `manifest-v2.json` in its
explicit output directory. This separate stage is part of the repository and
is not included in the source-recovery archive.

### Selection and actual geometry reduction

The museum asset contains the transporter without its transported payload,
locomotives or source rail geometry. These are excluded by exact source
subtree identity:

| Source root | Content excluded from the transporter exhibit |
|---|---|
| 10355 | First locomotive/rail branch |
| 11898 | Second locomotive/rail branch |
| 35293 | Red payload assembly |

Selection leaves **2,351 meshes and 93,800 triangles**. The detailed production
profile now retains all **920 reviewed narrow spline objects**, contributing
**45,856 triangles**, as well as the 46 thicker splines. These source objects
supply the handrails, ladder runs, walkway edges and other repeated structure
visible in the owner's close-up photographs. No independent bolts are added.
The earlier macro profile and its 47,944-triangle result remain part of the
release history; they are no longer the displayed asset.

All **320 running-gear parts**, totaling **10,432 triangles**, are preserved:
128 wheels, 64 axles and 128 other bogie components. Main frames, pierced
members, forks and hydraulic mechanisms retain their source geometry. The
source IDs and before/after counts are recorded in the policy and manifest.

| Geometry balance | Triangles |
|---|---:|
| Complete recovered assembly | 137,269 |
| Excluded payload, locomotives and source rails | −43,469 |
| Detailed museum transporter | **93,800** |
| Removed narrow spline triangles in this profile | **0** |
| Retained narrow spline triangles | **45,856** |

The retained 2,351 source meshes are joined by material. The final binary has
**16 draw primitives, 16 materials and 94,984 vertices**, with no textures or
external resource dependencies. Material roles are retained, including `Loco`
names also used on transporter parts. Unassigned objects **21383** and **23463**
receive the existing `Tube` material. The palette uses muted grey-green steel
and weathered yellow forks interpreted from the supplied photographs.

Compression uses `EXT_meshopt_compression`, **16-bit positions** and **12-bit
normals**. The production asset is **542,308 bytes**, SHA256
`d9d5f8a28900d0bc84d0abc24bd86bd259c1e288a4daf9e1bd5f1b292df5d988`.
One binary and one set of decoded geometry/material resources supply both
museum placements: **187,600 triangles and 32 draw primitives for the pair**.

### Exact transforms before hierarchy removal

Source ScaleValue helper chains can produce affine world matrices containing
shear. The preparation stage captures every retained mesh's complete world
matrix and bakes `normalization × worldMatrix` directly into its geometry
**before** removing or flattening the hierarchy. It then creates direct scene
nodes and joins materials. Decomposing the hierarchy first can distort wheels
and move their lower surfaces, even when the nominal object transforms appear
reasonable.

The accepted asset's actual bounds agree with the calibrated full transporter
to within 0.001 local unit. Its lower bound is approximately **−0.123205 m**,
matching the source flange position of **−0.122995 m** before quantization.
The preparation stage does not move the model up to make its lowest vertex
touch zero.

Normalization uses the single uniform scale **1.0** (one local unit is one metre), with physical source
origin `[-0.0014610663056373596, -14.5, 25.500000713507283]`:

```text
local metres = [rawGlb.x, −rawGlb.z, rawGlb.y] − physicalOrigin
```

Local Y=0 is the original rail-head datum. The two MIK-local placements are
`[-71, 4.305, -183]` and `[-19, 4.305, -183]`, each rotated by π around Y.
The enclosing MIK keeps its scale 0.14 and yaw −π/4. The source's authored
transport pose remains unchanged. Its actual envelope is approximately
**61.215 m long × 25.300 m wide × 19.444 m high**. The [published TUA
reference table](https://www.buran.ru/htm/transp.htm) gives 56.3 × 29.5 × 21.2 m
and a 20 m distance between the two railway axes. The native authored pose
and the published envelope are recorded separately; individual axes are not
stretched to force a match. The source wheel-centre gauge, approximately
1.629862 m, is likewise retained without squeezing the original wheelsets.
The rendered railway uses the museum's common **1.52 m** gauge. Its **.20 m**
heads fully support the original **.08 m** wheel treads despite the small
difference between source wheel centres and rail centres.

### Horizontal rocket anchors

The excluded source payload establishes the mounting axis independently of
the new rocket GLB. Its central body `MaketC` is centred at transporter-local
Y **15.360346675 m**; the complete source payload starts at Z
**−26.070907001 m**. The exposed mount is therefore
`position=[0,15.360346675,-26.070907001]`, `rotation.x=+π/2`. A rocket whose
longitudinal axis is +Y and whose aft datum is Y=0 points along transporter
+Z. The normalized Buran side lies at rocket −Z, which rotates upwards.

`buildMik112(...).rocketMounts()` returns hall and pair mounting poses in the
MIK root's metre coordinates. The TUA poses include their existing yaw and
rail-head placement. The hall mount is `[-35,15.360346675,-35]` with the same
X rotation, inside the middle 40 m high bay. Two simple museum cradles support
the exhibit; their shape is not presented as a surveyed historical fixture.

### Continuous museum rails

[`src/tua-rails.js`](../src/tua-rails.js) adapts only the exposed
`mikExhibit.transporterRails` group. `adaptTuaRails(mikExhibit, manifest)` builds
eight continuous rail meshes and one instanced sleeper batch before replacing
the old children. Shared scene geometry and materials are not disposed.
Placement transforms, actual contact height and the four external track centre
axes stay unchanged. The low-hall track and other museum rails use the same
shared profile from `src/rail-profile.js`.

The four external track centre axes remain at X **−82.4, −59.6, −30.4, −7.6**.
The running axes beneath the vehicles now lie at **−81, −61, −29, −9**,
matching each source vehicle's **20 m** double-track spacing. Each rail
runs from Z **−258.5** to **−5.5**, with head Y **4.305**, body height **0.27** and
head width **0.20**. The gauge remains **1.52 m** throughout; only the track-centre
axis changes at the following stations:

| MIK-local Z | Individual gauge | Track axes |
|---:|---:|---|
| −258.5 | 1.52 m | External entry axes |
| −238 | 1.52 m | External entry axes |
| −218 | 1.52 m | Vehicle running axes |
| −148 | 1.52 m | Vehicle running axes |
| −128 | 1.52 m | External entry axes |
| −5.5 | 1.52 m | External entry axes |

The two 20 m transitions use monotone smoothstep easing for track-centre
position, independently of gauge; the vehicle section and external end
sections are straight. The entire wheel-surface range
Z **−209.968352568 to −156.031647445** lies inside the straight running section.
The 420 instanced sleepers share the same **2.6 × .16 × .32 m** dimensions. Rail
geometry totals 2,784 triangles, with continuous faces across the bends.

The helper exports `gaugeAt`, `trackAxisAt`, `createTuaRailGeometry` and
`resolveTuaRailProfile` for independent geometry checks. Returned metadata
records counts, stations, segments, head endpoints and the preserved entry
vectors. Local verification checked actual rail buffers, sleeper matrices,
768 head raycasts through the actual decoded wheel widths, unchanged external world coordinates and the absence of
the old wide rails beneath the vehicles.

The asset manifest preserves the original source calibration, selection,
protected running gear, placement and camera. Its older gauge-adaptation
recommendation is historical; the current runtime profile owns railway gauge
and head width. The source converter does not modify runtime files or publish
an asset.

## License and source references

The converter and upstream importer code are **GPL-2.0-or-later**. The upstream
copyright/SPDX notices are retained, and the complete license text is included
through the shared importer. This license applies to converter code; it does
not relicense the user's original model, photographs or recovered scene assets.
Those files are excluded from the source-code archive.

Parameter interpretation follows the saved source records and these Autodesk
primary references:

- [SplineShape and rendering parameters](https://help.autodesk.com/cloudhelp/2021/ENU/3DSMax-MAXScript/files/GUID-6C6A35EB-DD5F-40C1-9869-0938849F6842.htm)
- [Tube parameters](https://help.autodesk.com/cloudhelp/2018/ENU/MAXScript-Help/files/GUID-924ACD1D-2B90-4CEF-A28B-4DCF5498E592.htm)
- [Mirror modifier](https://help.autodesk.com/cloudhelp/2023/ENU/MAXScript-Help/files/3ds-Max-Objects-and-Interfaces/Modifier-MAXWrapper-and/Modifier-and-SpacewarpModifier/Modifiers/Parametric-Modifiers/GUID-20733738-BEBA-42D8-83B6-6CC3DB5CB803.html)
- [Extrude modifier](https://help.autodesk.com/cloudhelp/2024/ENU/MAXScript-Help/files/3ds-Max-Objects-and-Interfaces/Modifier-MAXWrapper-and/Modifier-and-SpacewarpModifier/Modifiers/Mesh-Editing/GUID-C6D6E1AB-915F-47F6-8EC0-7955623CA5B3.html)
- [Smooth modifier](https://help.autodesk.com/cloudhelp/2021/ENU/MAXScript-Help/files/3ds-Max-Objects-and-Interfaces/Modifier-MAXWrapper-and/Modifier-and-SpacewarpModifier/Modifiers/Mesh-Editing/GUID-2147DA88-06E0-4F90-B358-E98011E776B6.html)
- [ScaleValue transform basis](https://help.autodesk.com/cloudhelp/2023/ENU/Max-Developer-Help/cpp_ref/class_scale_value.html)
