import fs from "node:fs";
import path from "node:path";
import { Client, Pool, type PoolClient } from "pg";

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

function sslFor(url: string) {
  // Supabase and most managed Postgres require TLS. `sslmode=disable` (or a local host) turns it off.
  if (/sslmode=disable/.test(url) || /@(localhost|127\.0\.0\.1)(:|\/)/.test(url)) return undefined;
  return { rejectUnauthorized: false } as const;
}

/**
 * Node mode: a shared connection pool.
 * Cloudflare Workers mode (DB_PER_REQUEST=1): a Workers isolate cannot reuse sockets across requests, so every
 * query/transaction opens its own short-lived connection (use Hyperdrive or the Supabase pooler in front of it).
 */
function makePg(url: string): Driver {
  const perRequest = process.env.DB_PER_REQUEST === "1";
  const ssl = sslFor(url);
  const pool = perRequest ? null : new Pool({ connectionString: url, max: 10, ssl });
  const connect = async () => { const c = new Client({ connectionString: url, ssl }); await c.connect(); return c; };
  const wrapOne = (c: { query: (t: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> }): Queryable["query"] => async (text, params) => {
    const r = await c.query(text, params as unknown[]);
    return { rows: r.rows, rowCount: r.rowCount ?? r.rows.length };
  };
  const wrap = (c: Pool | PoolClient): Queryable["query"] => wrapOne(c as never);
  const ex = (c: { query: (t: string) => Promise<unknown> }) => async (sql: string) => { await c.query(sql); };
  return {
    query: perRequest
      ? async (text, params) => { const c = await connect(); try { return await wrapOne(c)(text, params); } finally { await c.end().catch(() => {}); } }
      : wrap(pool!),
    exec: perRequest
      ? async (sql) => { const c = await connect(); try { await c.query(sql); } finally { await c.end().catch(() => {}); } }
      : ex(pool!),
    async tx(fn) {
      const c = perRequest ? await connect() : await pool!.connect();
      try {
        await c.query("BEGIN");
        const out = await fn({ query: wrap(c as never), exec: ex(c) });
        await c.query("COMMIT");
        return out;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        if (perRequest) await (c as Client).end().catch(() => {}); else (c as PoolClient).release();
      }
    },
  };
}

function makeLite(dir?: string): Driver {
  if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
  // Loaded lazily and by a variable name so production/Workers bundles never include the embedded database.
  const spec = "@electric-sql/pglite";
  type Lite = { query(t: string, p?: unknown[]): Promise<{ rows: unknown[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; transaction<T>(fn: (t: Lite) => Promise<T>): Promise<T> };
  const lite: Promise<Lite> = import(/* webpackIgnore: true */ spec).then((m) => new m.PGlite(dir) as Lite);
  let chain: Promise<unknown> = Promise.resolve();
  const rc = (r: { rows: unknown[]; affectedRows?: number }) => (r.rows.length > 0 ? r.rows.length : (r.affectedRows ?? 0));
  const q: Queryable["query"] = async (text, params) => {
    const r = await (await lite).query(text, params as unknown[]);
    return { rows: r.rows as never[], rowCount: rc(r) };
  };
  return {
    exec: (sql) => {
      const p = chain.then(async () => { await (await lite).exec(sql); });
      chain = p.catch(() => undefined);
      return p;
    },
    query: (text, params) => {
      const p = chain.then(() => q(text, params));
      chain = p.catch(() => undefined);
      return p as never;
    },
    tx(fn) {
      const p = chain.then(async () =>
        (await lite).transaction(async (t) =>
          fn({
            query: async (text, params) => {
              const r = await t.query(text, params as unknown[]);
              return { rows: r.rows as never[], rowCount: rc(r) };
            },
            exec: async (sql) => { await t.exec(sql); },
          })
        )
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

/** Test helper: run against a real PostgreSQL server instead of the embedded database. */
export function usePostgres(url: string) {
  g.__erpDriver = makePg(url);
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
