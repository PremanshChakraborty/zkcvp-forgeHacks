"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GithubBranch, GithubCommit } from "@zkcvp/github";
import type { RequirementStatus } from "@zkcvp/contracts";
import {
  Alert,
  Button,
  Checkbox,
  Disclosure,
  DisclosureList,
  CommitList,
  CommitRow,
  Field,
  Fieldset,
  Select,
  StatusBadge,
  VersionPill,
  EvaluationProgress,
} from "@zkcvp/design-system-ledger/components";
import { listBranchesAction, listCommitsAction } from "./actions";
import { useClaimStream, type ClaimRun } from "../../../../../lib/claims/use-claim-stream";

export type ClaimRequirementOption = {
  requirementVersionId: string;
  /**
   * The version this claim would pin, which is always the requirement's current
   * one: `createClaim` rejects a superseded version outright, on the grounds
   * that evaluating one would judge text the developer never read.
   */
  versionNumber: number;
  title: string;
  description: string;
  status: RequirementStatus;
};

export type ClaimRepoOption = {
  id: string;
  fullName: string;
  defaultBranch: string;
};

type RepoEntry = {
  key: string;
  repoId: string;
  branch: string;
  commitSha: string;
  branches: GithubBranch[] | null;
  branchesLoading: boolean;
  branchesError: string | null;
  commits: GithubCommit[] | null;
  commitsLoading: boolean;
  commitsError: string | null;
};

/** Dates are absolute throughout this product, never relative — see repos/page.tsx. */
const retryAtFormat = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function makeEntry(): RepoEntry {
  return {
    key: crypto.randomUUID(),
    repoId: "",
    branch: "",
    commitSha: "",
    branches: null,
    branchesLoading: false,
    branchesError: null,
    commits: null,
    commitsLoading: false,
    commitsError: null,
  };
}

export function ClaimComposer({
  projectId,
  requirements,
  repos,
  ceilingSeconds,
}: {
  projectId: string;
  requirements: ClaimRequirementOption[];
  repos: ClaimRepoOption[];
  ceilingSeconds: number;
}) {
  const router = useRouter();
  const { run, submit } = useClaimStream();

  const boundListBranches = (repoId: string) => listBranchesAction(projectId, repoId);
  const boundListCommits = (repoId: string, ref: string) =>
    listCommitsAction(projectId, repoId, ref);

  const [selectedReqs, setSelectedReqs] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<RepoEntry[]>(() => [makeEntry()]);
  const [validationError, setValidationError] = useState<string | null>(null);

  /* The clock ticks locally from the moment the request was opened — the
   * server never streams a heartbeat for this, only progress frames when the
   * graph actually advances. */
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (run.status !== "running") return;
    const startedAt = run.startedAt;
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.status === "running" ? run.startedAt : null]);

  /* `done` carries only a claimId, not the phase/round/etc. EvaluationProgress
   * needs — so the last running snapshot is kept a beat longer, purely so the
   * screen does not flash back to the form for the instant between the `done`
   * frame arriving and the redirect below actually landing. */
  const [lastProgress, setLastProgress] = useState<Extract<ClaimRun, { status: "running" }> | null>(
    null,
  );
  useEffect(() => {
    if (run.status === "running") setLastProgress(run);
  }, [run]);

  useEffect(() => {
    if (run.status === "done") router.push(`/claims/${run.claimId}`);
  }, [run, router]);

  function toggleRequirement(id: string) {
    setSelectedReqs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function replaceEntry(key: string, patch: Partial<RepoEntry> | ((e: RepoEntry) => RepoEntry)) {
    setEntries((prev) =>
      prev.map((e) => (e.key === key ? (typeof patch === "function" ? patch(e) : { ...e, ...patch }) : e)),
    );
  }

  function addEntry() {
    setEntries((prev) => [...prev, makeEntry()]);
  }

  function removeEntry(key: string) {
    setEntries((prev) => prev.filter((e) => e.key !== key));
  }

  function availableReposFor(entry: RepoEntry): ClaimRepoOption[] {
    const takenElsewhere = new Set(
      entries.filter((e) => e.key !== entry.key && e.repoId).map((e) => e.repoId),
    );
    return repos.filter((r) => r.id === entry.repoId || !takenElsewhere.has(r.id));
  }

  async function handleBranchChange(key: string, repoId: string, ref: string) {
    replaceEntry(key, {
      branch: ref,
      commitSha: "",
      commits: null,
      commitsError: null,
      commitsLoading: true,
    });
    try {
      const result = await boundListCommits(repoId, ref);
      replaceEntry(key, (e) => {
        /* Stale-response guard: the developer may have switched repo or branch
         * again while this request was in flight. */
        if (e.repoId !== repoId || e.branch !== ref) return e;
        if (result.status === "error") {
          return { ...e, commitsError: result.message };
        }
        return { ...e, commits: result.commits };
      });
    } catch {
      /* boundListCommits/listCommitsAction rethrows anything that isn't a
       * ServiceError (a session that expired mid-request, for one). Left
       * uncaught, this handler — fired from onChange, awaited by nobody —
       * would become an unhandled rejection and strand the picker on
       * "Loading commits…" forever, with no error and no way out but a
       * reload. A generic message is right here: a rethrown non-ServiceError
       * has no user-meaningful text. */
      replaceEntry(key, (e) =>
        e.repoId === repoId && e.branch === ref
          ? { ...e, commitsError: "Something went wrong. Try again." }
          : e,
      );
    } finally {
      /* Cleared on every path — success, a returned error, and a thrown one —
       * so the loading state can never outlive the request that set it. */
      replaceEntry(key, (e) =>
        e.repoId === repoId && e.branch === ref ? { ...e, commitsLoading: false } : e,
      );
    }
  }

  async function handleRepoChange(key: string, repoId: string) {
    replaceEntry(key, {
      repoId,
      branch: "",
      commitSha: "",
      branches: null,
      branchesError: null,
      commits: null,
      commitsError: null,
      branchesLoading: Boolean(repoId),
    });
    if (!repoId) return;

    let resolvedBranch: string | null = null;
    try {
      const result = await boundListBranches(repoId);
      if (result.status === "error") {
        replaceEntry(key, (e) => (e.repoId === repoId ? { ...e, branchesError: result.message } : e));
        return;
      }

      /* Pre-selects the repo's own default branch — no extra GitHub call,
       * since AttachedRepo.defaultBranch is already known from the server
       * props. */
      const repo = repos.find((r) => r.id === repoId);
      const names = result.branches.map((b) => b.name);
      resolvedBranch = names.includes(repo?.defaultBranch ?? "")
        ? (repo!.defaultBranch as string)
        : (names[0] ?? "");

      replaceEntry(key, (e) =>
        e.repoId === repoId ? { ...e, branches: result.branches, branch: resolvedBranch! } : e,
      );
    } catch {
      /* Same reasoning as handleBranchChange's catch: an uncaught rethrow
       * here (e.g. an expired session) would otherwise strand this row on
       * "Loading branches…" with no error and no retry affordance. */
      replaceEntry(key, (e) =>
        e.repoId === repoId ? { ...e, branchesError: "Something went wrong. Try again." } : e,
      );
      return;
    } finally {
      replaceEntry(key, (e) => (e.repoId === repoId ? { ...e, branchesLoading: false } : e));
    }

    if (resolvedBranch) {
      await handleBranchChange(key, repoId, resolvedBranch);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedReqs.size === 0) {
      setValidationError("Select at least one requirement.");
      return;
    }
    if (entries.some((en) => !en.repoId || !en.commitSha)) {
      setValidationError("Choose a repository, branch, and commit for every row.");
      return;
    }
    setValidationError(null);
    void submit(projectId, {
      requirementVersionIds: Array.from(selectedReqs),
      repos: entries.map((en) => ({ projectRepoId: en.repoId, commitSha: en.commitSha })),
    });
  }

  const showProgress = run.status === "running" || run.status === "done";
  const progress = run.status === "running" ? run : lastProgress;

  return (
    <div className="lg-stack lg-stack--loose">
      {run.status === "failed" && (
        <Alert tone="danger" title="The evaluation did not complete">
          {run.message}
          {run.retryAt && <> Retry after {retryAtFormat.format(new Date(run.retryAt))}.</>}
        </Alert>
      )}

      {showProgress && progress ? (
        <EvaluationProgress
          elapsedSeconds={elapsedSeconds}
          ceilingSeconds={ceilingSeconds}
          phase={progress.phase}
          completed={progress.completed}
          filesRead={progress.filesRead}
          round={progress.round}
        />
      ) : (
        <form onSubmit={handleSubmit} className="lg-stack lg-stack--loose">
          {validationError && <Alert tone="danger">{validationError}</Alert>}

          <Fieldset legend="Requirements this claim covers">
            {/* The same expandable entries the checklist uses, so a developer
                picking requirements reads them in the shape they already know
                from the project page. The checkbox rides in the `lead` slot,
                outside the summary: inside one, a single click would both
                select the requirement and expand it, and the description a
                developer opened to read would collapse the moment they ticked
                the box they opened it to decide about. */}
            <DisclosureList>
              {requirements.map((r) => (
                <Disclosure
                  key={r.requirementVersionId}
                  lead={
                    <Checkbox
                      checked={selectedReqs.has(r.requirementVersionId)}
                      onChange={() => toggleRequirement(r.requirementVersionId)}
                      /* The summary carries the title visually; the checkbox
                         needs its own name, because "checkbox" is all a screen
                         reader would otherwise announce. */
                      label={
                        <span className="lg-sr-only">{`Claim ${r.title}`}</span>
                      }
                    />
                  }
                  summary={
                    <>
                      {r.title}
                      <StatusBadge status={r.status} />
                    </>
                  }
                  /* The version the claim would pin, in the trailing slot the
                     checklist uses for a timestamp. A claim is a statement
                     about a specific version and the record keeps it forever,
                     so the developer should be able to see which one they are
                     signing for without opening the requirement. */
                  meta={<VersionPill version={r.versionNumber} current />}
                >
                  {r.description ? (
                    <p className="lg-prose">{r.description}</p>
                  ) : null}
                </Disclosure>
              ))}
            </DisclosureList>
          </Fieldset>

          <Fieldset legend="Repositories and commits">
            <div className="lg-stack">
              {entries.map((entry, index) => (
                <RepoEntryFields
                  key={entry.key}
                  index={index}
                  entry={entry}
                  repoOptions={availableReposFor(entry)}
                  onRepoChange={(repoId) => handleRepoChange(entry.key, repoId)}
                  onBranchChange={(branch) => handleBranchChange(entry.key, entry.repoId, branch)}
                  onRetryBranches={() => handleRepoChange(entry.key, entry.repoId)}
                  onRetryCommits={() => handleBranchChange(entry.key, entry.repoId, entry.branch)}
                  onCommitSelect={(sha) => replaceEntry(entry.key, { commitSha: sha })}
                  onRemove={entries.length > 1 ? () => removeEntry(entry.key) : undefined}
                />
              ))}
            </div>

            {entries.length < repos.length && (
              <div>
                <Button type="button" tone="secondary" onClick={addEntry}>
                  Add another repo
                </Button>
              </div>
            )}
          </Fieldset>

          <div>
            <Button type="submit" tone="primary">
              Submit claim
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function RepoEntryFields({
  index,
  entry,
  repoOptions,
  onRepoChange,
  onBranchChange,
  onRetryBranches,
  onRetryCommits,
  onCommitSelect,
  onRemove,
}: {
  index: number;
  entry: RepoEntry;
  repoOptions: ClaimRepoOption[];
  onRepoChange: (repoId: string) => void;
  onBranchChange: (branch: string) => void;
  onRetryBranches: () => void;
  onRetryCommits: () => void;
  onCommitSelect: (sha: string) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="app-claim-repo-entry lg-stack lg-stack--tight">
      <div className="lg-row-flex lg-row-flex--between">
        <strong className="lg-caption">Repository {index + 1}</strong>
        {onRemove && (
          <Button type="button" tone="quiet" size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>

      <Field label="Repository" required>
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            value={entry.repoId}
            aria-describedby={describedBy}
            invalid={invalid}
            onChange={(e) => onRepoChange(e.target.value)}
          >
            <option value="" disabled>
              Select a repository
            </option>
            {repoOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {entry.repoId && (
        <Field label="Branch" required help="Defaults to the repository's default branch.">
          {({ id, describedBy, invalid }) =>
            entry.branchesLoading ? (
              <p className="lg-caption">Loading branches…</p>
            ) : entry.branchesError ? (
              <Alert
                tone="danger"
                title="Could not load branches"
                actions={
                  <Button type="button" size="sm" onClick={onRetryBranches}>
                    Retry
                  </Button>
                }
              >
                {entry.branchesError}
              </Alert>
            ) : (
              <Select
                id={id}
                value={entry.branch}
                aria-describedby={describedBy}
                invalid={invalid}
                onChange={(e) => onBranchChange(e.target.value)}
              >
                {(entry.branches ?? []).map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )
          }
        </Field>
      )}

      {entry.repoId && entry.branch && !entry.branchesError && (
        <Field label="Commit" required help="Up to 50 most recent commits on this branch.">
          {() =>
            entry.commitsLoading ? (
              <p className="lg-caption">Loading commits…</p>
            ) : entry.commitsError ? (
              <Alert
                tone="danger"
                title="Could not load commits"
                actions={
                  <Button type="button" size="sm" onClick={onRetryCommits}>
                    Retry
                  </Button>
                }
              >
                {entry.commitsError}
              </Alert>
            ) : entry.commits && entry.commits.length > 0 ? (
              <div className="app-claim-commit-scroll">
                <CommitList label={`Commits on ${entry.branch}`}>
                  {entry.commits.map((c) => (
                    <CommitRow
                      key={c.sha}
                      sha={c.sha}
                      subject={c.message}
                      author={c.authorName}
                      authoredAt={c.committedAt}
                      selected={entry.commitSha === c.sha}
                      actions={
                        <Button
                          type="button"
                          size="sm"
                          tone={entry.commitSha === c.sha ? "primary" : "secondary"}
                          onClick={() => onCommitSelect(c.sha)}
                        >
                          {entry.commitSha === c.sha ? "Selected" : "Select"}
                        </Button>
                      }
                    />
                  ))}
                </CommitList>
              </div>
            ) : (
              <p className="lg-caption">No commits found on this branch.</p>
            )
          }
        </Field>
      )}
    </div>
  );
}
