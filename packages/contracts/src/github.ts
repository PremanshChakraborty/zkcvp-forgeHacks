export type RepoCommit = {
  /** "owner/name". */
  repo: string;
  /** Full 40-character SHA. The Evaluator reads this exact commit, never HEAD. */
  commitSha: string;
};

export type TreeEntry = {
  path: string;
  type: "file" | "dir";
  size?: number;
};

export type Tree = {
  entries: TreeEntry[];
  /**
   * GitHub caps a recursive tree listing and sets this when it did.
   *
   * It changes how a later 404 must be read: against a complete tree a planned
   * path that 404s is anomalous (the planner only ever sees real paths), but
   * against a truncated one it is ordinary, because the file may exist in a
   * part of the tree that was never listed. The Evaluator uses this to decide
   * whether to hard-filter unknown paths or let them through.
   */
  truncated: boolean;
};

export type ChangedFile = {
  path: string;
  status: string;
};

/**
 * How a read failed, in the vocabulary the Evaluator reasons in.
 *
 * This lives in the contract rather than in the client because the interface
 * has to describe how it fails, not just what it does. `packages/orchestrator`
 * depends only on `@zkcvp/contracts` and never imports a concrete
 * implementation, so without a shared taxonomy the only way to tell a rate
 * limit from a missing file would be to match on HTTP status codes or message
 * strings. It also means a test double can raise exactly what the real client
 * raises.
 *
 * The distinction that carries the weight: `not_found` is EVIDENCE — a fact
 * about the repo, and a legitimate input to a verdict. Everything else is the
 * ABSENCE of evidence and must never colour one.
 */
export type GitHubErrorKind =
  | "not_found"
  | "rate_limited"
  | "unauthorized"
  | "forbidden"
  | "too_large"
  | "malformed"
  | "unavailable";

export class GitHubReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: GitHubErrorKind,
    /** When a rate limit resets. ISO 8601. */
    readonly resetAt?: string,
  ) {
    super(message);
    this.name = "GitHubReadError";
  }

  /** Retrying changes nothing for the rest — the answer would be identical. */
  get retryable(): boolean {
    return this.kind === "rate_limited" || this.kind === "unavailable";
  }
}

/**
 * Identifies the error across package boundaries.
 *
 * `instanceof` is not reliable here: workspace packages can resolve to
 * different copies of a module, and a test double may build its own error
 * rather than importing this class.
 */
export function isGitHubReadError(err: unknown): err is GitHubReadError {
  return (
    err instanceof Error &&
    typeof (err as GitHubReadError).kind === "string" &&
    typeof (err as GitHubReadError).status === "number"
  );
}

/**
 * File and diff access scoped to specific commit SHAs.
 *
 * Authenticated as the requesting developer's own live GitHub OAuth token —
 * never a service-level credential, and there is no GitHub App or installation
 * anywhere in this design. The token is injected by the caller and is never
 * stored, logged, or serialised into either output artifact.
 *
 * This is also why evaluation runs synchronously inside the request that submits
 * a claim: there is no persisted token a background process could use once the
 * developer's session ends.
 */
export interface GitHubReadTool {
  readFile(repo: string, commitSha: string, path: string): Promise<string>;
  listTree(repo: string, commitSha: string, path?: string): Promise<Tree>;
  diff(repo: string, baseSha: string, headSha: string): Promise<string>;
  /**
   * Paths touched by `commitSha` relative to its first parent — filenames and
   * statuses only, never patch bodies.
   *
   * A RANKING HINT for the planner, not evidence. It narrows where to look
   * first while the full tree stays the selection space, so the evaluation
   * still asserts "this code satisfies the requirement" (snapshot) rather than
   * "this change satisfies it" (delta), and an unhelpful hint degrades to
   * nothing rather than misleading.
   *
   * Returns `[]` for a root commit, and for a merge commit — where the first
   * parent describes the branch's step rather than the work being claimed.
   */
  changedFiles(repo: string, commitSha: string): Promise<ChangedFile[]>;
}
