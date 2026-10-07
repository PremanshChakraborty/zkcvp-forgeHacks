// apps/web/lib/auth/session-error.ts

/**
 * Standalone SessionError to avoid pulling next-auth into the API layer.
 * This error is defined separately so it can be imported by respond.ts
 * without requiring next-auth or next/headers.
 */
export class SessionError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "SessionError";
  }
}
