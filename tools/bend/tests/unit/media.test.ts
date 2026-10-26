import { describe, expect, it } from "vitest";
import { createAssetRecord, releaseVideoElement } from "../../src/engine/media/media";

describe("media lifecycle", () => {
  it("releases a hidden video element and its object URL source", () => {
    const calls: string[] = [];
    const video = {
      pause: () => calls.push("pause"),
      removeAttribute: (name: string) => calls.push(`removeAttribute:${name}`),
      load: () => calls.push("load"),
      remove: () => calls.push("remove"),
    } as unknown as HTMLVideoElement;

    releaseVideoElement(video);

    expect(calls).toEqual(["pause", "removeAttribute:src", "load", "remove"]);
  });

  it("preserves the probed duration and audio media kind", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "music.mp3", { type: "audio/mpeg" });
    const record = createAssetRecord(file, { width: 1, height: 1, duration: 12.5 }, "audio");
    expect(record.duration).toBe(12.5);
    expect(record.mediaType).toBe("audio");
  });
});
