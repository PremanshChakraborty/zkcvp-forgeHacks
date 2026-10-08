import type { Verdict } from "./domain";
import type { GitHubReadTool, RepoCommit } from "./github";

export type EvaluatorInput = {
  claim: {
    /**
     * Identifies the developer's submission that triggered this evaluation.
     * This is a CALLER concept (it comes from the future claim-submission
     * flow, not from the Evaluator itself), so it arrives via the input
     * rather than being minted inside `evaluate()`. It is echoed back
     * verbatim into both `EvidenceBundle.claimId` and `Report.claimId`.
     */
    claimId: string;
    /**
     * AT MOST ONE ENTRY PER REPO, and that is enforced, not merely expected.
     *
     * A commit is a full snapshot, so two commits of the same repo would give
     * the planner two file trees whose paths overlap while the gatherer can
     * only read one of them — the same path at the wrong commit reads
     * successfully and silently yields the wrong content. `repo` is therefore
     * the discriminator that maps a planned path back to a commit, and it only
     * works while it is unique. See docs/orchestrator.md § 9.
     */
    repoCommits: RepoCommit[];
  };
  /** One or more, evaluated together against the same claim. */
  requirements: {
    requirementVersionId: string;
    title: string;
    description: string;
  }[];
  github: GitHubReadTool;
  /**
   * Overrides the Evaluator's default model. Echoed into `Report.modelId`,
   * which must always name the model that actually produced the verdicts —
   * a report that misreports its own model undermines the record it anchors.
   */
  modelId?: string;
  /**
   * Wall-clock budget for the whole run. The Evaluator refuses to start work
   * it cannot finish, rather than being killed mid-write by the host.
   */
  deadline?: Date;
  /**
   * Cancels the run when the caller goes away — a closed browser tab, a host
   * tearing down the request. Distinct from `deadline`, which is the
   * Evaluator's own budget rather than the caller's patience.
   */
  signal?: AbortSignal;
};

/**
 * How a tool call ended.
 *
 * `not_found` and `truncated` are EVIDENCE — a fact about the repo, and a
 * legitimate input to a verdict. `unavailable` is the ABSENCE of evidence: the
 * call failed for a reason that says nothing about the code. Collapsing the two
 * is how a rate limit turns into "not satisfied", which PRODUCT.md principle 2
 * forbids.
 */
export type ToolCallOutcome = "ok" | "not_found" | "truncated" | "unavailable";

export type ToolCall = {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  at: string;
  outcome: ToolCallOutcome;
};

/**
 * The raw tool-call transcript, containing verbatim source from a private repo.
 *
 * NOT shown to the stakeholder in this phase — stored only. This is what gets
 * hashed for the Transparency Log's `evidence_hash`, which is what makes
 * integrity checkable WITHOUT disclosing contents. Withheld is not unverifiable;
 * the two are separate operations and the first never requires the second.
 */
export type EvidenceBundle = {
  /**
   * Identifies one *execution* of `evaluate()`. Unlike `claimId`, this is a
   * CALLEE concept — a real implementation mints it itself (e.g.
   * `crypto.randomUUID()` at the start of `evaluate()`) and uses the same
   * value here and in the returned `Report`, rather than receiving it via
   * `EvaluatorInput`.
   */
  evaluationId: string;
  claimId: string;
  toolCallLog: ToolCall[];
  /**
   * Why the agent chose the files it read.
   *
   * Kept because a transcript of reads alone cannot be audited: it shows what
   * was looked at, never what was passed over or why. Prose from the planning
   * step, never source code.
   */
  planReasoning: string;
  /**
   * File requests that named nothing real, and the reason each was discarded.
   *
   * A planner naming a few paths that do not exist is ordinary, and dropping
   * them silently would leave the transcript implying the agent never asked.
   */
  droppedPaths: string[];
  /**
   * What the run did, for explaining a verdict after the fact: timing, rounds,
   * reads, model usage, guardrail interventions, and why the loop stopped.
   *
   * Lives here rather than in a tracing service so it is hashed with the rest
   * of the evidence and needs no third party. Never contains source code.
   * Optional only so bundles recorded before it existed still type-check.
   */
  trace?: RunTrace;
};

export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type RunTrace = {
  nodes: {
    node: "plan" | "gather" | "analyze" | "format";
    /** GATHER↔ANALYZE round the node ran in; 0 for PLAN. */
    round: number;
    startedAt: string;
    durationMs: number;
  }[];
  modelCalls: {
    node: "plan" | "analyze";
    round: number;
    /** Transport retries plus repair rounds; 1 means first try accepted. */
    attempts: number;
    /** Each repair instruction the model was given, in order. */
    repairs: string[];
    usage: ModelUsage;
  }[];
  /** Per round, the `repo:path` keys GATHER attempted. */
  filesReadPerRound: string[][];
  rounds: number;
  stopReason: "sufficient" | "iteration_cap" | "no_readable_files";
  /** Rationales replaced at FORMAT, and why. */
  redactions: {
    requirementVersionId: string;
    reason: "code" | "ungrounded_citation";
    detail?: string;
  }[];
  totalUsage: ModelUsage;
};

/**
 * Human language only, one entry per requirement in the batch.
 *
 * Unconditionally visible to the stakeholder the moment evaluation completes —
 * no developer consent step, no release flag, no gating of any kind.
 */
export type Report = {
  evaluationId: string;
  claimId: string;
  modelId: string;
  promptTemplateVersion: string;
  /** ISO 8601. Dates are absolute throughout this product, never relative. */
  createdAt: string;
  perRequirement: {
    requirementVersionId: string;
    verdict: Verdict;
    /**
     * Prose. Must never embed verbatim source code — a file path or a line
     * range is fine, pasted code is not. This is a GENERATION-TIME constraint
     * on the agent's output step, not a display-layer filter: filtering code
     * out of already-generated text is unreliable.
     */
    rationale: string;
  }[];
};

/**
 * The Evaluator, black-boxed on purpose.
 *
 * Returns two STRUCTURALLY SEPARATE artifacts. They are never merged into one
 * object: one is withheld and one is unconditionally visible, and a shape that
 * blurs that invites a surface that blurs it too.
 *
 * A plain async function by design. The route handler that calls it is a thin
 * adapter, so moving between a serverless host and a long-lived Node host
 * changes where this is invoked from, not what it is.
 */
export interface Evaluator {
  evaluate(input: EvaluatorInput): Promise<{
    evidence: EvidenceBundle;
    report: Report;
  }>;
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet`);
    this.name = "NotImplementedError";
  }
}

/**
 * Why an evaluation produced no Report at all.
 *
 * The Report is ALL-OR-NOTHING. It is unconditionally stakeholder-visible the
 * instant it exists and there is no pending state to park a draft in, so a
 * partial or evidence-starved report is strictly worse than no report. Every
 * failure therefore surfaces as a thrown error rather than a degraded verdict,
 * which is what keeps `Verdict` at two members and `RequirementStatus` at
 * three: a failed request is not a state a requirement rests in.
 *
 * The caller maps `kind` to a status code. The rule that matters at the
 * transport layer: a verdict is a 200, a failure never is.
 */
export type EvaluationErrorKind =
  /** The developer's GitHub token was rejected mid-run. Re-authenticate. */
  | "unauthorized"
  /** GitHub rate limit, with a reset beyond the run's budget. Retry later. */
  | "rate_limited"
  /** The repo or the claimed commit could not be read at all. */
  | "repo_unreachable"
  /** The model provider failed or returned unusable output after repair. */
  | "model_unavailable"
  /** Evidence was materially incomplete, so no sound verdict was possible. */
  | "evidence_incomplete"
  /** The run could not finish inside its budget. */
  | "deadline_exceeded"
  /** The caller's input violated the contract (e.g. duplicate repos). */
  | "invalid_input";

export class EvaluationError extends Error {
  constructor(
    readonly kind: EvaluationErrorKind,
    message: string,
    /** Present for `rate_limited`: when the limit resets. ISO 8601. */
    readonly retryAt?: string,
  ) {
    super(message);
    this.name = "EvaluationError";
  }
}
