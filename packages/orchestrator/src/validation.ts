/**
 * Checks the schema cannot make.
 *
 * `withStructuredOutput` guarantees the SHAPE of a model's response and nothing
 * about its CONTENTS: a Zod schema cannot know which requirement IDs exist or
 * which paths are real. Everything here is pure and synchronous, so it is
 * cheap to test directly — which matters, because these are the checks standing
 * between a hallucinated ID and a persisted requirement status.
 */
import type { RepoCommit, Tree } from "@zkcvp/contracts";
import { EvaluationError } from "@zkcvp/contracts";

import { fileKey, type PlannedFile, type RequirementInput, type VerdictEntry } from "./state";
import { MAX_PLANNED_FILES } from "./limits";

/**
 * One commit per repo, enforced.
 *
 * A commit is a full snapshot, so a second commit of the same repo adds no
 * readable state — but it does give the planner two overlapping trees while
 * leaving `repo` no longer able to identify which commit a path came from. The
 * failure that produces is silent: the same path read at the wrong commit
 * succeeds and returns the wrong content.
 */
export function assertOneCommitPerRepo(repoCommits: RepoCommit[]): void {
  if (repoCommits.length === 0) {
    throw new EvaluationError("invalid_input", "A claim must pin at least one repo commit");
  }
  const seen = new Set<string>();
  for (const rc of repoCommits) {
    if (seen.has(rc.repo)) {
      throw new EvaluationError(
        "invalid_input",
        `A claim may pin at most one commit per repo; ${rc.repo} appears more than once`,
      );
    }
    seen.add(rc.repo);
  }
}

export type ResolvedFiles = {
  accepted: PlannedFile[];
  /** Human-readable reasons, suitable for a repair prompt and the evidence. */
  dropped: string[];
};

/**
 * Keep the file requests that name a real repo and a real path.
 *
 * Filtering is the right response here, not rejection: a planner returning
 * three bad paths out of twenty is ordinary model behaviour, and aborting a run
 * over it would make the Evaluator uselessly brittle. A verdict set missing a
 * requirement is the opposite case — see `verdictProblem`.
 *
 * When GitHub truncated a tree, unknown paths are ACCEPTED rather than dropped:
 * the file may exist in a part of the tree that was never listed, and a 404 at
 * read time is evidence either way.
 */
export function resolveFiles(
  requested: { repo: string; path: string }[],
  trees: Record<string, Tree>,
  options: { limit?: number; exclude?: Set<string> } = {},
): ResolvedFiles {
  const limit = options.limit ?? MAX_PLANNED_FILES;
  const exclude = options.exclude ?? new Set<string>();

  const accepted: PlannedFile[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();

  const pathsByRepo = new Map<string, Set<string>>();
  for (const [repo, tree] of Object.entries(trees)) {
    pathsByRepo.set(
      repo,
      new Set(tree.entries.filter((e) => e.type === "file").map((e) => e.path)),
    );
  }

  for (const req of requested) {
    const path = req.path.trim().replace(/^\.?\//, "");
    const tree = trees[req.repo];

    if (!tree) {
      dropped.push(`${req.repo}:${path} — no such repo in this claim`);
      continue;
    }
    if (!tree.truncated && !pathsByRepo.get(req.repo)?.has(path)) {
      dropped.push(`${req.repo}:${path} — not present at the claimed commit`);
      continue;
    }

    const key = fileKey({ repo: req.repo, path });
    if (seen.has(key) || exclude.has(key)) continue;
    seen.add(key);

    if (accepted.length >= limit) {
      dropped.push(`${req.repo}:${path} — over the ${limit}-file limit`);
      continue;
    }
    accepted.push({ repo: req.repo, path });
  }

  return { accepted, dropped };
}

/**
 * Why a verdict set is unusable, or null if it is fine.
 *
 * Returned as a sentence addressed to the model, because it is fed straight
 * back as a repair instruction. A missing verdict cannot be filtered around the
 * way a bad file path can: there is nothing to fall back to, and FORMAT would
 * otherwise emit a Report that silently omits a requirement the stakeholder
 * asked about.
 */
export function verdictProblem(
  verdicts: VerdictEntry[],
  requirements: RequirementInput[],
): string | null {
  const expected = new Set(requirements.map((r) => r.requirementVersionId));
  const returned = new Set<string>();

  for (const v of verdicts) {
    if (!expected.has(v.requirementVersionId)) {
      return `You returned a verdict for "${v.requirementVersionId}", which is not one of the requirement IDs you were given. Use only the exact IDs listed under REQUIREMENTS.`;
    }
    if (returned.has(v.requirementVersionId)) {
      return `You returned more than one verdict for "${v.requirementVersionId}". Return exactly one verdict per requirement.`;
    }
    if (!v.rationale.trim()) {
      return `Your rationale for "${v.requirementVersionId}" is empty. Every verdict needs a rationale in natural language.`;
    }
    returned.add(v.requirementVersionId);
  }

  const missing = [...expected].filter((id) => !returned.has(id));
  if (missing.length > 0) {
    return `You returned verdicts for ${returned.size} of ${expected.size} requirements. Missing: ${missing.join(", ")}. Return one verdict for every requirement.`;
  }

  return null;
}
