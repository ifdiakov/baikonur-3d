# UKSS native source converter

Offline recovery of the specific `ukss_scaled.max` identified in
[source-summary.json](source-summary.json). This is a source preservation tool;
it does not modify museum runtime files or publish an asset.

Requires Python **3.11+** and the official **Blender 4.2.23 LTS** executable,
build `d0cbe84903e8`. NumPy comes from Blender; no `pip install` is needed.

From the repository root:

```sh
python3 scripts/source-models/ukss/convert.py \
  --source "../private-source/ukss_scaled.max" \
  --output "../private-output/ukss" \
  --blender "../tools/blender-4.2.23-linux-x64/blender"
```

Add `--reuse-checkpoint` to reuse `ukss_import_fast_base.blend` and its matching
`ukss_import_fast_report.json` in the output directory. Use `--validate-only`
without `--source` to check an existing recovered GLB and its manifest.

Every output, including large models, logs and per-node reports, goes to the
explicit `--output` directory. The converter never downloads software or sends
source data anywhere. Blender uses `--factory-startup --disable-autoexec`.

To produce a deterministic source-only archive, including the full guide:

```sh
python3 scripts/source-models/ukss/bundle.py \
  --output "../private-output/ukss-converter.tar.gz"
```

See [the full conversion guide](../../../docs/ukss-source-model.md) for pinned
downloads and checksums, source visibility uncertainty, reconstruction
qualifications, the separate `Bordo` mock-up, and licensing.

## License

The converter and included upstream code are distributed under
**GPL-2.0-or-later**. Original upstream copyright/SPDX notices are retained;
the complete GPL v2 text is in
[COPYING-GPL-2.txt](io_scene_max/COPYING-GPL-2.txt). This code license does not
relicense the user's MAX file, photographs or recovered scene assets. None of
those large source or generated assets is included in this directory.
