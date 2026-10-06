import { describe, expect, it } from "vitest";

import { backoffMs, canWait, classify } from "../src/read-tool";

/**
 * Transport policy: which failures mean what, and when waiting is worth it.
 *
 * The 403 cases are the subtle ones. GitHub uses the same status for a spent
 * rate limit and a genuine permission failure, and only the headers separate
 * them — get it wrong in one direction and the run retries something that will
 * never succeed, get it wrong in the other and a rate limit reaches the model
 * as missing evidence and comes back out as "not satisfied".
 */

function headers(init: Record<string, string> = {}): Headers {
  return new Headers(init);
}

describe("classify", () => {
  it("reads 404 as a fact about the repo", () => {
    expect(classify(404, headers())).toBe("not_found");
  });

  it("reads 401 as a dead token", () => {
    expect(classify(401, headers())).toBe("unauthorized");
  });

  it("reads 429 as a rate limit", () => {
    expect(classify(429, headers())).toBe("rate_limited");
  });

  it("reads a 403 with an exhausted quota as a rate limit", () => {
    expect(classify(403, headers({ "x-ratelimit-remaining": "0" }))).toBe(
      "rate_limited",
    );
  });

  it("reads a 403 carrying retry-after as a rate limit", () => {
    expect(classify(403, headers({ "retry-after": "60" }))).toBe("rate_limited");
  });

  it("reads a bare 403 as a permission failure, not a rate limit", () => {
    // Retrying this would burn the developer's wait on an answer that cannot
    // change.
    expect(classify(403, headers({ "x-ratelimit-remaining": "4999" }))).toBe(
      "forbidden",
    );
    expect(classify(403, headers())).toBe("forbidden");
  });

  it("reads 5xx as transient", () => {
    expect(classify(500, headers())).toBe("unavailable");
    expect(classify(503, headers())).toBe("unavailable");
  });

  it("reads other 4xx as malformed", () => {
    expect(classify(422, headers())).toBe("malformed");
  });
});

describe("backoffMs", () => {
  it("grows with each attempt", () => {
    const flat = () => 1; // pin the jitter so the shape is observable
    expect(backoffMs(0, flat)).toBeLessThan(backoffMs(1, flat));
    expect(backoffMs(1, flat)).toBeLessThan(backoffMs(2, flat));
  });

  it("caps, so a late attempt cannot sleep for minutes", () => {
    expect(backoffMs(20, () => 1)).toBeLessThanOrEqual(4_000);
  });

  it("jitters within half the ceiling, so parallel reads desynchronise", () => {
    expect(backoffMs(3, () => 0)).toBeLessThan(backoffMs(3, () => 1));
  });
});

describe("canWait", () => {
  const now = 1_000_000;

  it("allows any wait when the run has no deadline", () => {
    expect(canWait(60_000, undefined, now)).toBe(true);
  });

  it("allows a wait that finishes inside the budget", () => {
    expect(canWait(1_000, new Date(now + 5_000), now)).toBe(true);
  });

  it("refuses a wait that outlives the budget", () => {
    // A rate-limit reset is routinely 20+ minutes out. Inside a request the
    // developer's browser is holding open, failing fast with the reset time
    // attached beats sleeping through the ceiling.
    expect(canWait(20 * 60_000, new Date(now + 5_000), now)).toBe(false);
  });

  it("refuses a wait that lands exactly on the deadline", () => {
    expect(canWait(5_000, new Date(now + 5_000), now)).toBe(false);
  });
});
