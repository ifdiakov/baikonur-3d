# TUA native source converter

Offline recovery of the exact `Transporter_railroad_assambly.MAX` identified in
[source-summary.json](source-summary.json). The complete recovered scene retains
the transporter, payload, locomotive assemblies, source rails and small details.
The separate museum preparation stage selects and simplifies the transporter.

Requires Python **3.11+** and official **Blender 4.2.23 LTS**, build
`d0cbe84903e8`. NumPy comes from Blender; no `pip install` is needed.

From the repository root:

```sh
python3 scripts/source-models/tua/convert.py \
  --source "../private-source/Transporter_railroad_assambly.MAX" \
  --output "../private-output/tua" \
  --blender "../tools/blender-4.2.23-linux-x64/blender"
```

The original filename is not required; the source size and SHA256 are enforced.
All outputs, including logs and large per-node reports, stay in `--output`.

Use `--reuse-checkpoint` with `tua_import_base.blend` and its matching
`tua_import_report.json` already present in the output directory. Use
`--validate-only` without a source file to validate an existing recovered GLB
and its report. The pipeline downloads nothing, runs with
`--factory-startup --disable-autoexec`, and never executes scripts from a model.

The sibling `../ukss/` directory provides one pinned copy of `io_scene_max` and
three shared helper source files. Their hashes are checked before use. The
TUA converter loads only the reviewed generic declarations; it does not run
UKSS source indexing, recovery, or normalization.

To create a deterministic portable source archive, including those dependencies:

```sh
python3 scripts/source-models/tua/bundle.py \
  --output "../private-output/tua-converter.tar.gz"
```

The archive contains `tua/` and `ukss/` sibling directories under
`tua-converter/`. Run `python3 tua/convert.py` from its root with the same CLI.

See [the full conversion guide](../../../docs/tua-source-model.md) for the
coordinate convention, recovery qualifications, validation and museum selection.

## License

Converter code and included upstream code are **GPL-2.0-or-later**. Upstream
copyright and license notices remain in the shared importer; the complete GPL
text is [COPYING-GPL-2.txt](../ukss/io_scene_max/COPYING-GPL-2.txt). This code
license does not relicense the user's MAX file, photographs or scene assets.
The converter directory and source archive exclude those assets.
