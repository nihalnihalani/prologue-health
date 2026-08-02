/**
 * Durable control-plane connection.
 *
 * The in-process `Map` in lib/store.ts cannot survive a restart or a second
 * instance, which means a signed session could vanish and a clinician queue
 * could disagree with itself between two servers. This module is the boundary
 * where that stops.
 *
 * Configuration is validated at startup, and production FAILS CLOSED: an
 * outpatient clinic must never be served a process that silently degraded to
 * ephemeral storage, because the failure is invisible until the data is gone.
 */

import { Pool, type PoolClient } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runtimeMode } from "../runtime";

export class DatabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

const url = process.env.DATABASE_URL;

export const databaseConfigured = Boolean(url);

/**
 * Startup validation.
 *
 * Called from the readiness path rather than at import time so that a
 * development machine can still run unit tests that never touch the database.
 * In pilot/production a missing URL is fatal by design.
 */
export function assertDatabaseConfigured(): void {
  // Unverified TLS is a development affordance, never a production posture.
  if (runtimeMode() === "pilot" && process.env.DATABASE_SSL && process.env.DATABASE_SSL !== "require") {
    throw new DatabaseUnavailableError(
      `DATABASE_SSL="${process.env.DATABASE_SSL}" is refused in pilot mode: the control plane holds ` +
        `PHI and must use a verified TLS connection.`
    );
  }
  if (databaseConfigured) return;
  const mode = runtimeMode();
  if (mode === "pilot") {
    throw new DatabaseUnavailableError(
      "DATABASE_URL is required in pilot mode. Refusing to start with ephemeral session storage: " +
        "an in-process store loses signed sessions on restart and disagrees across instances."
    );
  }
  throw new DatabaseUnavailableError("DATABASE_URL is not configured");
}

let pool: Pool | null = null;

export function getPool(): Pool {
  assertDatabaseConfigured();
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      // Managed Postgres (Neon and friends) terminates plaintext connections.
      // Local docker in tests does not offer TLS at all, so this is opt-out.
      /*
       * Verify the server certificate by DEFAULT.
       *
       * This used to send `rejectUnauthorized: false` for every non-local
       * connection, which encrypts the link but authenticates nothing — a
       * machine-in-the-middle on the path to a managed Postgres could read and
       * rewrite the entire clinical control plane while TLS still "worked".
       *
       *   DATABASE_SSL=disable      plaintext, for a local container only
       *   DATABASE_SSL=no-verify    encrypted but UNVERIFIED; explicit opt-in,
       *                             refused in pilot mode
       *   (unset)                   TLS with certificate verification
       */
      ssl:
        process.env.DATABASE_SSL === "disable"
          ? undefined
          : process.env.DATABASE_SSL === "no-verify"
            ? { rejectUnauthorized: false }
            : true,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = null;
}

/**
 * Run `fn` inside a single transaction.
 *
 * Every command that changes workflow state and also decides on an external
 * write must go through here, so the decision and its outbox row commit or
 * roll back together.
 */
export async function withTransaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await c.query("ROLLBACK");
    } catch {
      /* connection already dead; the server rolls back for us */
    }
    throw err;
  } finally {
    c.release();
  }
}

/* ------------------------------------------------------------------ */
/* Migrations                                                          */
/* ------------------------------------------------------------------ */

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

/**
 * Apply pending migrations.
 *
 * Deliberately simple and forward-only in normal operation. Each file is
 * applied once, inside a transaction, and recorded — so a crash mid-migration
 * cannot leave a half-applied schema recorded as complete.
 */
export async function migrate(): Promise<string[]> {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await p.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name)
  );

  const pending = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort()
    .filter((f) => !applied.has(f));

  const ran: string[] = [];
  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    await withTransaction(async (c) => {
      await c.query(sql);
      await c.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    });
    ran.push(file);
  }
  return ran;
}

/** Reverse a migration. Staging recovery only — see the .down.sql header. */
export async function rollback(name: string): Promise<void> {
  const down = name.replace(/\.sql$/, ".down.sql");
  const sql = readFileSync(join(MIGRATIONS_DIR, down), "utf8");
  await withTransaction(async (c) => {
    await c.query(sql);
    await c.query("DELETE FROM schema_migrations WHERE name = $1", [name]);
  });
}
