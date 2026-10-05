/**
 * PLAN node — decides which files to read.
 *
 * 🤖 LLM: YES (reads file tree + requirements, outputs file paths)
 * 📡 GitHub API: YES (listTree, and changedFiles as a ranking hint)
 *
 * 1. Lists the tree at each claimed commit
 * 2. Asks GitHub what that commit touched, purely to say "look here first"
 * 3. Gives the model the trees, the hint, and every requirement
 * 4. Keeps only the file requests that name a real repo and a real path
 */
import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { ChangedFile, ToolCall, Tree } from "@zkcvp/contracts";

import { assertBudget, runContext } from "../context";
import { invokeStructured } from "../llm";
import { MAX_PLANNED_FILES, MAX_TREE_ENTRIES_IN_PROMPT } from "../limits";
import type { EvaluatorState, EvaluatorUpdate } from "../state";
import { resolveFiles } from "../validation";

const PlanOutputSchema = z.object({
  filesToRead: z
    .array(
      z.object({
        repo: z
          .string()
          .describe("The repository the file belongs to, exactly as listed, e.g. 'owner/name'"),
        path: z
          .string()
          .describe("Repo-relative file path, e.g. 'src/auth.ts'"),
      }),
    )
    .describe(
      "Files to read. Each MUST name the repository it came from — paths are not unique across repositories.",
    ),
  reasoning: z
    .string()
    .describe("Brief explanation of why these files were chosen"),
});

function renderTree(repo: string, commitSha: string, tree: Tree): string {
  const files = tree.entries.filter((e) => e.type === "file");
  const shown = files.slice(0, MAX_TREE_ENTRIES_IN_PROMPT);
  const lines = shown
    .map((e) => `  ${e.path}${e.size ? ` (${e.size}b)` : ""}`)
    .join("\n");

  const notes: string[] = [];
  if (tree.truncated) {
    notes.push("GitHub truncated this listing; the repo has more files than shown");
  }
  if (files.length > shown.length) {
    notes.push(`showing ${shown.length} of ${files.length} files`);
  }
  const suffix = notes.length ? `\n  [${notes.join("; ")}]` : "";

  return `Repository: ${repo} @ ${commitSha.substring(0, 8)}\n${lines}${suffix}`;
}

function renderHint(repo: string, changed: ChangedFile[]): string | null {
  if (changed.length === 0) return null;
  const paths = changed.map((c) => `  ${c.path} (${c.status})`).join("\n");
  return `Files touched by the claimed commit in ${repo}:\n${paths}`;
}

export async function planNode(
  state: EvaluatorState,
  config: LangGraphRunnableConfig,
): Promise<EvaluatorUpdate> {
  const { github, modelId, deadline } = runContext(config);
  assertBudget(deadline);

  const trees: Record<string, Tree> = {};
  const changed: Record<string, string[]> = {};
  const toolCalls: ToolCall[] = [];
  const treeBlocks: string[] = [];
  const hintBlocks: string[] = [];

  for (const rc of state.repoCommits) {
    const tree = await github.listTree(rc.repo, rc.commitSha);
    trees[rc.repo] = tree;
    treeBlocks.push(renderTree(rc.repo, rc.commitSha, tree));

    // The transcript records the tree itself, not a count of it. An evidence
    // bundle that cannot show what the planner saw cannot be audited.
    toolCalls.push({
      tool: "listTree",
      args: { repo: rc.repo, commitSha: rc.commitSha },
      result: tree.entries
        .filter((e) => e.type === "file")
        .map((e) => e.path)
        .join("\n"),
      at: new Date().toISOString(),
      outcome: tree.truncated ? "truncated" : "ok",
    });

    // A hint, and one that is allowed to be useless: a merge or root commit
    // returns nothing and the planner simply works from the tree.
    const changedForRepo = await github.changedFiles(rc.repo, rc.commitSha);
    changed[rc.repo] = changedForRepo.map((c) => c.path);
    toolCalls.push({
      tool: "changedFiles",
      args: { repo: rc.repo, commitSha: rc.commitSha },
      result: changedForRepo.map((c) => `${c.status} ${c.path}`).join("\n"),
      at: new Date().toISOString(),
      outcome: "ok",
    });

    const hint = renderHint(rc.repo, changedForRepo);
    if (hint) hintBlocks.push(hint);
  }

  const requirementsList = state.requirements
    .map((r, i) => `${i + 1}. [${r.title}]: ${r.description}`)
    .join("\n");

  const hintSection = hintBlocks.length
    ? `\n\nRECENTLY CHANGED (a hint about where the claimed work happened — start here, but do not stop here, and ignore it if it looks irrelevant):\n${hintBlocks.join("\n\n")}`
    : "";

  const prompt = `You are a code review planner. Given repository file trees and a set of requirements, decide which files need to be read to evaluate whether the code satisfies the requirements.

FILE TREES:
${treeBlocks.join("\n\n")}${hintSection}

REQUIREMENTS TO EVALUATE:
${requirementsList}

Select the files most likely to contain evidence for or against these requirements. Be selective — don't list every file. Focus on source code files relevant to the requirements. Skip assets, images, lock files, and configs unless a requirement specifically mentions them.

Every entry must name the repository it came from, exactly as written above.

Return at most ${MAX_PLANNED_FILES} files.`;

  const result = await invokeStructured({
    modelId,
    schema: PlanOutputSchema,
    prompt,
    deadline,
    signal: config.signal,
    // Only a plan with nothing usable in it is worth a repair round. Anything
    // less is normal noise, and the filter below handles it.
    validate: (value) =>
      resolveFiles(value.filesToRead, trees).accepted.length === 0
        ? "None of the files you listed exist at the claimed commits. Choose paths that appear verbatim in the FILE TREES above, and set `repo` to the repository each path was listed under."
        : null,
  });

  const { accepted, dropped } = resolveFiles(result.filesToRead, trees);

  return {
    trees,
    changedFiles: changed,
    plannedFiles: accepted,
    planReasoning: result.reasoning,
    droppedPaths: dropped,
    toolCallLog: toolCalls,
  };
}
