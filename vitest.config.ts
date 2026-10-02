import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: "./packages/db/.env" });

export default defineConfig({
  test: {
    include: ["{apps,packages}/*/tests/**/*.test.ts"],
    /* The design system has its own render check (`npm run verify -w
     * @zkcvp/design-system-ledger`) which server-renders real markup. It is not
     * a Vitest suite and is not collected here.
     *
     * The orchestrator's live end-to-end check is
     * packages/orchestrator/tests/integration-manual.ts — named so it falls
     * outside the `*.test.ts` include rather than needing an exclude entry,
     * because a blanket exclude on that directory also hid the real unit tests
     * beside it. It hits a live repo and a live LLM; run it by hand with
     * `GITHUB_TOKEN=... GOOGLE_API_KEY=... npx tsx`. */
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],

    /* Drops each test file's database schema and closes its pool when the file
     * finishes. Required, not bookkeeping: the harness holds a pg.Pool in module
     * scope, and an open pool keeps the worker's event loop alive — without this
     * Vitest hangs at exit. Harmless for the files that never touch a database. */
    setupFiles: ["./packages/db/tests/setup.ts"],

    /* The FIRST test in a database file pays a one-time cost the others do not,
     * and it is paid inside that test's timeout.
     *
     * `withTestSchema` builds the file's schema lazily on first call — sweep
     * stale schemas, CREATE SCHEMA, run every migration as one query, read back
     * the table list. Measured against this hosted database while idle: 4796ms
     * for that first call, 236ms for each one after it. Vitest's default
     * timeout is 5000ms, so on a quiet machine the first test cleared it by
     * about two hundred milliseconds, and under the contention of thirteen
     * database files starting at once it did not — which surfaced as a handful
     * of scattered 5010ms failures in whichever files lost the race, never the
     * same ones twice.
     *
     * That reads exactly like the connection exhaustion documented below, and
     * it is not: there were no pooler errors, and the failing assertions were
     * always the first in their file. The lazy build is deliberate (files that
     * never touch the database must not pay for a schema), so the cost has to
     * live inside a test — which means the budget has to accommodate it.
     *
     * Raise this if migrations keep accumulating; the one-time cost grows with
     * them. It is not a licence for slow tests: everything after the first call
     * in a file runs in a quarter of a second. */
    testTimeout: 30_000,
    hookTimeout: 30_000,

    /* File parallelism is deliberately UNCAPPED, and that is only safe because
     * of how packages/db/tests/harness.ts is written. Read this before adding a
     * cap back.
     *
     * The harness builds one schema per test FILE and separates the tests inside
     * it with TRUNCATE. So the database cost is one single-connection pool per
     * in-flight file — 13 connections across the 13 files that touch the
     * database — and it is flat: it does not grow with the test count.
     *
     * It does grow with the FILE count, which is the one thing to watch. This
     * database allows 60 connections, 3 reserved, and Supabase's own services
     * hold about 13 permanently. See the note on `max` in
     * packages/db/tests/harness.ts.
     *
     * It used to. An earlier harness created a fresh schema per TEST, which gave
     * every connection a distinct `search_path` startup parameter. Supavisor
     * cannot share a backend between clients whose startup parameters differ, so
     * pool count grew with the test count until the pooler refused new ones. That
     * forced maxWorkers down to 2, and the measurements were:
     *
     *   workers │ result │ connection errors │ wall
     *   ────────┼────────┼───────────────────┼──────
     *      6    │ 64/96  │ many              │  93s
     *      3    │ 64/96  │ many              │ 138s
     *      2    │ 96/96  │ NONE              │ 327s
     *
     * Note what that table shows: MORE workers looked faster while failing. The
     * failures arrive as a dozen scattered, unrelated-looking test errors rather
     * than an obvious resource message, so a green run is the only evidence that
     * counts here. Switching the endpoint from the transaction pooler (:6543) to
     * session mode (:5432) was tried and changed nothing.
     *
     * If connection errors ever return, the fix is to look at what the harness
     * opens per file — capping workers only hides it. */
  },
});
