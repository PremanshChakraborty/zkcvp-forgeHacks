// packages/db/src/client.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index";

export type Db = ReturnType<typeof createDb>;

let pool: pg.Pool | undefined;

/**
 * Pooled Drizzle client.
 *
 * A connection string is the ONLY input, which is what makes the database host
 * swappable — Supabase, Neon, Railway, or local Postgres are all the same code.
 * Deliberately not `@vercel/postgres` or an HTTP driver.
 *
 * The pool is memoised per process. On a serverless host each cold start gets
 * its own; on a long-lived Node host there is exactly one. Both are correct,
 * which is the point.
 */
export function createDb(connectionString: string) {
  pool ??= new pg.Pool({ connectionString, max: 10 });
  return drizzle(pool, { schema });
}

/** Closes the pool. For test teardown and graceful shutdown. */
export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
