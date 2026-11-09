# AI agent instructions — Baikonur 3D

Before making changes, read [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) in full. It contains the consolidated product specification, historical requirements, scene details, UX rules, known defects and development workflow.

- Inspect current code and latest user requests; the specification includes requests that may not yet be implemented.
- Prefer implementing and committing working changes to merely describing how to do them.
- Never claim deployment or successful verification without evidence.
- Preserve existing behavior; latest explicit user requirements override older conflicting ones.
- After each substantive change, update PROJECT_CONTEXT.md in the same change set: relevant requirements, decision, implementation status, remaining issues, date, and commit or PR reference where available.
- Verify geographic/historical claims and respect third-party asset licenses.
- Keep this file concise; the canonical product context is PROJECT_CONTEXT.md.

- After every release provide three plain-language role reports: 3D graphics + asset preparation; interface; testing/performance. Distinguish completed changes, measured results and limitations. Never invent independent agents.
- Public museum.html must not load authoring tools or raw GIS at startup. Workshop workshop.html is generated from index.html. Isolate local drafts from publication; never store GitHub credentials in client code.
