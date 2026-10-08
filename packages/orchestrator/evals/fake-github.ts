/**
 * An in-memory GitHubReadTool over a fixture repo.
 *
 * It implements the same contract the production client does and fails the
 * same way — `GitHubReadError` with a real `kind` — so GATHER cannot tell the
 * difference: a missing path is `not_found` evidence, exactly as a 404 would
 * be. No credentials, no network.
 */
import {
  GitHubReadError,
  type ChangedFile,
  type GitHubReadTool,
  type Tree,
} from "@zkcvp/contracts";

/** One repository at one commit. */
export type FixtureRepo = {
  /** "owner/name", as the claim names it. */
  repo: string;
  /** Path → content. Directories are implied by the paths. */
  files: Record<string, string>;
  /** Paths the claimed commit touched — the planner's ranking hint. */
  changed?: string[];
};

/** A deterministic 40-char SHA per repo, so every claim pins something real-looking. */
export function fixtureSha(repo: string): string {
  let h = 0;
  for (const c of repo) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, "0").repeat(5);
}

export class FakeGitHubReadTool implements GitHubReadTool {
  private readonly repos: Map<string, FixtureRepo>;
  /** Every call, so a test can assert on what the agent asked for. */
  readonly calls: { method: string; repo: string; path?: string }[] = [];

  constructor(repos: FixtureRepo[]) {
    this.repos = new Map(repos.map((r) => [r.repo, r]));
  }

  private resolve(repo: string, commitSha: string): FixtureRepo {
    const fixture = this.repos.get(repo);
    if (!fixture || commitSha !== fixtureSha(repo)) {
      // The production client classifies an unknown repo or commit as a
      // permission failure, which the Evaluator treats as fatal.
      throw new GitHubReadError(`${repo}@${commitSha} is not a fixture`, 403, "forbidden");
    }
    return fixture;
  }

  async readFile(repo: string, commitSha: string, path: string): Promise<string> {
    this.calls.push({ method: "readFile", repo, path });
    const content = this.resolve(repo, commitSha).files[path];
    if (content === undefined) {
      throw new GitHubReadError(`${path} not found`, 404, "not_found");
    }
    return content;
  }

  async listTree(repo: string, commitSha: string): Promise<Tree> {
    this.calls.push({ method: "listTree", repo });
    const paths = Object.keys(this.resolve(repo, commitSha).files).sort();
    const dirs = new Set<string>();
    for (const p of paths) {
      const parts = p.split("/");
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
    }
    return {
      entries: [
        ...[...dirs].sort().map((path) => ({ path, type: "dir" as const })),
        ...paths.map((path) => ({
          path,
          type: "file" as const,
          size: this.repos.get(repo)!.files[path]!.length,
        })),
      ],
      truncated: false,
    };
  }

  async diff(): Promise<string> {
    throw new GitHubReadError("diff is not used by the Evaluator", 501, "unavailable");
  }

  async changedFiles(repo: string, commitSha: string): Promise<ChangedFile[]> {
    this.calls.push({ method: "changedFiles", repo });
    const fixture = this.resolve(repo, commitSha);
    return (fixture.changed ?? []).map((path) => ({
      path,
      status: path in fixture.files ? "modified" : "removed",
    }));
  }
}
