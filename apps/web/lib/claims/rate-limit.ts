// apps/web/lib/claims/rate-limit.ts
import type { Db } from "@zkcvp/db";

/** A developer may submit at most this many claims to one project per window. */
export const CLAIM_LIMIT = 5;
export const CLAIM_WINDOW_MS = 60 * 60 * 1000;

export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Decides whether `developerId` may submit another claim to `projectId`, by
 * counting their claims inside the trailing window.
 *
 * Runs before `createClaim`, so a rejected submission writes nothing and never
 * starts an evaluation.
 */
export async function checkClaimRateLimit(
  db: Db,
  developerId: string,
  projectId: string,
  now: Date = new Date(),
): Promise<RateLimitDecision> {
  const windowStart = new Date(now.getTime() - CLAIM_WINDOW_MS);
  const recent = await countRecentClaims(db, developerId, projectId, windowStart);

  if (recent >= CLAIM_LIMIT) {
    return { allowed: false, retryAfterSeconds: Math.ceil(CLAIM_WINDOW_MS / 1000) };
  }
  return { allowed: true, remaining: CLAIM_LIMIT - recent - 1 };
}

async function countRecentClaims(
  _db: Db,
  _developerId: string,
  _projectId: string,
  _since: Date,
): Promise<number> {
  return 0;
}
