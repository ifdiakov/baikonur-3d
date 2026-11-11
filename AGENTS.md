# Baikonur 3D — short working entrypoint

Read `docs/CURRENT_WORK.md` first. Then read only the files needed for the current task. `PROJECT_CONTEXT.md` and `docs/WORK_STATUS.md` are retained history: search relevant headings instead of loading them in full on every turn.

## Delivery
- Preserve the complete approved evening museum: fog, lights, flanks, transport, models, menu and reconstruction controls. No visual simplification to speed up work.
- One task, one local change set, one candidate, one verified main update. Reuse the existing checkout. Do not download the whole museum or create another workflow for a minor correction.
- Test the exact files that will be committed. CI must not regenerate and push application files while another publication is running. Build affected road caches or workers before the candidate, only when their inputs changed.
- Built-in Pages is the production publisher. `nonblocking-detail.yml` is now read-only syntax/import validation plus a short real-scene check; it does not publish. The historical OSM regression runs only on explicit manual request. Feature-specific checks remain mandatory for the affected feature.
- Use `node tests/delivery-policy.mjs`, `node tests/ci-reliability.mjs`, and `node --experimental-vm-modules scripts/ci/fast-check.mjs` for pipeline edits. A source check does not replace a visual/functional check.
- Inspect a failed report, fix the identified cause, then rerun only the affected check. Never repeatedly rerun until green or claim skipped tests passed.
- Inspect run status at meaningful stage boundaries; do not flood the conversation with repeated raw API payloads. Save reports in the workspace and communicate compact findings. Cap waits and report blocked stages honestly.
- Every completion claim needs the actual public files and the relevant successful browser scenario. Commit or deploy success alone is insufficient. A brief smoke test does not prove every feature or physical-device performance.
- After an interruption, record changed files, exact revision, passed checks and unfinished items in `docs/CURRENT_WORK.md` or a linked task report before starting another task. Do not lose earlier work or silently mark it complete.
- Use authorized GitHub write tools for publication; never embed credentials in source or ask the user to send a token.
- Historical facts and asset licenses must be verified. Do not remove required attribution.
- Final update: four short viewpoints (3D, UI, optimization, QA), with actual changes and remaining limitations. Do not invent independent agents.
- End each user-facing message with `[Музей](https://ifdiakov.github.io/baikonur-3d/museum.html) · [Админка](https://ifdiakov.github.io/baikonur-3d/workshop.html)`.
