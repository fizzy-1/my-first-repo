// Builds preview/index.html (the online preview page) from public/index.html.
// Publish it with these files next to it: icons.js, metrics.js, ui.js, app.js and crest.png from public/, plus preview/mock-api.js and preview/demo-data.js.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "../public/index.html"), "utf8");
const style = source.match(/<style>([\s\S]*?)<\/style>/)[1];
const boot = source.match(/<div id="root">[\s\S]*?<\/div><\/div><\/div><\/div>/)[0];

const previewCss = `
/* Online preview: sticky bars clear the phone's safe area, plus the preview bar and file viewer. */
.topbar { top: env(safe-area-inset-top, 0px); }
.sidebar { top: env(safe-area-inset-top, 0px); height: calc(100vh - env(safe-area-inset-top, 0px)); }
.pv-bar { position: fixed; left: 50%; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 90; display: grid; justify-items: center; gap: 8px; width: max-content; max-width: calc(100vw - 32px); }
.pv-pill { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--sidebar-border); background: var(--sidebar); color: var(--sidebar-fg); font-size: 12.5px; cursor: pointer; box-shadow: 0 6px 20px rgb(0 0 0 / .25); max-width: 100%; }
.pv-pill strong { color: var(--sidebar-active-fg); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; font-size: 11px; }
.pv-pill span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pv-menu { width: min(380px, calc(100vw - 32px)); background: var(--card); color: var(--fg); border: 1px solid var(--border); border-radius: 14px; padding: 14px; box-shadow: 0 16px 40px rgb(0 0 0 / .28); display: grid; gap: 10px; }
.pv-menu p { margin: 0; }
.pv-menu-label { font-size: 12px; font-weight: 600; color: var(--muted-fg); letter-spacing: .06em; text-transform: uppercase; }
.pv-people { display: grid; gap: 4px; }
.pv-person { display: grid; text-align: left; gap: 1px; padding: 8px 10px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--fg); cursor: pointer; }
.pv-person:hover { background: var(--accent); }
.pv-person small { color: var(--muted-fg); font-size: 11.5px; }
.pv-current { border-color: var(--border); background: var(--primary-soft); }
.pv-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.pv-actions button { height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--fg); cursor: pointer; font-size: 12.5px; }
.pv-note { font-size: 12px; color: var(--muted-fg); }
.pv-overlay { position: fixed; inset: 0; z-index: 95; display: grid; place-items: center; padding: 16px; background: rgb(0 0 0 / .5); }
.pv-panel { width: 100%; max-width: 620px; max-height: calc(100vh - 32px); overflow: auto; background: var(--card); color: var(--fg); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 20px 60px rgb(0 0 0 / .35); }
.pv-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.pv-head h2 { margin: 0; font-size: 16px; }
.pv-close { height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--fg); cursor: pointer; }
.pv-body { padding: 18px 20px; display: grid; gap: 10px; }
.pv-body p { margin: 0; }
.pv-pre { margin: 0; padding: 12px; border-radius: 10px; background: var(--subtle); border: 1px solid var(--border); white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.pv-img { max-width: 100%; border-radius: 10px; }
`;

const page = `<title>Integral Workspace</title>
<link rel="icon" href="crest.png" />
<style>${style}${previewCss}</style>
${boot}
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js"></script>
<script src="icons.js"></script>
<script src="metrics.js"></script>
<script src="demo-data.js"></script>
<script src="ui.js"></script>
<script src="mock-api.js"></script>
<script src="app.js"></script>
`;
writeFileSync(path.join(here, "index.html"), page);
console.log("Wrote preview/index.html");
