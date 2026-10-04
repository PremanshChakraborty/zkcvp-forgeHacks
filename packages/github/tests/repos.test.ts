import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGitHubClient,
  GithubUnavailable,
  listBranches,
  listCommits,
  listUserRepos,
} from "../src/index";

const client = createGitHubClient("gho_token");

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const res = new Response(JSON.stringify(body), { status, headers });
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(res);
}

afterEach(() => vi.restoreAllMocks());

describe("listUserRepos", () => {
  it("maps the numeric id and default branch, and sends the token", async () => {
    const spy = mockFetch(200, [
      { id: 1296269, full_name: "octocat/Hello-World", private: true, default_branch: "main" },
    ]);

    const repos = await listUserRepos(client);

    expect(repos).toEqual([
      { githubRepoId: "1296269", fullName: "octocat/Hello-World", private: true, defaultBranch: "main" },
    ]);
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gho_token");
  });

  it("reports a rate-limited 403 as unavailability, not as an empty list", async () => {
    mockFetch(403, {}, { "x-ratelimit-remaining": "0" });
    await expect(listUserRepos(client)).rejects.toBeInstanceOf(GithubUnavailable);
  });
});

describe("listBranches", () => {
  it("maps name and head sha", async () => {
    mockFetch(200, [{ name: "main", commit: { sha: "a".repeat(40) } }]);
    await expect(listBranches(client, "octocat/Hello-World")).resolves.toEqual([
      { name: "main", commitSha: "a".repeat(40) },
    ]);
  });
});

describe("listCommits", () => {
  it("maps sha, first message line, author and date", async () => {
    mockFetch(200, [
      {
        sha: "b".repeat(40),
        commit: {
          message: "Add login\n\nLonger body that must not appear",
          author: { name: "Mira", date: "2026-09-01T10:00:00Z" },
        },
      },
    ]);

    await expect(listCommits(client, "octocat/Hello-World", "main")).resolves.toEqual([
      {
        sha: "b".repeat(40),
        message: "Add login",
        authorName: "Mira",
        committedAt: "2026-09-01T10:00:00Z",
      },
    ]);
  });

  it("passes the ref as the sha query parameter", async () => {
    const spy = mockFetch(200, []);
    await listCommits(client, "octocat/Hello-World", "feature/x");
    expect(String(spy.mock.calls[0][0])).toContain("sha=feature%2Fx");
  });
});
