// packages/github/src/index.ts

/**
 * The whole M3 surface: a client constructed from a developer's session
 * access token. No fetch calls, no API methods — those get added as a
 * caller actually needs them (see docs/architecture.md, M3/M4).
 */
export interface GitHubClient {
  readonly accessToken: string;
}

export function createGitHubClient(accessToken: string): GitHubClient {
  if (!accessToken) {
    throw new Error("createGitHubClient requires a non-empty accessToken");
  }
  return { accessToken };
}

export type GithubUser = {
  /** GitHub's NUMERIC id as text. The only identity key. Never the username. */
  githubUserId: string;
  /** Cache only, for display. */
  githubUsername: string;
  displayName: string;
  avatarUrl: string | null;
};

export class GithubUserNotFound extends Error {
  constructor(username: string) {
    super(`No GitHub user named ${username}`);
    this.name = "GithubUserNotFound";
  }
}

export class GithubUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubUnavailable";
  }
}

/**
 * Resolves a username to a stable numeric id at invite time.
 *
 * UNAUTHENTICATED on purpose: the caller is a stakeholder, who has no GitHub
 * token, and plan 01 rules out any service-level credential. GitHub caps
 * unauthenticated requests at 60/hour per IP, shared by every stakeholder on the
 * deployment — so exhaustion is a real operational condition, not an edge case,
 * and it is reported as unavailability rather than as a missing user.
 */
export async function resolveGithubUser(username: string): Promise<GithubUser> {
  let res: Response;
  try {
    res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        /* A hung connection to GitHub would otherwise hold a stakeholder's
         * request open indefinitely. The catch below maps this — like every
         * other fetch failure — to GithubUnavailable, never to
         * GithubUserNotFound: a timeout says nothing about whether the user
         * exists. */
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (e) {
    throw new GithubUnavailable(
      `Could not reach GitHub: ${e instanceof Error ? e.message : "unknown error"}`,
    );
  }

  if (res.status === 404) throw new GithubUserNotFound(username);

  if (
    (res.status === 403 || res.status === 429) &&
    res.headers.get("x-ratelimit-remaining") === "0"
  ) {
    throw new GithubUnavailable(
      "GitHub's unauthenticated rate limit is exhausted. Try again shortly.",
    );
  }

  if (!res.ok) throw new GithubUnavailable(`GitHub returned ${res.status}`);

  const body = (await res.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
  };

  return {
    githubUserId: String(body.id),
    githubUsername: body.login,
    displayName: body.name ?? body.login,
    avatarUrl: body.avatar_url ?? null,
  };
}

export type GithubRepo = {
  /** Numeric id as text. The join key. */
  githubRepoId: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
};

export type GithubBranch = { name: string; commitSha: string };

export type GithubCommit = {
  sha: string;
  /** First line only. A commit body can be long and is not worth a list row. */
  message: string;
  authorName: string;
  /** ISO 8601. Dates are absolute throughout this product. */
  committedAt: string;
};

/**
 * Every call here is authenticated as the acting developer.
 *
 * That is the whole access model: a developer sees exactly what their own
 * GitHub account can already see, at the moment of the call. There is no
 * installation, no service credential, and therefore nothing that can grant
 * access the developer does not personally hold.
 */
async function authedJson<T>(
  client: GitHubClient,
  url: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${client.accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new GithubUnavailable(
      `Could not reach GitHub: ${e instanceof Error ? e.message : "unknown error"}`,
    );
  }

  /* GitHub uses 403 for both a spent rate limit and a real permission failure,
   * and only the headers tell them apart. Reporting exhaustion as "nothing
   * here" would show a developer an empty repo list and let them conclude
   * their repos are gone. */
  if (
    (res.status === 403 || res.status === 429) &&
    res.headers.get("x-ratelimit-remaining") === "0"
  ) {
    throw new GithubUnavailable(
      "GitHub's rate limit is exhausted. Try again shortly.",
    );
  }

  if (!res.ok) throw new GithubUnavailable(`GitHub returned ${res.status}`);
  return (await res.json()) as T;
}

export async function listUserRepos(
  client: GitHubClient,
): Promise<GithubRepo[]> {
  const body = await authedJson<
    { id: number; full_name: string; private: boolean; default_branch: string }[]
  >(client, "https://api.github.com/user/repos?per_page=100&sort=updated");

  return body.map((r) => ({
    githubRepoId: String(r.id),
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
  }));
}

export async function listBranches(
  client: GitHubClient,
  fullName: string,
): Promise<GithubBranch[]> {
  const body = await authedJson<{ name: string; commit: { sha: string } }[]>(
    client,
    `https://api.github.com/repos/${fullName}/branches?per_page=100`,
  );
  return body.map((b) => ({ name: b.name, commitSha: b.commit.sha }));
}

export async function listCommits(
  client: GitHubClient,
  fullName: string,
  ref: string,
): Promise<GithubCommit[]> {
  const body = await authedJson<
    {
      sha: string;
      commit: { message: string; author: { name: string; date: string } | null };
    }[]
  >(
    client,
    `https://api.github.com/repos/${fullName}/commits?sha=${encodeURIComponent(ref)}&per_page=50`,
  );

  return body.map((c) => ({
    sha: c.sha,
    message: c.commit.message.split("\n")[0],
    authorName: c.commit.author?.name ?? "Unknown",
    committedAt: c.commit.author?.date ?? new Date(0).toISOString(),
  }));
}
