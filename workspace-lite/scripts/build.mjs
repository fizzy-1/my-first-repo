// Builds dist/integral-workspace: only the files needed to run or host the workspace (no demo pages, no
// data, no installed packages), plus BUILD.txt saying which version it is. Usage: npm run build
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist", "integral-workspace");
const FILES = [
  "server.js", "db.js", "db-remote.js", "db-worker.js", "passwords.js", "seed.js", "preview/demo-data.js",
  "public", "api", "vercel.json", "Dockerfile", ".dockerignore", "render.yaml",
  "package.json", "package-lock.json", "README.md", ".gitignore", "Start Workspace.bat", "Start Workspace.command",
];

rmSync(path.join(ROOT, "dist"), { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const f of FILES) {
  if (!existsSync(path.join(ROOT, f))) throw new Error(`Missing ${f}`);
  cpSync(path.join(ROOT, f), path.join(OUT, f), { recursive: true, preserveTimestamps: true });
}
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
let commit = "unknown";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
} catch {
  /* not a git checkout */
}
writeFileSync(path.join(OUT, "BUILD.txt"), `Integral Workspace ${pkg.version}
Built ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC from commit ${commit}.

Start it on a computer (needs Node.js ${pkg.engines.node.replace(">=", "")} or newer from nodejs.org):
  Windows: double-click "Start Workspace.bat"
  Mac:     double-click "Start Workspace.command"
  Or run:  npm start

Put it online: see "Put it online so everyone can work from home" in README.md (Vercel, Render or Docker).
`);
console.log(`Built ${path.relative(ROOT, OUT)}`);
