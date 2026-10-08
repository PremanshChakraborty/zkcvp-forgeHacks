/**
 * Citation grounding.
 *
 * Guardrail: a rationale may only cite files this run actually attempted to
 * read. A rationale citing a file the agent never opened is a claim about code
 * nobody looked at — and the stakeholder, who cannot see the repo, has no way
 * to tell. It is also the visible trace of an injection that worked: a forged
 * "file" pasted inside another file's contents gets cited by a path that does
 * not exist at the claimed commit.
 *
 * Deterministic and pure, like the code detector. Heuristic in one direction
 * only: it extracts path-like tokens, so prose that names a file without its
 * extension is not checked. It is built to avoid false alarms rather than to
 * catch every citation.
 */
import type { Tree } from "@zkcvp/contracts";

export type UngroundedCitation = {
  citation: string;
  reason: "not_read" | "not_in_tree";
};

/** An optional `owner/name:` prefix, then a path ending in a file extension. */
const CITATION = /(?:([\w.-]+\/[\w.-]+):)?((?:[\w.-]+\/)*[\w-][\w.-]*\.[A-Za-z][A-Za-z0-9]{0,4})\b/g;

/** Strips a GATHER window suffix (`#15000`) so a window counts as the file. */
function basePath(key: string): string {
  return key.replace(/#\d+$/, "");
}

/**
 * Citations in `rationale` that name no file this run read.
 *
 * @param readKeys `repo:path` keys GATHER attempted, any outcome — a cited
 *   404 is a legitimate finding about absence.
 */
export function ungroundedCitations(
  rationale: string,
  trees: Record<string, Tree>,
  readKeys: Iterable<string>,
): UngroundedCitation[] {
  const read = new Set([...readKeys].map(basePath));
  const out: UngroundedCitation[] = [];
  const seen = new Set<string>();

  const filesByRepo = Object.entries(trees).map(([repo, tree]) => ({
    repo,
    files: tree.entries.filter((e) => e.type === "file").map((e) => e.path),
    roots: new Set(tree.entries.map((e) => e.path.split("/")[0])),
  }));

  for (const m of rationale.matchAll(CITATION)) {
    const repoPrefix = m[1];
    const path = m[2]!.replace(/^\.?\//, "");
    const citation = repoPrefix ? `${repoPrefix}:${path}` : path;
    if (seen.has(citation)) continue;
    seen.add(citation);

    const scope = repoPrefix
      ? filesByRepo.filter((r) => r.repo === repoPrefix)
      : filesByRepo;

    // Exact path, or a bare file name that is unambiguous enough to match by
    // suffix ("rate-limit.ts" for "src/middleware/rate-limit.ts").
    const matches = scope.flatMap((r) =>
      r.files
        .filter((f) => f === path || f.endsWith(`/${path}`))
        .map((f) => `${r.repo}:${f}`),
    );

    if (matches.length > 0) {
      if (!matches.some((k) => read.has(k))) out.push({ citation, reason: "not_read" });
      continue;
    }

    // No such file. Flag it only when it is shaped like a repo path — its first
    // segment is a real top-level entry — so a route such as
    // "/api/notes/export.csv" or a word like "e.g." is not mistaken for one.
    const first = path.split("/")[0]!;
    if (path.includes("/") && scope.some((r) => r.roots.has(first))) {
      out.push({ citation, reason: "not_in_tree" });
    }
  }

  return out;
}

/** The repair instruction ANALYZE sends back, or null if every citation is grounded. */
export function groundingProblem(
  verdicts: { requirementVersionId: string; rationale: string }[],
  trees: Record<string, Tree>,
  readKeys: Iterable<string>,
): string | null {
  const keys = [...readKeys];
  for (const v of verdicts) {
    const bad = ungroundedCitations(v.rationale, trees, keys);
    if (bad.length === 0) continue;
    const list = bad
      .map((b) =>
        b.reason === "not_read"
          ? `"${b.citation}" (exists, but you have not read it)`
          : `"${b.citation}" (does not exist at the claimed commit)`,
      )
      .join(", ");
    return `Your rationale for "${v.requirementVersionId}" cites ${list}. Cite only files whose contents appear in the EVIDENCE. If a file you have not read matters, request it instead of describing it.`;
  }
  return null;
}
