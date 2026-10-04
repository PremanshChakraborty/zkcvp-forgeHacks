// apps/web/tests/middleware.test.ts
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

function request(path: string, cookie?: string) {
  const req = new NextRequest(`https://zkcvp.test${path}`);
  if (cookie) req.cookies.set(cookie, "value");
  return req;
}

describe("middleware", () => {
  it("redirects an unauthenticated visitor to /login", () => {
    const res = middleware(request("/projects"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://zkcvp.test/login?from=%2Fprojects",
    );
  });

  it("passes a visitor holding either instance's session cookie through", () => {
    expect(
      middleware(request("/projects", "authjs.dev.session-token")).status,
    ).toBe(200);
    expect(
      middleware(request("/projects", "authjs.sh.session-token")).status,
    ).toBe(200);
  });

  it("carries the original path so login can return the visitor to it", () => {
    const res = middleware(request("/projects/abc/members"));
    expect(res.headers.get("location")).toContain(
      "from=%2Fprojects%2Fabc%2Fmembers",
    );
  });
});
