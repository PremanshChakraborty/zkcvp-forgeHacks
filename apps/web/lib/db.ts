// apps/web/lib/db.ts
import { createDb, type Db } from "@zkcvp/db";
import { env } from "./env";

/**
 * One accessor for the pooled client. `createDb` memoises the pool internally,
 * so repeated calls are free; this exists so `env().DATABASE_URL` is not spelled
 * out at every call site the way session.ts had to before M4.
 */
export function getDb(): Db {
  return createDb(env().DATABASE_URL);
}
