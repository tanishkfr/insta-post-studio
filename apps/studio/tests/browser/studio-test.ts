import { test as base, expect } from "@playwright/test";

/**
 * All Phase 1 browser tests fail on uncaught page errors or console errors from
 * the host or any embedded editor frame.
 */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => {
        errors.push(`pageerror: ${error.message}`);
      });
      page.on("console", (message) => {
        if (message.type() === "error") {
          const allowed = test
            .info()
            .annotations.filter((annotation) => annotation.type === "allow-console-error")
            .map((annotation) => annotation.description ?? "");
          if (allowed.some((fragment) => fragment && message.text().includes(fragment))) {
            return;
          }
          errors.push(`console.error: ${message.text()}`);
        }
      });
      await use();
      expect(errors, `Browser console/page errors:\n${errors.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
