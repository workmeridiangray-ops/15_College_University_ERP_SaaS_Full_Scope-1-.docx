import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";

export async function migrate(dir = path.join(process.cwd(), "migrations")) {
  const db = getDb();
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await db.tx(async (q) => {
      await q.exec(sql);
      await q.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
    });
    applied.push(f);
  }
  return applied;
}
