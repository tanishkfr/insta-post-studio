import { expect, test } from "./studio-test";

const HARNESS = String.raw`
async (scenario) => {
  const moduleUrl = "/src/adapters/iframe/IframeToolAdapter.ts";
  const { IframeToolAdapter } = await import(moduleUrl);
  let counter = 0;
  const errors = [];
  const events = [];
  const makeScope = () => {
    counter += 1;
    return {
      projectId: "project_transport_" + counter,
      sessionId: "session_transport_" + counter,
      toolId: "vector",
      channelId: "channel_transport_" + counter,
    };
  };
  const artboard = {
    id: "artboard_1",
    name: "Artboard 01",
    index: 0,
    width: 1080,
    height: 1350,
    background: { kind: "solid", color: "#ffffff" },
  };
  const globalContext = (projectId) => ({
    projectId,
    projectName: "Transport test",
    schemaVersion: 1,
    format: {
      id: "instagram-4-5",
      label: "Instagram 4:5",
      width: 1080,
      height: 1350,
      unit: "px",
      aspectRatio: 0.8,
      orientation: "portrait",
    },
    artboards: [artboard],
    activeArtboard: artboard,
    colorScheme: "light",
    accentColor: "#236F72",
  });
  const create = async (fakeScenario, overrides = {}) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:20px;height:20px";
    document.body.appendChild(iframe);
    const adapter = new IframeToolAdapter({
      iframe,
      bridgeUrl:
        "http://127.0.0.1:4189/fake-adapter.html?scenario=" +
        encodeURIComponent(fakeScenario),
      hostOrigin: location.origin,
      toolOrigin: "http://127.0.0.1:4189",
      handshakeTimeoutMs: 2000,
      requestTimeoutMs: 2000,
      onProtocolViolation: (error) => errors.push(error),
      onEvent: (event) => events.push(event),
      ...overrides,
    });
    const scope = makeScope();
    const ctx = {
      projectId: scope.projectId,
      sessionId: scope.sessionId,
      runtimeKind: "iframe",
      integrationMode: "isolated-iframe",
      hostOrigin: location.origin,
      toolOrigin: overrides.toolOrigin || "http://127.0.0.1:4189",
      channelId: scope.channelId,
    };
    return { adapter, iframe, scope, ctx };
  };
  const cleanup = (adapter, iframe) => {
    adapter.dispose();
    iframe.remove();
  };
  const code = (error) => (error && error.code) || error?.name || String(error);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  if (scenario === "happy") {
    const { adapter, iframe, scope, ctx } = await create("happy");
    try {
      const init = await adapter.initialize(ctx);
      const open = await adapter.open({
        projectName: "Transport test",
        global: globalContext(scope.projectId),
        inputAssets: [],
        options: {},
      });
      const context = await adapter.receiveGlobalContext(
        globalContext(scope.projectId),
      );
      await wait(60);
      const receipts = await adapter.receiveInputAssets([
        {
          layerId: "layer_input",
          role: "reference",
          asset: {
            id: "asset_inline",
            kind: "vector",
            name: "Inline asset",
            mimeType: "image/svg+xml",
            storage: {
              backend: "inline",
              mimeType: "image/svg+xml",
              dataUrl: "data:image/svg+xml,%3Csvg/%3E",
            },
            createdAt: new Date().toISOString(),
            sourceTool: "vector",
          },
        },
      ]);
      const restore = await adapter.restoreSourceState({
        tool: "vector",
        toolStateVersion: "1.0.0",
        mimeType: "application/vnd.studio.vector+json",
        content: JSON.stringify({ seed: 1 }),
      });
      const source = await adapter.getEditableSourceState();
      const render = await adapter.render({
        requestId: "render_happy",
        artboard,
        scale: 1,
        format: "svg",
        background: "transparent",
      });
      const renderedText = new TextDecoder().decode(render.bytes);
      await adapter.close({ reason: "host", discardUnsavedChanges: false });
      return {
        ok: true,
        capabilities: init.capabilities,
        openCapabilities: open.capabilities.toolId,
        context,
        receipts,
        restore,
        source,
        renderedMime: render.rendered.mimeType,
        renderedHasSvg: renderedText.includes("<svg"),
        bytesAreUint8: render.bytes instanceof Uint8Array,
        events,
        protocolViolations: errors.map((entry) => entry.code),
      };
    } catch (error) {
      cleanup(adapter, iframe);
      return { ok: false, code: code(error), message: String(error) };
    }
  }

  if (scenario === "security") {
    const results = {};

    {
      const { adapter, iframe, ctx } = await create("happy", {
        toolOrigin: "http://127.0.0.1:4199",
      });
      try {
        await adapter.initialize(ctx);
        results.wrongOrigin = { rejected: false };
      } catch (error) {
        results.wrongOrigin = { rejected: true, code: code(error) };
      } finally {
        cleanup(adapter, iframe);
      }
    }

    {
      const { adapter, iframe, ctx } = await create("wrong-scope-ready");
      try {
        await adapter.initialize(ctx);
        results.wrongScopeReady = { rejected: false };
      } catch (error) {
        results.wrongScopeReady = { rejected: true, code: code(error) };
      } finally {
        cleanup(adapter, iframe);
      }
    }

    {
      const { adapter, iframe, ctx } = await create("protocol-mismatch");
      try {
        await adapter.initialize(ctx);
        results.protocolMismatch = { rejected: false };
      } catch (error) {
        results.protocolMismatch = { rejected: true, code: code(error) };
      } finally {
        cleanup(adapter, iframe);
      }
    }

    {
      const { adapter, iframe, ctx } = await create("wrong-scope-response");
      try {
        await adapter.initialize(ctx);
        results.wrongScopeResponse = { rejected: false };
      } catch (error) {
        results.wrongScopeResponse = { rejected: true, code: code(error) };
      } finally {
        cleanup(adapter, iframe);
      }
    }

    {
      const { adapter, iframe, scope, ctx } = await create("silent-render", {
        requestTimeoutMs: 150,
      });
      try {
        await adapter.initialize(ctx);
        await adapter.open({
          projectName: "Forged sender",
          global: globalContext(scope.projectId),
          inputAssets: [],
        });
        const pendingRender = adapter.render({
          requestId: "render_forged",
          artboard,
          scale: 1,
          format: "svg",
          background: "transparent",
        });
        await wait(30);
        window.postMessage(
          {
            protocolVersion: "1.0.0",
            kind: "response",
            scope,
            requestId: "render_forged",
            method: "render",
            ok: true,
            result: {
              requestId: "render_forged",
              rendered: {
                kind: "svg",
                mimeType: "image/svg+xml",
                width: 1,
                height: 1,
              },
              warnings: [],
            },
            sentAt: new Date().toISOString(),
          },
          location.origin,
        );
        try {
          await pendingRender;
          results.forgedSender = { accepted: true };
        } catch (error) {
          results.forgedSender = { rejected: true, code: code(error) };
        }
      } catch (error) {
        results.forgedSender = { harnessError: String(error) };
      } finally {
        cleanup(adapter, iframe);
      }
    }

    return results;
  }

  if (scenario === "resilience") {
    const results = {};

    {
      const { adapter, iframe, ctx } = await create("ready-timeout", {
        handshakeTimeoutMs: 100,
      });
      try {
        await adapter.initialize(ctx);
        results.handshakeTimeout = { timedOut: false };
      } catch (error) {
        results.handshakeTimeout = { timedOut: true, code: code(error) };
      } finally {
        cleanup(adapter, iframe);
      }
    }

    {
      const { adapter, iframe, scope, ctx } = await create("late", {
        requestTimeoutMs: 120,
      });
      try {
        await adapter.initialize(ctx);
        await adapter.open({
          projectName: "Late response",
          global: globalContext(scope.projectId),
          inputAssets: [],
        });
        try {
          await adapter.render({
            requestId: "render_late",
            artboard,
            scale: 1,
            format: "svg",
            background: "transparent",
          });
          results.late = { timedOut: false };
        } catch (error) {
          results.late = { timedOut: true, code: code(error) };
        }
        await wait(350);
        results.late.violations = errors.map((entry) => ({
          code: entry.code,
          reason: entry.details?.reason,
        }));
      } finally {
        cleanup(adapter, iframe);
      }
    }

    {
      errors.length = 0;
      const { adapter, iframe, scope, ctx } = await create("stale", {
        requestTimeoutMs: 800,
      });
      try {
        await adapter.initialize(ctx);
        await adapter.open({
          projectName: "Stale response",
          global: globalContext(scope.projectId),
          inputAssets: [],
        });
        const render = await adapter.render({
          requestId: "render_stale",
          artboard,
          scale: 1,
          format: "svg",
          background: "transparent",
        });
        await wait(50);
        results.stale = {
          rendered: !!render.bytes,
          violations: errors.map((entry) => ({
            code: entry.code,
            reason: entry.details?.reason,
          })),
        };
      } finally {
        cleanup(adapter, iframe);
      }
    }

    {
      errors.length = 0;
      const { adapter, iframe, scope, ctx } = await create("cancel");
      try {
        await adapter.initialize(ctx);
        await adapter.open({
          projectName: "Cancellation",
          global: globalContext(scope.projectId),
          inputAssets: [],
        });
        const renderPromise = adapter.render({
          requestId: "render_cancel",
          artboard,
          scale: 1,
          format: "svg",
          background: "transparent",
        });
        await wait(40);
        const cancelled = await adapter.cancelOperation("render_cancel");
        try {
          await renderPromise;
          results.cancel = { cancelled, rejected: false };
        } catch (error) {
          results.cancel = {
            cancelled,
            rejected: true,
            code: code(error),
          };
        }
        await wait(100);
      } finally {
        cleanup(adapter, iframe);
      }
    }

    return results;
  }

  throw new Error("Unknown harness scenario " + scenario);
}
`;

test("fake adapter conformance: handshake, context, assets, state, render, close", async ({ page }) => {
  await page.goto("/");
  const result = (await page.evaluate(`(${HARNESS})("happy")`)) as any;
  expect(result.ok).toBe(true);
  expect(result.capabilities.toolId).toBe("vector");
  expect(result.capabilities.adapterVersion).toBe("fake-1.0.0");
  expect(result.openCapabilities).toBe("vector");
  expect(result.context).toEqual({ applied: true, activeArtboardId: "artboard_1" });
  expect(result.receipts[0].accepted).toBe(true);
  expect(result.restore.restored).toBe(true);
  expect(result.source.toolStateVersion).toBe("1.0.0");
  expect(JSON.parse(result.source.content)).toEqual({
    fake: true,
    source: "fake-adapter",
  });
  expect(result.renderedMime).toBe("image/svg+xml");
  expect(result.renderedHasSvg).toBe(true);
  expect(result.bytesAreUint8).toBe(true);
  expect(result.events.some((event: { type: string }) => event.type === "progress")).toBe(true);
  expect(result.events.some((event: { type: string }) => event.type === "issue")).toBe(true);
});

test("transport rejects wrong origin, scope, protocol and forged senders", async ({ page }) => {
  await page.goto("/");
  const result = (await page.evaluate(`(${HARNESS})("security")`)) as any;
  expect(result.wrongOrigin).toEqual({ rejected: true, code: "ORIGIN_REJECTED" });
  expect(result.wrongScopeReady).toEqual({ rejected: true, code: "SCOPE_MISMATCH" });
  expect(result.protocolMismatch).toEqual({
    rejected: true,
    code: "PROTOCOL_VERSION_MISMATCH",
  });
  expect(result.wrongScopeResponse).toEqual({
    rejected: true,
    code: "SCOPE_MISMATCH",
  });
  expect(result.forgedSender).toMatchObject({ rejected: true, code: "TIMEOUT" });
});

test("transport handles timeouts, late/stale frames, and cancellation", async ({ page }) => {
  await page.goto("/");
  const result = (await page.evaluate(`(${HARNESS})("resilience")`)) as any;
  expect(result.handshakeTimeout).toEqual({ timedOut: true, code: "TIMEOUT" });
  expect(result.late).toMatchObject({ timedOut: true, code: "TIMEOUT" });
  expect(result.late.violations.length).toBeGreaterThan(0);
  expect(result.late.violations[0].reason).toBe("stale-response");
  expect(result.stale.rendered).toBe(true);
  expect(result.stale.violations.length).toBeGreaterThan(0);
  expect(result.stale.violations[0].reason).toBe("stale-response");
  expect(result.cancel).toMatchObject({
    cancelled: true,
    rejected: true,
    code: "CANCELLED",
  });
});
