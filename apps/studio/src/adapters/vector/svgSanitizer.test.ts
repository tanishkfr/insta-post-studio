import { describe, expect, it } from "vitest";
import { sanitizeVectorSvg, SvgSanitizationError } from "./svgSanitizer";

const validSvg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1414">
  <defs><clipPath id="clp"><rect x="10" y="10" width="980" height="1394"/></clipPath></defs>
  <rect width="1000" height="1414" fill="#ECE4E0"/>
  <g clip-path="url(#clp)"><path data-i="0" d="M0 0L10 10Z" fill="none" stroke="#A33714" stroke-width="1.2"/></g>
  <g font-family="'Source Sans 3',sans-serif"><text x="40" y="150" font-size="88" fill="#A33714">ABOUT</text></g>
</svg>`;

describe("sanitizeVectorSvg", () => {
  it("preserves artwork, viewBox and clip paths", () => {
    const result = sanitizeVectorSvg(validSvg);
    expect(result.width).toBe(1000);
    expect(result.height).toBe(1414);
    expect(result.viewBox).toEqual([0, 0, 1000, 1414]);
    expect(result.svg).toContain("<rect");
    expect(result.svg).toContain('clip-path="url(#clp)"');
    expect(result.svg).toContain("ABOUT");
    expect(result.svg).toContain('viewBox="0 0 1000 1414"');
  });

  it("removes scripts, event handlers, external images and foreign objects", () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="alert(1)">
      <script>alert(1)</script>
      <foreignObject><iframe src="https://evil.example"></iframe></foreignObject>
      <image href="https://evil.example/a.png" width="100" height="100"/>
      <a href="javascript:alert(1)"><rect width="10" height="10" fill="#fff"/></a>
      <rect width="100" height="100" fill="url(https://evil.example/bg.svg)" onclick="alert(1)"/>
      <path d="M0 0L10 10" fill="none" stroke="#000" style="background:url(https://evil.example)"/>
    </svg>`;
    const result = sanitizeVectorSvg(malicious);
    expect(result.svg).not.toContain("script");
    expect(result.svg).not.toContain("foreignObject");
    expect(result.svg).not.toContain("<image");
    expect(result.svg).not.toContain("<a ");
    expect(result.svg).not.toContain("onload");
    expect(result.svg).not.toContain("onclick");
    expect(result.svg).not.toContain("evil.example");
    expect(result.svg).not.toContain("javascript:");
    expect(result.svg).not.toContain("style=");
    // Safe siblings remain.
    expect(result.svg).toContain("<rect");
    expect(result.svg).toContain("<path");
  });

  it("rejects malformed SVG and missing viewBox", () => {
    expect(() => sanitizeVectorSvg("<svg><path></svg>")).toThrow(SvgSanitizationError);
    expect(() =>
      sanitizeVectorSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
    ).toThrow(/viewBox/);
    expect(() => sanitizeVectorSvg("")).toThrow(/empty/);
  });
});
