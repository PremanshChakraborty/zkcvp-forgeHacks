// apps/web/lib/repos/service.ts
import { and, eq } from "drizzle-orm";
import { projectRepos, type Db } from "@zkcvp/db";
import {
  createGitHubClient,
  GithubUnavailable,
  listBranches,
  listCommits,
  listUserRepos,
  type GitHubClient,
  type GithubBranch,
  type GithubCommit,
  type GithubRepo,
} from "@zkcvp/github";
import { isDeveloperMember, isProjectMember } from "../auth/authorization";
import type { DeveloperSession, Session } from "../auth/types";
import {
  conflict,
  forbidden,
  githubUnavailable,
  invalidBody,
  isForeignKeyViolation,
  isUniqueViolation,
  notFound,
} from "../api/errors";

/**
 * Removal is an undo, not a detach.
 *
 * Past this window an attachment is permanent for the life of the project.
 * That is what makes a claim unable to reference a repo removed from under it,
 * which is why claims may hold a plain foreign key to an attachment row.
 */
export const UNDO_WINDOW_MS = 60_000;

export type AttachedRepo = {
  id: string;
  githubRepoId: string;
  fullName: string;
  /** GitHub's own default branch at attach time. Pre-selects the branch in the
   * claim composer's commit picker (claims/new/ClaimComposer.tsx) — no extra
   * GitHub call needed to know it. */
  defaultBranch: string;
  addedAt: Date;
  /** Absolute instant the undo expires. The UI never computes this itself. */
  undoableUntil: Date;
};

/** Injected so tests never reach the network. Production passes the real call. */
export type RepoLister = { list: (client: GitHubClient) => Promise<GithubRepo[]> };

export const liveRepoLister: RepoLister = { list: listUserRepos };

const present = (row: typeof projectRepos.$inferSelect): AttachedRepo => ({
  id: row.id,
  githubRepoId: row.githubRepoId,
  fullName: row.fullName,
  defaultBranch: row.defaultBranch,
  addedAt: row.addedAt,
  undoableUntil: new Date(row.addedAt.getTime() + UNDO_WINDOW_MS),
});

/**
 * Every repo action but reading requires a developer, because every one of them
 * spends the acting developer's own GitHub token. A stakeholder has no GitHub
 * identity at all, so this is a statement about capability, not about trust.
 */
export async function assertDeveloperMember(
  db: Db,
  session: Session,
  projectId: string,
): Promise<DeveloperSession> {
  if (session.kind !== "developer") {
    throw forbidden("Only a developer may perform this action");
  }
  if (!(await isDeveloperMember(db, session.developerId, projectId))) {
    throw forbidden();
  }
  return session;
}

/** Readable by any project member: it touches the attachment table only. */
export async function listAttachedRepos(
  db: Db,
  session: Session,
  projectId: string,
): Promise<AttachedRepo[]> {
  if (!(await isProjectMember(db, session, projectId))) throw forbidden();

  const rows = await db
    .select()
    .from(projectRepos)
    .where(eq(projectRepos.projectId, projectId))
    .orderBy(projectRepos.addedAt);

  return rows.map(present);
}

/**
 * Reads live from GitHub, so a rate-limited or unreachable GitHub has to be
 * told apart from "this developer's account can see nothing" — see
 * `listRepoBranches` for why this translation lives beside every other
 * live-GitHub call rather than in the route.
 */
export async function listCandidateRepos(
  db: Db,
  session: Session,
  projectId: string,
  gh: RepoLister = liveRepoLister,
): Promise<GithubRepo[]> {
  const dev = await assertDeveloperMember(db, session, projectId);

  const attached = await db
    .select({ githubRepoId: projectRepos.githubRepoId })
    .from(projectRepos)
    .where(eq(projectRepos.projectId, projectId));

  const taken = new Set(attached.map((r) => r.githubRepoId));

  let all: GithubRepo[];
  try {
    all = await gh.list(createGitHubClient(dev.githubAccessToken));
  } catch (e) {
    if (e instanceof GithubUnavailable) throw githubUnavailable(e.message);
    throw e;
  }

  return all.filter((r) => !taken.has(r.githubRepoId));
}

/**
 * Attaches a repo the acting developer names by `githubRepoId`.
 *
 * Plan 02 says the attach body comes "from the candidates list", but nothing
 * enforced that — a client could submit any `{ githubRepoId, fullName }` pair
 * on trust, and the two were never even checked against each other. This
 * resolves the submitted id against the developer's own live list (the same
 * list `listCandidateRepos` builds the picker from) and stores GitHub's OWN
 * `fullName` and `defaultBranch`, never the client's copy — an attach can
 * therefore only ever name a repo this developer's token can see right now,
 * and the stored display name is authoritative at the moment it was written.
 */
export async function attachRepo(
  db: Db,
  session: Session,
  projectId: string,
  input: { githubRepoId: string; fullName: string },
  gh: RepoLister = liveRepoLister,
): Promise<AttachedRepo> {
  const dev = await assertDeveloperMember(db, session, projectId);

  const githubRepoId = input.githubRepoId.trim();
  const fullName = input.fullName.trim();
  if (!githubRepoId || !fullName) {
    throw invalidBody({
      ...(githubRepoId ? {} : { githubRepoId: "Required" }),
      ...(fullName ? {} : { fullName: "Required" }),
    });
  }

  let candidates: GithubRepo[];
  try {
    candidates = await gh.list(createGitHubClient(dev.githubAccessToken));
  } catch (e) {
    if (e instanceof GithubUnavailable) throw githubUnavailable(e.message);
    throw e;
  }

  /* Not a client-trusted lookup: the client's `fullName` is discarded from
   * here on. Only a repo this developer's own token can currently see may be
   * attached, and only under GitHub's own name for it. */
  const match = candidates.find((r) => r.githubRepoId === githubRepoId);
  if (!match) {
    throw notFound("No such repository visible to your GitHub account");
  }

  /* Insert and let the unique constraint arbitrate, rather than checking then
   * inserting — the same approach the developer-invite endpoint takes, and for
   * the same reason: a check-then-insert has a race the constraint does not. */
  try {
    const [row] = await db
      .insert(projectRepos)
      .values({
        projectId,
        githubRepoId: match.githubRepoId,
        fullName: match.fullName,
        defaultBranch: match.defaultBranch,
        addedBy: dev.developerId,
      })
      .returning();
    return present(row);
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict("That repo is already attached to this project");
    }
    throw e;
  }
}

export async function detachRepo(
  db: Db,
  session: Session,
  projectId: string,
  repoId: string,
): Promise<void> {
  await assertDeveloperMember(db, session, projectId);

  const [row] = await db
    .select()
    .from(projectRepos)
    .where(and(eq(projectRepos.id, repoId), eq(projectRepos.projectId, projectId)));

  /* Scoped to the project in the query, so a repo attached to a project the
   * caller cannot see is a 404 and not a 403 — the response must not confirm
   * that the id exists somewhere else. */
  if (!row) throw notFound("No such attached repo");

  if (Date.now() - row.addedAt.getTime() > UNDO_WINDOW_MS) {
    throw conflict(
      "The undo window has passed. An attached repo is permanent for the life of the project.",
    );
  }

  /* Once a claim exists, `claim_repos.project_repo_id` holds ON DELETE RESTRICT
   * against this row — a claim's own commit references stay meaningful for as
   * long as the claim does. The undo window and a claim submission can both
   * land inside the same 60 seconds, so this is a reachable 23503, not a
   * theoretical one, and it must read as a conflict rather than surface as an
   * unhandled 500. */
  try {
    await db.delete(projectRepos).where(eq(projectRepos.id, repoId));
  } catch (e) {
    if (isForeignKeyViolation(e)) {
      throw conflict(
        "This repo is referenced by a submitted claim and can no longer be removed.",
      );
    }
    throw e;
  }
}

/**
 * Resolves an attachment id to its stored `fullName`, alongside the narrowed
 * developer session that resolved it.
 *
 * The branches and commits endpoints take a repo id, never a repo name: a
 * caller-supplied name would let any developer member read any repo their token
 * can reach, whether or not it is attached to this project.
 *
 * Returning the developer session too means nothing downstream ever needs to
 * re-inspect `session.kind` — `assertDeveloperMember` has already proven it,
 * and a caller that only had the repo back would have no other way to reach
 * for the access token without a redundant (and forgeable-by-omission) check.
 */
export async function getAttachedRepo(
  db: Db,
  session: Session,
  projectId: string,
  repoId: string,
): Promise<{ repo: AttachedRepo; developer: DeveloperSession }> {
  const developer = await assertDeveloperMember(db, session, projectId);

  const [row] = await db
    .select()
    .from(projectRepos)
    .where(and(eq(projectRepos.id, repoId), eq(projectRepos.projectId, projectId)));

  if (!row) throw notFound("No such attached repo");
  return { repo: present(row), developer };
}

/** Injected so tests never reach the network. Production passes the real call. */
export type BranchLister = {
  list: (client: GitHubClient, fullName: string) => Promise<GithubBranch[]>;
};

export const liveBranchLister: BranchLister = { list: listBranches };

/**
 * Lists a project's own branches for an attached repo, spending the acting
 * developer's own GitHub token.
 *
 * The `GithubUnavailable` -> 503 translation lives here, in the one place both
 * this and `listRepoCommits` funnel through, rather than duplicated per route:
 * a rate-limited or unreachable GitHub is an infrastructure failure, never a
 * 404 — reporting exhaustion as "no such thing" would tell a caller something
 * false.
 */
export async function listRepoBranches(
  db: Db,
  session: Session,
  projectId: string,
  repoId: string,
  gh: BranchLister = liveBranchLister,
): Promise<GithubBranch[]> {
  const { repo, developer } = await getAttachedRepo(db, session, projectId, repoId);

  try {
    return await gh.list(createGitHubClient(developer.githubAccessToken), repo.fullName);
  } catch (e) {
    if (e instanceof GithubUnavailable) throw githubUnavailable(e.message);
    throw e;
  }
}

/** Injected so tests never reach the network. Production passes the real call. */
export type CommitLister = {
  list: (client: GitHubClient, fullName: string, ref: string) => Promise<GithubCommit[]>;
};

export const liveCommitLister: CommitLister = { list: listCommits };

/** Lists commits on `ref` for an attached repo. See `listRepoBranches` for why
 * the `GithubUnavailable` translation lives in the service rather than the route. */
export async function listRepoCommits(
  db: Db,
  session: Session,
  projectId: string,
  repoId: string,
  ref: string,
  gh: CommitLister = liveCommitLister,
): Promise<GithubCommit[]> {
  const { repo, developer } = await getAttachedRepo(db, session, projectId, repoId);

  try {
    return await gh.list(createGitHubClient(developer.githubAccessToken), repo.fullName, ref);
  } catch (e) {
    if (e instanceof GithubUnavailable) throw githubUnavailable(e.message);
    throw e;
  }
}
