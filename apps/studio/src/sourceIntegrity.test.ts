import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function hashOf(relativePath: string): string {
  const bytes = readFileSync(resolve(process.cwd(), relativePath));
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

/**
 * Preserved editors are frozen baselines. Studio integrates them through
 * generated wrapper pages and bridge injection; original sources must never be
 * edited. These guards make an accidental rewrite fail immediately.
 */
describe("preserved tool source integrity", () => {
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

  it("keeps the preserved Image editor byte-identical", () => {
    const bytes = readFileSync(
      resolve(process.cwd(), "../../tools/legacy/image/janya.html"),
    );
    const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
    expect(hash).toBe(
      "ACDD62C499A4FCD3C372918BC6AD96F3E0A6DFA6D583A1BAB74B4AFBF9EC9BF6",
    );
    const text = bytes.toString("utf8");
    expect(text).toContain("function makeGif");
    expect(text).toContain("JSZip");
    expect(text).not.toContain("Studio integration bridge");
  });

  it("keeps both preserved Typography scripts and pages byte-identical", () => {
    expect(hashOf("../../tools/typography/fonts.js")).toBe(
      "82D9409347F795CAC9C124FF2D329A74F19B9408D6F121A46F4E21586195456C",
    );
    expect(hashOf("../../tools/typography/script.js")).toBe(
      "715DCEE5B88EACCE025120B7AD43F91DE698065E3FA1F648824853703BD08161",
    );
    expect(hashOf("../../tools/typography/fonts.html")).toBe(
      "C2CF92B1AF381B8EBD3446F15E65CFE996112FD8F3A00E9628FE75627500109B",
    );
    expect(hashOf("../../tools/typography/custom.html")).toBe(
      "457120E04C874158341D4D2314B740A0E4DFB7D363B6DFE49337C727662799ED",
    );
    const fonts = readFileSync(
      resolve(process.cwd(), "../../tools/typography/fonts.js"),
      "utf8",
    );
    const custom = readFileSync(
      resolve(process.cwd(), "../../tools/typography/script.js"),
      "utf8",
    );
    expect(fonts).not.toContain("Studio integration bridge");
    expect(custom).not.toContain("Studio integration bridge");
  });
});
