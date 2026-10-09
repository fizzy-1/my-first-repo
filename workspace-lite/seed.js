// Optional demo data so you can try the workspace before using it for real:  node seed.js
// It only runs on an empty workspace. To start over, stop the server and delete the data folder.
// The story itself lives in preview/demo-data.js, shared with the online preview.
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { DATA_DIR, db, get, run, setSetting } from "./db.js";
import { hashPassword } from "./passwords.js";
import "./preview/demo-data.js";

if (get("SELECT COUNT(*) AS n FROM users").n > 0) {
  console.error("The workspace already has accounts, so demo data was not added.");
  console.error("To start over with demo data: stop the server, delete the data folder, then run this again.");
  process.exit(1);
}

const demo = globalThis.WSDemoData.buildDemoData();
const insert = (table, row) => {
  const keys = Object.keys(row);
  run(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`, ...keys.map((k) => row[k] ?? null));
};
const hash = await hashPassword(demo.password);

db.exec("BEGIN");
for (const u of demo.tables.users) insert("users", { ...u, password_hash: hash });
// Parents before children, so every link points at a row that exists.
for (const table of ["leads", "contracts", "lead_notes", "transactions", "content", "meetings", "tasks", "goals", "goal_updates", "approvals", "notifications", "activity"])
  for (const row of demo.tables[table] || []) insert(table, row);
for (const { body, ...d } of demo.tables.documents) {
  const storage_key = `${Date.now()}-${randomBytes(4).toString("hex")}${path.extname(d.file_name)}`;
  writeFileSync(path.join(DATA_DIR, "uploads", storage_key), body);
  insert("documents", { ...d, storage_key, size: Buffer.byteLength(body) });
}
for (const b of demo.budgets) insert("budgets", b);
for (const [key, value] of Object.entries(demo.settings)) setSetting(key, value);
db.exec("COMMIT");

console.log(`Demo data added. Sign in with any of these (password: ${demo.password}):`);
for (const [name, email, role] of demo.people) console.log(`  ${role.padEnd(8)} ${email}  (${name})`);
console.log("Before using it for real, delete the data folder and start fresh.");
