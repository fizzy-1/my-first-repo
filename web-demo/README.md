# Web demo (browser-only)

An interactive, static version of the Executive Workspace that runs entirely in the browser on a
snapshot of the demo data, so it can be hosted as a plain web page (it is published as a Claude
artifact: https://claude.ai/artifact/8U6cj2QWHVABzXnMbxCWjU). It is a preview of the product, not
the live system: there is no server, all demo data ships with the page, and changes are kept only in
the viewer's browser.

## Status

- Done: `index.html` (design tokens, script loading), `core.js` (store with per-browser edits,
  persona/RBAC helpers, hash router, UI kit, validated SVG charts, kanban, tables), `app.js` (shell:
  role-filtered sidebar, "Viewing as" persona switcher, notifications, demo banner with reset,
  toasts, router), `lib.js`, `assets.js`, `data.json`.
- To do: the module views in `modules/*.js`. `dashboard.js` is a small smoke test; the others are
  empty placeholders (the published page shows "This section is still being built" for them).
  Planned split: dashboard + intelligence, finance + approvals, operations (schools, marketing,
  academic, technology), workspace (tasks, meetings, calendar, documents, notifications, search),
  people (team, strategy, admin, profile).

## Regenerating the pieces

```bash
# Data snapshot (needs the seeded database)
npx tsx --tsconfig scripts/tsconfig.json scripts/export-demo-snapshot.ts web-demo/data.json

# lib.js — the app's real src/lib bundled for the browser (labels, formatting, SAST dates,
# projections model, RBAC). Create a temporary entry file under src/ that re-exports them:
#   export * as labels from "@/lib/labels"; export * as format from "@/lib/format";
#   export * as dates from "@/lib/dates"; export * as projections from "@/lib/projections";
#   export * as rbac from "@/lib/rbac";
npx esbuild src/__weblib_entry.ts --bundle --format=iife --global-name=IALib --minify --outfile=web-demo/lib.js
```

`assets.js` holds the Lucide icon path data (ISC licence) and the crest image.

## Testing locally

`node web-demo/tools/test-harness.mjs <persona> <#path> [...]` serves this folder, screenshots each
route (env `SCHEMES=dark,light`, `W=390` for phone, `SHOTS=<dir>`) and reports browser errors and
horizontal overflow. The page loads React 18.3.1 and htm 3.1.1 from cdnjs/jsDelivr; where those
CDNs are blocked, the harness serves local copies from `web-demo/vendor/` (download them with
`npm pack react@18.3.1 react-dom@18.3.1 htm@3.1.1`). Personas: sipho, ayesha, johan, nomvula,
pieter, kagiso, tshepo, bongani.
