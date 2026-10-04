// apps/web/lib/api/respond.ts
import { SessionError } from "../auth/session-error";
import { ServiceError } from "./errors";

/**
 * The ONLY place an error becomes a response.
 *
 * Anything unrecognised is rethrown rather than flattened into a generic 500
 * body — an unexpected throw is a bug, and dressing it up as a well-formed API
 * error hides it.
 */
export function errorResponse(e: unknown): Response {
  if (e instanceof ServiceError) {
    return Response.json(
      {
        error: {
          code: e.code,
          message: e.message,
          ...(e.details === undefined ? {} : { details: e.details }),
        },
      },
      { status: e.status },
    );
  }

  if (e instanceof SessionError) {
    return Response.json(
      {
        error: {
          code: e.status === 403 ? "forbidden" : "unauthenticated",
          message: e.message,
        },
      },
      { status: e.status },
    );
  }

  throw e;
}

export async function handle(
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    return errorResponse(e);
  }
}
