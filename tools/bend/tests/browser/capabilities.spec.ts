import { expect, test } from "@playwright/test";

test.describe("BEND browser capability matrix", () => {
  test("records worker, canvas, and codec capabilities", async ({ page, browserName }) => {
    await page.goto("/");
    const capabilities = await page.evaluate(async () => {
      const recorderTypes = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4;codecs=avc1.42E01E",
      ];
      const worker = await new Promise<{ workerCreated: boolean; offscreenCanvas: boolean; webgl: boolean }>((resolve) => {
        const source = `self.onmessage = () => { let offscreenCanvas = false; let webgl = false; try { offscreenCanvas = typeof OffscreenCanvas === 'function'; const canvas = offscreenCanvas ? new OffscreenCanvas(16, 16) : null; webgl = Boolean(canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'))); } catch {} self.postMessage({ workerCreated: true, offscreenCanvas, webgl }); };`;
        const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        try {
          const instance = new Worker(url);
          instance.onmessage = (event) => { resolve(event.data); instance.terminate(); URL.revokeObjectURL(url); };
          instance.onerror = () => { resolve({ workerCreated: false, offscreenCanvas: false, webgl: false }); instance.terminate(); URL.revokeObjectURL(url); };
          instance.postMessage(null);
        } catch {
          resolve({ workerCreated: false, offscreenCanvas: false, webgl: false });
          URL.revokeObjectURL(url);
        }
      });
      const videoEncoder = "VideoEncoder" in window;
      const audioEncoder = "AudioEncoder" in window;
      return {
        worker,
        mediaRecorder: typeof MediaRecorder !== "undefined",
        recorderTypes: Object.fromEntries(recorderTypes.map((type) => [type, typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)])),
        videoEncoder,
        audioEncoder,
        offscreenCanvas: "OffscreenCanvas" in window,
      };
    });
    console.log(`[BEND CAPABILITY] ${JSON.stringify({ browserName, ...capabilities })}`);
    expect(capabilities.worker.workerCreated).toBe(true);
    expect(capabilities.worker.offscreenCanvas).toBe(true);
    // Headless Linux Firefox can expose OffscreenCanvas without a worker WebGL
    // context. Record the capability instead of claiming universal WebGL.
    expect(typeof capabilities.worker.webgl).toBe("boolean");
  });
});
