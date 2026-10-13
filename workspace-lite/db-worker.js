// Runs the online database's queries for db-remote.js and wakes the waiting thread with each answer.
import { parentPort, workerData } from "node:worker_threads";
import { createClient } from "@libsql/client";

const { port, signal, url, authToken } = workerData;
const client = createClient({ url, authToken });
let tx = null; // the open transaction, if any

const plain = (result) => ({
  rows: result.rows.map((row) => {
    const out = {};
    result.columns.forEach((col, i) => {
      const v = row[i];
      out[col] = v instanceof ArrayBuffer ? new Uint8Array(v) : typeof v === "bigint" ? Number(v) : v;
    });
    return out;
  }),
  rowsAffected: result.rowsAffected,
  lastInsertRowid: result.lastInsertRowid === undefined ? 0 : Number(result.lastInsertRowid),
});

async function handle({ op, sql, args }) {
  if (op === "execute") return plain(await (tx || client).execute({ sql, args }));
  if (op === "script") return void (await client.executeMultiple(sql));
  if (op === "begin") {
    tx = await client.transaction("write");
    return null;
  }
  if (op === "commit" || op === "rollback") {
    const t = tx;
    tx = null;
    if (t) await (op === "commit" ? t.commit() : t.rollback());
    if (t) t.close();
    return null;
  }
  throw new Error(`Unknown database operation: ${op}`);
}

parentPort.on("message", async (msg) => {
  let reply;
  try {
    reply = { id: msg.id, result: await handle(msg) };
  } catch (err) {
    reply = { id: msg.id, error: String(err && err.message ? err.message : err), code: err && err.code };
  }
  port.postMessage(reply);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
});
