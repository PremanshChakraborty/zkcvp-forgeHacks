// apps/web/app/projects/[id]/claims/new/actions.ts
"use server";

import type { GithubBranch, GithubCommit } from "@zkcvp/github";
import { getDb } from "../../../../../lib/db";
import { requireSession } from "../../../../../lib/auth/session";
import { listRepoBranches, listRepoCommits } from "../../../../../lib/repos/service";
import { ServiceError } from "../../../../../lib/api/errors";

/**
 * Branches and commits for the commit picker below the requirement checklist.
 *
 * Ruling C13 (task-6 brief): the plan never lists a route for either lookup —
 * `listRepoBranches`/`listRepoCommits` are service functions, not endpoints —
 * so this module exists to reach them from the client composer without
 * inventing an API route the contract does not have. Both spend the acting
 * developer's own GitHub token (see repos/service.ts), which is why they can
 * only run server-side.
 *
 * Same shape as `attachRepoAction`/`detachRepoAction` in
 * `../../repos/actions.ts`: `projectId` bound first, and a caught
 * `ServiceError` comes back as data instead of being thrown at the client.
 * `listRepoBranches`/`listRepoCommits` already translate a `GithubUnavailable`
 * into a 503 `ServiceError` — that translation is not re-derived here, only
 * carried across the server/client boundary as returned state, so a GitHub
 * outage reaches the picker as an infrastructure message rather than as an
 * empty list.
 */
export type BranchesResult =
  | { status: "ok"; branches: GithubBranch[] }
  | { status: "error"; message: string };

export async function listBranchesAction(
  projectId: string,
  repoId: string,
): Promise<BranchesResult> {
  try {
    const session = await requireSession();
    const branches = await listRepoBranches(getDb(), session, projectId, repoId);
    return { status: "ok", branches };
  } catch (e) {
    if (e instanceof ServiceError) {
      return { status: "error", message: e.message };
    }
    throw e;
  }
}

export type CommitsResult =
  | { status: "ok"; commits: GithubCommit[] }
  | { status: "error"; message: string };

export async function listCommitsAction(
  projectId: string,
  repoId: string,
  ref: string,
): Promise<CommitsResult> {
  try {
    const session = await requireSession();
    const commits = await listRepoCommits(getDb(), session, projectId, repoId, ref);
    return { status: "ok", commits };
  } catch (e) {
    if (e instanceof ServiceError) {
      return { status: "error", message: e.message };
    }
    throw e;
  }
}
