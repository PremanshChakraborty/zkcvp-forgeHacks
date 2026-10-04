// apps/web/tests/host-agnostic.test.ts
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = join(fileURLToPath(import.meta.url), "../..");
const SKIP = new Set(["node_modules", ".next", "tests", "dist"]);

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await sourceFiles(full)));
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

describe("host agnosticism", () => {
  it("declares no edge runtime anywhere", async () => {
    const files = await sourceFiles(WEB_ROOT);
    const offenders: string[] = [];
    for (const f of files) {
      const src = await readFile(f, "utf8");
      if (/runtime\s*=\s*["'`]edge["'`]/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("imports nothing from @vercel/*", async () => {
    const files = await sourceFiles(WEB_ROOT);
    const offenders: string[] = [];
    for (const f of files) {
      const src = await readFile(f, "utf8");
      if (/from\s+["'`]@vercel\//.test(src) || /require\(["'`]@vercel\//.test(src)) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("declares no @vercel/* dependency", async () => {
    const pkg = JSON.parse(
      await readFile(join(WEB_ROOT, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(all.filter((d) => d.startsWith("@vercel/"))).toEqual([]);
  });
});
