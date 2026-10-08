/**
 * GATHER node — reads files from GitHub.
 *
 * 🤖 LLM: NO
 * 📡 GitHub API: YES (readFile for each planned path)
 *
 * Where the distinction between "evidence of absence" and "absence of evidence"
 * is actually made. A 404 is a fact about the repo and feeds the verdict; a
 * rate limit or a 5xx says nothing about the code, and a verdict rendered over
 * one would be `not_satisfied` for a reason that has nothing to do with whether
 * the requirement was met. PRODUCT.md principle 2 forbids exactly that, so
 * unresolved failures end the run instead of colouring it.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { ToolCall } from "@zkcvp/contracts";
import { EvaluationError, isGitHubReadError } from "@zkcvp/contracts";

import { assertBudget, runContext } from "../context";
import { MAX_FILE_CHARS } from "../limits";
import {
  fileKey,
  type EvaluatorState,
  type EvaluatorUpdate,
  type GatheredFile,
  type PlannedFile,
} from "../state";

function truncate(content: string): {
  content: string;
  status: "ok" | "truncated";
} {
  if (content.length <= MAX_FILE_CHARS) return { content, status: "ok" };
  return {
    content:
      content.substring(0, MAX_FILE_CHARS) +
      "\n\n[TRUNCATED — file exceeds size limit]",
    status: "truncated",
  };
}

/** A failure that says nothing about the code, after retries were exhausted. */
type Unresolved = {
  file: PlannedFile;
  kind: "rate_limited" | "unavailable";
  message: string;
  retryAt?: string;
};

export async function gatherNode(
  state: EvaluatorState,
  config: LangGraphRunnableConfig,
): Promise<EvaluatorUpdate> {
  const { github, deadline } = runContext(config);
  assertBudget(deadline);

  const shaByRepo = new Map(state.repoCommits.map((rc) => [rc.repo, rc.commitSha]));
  const filesToRead =
    state.iterationCount === 0
      ? state.plannedFiles
      : state.additionalFilesNeeded;

  const toolCalls: ToolCall[] = [];
  const gathered: Record<string, GatheredFile> = {};
  const unresolved: Unresolved[] = [];

  for (const file of filesToRead) {
    const key = fileKey(file);
    if (state.gatheredFiles[key] || gathered[key]) continue;

    const commitSha = shaByRepo.get(file.repo);
    if (!commitSha) continue; // resolveFiles already rejects unknown repos

    assertBudget(deadline);
    const args = { repo: file.repo, commitSha, path: file.path };

    try {
      const raw = await github.readFile(file.repo, commitSha, file.path);
      const { content, status } = truncate(raw);
      gathered[key] = { repo: file.repo, path: file.path, content, status };
      toolCalls.push({
        tool: "readFile",
        args,
        result: content,
        at: new Date().toISOString(),
        outcome: status === "truncated" ? "truncated" : "ok",
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") throw err;

      if (!isGitHubReadError(err)) throw err;

      // Fatal for the whole run — every remaining read would fail identically,
      // and making the developer wait to be told so is pure waste.
      if (err.kind === "unauthorized") {
        throw new EvaluationError(
          "unauthorized",
          "The GitHub token was rejected during evaluation. Sign in again.",
        );
      }
      if (err.kind === "forbidden") {
        throw new EvaluationError(
          "repo_unreachable",
          `Access to ${file.repo} was refused during evaluation.`,
        );
      }

      // Evidence: the file genuinely is not there, or is not readable as text.
      if (err.kind === "not_found" || err.kind === "too_large") {
        const marker =
          err.kind === "not_found"
            ? `[FILE NOT FOUND at ${commitSha.substring(0, 8)}]`
            : `[FILE TOO LARGE TO READ]`;
        gathered[key] = {
          repo: file.repo,
          path: file.path,
          content: marker,
          status: err.kind === "not_found" ? "not_found" : "too_large",
        };
        toolCalls.push({
          tool: "readFile",
          args,
          result: marker,
          at: new Date().toISOString(),
          outcome: err.kind === "not_found" ? "not_found" : "truncated",
        });
        continue;
      }

      // Absence of evidence. Recorded, then acted on below.
      unresolved.push({
        file,
        kind: err.kind === "rate_limited" ? "rate_limited" : "unavailable",
        message: err.message,
        retryAt: err.resetAt,
      });
      toolCalls.push({
        tool: "readFile",
        args,
        result: `[UNAVAILABLE] ${err.message}`,
        at: new Date().toISOString(),
        outcome: "unavailable",
      });
    }
  }

  // Strict materiality. Every planned path was checked against the tree before
  // it got here, so an unresolved failure is not a bad guess — it is a file we
  // know exists and could not read, and any verdict over that gap is unsound.
  if (unresolved.length > 0) {
    const rateLimited = unresolved.find((u) => u.kind === "rate_limited");
    if (rateLimited) {
      throw new EvaluationError(
        "rate_limited",
        `GitHub rate limit reached while reading evidence (${unresolved.length} file(s) unread).`,
        rateLimited.retryAt,
      );
    }
    throw new EvaluationError(
      "evidence_incomplete",
      `${unresolved.length} file(s) could not be read: ${unresolved
        .map((u) => `${u.file.repo}:${u.file.path} (${u.message})`)
        .join("; ")}`,
    );
  }

  return {
    toolCallLog: toolCalls,
    gatheredFiles: gathered,
    iterationCount: state.iterationCount + 1,
    filesReadPerRound: [Object.keys(gathered)],
  };
}
