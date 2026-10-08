/**
 * Scoring for an eval run. Pure — no model, no files — so it is unit-tested.
 *
 * The positive class is `satisfied`. The headline number is the FALSE-APPROVAL
 * RATE: of the requirements whose truth is `not_satisfied`, how many the agent
 * called `satisfied`. That error tells a stakeholder work is done when it is
 * not, which is the one they cannot detect from the report.
 *
 * Infrastructure failures are counted as errors and kept OUT of every rate.
 * Scoring one as `not_satisfied` would repeat, in the metrics, the exact
 * conflation the Evaluator is built to prevent.
 */
import type { Category } from "./cases";

export type Outcome = "satisfied" | "not_satisfied" | "error";

export type ScoredRequirement = {
  caseId: string;
  category: Category;
  requirementId: string;
  expected: "satisfied" | "not_satisfied";
  got: Outcome;
  /** Citations in the rationale that name no file the run read. */
  ungrounded: string[];
};

export type Rate = {
  /** null when the denominator is zero — "no data", not 0%. */
  value: number | null;
  num: number;
  den: number;
  /** 95% Wilson interval; honest at small n where p±1.96σ is not. */
  ci: [number, number] | null;
};

export function wilson(num: number, den: number, z = 1.96): Rate {
  if (den === 0) return { value: null, num, den, ci: null };
  const p = num / den;
  const z2 = z * z;
  const centre = (p + z2 / (2 * den)) / (1 + z2 / den);
  const half = (z * Math.sqrt((p * (1 - p)) / den + z2 / (4 * den * den))) / (1 + z2 / den);
  return { value: p, num, den, ci: [Math.max(0, centre - half), Math.min(1, centre + half)] };
}

export type Confusion = { tp: number; fp: number; fn: number; tn: number; errors: number };

export function confusion(rows: ScoredRequirement[]): Confusion {
  const c: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0, errors: 0 };
  for (const r of rows) {
    if (r.got === "error") c.errors++;
    else if (r.expected === "satisfied") r.got === "satisfied" ? c.tp++ : c.fn++;
    else r.got === "satisfied" ? c.fp++ : c.tn++;
  }
  return c;
}

export type Metrics = {
  n: number;
  confusion: Confusion;
  accuracy: Rate;
  falseApprovalRate: Rate;
  falseRejectionRate: Rate;
  precision: Rate;
  recall: Rate;
  ungroundedRationales: Rate;
  byCategory: Record<string, { n: number; correct: number; fp: number; fn: number; errors: number }>;
};

export function score(rows: ScoredRequirement[]): Metrics {
  const c = confusion(rows);
  const scored = rows.filter((r) => r.got !== "error");
  const byCategory: Metrics["byCategory"] = {};
  for (const r of rows) {
    const b = (byCategory[r.category] ??= { n: 0, correct: 0, fp: 0, fn: 0, errors: 0 });
    b.n++;
    if (r.got === "error") b.errors++;
    else if (r.got === r.expected) b.correct++;
    else if (r.got === "satisfied") b.fp++;
    else b.fn++;
  }
  return {
    n: rows.length,
    confusion: c,
    accuracy: wilson(c.tp + c.tn, scored.length),
    falseApprovalRate: wilson(c.fp, c.fp + c.tn),
    falseRejectionRate: wilson(c.fn, c.tp + c.fn),
    precision: wilson(c.tp, c.tp + c.fp),
    recall: wilson(c.tp, c.tp + c.fn),
    ungroundedRationales: wilson(scored.filter((r) => r.ungrounded.length > 0).length, scored.length),
    byCategory,
  };
}

export function pct(r: Rate): string {
  if (r.value === null) return "n/a";
  const ci = r.ci ? ` (95% CI ${Math.round(r.ci[0] * 100)}–${Math.round(r.ci[1] * 100)}%)` : "";
  return `${Math.round(r.value * 100)}% — ${r.num}/${r.den}${ci}`;
}
