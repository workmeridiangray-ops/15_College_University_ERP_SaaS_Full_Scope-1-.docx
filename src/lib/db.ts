import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool, type PoolClient } from "pg";

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  /** Run a script of several statements with no parameters (migrations). */
  exec(sql: string): Promise<void>;
}

type Driver = {
  query: Queryable["query"];
  exec: Queryable["exec"];
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
};

const g = globalThis as unknown as { __erpDriver?: Driver };

function makePg(url: string): Driver {
  const pool = new Pool({ connectionString: url, max: 10 });
  const wrap = (c: Pool | PoolClient): Queryable["query"] => async (text, params) => {
    const r = await c.query(text, params as unknown[]);
    return { rows: r.rows, rowCount: r.rowCount ?? r.rows.length };
  };
  const ex = (c: Pool | PoolClient) => async (sql: string) => { await c.query(sql); };
  return {
    query: wrap(pool),
    exec: ex(pool),
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const out = await fn({ query: wrap(c), exec: ex(c) });
        await c.query("COMMIT");
        return out;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

function makeLite(dir?: string): Driver {
  if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const lite = new PGlite(dir);
  let chain: Promise<unknown> = Promise.resolve();
  const q: Queryable["query"] = async (text, params) => {
    const r = await lite.query(text, params as unknown[]);
    return { rows: r.rows as never[], rowCount: r.rows.length > 0 ? r.rows.length : (r.affectedRows ?? 0) };
  };
  return {
    exec: (sql) => {
      const p = chain.then(() => lite.exec(sql).then(() => undefined));
      chain = p.catch(() => undefined);
      return p;
    },
    query: (text, params) => {
      const p = chain.then(() => q(text, params));
      chain = p.catch(() => undefined);
      return p as never;
    },
    tx(fn) {
      const p = chain.then(() =>
        lite.transaction(async (t) => {
          return fn({
            query: async (text, params) => {
              const r = await t.query(text, params as unknown[]);
              return { rows: r.rows as never[], rowCount: r.rows.length > 0 ? r.rows.length : (r.affectedRows ?? 0) };
            },
            exec: async (sql) => { await t.exec(sql); },
          });
        })
      );
      chain = p.catch(() => undefined);
      return p;
    },
  };
}

export function getDb(): Driver {
  if (!g.__erpDriver) {
    const url = process.env.DATABASE_URL;
    if (url) g.__erpDriver = makePg(url);
    else if (process.env.NODE_ENV === "production" && process.env.ALLOW_EMBEDDED_DB !== "1")
      throw new Error("DATABASE_URL is required in production");
    else g.__erpDriver = makeLite(process.env.PGLITE_DIR ?? ".data/pglite");
  }
  return g.__erpDriver;
}

/** Test helper: use an in-memory database. */
export function useMemoryDb() {
  g.__erpDriver = makeLite(undefined);
  return g.__erpDriver;
}

export const query: Queryable["query"] = (t, p) => getDb().query(t, p);
export const exec: Queryable["exec"] = (s) => getDb().exec(s);
export const tx = <T>(fn: (q: Queryable) => Promise<T>) => getDb().tx(fn);

export async function one<T = Record<string, unknown>>(text: string, params?: unknown[], q: Pick<Queryable, "query"> = { query }): Promise<T | null> {
  const r = await q.query<T>(text, params);
  return r.rows[0] ?? null;
}
