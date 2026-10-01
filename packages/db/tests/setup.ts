// packages/db/tests/setup.ts
import dns from "node:dns";
import { afterAll } from "vitest";
import { releaseTestSchema } from "./harness";

/**
 * Try IPv4 before IPv6 when resolving the pooler.
 *
 * The pooler hostname carries both A and AAAA records, and on a machine with
 * no IPv6 route every AAAA candidate fails instantly with ENETUNREACH. Putting
 * IPv4 first means the working family is tried first rather than after a round
 * of failures.
 *
 * The signature this addresses is a run where several files fail their FIRST
 * test with `connect ENETUNREACH` or `connect ETIMEDOUT`, no assertion ever
 * runs, and the set of failing files changes between runs. Worth naming,
 * because it looks almost identical to the schema-build timeout described in
 * `vitest.config.ts` and the two have been confused before: a timeout means the
 * query was slow, this means no connection was ever made. A third shape,
 * `getaddrinfo ENOTFOUND`, is neither — that is DNS itself failing, and no
 * setting here can help it.
 *
 * Deliberately NOT paired with `net.setDefaultAutoSelectFamily(false)`.
 * Disabling Happy Eyeballs would also give up its fallback across the six A
 * records, and individual pooler addresses have been seen to time out; losing
 * that retry would trade one failure mode for another.
 *
 * Process-wide, and this file runs once per worker. Test-only on purpose:
 * production reaches the same pooler over cloud networking where the IPv6 leg
 * is not broken, so pinning the order there would buy nothing and could hide a
 * real fault.
 */
dns.setDefaultResultOrder("ipv4first");

/**
 * Vitest runs a setup file once per TEST FILE, so this `afterAll` fires when
 * each file finishes — which is exactly the lifetime of the schema the harness
 * builds lazily in module scope.
 *
 * It is registered for every test file, including the ones that never touch a
 * database; `releaseTestSchema` is a no-op when no schema was created.
 *
 * This is not optional bookkeeping. The harness holds a `pg.Pool` in module
 * scope, and an open pool keeps the worker's event loop alive — without this,
 * Vitest hangs at exit instead of finishing.
 */
afterAll(async () => {
  await releaseTestSchema();
});
