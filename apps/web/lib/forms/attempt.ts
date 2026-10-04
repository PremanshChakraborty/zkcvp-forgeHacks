// apps/web/lib/forms/attempt.ts

/**
 * A counter that increments on every rejected submit.
 *
 * React 19 resets an uncontrolled form once its action resolves. That is right
 * for the success path and wrong for the failure path, where the values the
 * visitor typed are the values they are being asked to fix. Re-seeding the
 * controls means remounting them, which means a `key` that changes — and it has
 * to change on the SECOND consecutive failure too, or the remount is skipped
 * and the field comes back blank exactly when someone is already frustrated.
 *
 * Hence a number rather than a boolean, and hence it lives in the action state
 * rather than in the client: the action is the only thing that knows a submit
 * was rejected.
 */
export function nextAttempt(prev: { status: string; attempt?: number }): number {
  return prev.status === "error" || prev.status === "unavailable"
    ? (prev.attempt ?? 0) + 1
    : 1;
}
