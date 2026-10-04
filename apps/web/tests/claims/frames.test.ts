import { describe, expect, it } from "vitest";
import {
  decodeFrames,
  encodeFrame,
  isTerminal,
  type ClaimFrame,
} from "../../lib/claims/frames";

const progress: ClaimFrame = { t: "progress", phase: "gather", filesRead: 12, round: 1 };

describe("encodeFrame", () => {
  it("emits exactly one newline-terminated line", () => {
    const line = encodeFrame(progress);
    expect(line.endsWith("\n")).toBe(true);
    expect(line.trimEnd().split("\n")).toHaveLength(1);
  });
});

describe("decodeFrames", () => {
  it("reads whole frames and keeps the partial tail", () => {
    const buffer = encodeFrame(progress) + '{"t":"progress","phase":"ana';
    const { frames, rest } = decodeFrames(buffer);
    expect(frames).toEqual([progress]);
    expect(rest).toBe('{"t":"progress","phase":"ana');
  });

  it("reassembles a frame split across two chunks", () => {
    const whole = encodeFrame(progress);
    const first = decodeFrames(whole.slice(0, 10));
    expect(first.frames).toEqual([]);
    const second = decodeFrames(first.rest + whole.slice(10));
    expect(second.frames).toEqual([progress]);
    expect(second.rest).toBe("");
  });

  it("reads several frames from one chunk", () => {
    const done: ClaimFrame = { t: "done", claimId: "c1", evaluationId: "e1" };
    const { frames } = decodeFrames(encodeFrame(progress) + encodeFrame(done));
    expect(frames).toHaveLength(2);
    expect(frames[1]).toEqual(done);
  });

  it("throws on syntactically malformed JSON", () => {
    expect(() => decodeFrames('{"t":"progress"\n')).toThrow();
  });

  it("throws on structurally invalid frame (unknown t value)", () => {
    expect(() => decodeFrames('{"foo":1}\n')).toThrow();
  });
});

describe("isTerminal", () => {
  /**
   * The invariant this whole protocol exists to hold: a failure must be
   * structurally impossible to read as a completed evaluation. If this ever
   * passes for a `failed` frame, a rate limit can reach a stakeholder as
   * "Not satisfied".
   */
  it("separates done and failed from progress, and never conflates them", () => {
    const failed: ClaimFrame = {
      t: "failed",
      kind: "rate_limited",
      status: 429,
      message: "GitHub rate limit",
      retryAt: "2026-09-11T12:04:00Z",
    };
    const done: ClaimFrame = { t: "done", claimId: "c1", evaluationId: "e1" };

    /* Routed through a ClaimFrame-typed parameter on purpose. Comparing the
     * narrowed const directly is a compile error — TypeScript proving the
     * invariant — but the runtime assertion is what survives a future in
     * which the union drifts. */
    const readsAsDone = (f: ClaimFrame) => f.t === "done";

    expect(isTerminal(progress)).toBe(false);
    expect(isTerminal(failed)).toBe(true);
    expect(isTerminal(done)).toBe(true);
    expect(readsAsDone(failed)).toBe(false);
    expect(readsAsDone(done)).toBe(true);
    expect("claimId" in failed).toBe(false);
  });
});
