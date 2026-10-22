import "server-only";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "@/lib/env";
import type { ParameterOrJSON, Sql, TransactionSql } from "postgres";
import { SCHEMA_SQL } from "./schema";

/**
 * Postgres access.
 *
 *  - Production / Supabase: `DATABASE_URL` → postgres.js. Use Supabase's
 *    **session** pooler (`*.pooler.supabase.com:5432`): it is IPv4 (Vercel
 *    can't reach the IPv6-only direct host) and keeps a real connection per
 *    client. The transaction pooler (:6543) intermittently drops a query
 *    when postgres.js reuses a connection right after a transaction, which
 *    left pages loading forever. Prepared statements stay disabled so the
 *    URL can still point at :6543 without "prepared statement" errors.
 *  - Local development without `DATABASE_URL`: an embedded Postgres (PGlite)
 *    persisted under `PGLITE_PATH`, so `npm run dev` needs no setup.
 *
 * Both are wrapped in one tiny interface with `$1`-style parameters. The
 * schema is applied idempotently once per process.
 */

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

declare global {
  var __cloutcraftDb: Promise<Db> | undefined;
}

async function connectPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    prepare: false,
    // Small per instance: the session pooler caps total clients, and on
    // Vercel every warm function instance holds its own pool.
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
  const wrap = (s: Sql | TransactionSql): Queryable => ({
    async query<T extends Row>(text: string, params: unknown[] = []) {
      return (await s.unsafe(text, params as ParameterOrJSON<never>[])) as unknown as T[];
    },
  });
  const base = wrap(sql);
  return {
    query: base.query,
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      return (await sql.begin((tx) => fn(wrap(tx)))) as T;
    },
  };
}

async function connectPglite(dir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  let pg: InstanceType<typeof PGlite>;
  if (dir === ":memory:") {
    pg = new PGlite();
  } else {
    const path = resolve(/* turbopackIgnore: true */ process.cwd(), dir);
    mkdirSync(path, { recursive: true });
    pg = new PGlite(path);
  }
  await pg.waitReady;
  type Tx = Parameters<Parameters<typeof pg.transaction>[0]>[0];
  const wrap = (q: typeof pg | Tx): Queryable => ({
    async query<T extends Row>(text: string, params: unknown[] = []) {
      return (await q.query<T>(text, params)).rows;
    },
  });
  const base = wrap(pg);
  return {
    query: base.query,
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
  };
}

async function init(): Promise<Db> {
  const e = env();
  const db = e.DATABASE_URL ? await connectPostgres(e.DATABASE_URL) : await connectPglite(e.PGLITE_PATH);
  // Serialise concurrent cold starts so CREATE ... IF NOT EXISTS can't race.
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(72190331)");
    for (const statement of SCHEMA_SQL) await tx.query(statement);
  });
  return db;
}

export function db(): Promise<Db> {
  if (!globalThis.__cloutcraftDb) {
    globalThis.__cloutcraftDb = init().catch((err) => {
      globalThis.__cloutcraftDb = undefined; // allow a retry on the next request
      throw err;
    });
  }
  return globalThis.__cloutcraftDb;
}
