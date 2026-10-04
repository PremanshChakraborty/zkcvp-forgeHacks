// apps/web/tests/api/respond.test.ts
import { describe, expect, it } from "vitest";
import { SessionError } from "../../lib/auth/session-error";
import { ServiceError, conflict, notFound } from "../../lib/api/errors";
import { errorResponse, handle } from "../../lib/api/respond";

describe("errorResponse", () => {
  it("maps a ServiceError to its status and code", async () => {
    const res = errorResponse(conflict("Already a member of this project"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "conflict", message: "Already a member of this project" },
    });
  });

  it("maps a 401 SessionError to code unauthenticated", async () => {
    const res = errorResponse(new SessionError(401, "Authentication required"));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthenticated");
  });

  it("maps a 403 SessionError to code forbidden", async () => {
    const res = errorResponse(new SessionError(403, "Not a member of this project"));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden");
  });

  it("includes details when present", async () => {
    const e = new ServiceError(400, "invalid_body", "Invalid request body", [
      { path: "name", message: "Required" },
    ]);
    expect((await errorResponse(e).json()).error.details).toEqual([
      { path: "name", message: "Required" },
    ]);
  });

  it("rethrows anything it does not recognise, so a bug surfaces as a 500", () => {
    expect(() => errorResponse(new Error("boom"))).toThrow("boom");
  });
});

describe("handle", () => {
  it("returns the handler's response when nothing throws", async () => {
    const res = await handle(async () => Response.json({ ok: true }, { status: 201 }));
    expect(res.status).toBe(201);
  });

  it("converts a thrown ServiceError into a response", async () => {
    const res = await handle(async () => {
      throw notFound("No such requirement");
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });
});
