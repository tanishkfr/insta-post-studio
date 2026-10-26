const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
const MAX_CACHE_ENTRIES = 80;

let video: HTMLVideoElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let queue: Promise<unknown> = Promise.resolve();

/**
 * One shared decoder/canvas serves every visible timeline thumbnail. Requests
 * are serialized so switching source URLs never races, and finished data URLs
 * are cached by asset and source timestamp.
 */
export function getThumbnail(url: string, assetId: string, sourceTime: number): Promise<string | null> {
  const key = `${assetId}@${sourceTime.toFixed(2)}`;
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = queue.then(() => generate(url, key, sourceTime)).finally(() => {
    pending.delete(key);
  });
  queue = request.catch(() => undefined);
  pending.set(key, request);
  return request;
}

function generate(url: string, key: string, sourceTime: number): Promise<string | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  video ??= createThumbnailVideo();
  canvas ??= document.createElement("canvas");
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      video?.removeEventListener("loadeddata", onReady);
      video?.removeEventListener("seeked", onReady);
      video?.removeEventListener("error", onError);
      window.clearTimeout(timer);
      resolve(value);
    };
    const draw = () => {
      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      const width = Math.min(320, Math.max(1, video.videoWidth || 320));
      const height = Math.max(1, Math.round(width * (video.videoHeight || 180) / Math.max(1, video.videoWidth || 320)));
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return finish(null);
      try {
        context.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.62);
        cache.set(key, dataUrl);
        if (cache.size > MAX_CACHE_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest) cache.delete(oldest);
        }
        finish(dataUrl);
      } catch {
        finish(null);
      }
    };
    const onReady = () => {
      if (!video) return;
      const target = Math.max(0, Math.min(sourceTime, Math.max(0, (video.duration || sourceTime) - 0.03)));
      if (Math.abs(video.currentTime - target) < 0.02) draw();
      else video.currentTime = target;
    };
    const onError = () => finish(null);
    const timer = window.setTimeout(() => finish(null), 4_000);
    video!.addEventListener("loadeddata", onReady);
    video!.addEventListener("seeked", onReady);
    video!.addEventListener("error", onError);
    if (video!.src !== url) {
      video!.src = url;
      video!.load();
    } else if (video!.readyState >= HTMLMediaElement.HAVE_METADATA) {
      onReady();
    }
  });
}

function createThumbnailVideo(): HTMLVideoElement {
  const element = document.createElement("video");
  element.preload = "metadata";
  element.muted = true;
  element.playsInline = true;
  element.crossOrigin = "anonymous";
  element.setAttribute("aria-hidden", "true");
  element.style.position = "fixed";
  element.style.width = "1px";
  element.style.height = "1px";
  element.style.opacity = "0";
  element.style.pointerEvents = "none";
  element.style.left = "-10px";
  element.style.top = "-10px";
  document.body.appendChild(element);
  return element;
}
