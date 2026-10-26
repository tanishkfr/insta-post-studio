import { describe, expect, it } from "vitest";
import { createGeneratedProject, createVideoProject } from "../../src/engine/core/project";
import { useEditorStore } from "../../src/app/store";
import type { MediaAssetRecord } from "../../src/engine/core/types";

describe("editor history", () => {
  it("supports commit, undo, and redo for project edits", () => {
    const project = createGeneratedProject("4:5", "pulse", "HISTORY-01");
    const store = useEditorStore.getState();
    store.setProject(project);
    store.commit("Rename project", (draft) => {
      draft.name = "History check";
      return draft;
    });
    expect(useEditorStore.getState().project?.name).toBe("History check");

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.name).toBe("Pulse field");
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().project?.name).toBe("History check");
    useEditorStore.getState().clearProject();
  });

  it("cancels direct-manipulation gestures without leaving history entries", () => {
    const project = createGeneratedProject("1:1", "pulse", "GESTURE-01");
    const store = useEditorStore.getState();
    store.setProject(project);
    store.beginGesture();
    store.updateTransient((draft) => {
      draft.layers[0].transform.x = 120;
      return draft;
    });
    expect(useEditorStore.getState().project?.layers[0].transform.x).toBe(120);
    useEditorStore.getState().cancelGesture();
    expect(useEditorStore.getState().project?.layers[0].transform.x).toBe(0);
    expect(useEditorStore.getState().history).toHaveLength(0);
    useEditorStore.getState().clearProject();
  });

  it("rolls back an in-progress crop session to its baseline", () => {
    const project = createGeneratedProject("1:1", "pulse", "CROP-01");
    const store = useEditorStore.getState();
    store.setProject(project);
    store.startCrop();
    useEditorStore.getState().commit("Set crop", (draft) => {
      draft.layers[0].crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
      return draft;
    });
    useEditorStore.getState().cancelCrop();
    expect(useEditorStore.getState().project?.layers[0].crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(useEditorStore.getState().canvasMode).toBe("select");
    expect(useEditorStore.getState().history).toHaveLength(0);
    useEditorStore.getState().clearProject();
  });

  it("removes every crop-session edit when cancelling after multiple presets", () => {
    const project = createGeneratedProject("1:1", "pulse", "CROP-02");
    const store = useEditorStore.getState();
    store.setProject(project);
    store.startCrop();
    useEditorStore.getState().commit("Set first crop", (draft) => {
      draft.layers[0].crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
      return draft;
    });
    useEditorStore.getState().commit("Set second crop", (draft) => {
      draft.layers[0].crop = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
      return draft;
    });
    useEditorStore.getState().cancelCrop();
    expect(useEditorStore.getState().project?.layers[0].crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(useEditorStore.getState().history).toHaveLength(0);
    useEditorStore.getState().clearProject();
  });

  it("keeps a removed video's source available for undo", () => {
    const asset: MediaAssetRecord = {
      id: "asset-history-video",
      storageKey: "blob-history-video",
      name: "history.mp4",
      mimeType: "video/mp4",
      size: 128,
      width: 640,
      height: 360,
      duration: 4,
      audio: { status: "available", codec: "aac", channels: 2, sampleRate: 48_000, startTime: 0 },
    };
    const project = createVideoProject("4:5", asset);
    const store = useEditorStore.getState();
    store.setProject(project);
    useEditorStore.getState().commit("Remove layer", (draft) => ({
      ...draft,
      layers: [],
    }));

    expect(useEditorStore.getState().project?.layers).toHaveLength(0);
    expect(useEditorStore.getState().project?.assets[asset.id]).toBeDefined();

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.layers[0]?.kind).toBe("video");
    expect(useEditorStore.getState().project?.assets[asset.id]).toMatchObject(asset);
    useEditorStore.getState().clearProject();
  });
});
