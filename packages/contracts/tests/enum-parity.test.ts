import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  INVITE_STATUSES,
  REQUIREMENT_STATUSES,
  ROLES,
  VERDICTS,
} from "../src/domain";

/**
 * The design system and this package describe the same domain from two sides.
 * TypeScript cannot see across them — design-system-ledger deliberately imports
 * nothing from this package, so the two copies of the domain enums have no
 * compile-time link. That leaves textual comparison as the only available
 * check, and drift here means one surface tells a user something another does
 * not.
 *
 * If this fails: fix packages/contracts, not the design system. The design
 * system's types.ts is the UI-facing source of truth for these unions; this
 * package mirrors it.
 */
const TYPES_PATH = fileURLToPath(
  new URL("../../design-system-ledger/components/types.ts", import.meta.url),
);

async function unionMembers(alias: string): Promise<string[]> {
  const src = await readFile(TYPES_PATH, "utf8");
  const m = new RegExp(`export type ${alias} =([^;]+);`).exec(src);
  if (!m) throw new Error(`Type alias ${alias} not found in ${TYPES_PATH}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe("contracts/design-system enum parity", () => {
  it("RequirementStatus matches", async () => {
    expect(await unionMembers("RequirementStatus")).toEqual([
      ...REQUIREMENT_STATUSES,
    ]);
  });

  it("Verdict matches", async () => {
    expect(await unionMembers("Verdict")).toEqual([...VERDICTS]);
  });

  it("Role matches", async () => {
    expect(await unionMembers("Role")).toEqual([...ROLES]);
  });

  it("InviteStatus matches", async () => {
    expect(await unionMembers("InviteStatus")).toEqual([...INVITE_STATUSES]);
  });
});
