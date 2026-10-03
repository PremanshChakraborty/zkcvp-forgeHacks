// packages/github/tests/client.test.ts
import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../src/index";

describe("createGitHubClient", () => {
  it("holds the access token it was constructed with", () => {
    const client = createGitHubClient("gho_test_token");
    expect(client.accessToken).toBe("gho_test_token");
  });

  it("rejects an empty access token", () => {
    expect(() => createGitHubClient("")).toThrow();
  });
});
