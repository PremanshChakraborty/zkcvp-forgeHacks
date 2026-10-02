import {
  type Evaluator,
  type EvaluatorInput,
  type EvidenceBundle,
  NotImplementedError,
  type Report,
} from "@zkcvp/contracts";

/**
 * Placeholder. The LangGraph Evaluator is built in a separate workstream; this
 * exists so the interface has a compiling implementation and so nothing in the
 * app is written against a type that has never been instantiated.
 *
 * It throws rather than returning fabricated output on purpose: the Evaluator
 * does not exist yet, and no surface may present anything as real verdict output.
 */
export class StubEvaluator implements Evaluator {
  async evaluate(
    _input: EvaluatorInput,
  ): Promise<{ evidence: EvidenceBundle; report: Report }> {
    throw new NotImplementedError("StubEvaluator.evaluate");
  }
}
