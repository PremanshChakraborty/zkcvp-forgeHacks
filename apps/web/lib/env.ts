import { z } from "zod";

/**
 * Runtime environment access.
 *
 * Deliberately a FUNCTION rather than an exported constant. A module-level
 * `export const env = schema.parse(process.env)` is evaluated during the build,
 * which bakes build-time values into the bundle and makes the same artifact
 * behave differently on two hosts. The host is Vercel today, and a move to a
 * long-lived Node host remains a redeploy — one artifact therefore has to
 * behave correctly wherever it runs, so configuration has to be read when it
 * is used.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  /* How long one Evaluator run may take. The host is Vercel, whose function
   * limit is 60 seconds on the current plan; a long-lived Node host does not
   * cap this at all. Feeds EvaluationProgress's `ceilingSeconds` prop, which
   * turns the elapsed clock ochre past 70% so a developer is warned BEFORE
   * the request is cut off. Configurable because the ceiling differs by
   * host — 60 on Vercel today, 300 by default — not because the host is
   * undecided. */
  EVAL_CEILING_SECONDS: z.coerce.number().int().positive().default(300),

  /* Which Gemini model the Evaluator runs. Configuration rather than a
   * constant so a model can be changed without a deploy, and so
   * `Report.modelId` names what actually produced the verdicts — a report that
   * misreports its own model undermines the record it anchors. The provider is
   * fixed; only the model id varies. */
  EVAL_MODEL_ID: z.string().min(1).default("gemini-3.5-flash"),

  NODE_ENV: z.string().default("development"),

  /* Auth.js JWT encryption/signing secret, shared by both instances — the two
   * disjoint session cookies (dev/sh) don't need separate secrets, since the
   * cookie name itself is what keeps them apart. */
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),

  /* Gate B — GitHub OAuth app credentials. Deliberately optional: the
   * stakeholder magic-link flow must keep working before Gate B is done (see
   * docs/architecture.md, M3). Left unset, the GitHub provider builds with an
   * empty client id/secret and only the developer login path is affected. */
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),

  /* Public origin of this deployment, e.g. https://zkcvp.example.com.
   *
   * Optional, but strongly recommended in production. When set, Auth.js
   * derives callback/action URLs from it instead of from the incoming
   * request's Host header, which removes host-header spoofing as a way to
   * redirect an OAuth callback. Unset, we fall back to trusting the proxy's
   * headers (see `trustHost` in developer.ts / stakeholder.ts).
   *
   * Read here only so the value is validated and documented in one place;
   * Auth.js reads process.env.AUTH_URL itself. */
  AUTH_URL: z.string().url().optional(),

  /* Magic-link delivery over SMTP. Optional as a group, following the
   * AUTH_GITHUB_* treatment: absent credentials disable one delivery path
   * rather than failing validation for everyone. SMTP_HOST alone selects the
   * real sender (see lib/auth/magic-link-sender.ts); the group check below is
   * what stops a half-configured mailbox from silently degrading to the
   * console sender in production. */
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().optional(),
}).superRefine((value, ctx) => {
  /* Only meaningful once a host is set — with SMTP_HOST absent the console
   * sender is the intended configuration, not an incomplete one. */
  if (!value.SMTP_HOST) return;
  for (const key of ["SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"] as const) {
    if (!value[key]) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `${key} is required when SMTP_HOST is set`,
      });
    }
  }
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${detail}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test-only. Clears the memoised value so a test can vary process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
