import type {
  ChangedFile,
  GitHubErrorKind,
  GitHubReadTool,
  Tree,
  TreeEntry,
} from "@zkcvp/contracts";
import { GitHubReadError } from "@zkcvp/contracts";

/**
 * Concrete GitHubReadTool implementation.
 *
 * Calls the GitHub REST API using the developer's OAuth token. The token is
 * sealed inside — the LLM never sees it. Native fetch, no SDK (architecture
 * rule).
 *
 * Owns TRANSPORT concerns only: which HTTP failures mean what, and which are
 * worth retrying. Whether an unresolved failure should sink the evaluation is
 * the orchestrator's call, not this file's.
 */

/**
 * The error taxonomy lives in `@zkcvp/contracts` beside the interface it
 * describes, so the Evaluator can reason about failure kinds without importing
 * this client. `GitHubApiError` is kept as the local name callers already use.
 */
export { GitHubReadError as GitHubApiError } from "@zkcvp/contracts";
export type { GitHubErrorKind } from "@zkcvp/contracts";

export type GitHubReadToolOptions = {
  /** Cancels in-flight requests when the run's budget expires. */
  signal?: AbortSignal;
  /** Hard stop. A backoff that cannot finish before this is never slept. */
  deadline?: Date;
  /** Attempts per call, including the first. */
  maxAttempts?: number;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 4_000;

/** Cap on the planner's ranking hint, so a sprawling commit cannot flood it. */
const MAX_CHANGED_FILES = 300;

export function classify(status: number, headers: Headers): GitHubErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 403) {
    // A 403 is either a spent rate limit or a genuine permission failure, and
    // only the headers tell them apart. Retrying the second is pure waste.
    const remaining = headers.get("x-ratelimit-remaining");
    if (remaining === "0" || headers.get("retry-after")) return "rate_limited";
    return "forbidden";
  }
  if (status >= 500) return "unavailable";
  return "malformed";
}

function resetAtFrom(headers: Headers): string | undefined {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return new Date(Date.now() + seconds * 1000).toISOString();
    }
  }
  const reset = headers.get("x-ratelimit-reset");
  if (reset) {
    const epochSeconds = Number(reset);
    if (Number.isFinite(epochSeconds)) {
      return new Date(epochSeconds * 1000).toISOString();
    }
  }
  return undefined;
}

/** Exponential with full jitter, so parallel reads do not resynchronise. */
export function backoffMs(attempt: number, random = Math.random): number {
  const ceiling = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

/**
 * Whether it is worth waiting `delayMs` before another attempt.
 *
 * A rate-limit reset is routinely 20+ minutes away. Inside a request the
 * developer's browser is holding open, sleeping for it is strictly worse than
 * failing immediately with the reset time attached.
 */
export function canWait(
  delayMs: number,
  deadline: Date | undefined,
  now: number,
): boolean {
  if (!deadline) return true;
  return now + delayMs < deadline.getTime();
}

export class GitHubReadToolImpl implements GitHubReadTool {
  private readonly token: string;
  private readonly baseUrl = "https://api.github.com";
  private readonly options: GitHubReadToolOptions;

  /** Commit metadata is needed twice (tree SHA, then parents). Fetch it once. */
  private readonly commitCache = new Map<
    string,
    { treeSha: string; parents: string[] }
  >();

  constructor(accessToken: string, options: GitHubReadToolOptions = {}) {
    if (!accessToken) {
      throw new Error("GitHubReadToolImpl requires a non-empty accessToken");
    }
    this.token = accessToken;
    this.options = options;
  }

  private headers(accept: string): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: accept,
      "User-Agent": "zkcvp-evaluator",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  /**
   * One request, retried on transport failures only, inside the run's budget.
   */
  private async request(
    url: string,
    accept: string,
    context: string,
  ): Promise<Response> {
    const maxAttempts = this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    let lastError: GitHubReadError | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let resp: Response;
      try {
        resp = await fetch(url, {
          headers: this.headers(accept),
          signal: this.options.signal,
        });
      } catch (err: unknown) {
        // An aborted run is over; retrying it would outlive its own request.
        if (err instanceof Error && err.name === "AbortError") throw err;
        lastError = new GitHubReadError(
          `${context}: network failure — ${err instanceof Error ? err.message : String(err)}`,
          0,
          "unavailable",
        );
        if (await this.pause(attempt, maxAttempts, lastError)) continue;
        throw lastError;
      }

      if (resp.ok) return resp;

      const kind = classify(resp.status, resp.headers);
      lastError = new GitHubReadError(
        `${context}: HTTP ${resp.status}`,
        resp.status,
        kind,
        kind === "rate_limited" ? resetAtFrom(resp.headers) : undefined,
      );
      if (!lastError.retryable) throw lastError;
      if (await this.pause(attempt, maxAttempts, lastError)) continue;
      throw lastError;
    }

    throw lastError ?? new GitHubReadError(context, 0, "unavailable");
  }

  /** Returns true if it slept and another attempt should be made. */
  private async pause(
    attempt: number,
    maxAttempts: number,
    error: GitHubReadError,
  ): Promise<boolean> {
    if (attempt >= maxAttempts - 1) return false;

    // A known reset beats a guessed backoff, but only if we can afford to wait.
    const explicit = error.resetAt
      ? new Date(error.resetAt).getTime() - Date.now()
      : undefined;
    const delay =
      explicit !== undefined && explicit > 0
        ? explicit
        : backoffMs(attempt);

    if (!canWait(delay, this.options.deadline, Date.now())) return false;

    await new Promise((resolve) => setTimeout(resolve, delay));
    return true;
  }

  private async commitMeta(
    repo: string,
    commitSha: string,
  ): Promise<{ treeSha: string; parents: string[] }> {
    const key = `${repo}@${commitSha}`;
    const cached = this.commitCache.get(key);
    if (cached) return cached;

    const resp = await this.request(
      `${this.baseUrl}/repos/${repo}/commits/${commitSha}`,
      "application/vnd.github+json",
      `Failed to resolve commit ${commitSha.substring(0, 8)}`,
    );
    const data = (await resp.json()) as {
      commit: { tree: { sha: string } };
      parents?: { sha: string }[];
    };

    const meta = {
      treeSha: data.commit.tree.sha,
      parents: (data.parents ?? []).map((p) => p.sha),
    };
    this.commitCache.set(key, meta);
    return meta;
  }

  /**
   * Read a single file's content at an exact commit SHA.
   *
   * Uses the raw media type rather than the default JSON+base64 representation.
   * That is not a style choice: the JSON form only inlines files up to 1 MB and
   * returns `encoding: "none"` above it, which the previous implementation
   * surfaced as an unexplained 422. Raw serves up to 100 MB and skips a
   * base64 decode on every read.
   */
  async readFile(
    repo: string,
    commitSha: string,
    path: string,
  ): Promise<string> {
    const url = `${this.baseUrl}/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${commitSha}`;
    let resp: Response;
    try {
      resp = await this.request(
        url,
        "application/vnd.github.raw",
        `Failed to read ${path} at ${commitSha.substring(0, 8)}`,
      );
    } catch (err: unknown) {
      // Over 100 MB the raw endpoint refuses outright. Name it, so it is not
      // mistaken for a missing file.
      if (err instanceof GitHubReadError && err.status === 403) {
        throw new GitHubReadError(
          `File too large to read: ${path}`,
          403,
          "too_large",
        );
      }
      throw err;
    }
    return await resp.text();
  }

  /**
   * List the file tree at an exact commit SHA.
   *
   * Reports GitHub's own truncation flag rather than hiding it — see
   * `Tree.truncated` for why the distinction changes how a 404 is read.
   */
  async listTree(
    repo: string,
    commitSha: string,
    path?: string,
  ): Promise<Tree> {
    const { treeSha } = await this.commitMeta(repo, commitSha);

    const resp = await this.request(
      `${this.baseUrl}/repos/${repo}/git/trees/${treeSha}?recursive=1`,
      "application/vnd.github+json",
      "Failed to list tree",
    );
    const data = (await resp.json()) as {
      tree: { path: string; type: string; size?: number }[];
      truncated?: boolean;
    };

    let entries = data.tree.map(
      (entry): TreeEntry => ({
        path: entry.path,
        type: entry.type === "blob" ? "file" : "dir",
        size: entry.size,
      }),
    );

    if (path) {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      entries = entries.filter((e) => e.path.startsWith(prefix));
    }

    return { entries, truncated: data.truncated === true };
  }

  /**
   * Get the diff between two commits.
   */
  async diff(repo: string, baseSha: string, headSha: string): Promise<string> {
    const resp = await this.request(
      `${this.baseUrl}/repos/${repo}/compare/${baseSha}...${headSha}`,
      "application/vnd.github+json",
      `Failed to compare ${baseSha.substring(0, 8)}...${headSha.substring(0, 8)}`,
    );
    const data = (await resp.json()) as {
      files?: { filename: string; status: string; patch?: string }[];
    };
    if (!data.files) return "";
    return data.files
      .map((f) => `--- ${f.filename} (${f.status})\n${f.patch ?? ""}`)
      .join("\n\n");
  }

  /**
   * Paths touched by a commit relative to its first parent. Filenames only.
   *
   * Deliberately gives up in two cases rather than returning something
   * misleading: a root commit has nothing to compare against, and a merge
   * commit's first parent describes the branch's step rather than the work
   * being claimed. Both return `[]`, and the planner falls back to the tree.
   */
  async changedFiles(repo: string, commitSha: string): Promise<ChangedFile[]> {
    const { parents } = await this.commitMeta(repo, commitSha);
    if (parents.length !== 1) return [];

    const resp = await this.request(
      `${this.baseUrl}/repos/${repo}/compare/${parents[0]}...${commitSha}`,
      "application/vnd.github+json",
      `Failed to compare ${commitSha.substring(0, 8)} with its parent`,
    );
    const data = (await resp.json()) as {
      files?: { filename: string; status: string }[];
    };

    return (data.files ?? [])
      .slice(0, MAX_CHANGED_FILES)
      .map((f) => ({ path: f.filename, status: f.status }));
  }
}

/**
 * Factory function — matches the pattern used by packages/github.
 */
export function createGitHubReadTool(
  accessToken: string,
  options: GitHubReadToolOptions = {},
): GitHubReadTool {
  return new GitHubReadToolImpl(accessToken, options);
}
