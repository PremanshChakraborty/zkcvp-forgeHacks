// packages/github/tests/resolve-user.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GithubUnavailable,
  GithubUserNotFound,
  resolveGithubUser,
} from "../src/index";

function stubFetch(response: Response) {
  vi.stubGlobal("fetch", vi.fn(async () => response));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveGithubUser", () => {
  it("returns the NUMERIC id as text, never the username, as the identity key", async () => {
    stubFetch(
      Response.json({
        id: 583231,
        login: "octocat",
        name: "The Octocat",
        avatar_url: "https://example.test/o.png",
      }),
    );

    expect(await resolveGithubUser("octocat")).toEqual({
      githubUserId: "583231",
      githubUsername: "octocat",
      displayName: "The Octocat",
      avatarUrl: "https://example.test/o.png",
    });
  });

  it("falls back to the login when the profile has no name", async () => {
    stubFetch(Response.json({ id: 1, login: "ghost", name: null, avatar_url: null }));
    const user = await resolveGithubUser("ghost");
    expect(user.displayName).toBe("ghost");
    expect(user.avatarUrl).toBeNull();
  });

  it("throws GithubUserNotFound for a 404", async () => {
    stubFetch(new Response("", { status: 404 }));
    await expect(resolveGithubUser("nobody")).rejects.toBeInstanceOf(
      GithubUserNotFound,
    );
  });

  /* The decision this whole function turns on: an exhausted rate limit must NOT
   * look like "no such user". Every stakeholder on the deployment shares one
   * unauthenticated 60/hour budget. */
  it("throws GithubUnavailable — not NotFound — when the rate limit is exhausted", async () => {
    stubFetch(
      new Response("", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
    );
    const err = await resolveGithubUser("octocat").catch((e) => e);
    expect(err).toBeInstanceOf(GithubUnavailable);
    expect(err).not.toBeInstanceOf(GithubUserNotFound);
  });

  it("throws GithubUnavailable for a 429 and for a 5xx", async () => {
    stubFetch(
      new Response("", { status: 429, headers: { "x-ratelimit-remaining": "0" } }),
    );
    await expect(resolveGithubUser("a")).rejects.toBeInstanceOf(GithubUnavailable);

    stubFetch(new Response("", { status: 502 }));
    await expect(resolveGithubUser("b")).rejects.toBeInstanceOf(GithubUnavailable);
  });

  /* A hung connection must not hold a stakeholder's request open forever, and
   * a timeout must never be mistaken for "no such user" — that would state
   * something false about a real person. `fetch` rejects with an abort
   * DOMException when the request's `signal` fires; simulate that directly
   * rather than actually waiting out the real 10s timeout. */
  it("throws GithubUnavailable — not NotFound — when the request times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "TimeoutError");
      }),
    );

    const err = await resolveGithubUser("octocat").catch((e) => e);
    expect(err).toBeInstanceOf(GithubUnavailable);
    expect(err).not.toBeInstanceOf(GithubUserNotFound);
  });
});
