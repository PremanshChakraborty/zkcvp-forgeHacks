import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/**
 * The deployment host is deliberately undecided — serverless (Vercel-class) and
 * a long-lived Node host are both live options, and the choice gets made once a
 * real Evaluator run has been measured. Everything here exists to keep that
 * decision cheap. See "Host-agnostic guarantees" in
 * docs/architecture.md.
 */
const nextConfig: NextConfig = {
  /* Emits a self-contained Node server at .next/standalone/server.js, runnable
   * under `node server.js` on Railway/Render/Fly/Docker. Vercel ignores it. */
  output: "standalone",

  /* @zkcvp/contracts and @zkcvp/db also ship raw, unbuilt .ts via their
   * `exports` maps (no build step), same as the design system — Next must
   * compile all three in-app rather than expecting pre-built JS. */
  transpilePackages: [
    "@zkcvp/design-system-ledger",
    "@zkcvp/contracts",
    "@zkcvp/db",
    "@zkcvp/github",
    "@zkcvp/orchestrator",
  ],

  /* nodemailer resolves its transports through dynamic requires, which the
   * bundler cannot follow. Left bundled it builds but fails at send time.
   * Server-only by construction — the magic-link sender never reaches a
   * client component. */
  serverExternalPackages: ["nodemailer"],

  /* The standalone tracer walks up to the workspace root to find hoisted deps.
   * fileURLToPath (not `.pathname`) is required here: on Windows, a file://
   * URL's `.pathname` keeps a leading slash before the drive letter
   * ("/C:/Users/..."), which is not a valid native path and silently breaks
   * output-file tracing (no .next/standalone is emitted, no error). */
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
};

export default nextConfig;
