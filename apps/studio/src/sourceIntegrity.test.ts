import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The preserved Vector editor is a frozen baseline. Phase 1 integrates it
 * through a generated wrapper and injected bridge; the original file must never
 * be edited. This guards against accidental rewrites.
 */
describe("preserved Vector source integrity", () => {
  it("keeps arnav.html byte-identical to the Phase 0 baseline", () => {
    const bytes = readFileSync(
      resolve(process.cwd(), "../../tools/legacy/vector/arnav.html"),
    );
    const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
    expect(hash).toBe(
      "24633B7233A5E7AD088D1E4423AACD21D838F215654F838170077328C1CB5AA2",
    );
    const text = bytes.toString("utf8");
    expect(text).toContain("const FlowEngine=");
    expect(text).toContain("Export SVG");
    expect(text).not.toContain("Studio integration bridge");
  });
});
