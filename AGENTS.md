# AI agent instructions — Baikonur 3D

Before making changes, read [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) and [docs/WORK_STATUS.md](./docs/WORK_STATUS.md). They contain the consolidated specification and exact completion/pending status.

- Inspect current code and latest user requests; the specification includes requests that may not yet be implemented.
- Prefer implementing and committing working changes to merely describing how to do them.
- Never claim deployment or successful verification without evidence for the actual published revision. A commit, a successful deploy step, or a partial report alone is not completion.
- Preserve existing behavior and approved appearance; latest explicit user requirements override older conflicting ones. Never simplify the museum's appearance to speed up testing.
- After each substantive change, update PROJECT_CONTEXT.md and WORK_STATUS.md: requirements, decision, implementation status, remaining issues, date, and commit or run reference.
- Keep each task narrow. Reuse existing tests and checked-out sources; do not create another release workflow for every small correction. Prefer local diagnosis and one atomic change set.
- Do not poll the same unchanged status repeatedly, restart passing tests without a changed input, or rerun failures until green. Inspect the saved failure, fix its cause, and preserve the failed evidence.
- Use scripts/ci/impact.mjs and the existing release workflow for targeted checks. Missing scope information requires full checks, never less validation. Skipped tests are not passed tests.
- Commit workflow changes through the authorized user connector; the built-in Actions token does not have workflows-write permission. Policy CI is read-only and must not try to push workflow changes.
- Verify geographic/historical claims and respect third-party asset licenses.
- Provide four short review viewpoints (3D, interface, models/optimization, QA) without inventing independent agents. End every user-facing message with Museum and Admin links from PROJECT_CONTEXT.md.
