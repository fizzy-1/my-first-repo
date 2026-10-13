// Online database (Turso / libSQL) for hosts that keep no files, such as Vercel.
// The workspace's code reads the database synchronously, the way Node's built-in SQLite works. Turso answers
// over the network, so queries run in a small worker thread and this thread waits for each answer
// (Atomics.wait + receiveMessageOnPort). Each server handles one request at a time, so waiting is fine.
import { DatabaseSync } from "node:sqlite";
import { MessageChannel, Worker, receiveMessageOnPort } from "node:worker_threads";

const TIMEOUT_MS = 25000;

export function connect(url, authToken) {
  // Loaded here as well as in the worker so that Vercel's bundler includes the client with the function.
  import("@libsql/client").catch(() => {});
  const { port1, port2 } = new MessageChannel();
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const worker = new Worker(new URL("./db-worker.js", import.meta.url), { workerData: { port: port2, signal, url, authToken }, transferList: [port2] });
  worker.unref();
  port1.unref();
  let nextId = 0;

  function call(op, sql = null, args = []) {
    const id = ++nextId;
    Atomics.store(signal, 0, 0);
    worker.postMessage({ id, op, sql, args: args.map((a) => (a === undefined ? null : a)) });
    const deadline = Date.now() + TIMEOUT_MS;
    for (;;) {
      for (let msg = receiveMessageOnPort(port1); msg; msg = receiveMessageOnPort(port1)) {
        if (msg.message.id !== id) continue; // a late answer to a query that already timed out
        if (msg.message.error) throw Object.assign(new Error(msg.message.error), { code: msg.message.code });
        return msg.message.result;
      }
      const left = deadline - Date.now();
      if (left <= 0) throw new Error("The online database didn't answer in time. Try again in a moment.");
      Atomics.wait(signal, 0, 0, left);
      Atomics.store(signal, 0, 0);
    }
  }
  const rows = (result) => result.rows.map((row) => fromDb(row));
  const fromDb = (row) => {
    for (const k of Object.keys(row)) if (row[k] instanceof Uint8Array) row[k] = Buffer.from(row[k]);
    return row;
  };

  return {
    all: (sql, params) => rows(call("execute", sql, params)),
    get: (sql, params) => rows(call("execute", sql, params))[0],
    run: (sql, params) => {
      const r = call("execute", sql, params);
      return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid };
    },
    exec: (sql) => call("script", sql),
    begin: () => call("begin"),
    commit: () => call("commit"),
    rollback: () => call("rollback"),
    /** Copies every table into a local SQLite file, so an online workspace can be backed up and restored on a computer. */
    snapshot(file) {
      const copy = new DatabaseSync(file, { enableForeignKeyConstraints: false }); // rows arrive table by table
      try {
        const tables = rows(call("execute", "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%'"));
        for (const t of tables) copy.exec(t.sql);
        for (const ix of rows(call("execute", "SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL"))) copy.exec(ix.sql);
        copy.exec("BEGIN");
        for (const { name } of tables) {
          for (const row of rows(call("execute", `SELECT * FROM "${name}"`))) {
            const keys = Object.keys(row);
            copy.prepare(`INSERT INTO "${name}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...keys.map((k) => row[k]));
          }
        }
        copy.exec("COMMIT");
      } finally {
        copy.close();
      }
    },
  };
}
