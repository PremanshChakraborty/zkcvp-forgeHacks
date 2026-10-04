/**
 * Every bound the Evaluator runs under, in one place.
 *
 * MAX_ITERATIONS in particular used to be declared twice — once in the driver
 * and once in the node that enforces it. They agreed, but only by luck: raising
 * the node's copy alone would have let the loop exit on the counter with
 * `needsMoreEvidence` still set, and FORMAT would have emitted whatever
 * half-formed verdict array it was left holding.
 */

/** Max GATHER↔ANALYZE rounds before a decision is forced. */
export const MAX_ITERATIONS = 5;

/** Max characters per file handed to the model. */
export const MAX_FILE_CHARS = 15_000;

/** Max files the planner may select per round. Enforced in code, not prose. */
export const MAX_PLANNED_FILES = 25;

/**
 * Max tree entries rendered into the plan prompt per repo.
 *
 * A monorepo tree can run to tens of thousands of paths, which would cost more
 * context than the files it is meant to help choose.
 */
export const MAX_TREE_ENTRIES_IN_PROMPT = 2_000;

/** Transport attempts for a model call, including the first. */
export const MAX_MODEL_ATTEMPTS = 3;

/** Rounds of "your output was rejected, here is why" before giving up. */
export const MAX_MODEL_REPAIRS = 2;

/**
 * Graph steps before LangGraph aborts. Generous enough that the iteration cap
 * is always what stops a run, and this only catches a genuine routing bug.
 */
export const RECURSION_LIMIT = MAX_ITERATIONS * 2 + 6;
