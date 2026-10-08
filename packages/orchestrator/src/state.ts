import { Annotation } from "@langchain/langgraph";
import type {
  EvidenceBundle,
  RepoCommit,
  Report,
  RunTrace,
  ToolCall,
  Tree,
  Verdict,
} from "@zkcvp/contracts";

/**
 * The graph's channels.
 *
 * Two rules hold everywhere below:
 *
 * 1. **Nothing here holds a credential.** The GitHubReadTool moved to
 *    `config.configurable` (see context.ts), so every channel is plain data and
 *    the whole state is serialisable.
 * 2. **A file reference always carries its repo.** The planner used to emit
 *    bare path strings, which lost track of which commit a path had been chosen
 *    from — the gatherer then read every file from `repoCommits[0]`, so a path
 *    present in two repos was read from the wrong one silently. Provenance now
 *    lives in the type, and `repo` is a sufficient discriminator because the
 *    input is constrained to one commit per repo.
 */

/** A file the planner chose, with the repo it was chosen from. */
export type PlannedFile = {
  repo: string;
  path: string;
  /**
   * Character offset to read from. Absent for a first read; set only by
   * ANALYZE asking to continue a file GATHER truncated.
   */
  offset?: number;
};

/** A file — or one window of a long file — the gatherer attempted. */
export type GatheredFile = {
  repo: string;
  path: string;
  /** Content, or a marker describing why there is none. */
  content: string;
  /** `ok` and `truncated` carry code; `not_found` is evidence of absence. */
  status: "ok" | "truncated" | "not_found" | "too_large";
  /** Where this window starts in the file. 0 for a first read. */
  offset: number;
  /** The whole file's length, so the model knows how much it has not seen. */
  totalChars?: number;
};

export type RequirementInput = {
  requirementVersionId: string;
  title: string;
  description: string;
};

export type VerdictEntry = {
  requirementVersionId: string;
  verdict: Verdict;
  rationale: string;
};

/** `repo:path` — unique across repos, unlike a bare path. */
export function fileKey(file: { repo: string; path: string }): string {
  return `${file.repo}:${file.path}`;
}

/**
 * `repo:path` for a first read, `repo:path#offset` for a later window — so a
 * continuation is a new entry in `gatheredFiles` rather than overwriting the
 * window the model has already seen.
 */
export function windowKey(file: { repo: string; path: string; offset?: number }): string {
  return file.offset ? `${fileKey(file)}#${file.offset}` : fileKey(file);
}

/** Later verdicts win per requirement; untouched requirements survive. */
export function mergeVerdicts(
  current: VerdictEntry[],
  update: VerdictEntry[],
): VerdictEntry[] {
  const byId = new Map(current.map((v) => [v.requirementVersionId, v]));
  for (const v of update) byId.set(v.requirementVersionId, v);
  return [...byId.values()];
}

export const EvaluatorAnnotation = Annotation.Root({
  // ── Input, set once at entry ──
  claimId: Annotation<string>,
  evaluationId: Annotation<string>,
  repoCommits: Annotation<RepoCommit[]>,
  requirements: Annotation<RequirementInput[]>,

  // ── Built by PLAN ──
  /** repo → the tree at that repo's claimed commit. */
  trees: Annotation<Record<string, Tree>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
  /** repo → paths the claimed commit touched. A ranking hint, not evidence. */
  changedFiles: Annotation<Record<string, string[]>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
  plannedFiles: Annotation<PlannedFile[]>({
    reducer: (_a, b) => b,
    default: () => [],
  }),
  /** Kept, not discarded — the evidence bundle must explain the plan step. */
  planReasoning: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),
  /** Paths the model asked for that do not exist. Recorded, not silently lost. */
  droppedPaths: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  // ── Built by GATHER ──
  toolCallLog: Annotation<ToolCall[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  gatheredFiles: Annotation<Record<string, GatheredFile>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),

  // ── Built by ANALYZE ──
  verdicts: Annotation<VerdictEntry[]>({
    reducer: mergeVerdicts,
    default: () => [],
  }),
  needsMoreEvidence: Annotation<boolean>({
    reducer: (_a, b) => b,
    default: () => false,
  }),
  additionalFilesNeeded: Annotation<PlannedFile[]>({
    reducer: (_a, b) => b,
    default: () => [],
  }),

  // ── Control ──
  iterationCount: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),
  /** Why ANALYZE let the loop end. Set on the round that ends it. */
  stopReason: Annotation<RunTrace["stopReason"] | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),

  // ── Trace, appended by each node; assembled into the evidence by FORMAT ──
  traceNodes: Annotation<RunTrace["nodes"]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  traceModelCalls: Annotation<RunTrace["modelCalls"]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  filesReadPerRound: Annotation<string[][]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  // ── Terminal, written only by FORMAT ──
  /**
   * Kept as channels rather than assembled after the run so a streaming
   * consumer sees FORMAT complete like any other node, and so the finished
   * artifacts belong to the snapshot a checkpointer would capture. Still two
   * separate values: one is withheld and one is unconditionally visible, and
   * merging them here would invite a surface that merges them too.
   */
  evidence: Annotation<EvidenceBundle | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
  report: Annotation<Report | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
});

export type EvaluatorState = typeof EvaluatorAnnotation.State;
export type EvaluatorUpdate = typeof EvaluatorAnnotation.Update;
