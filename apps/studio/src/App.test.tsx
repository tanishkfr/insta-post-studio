import type { SharedLayer, StudioProject } from "@studio/contracts";
import { createIdentityTransform } from "@studio/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InspectorPanel } from "./components/InspectorPanel";
import { LayersPanel } from "./components/LayersPanel";
import { ToolRail } from "./components/ToolRail";
import { Topbar } from "./components/Topbar";
import {
  createStudioProject,
  FORMAT_PRESETS,
} from "./project/defaultProject";
import { studioStore } from "./state/projectStore";

function makeLayer(project: StudioProject, name = "Vector artwork"): SharedLayer {
  return {
    id: "layer_test",
    name,
    kind: "vector",
    sourceTool: "vector",
    artboardId: project.artboards[0].id,
    order: 0,
    sourceState: {
      id: "source_test",
      tool: "vector",
      toolStateVersion: "1.0.0",
      mimeType: "application/vnd.studio.vector+json",
      storage: {
        backend: "indexeddb",
        database: "studio-assets",
        objectStore: "source-states",
        key: "source_test",
      },
      updatedAt: "2026-10-26T00:00:00.000Z",
      revision: 1,
    },
    rendered: {
      kind: "svg",
      mimeType: "image/svg+xml",
      assetId: "asset_test",
      width: 1000,
      height: 1414,
      hasAlpha: true,
    },
    transform: { ...createIdentityTransform(500, 707), x: 200, y: 120 },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    mask: null,
    clipToArtboard: true,
    metadata: {
      createdAt: "2026-10-26T00:00:00.000Z",
      updatedAt: "2026-10-26T00:00:00.000Z",
    },
  };
}

function resetStore(withLayer = true) {
  const project = createStudioProject({
    id: `project_${Math.random()}`,
    name: "Studio composition",
    formatId: "instagram-4-5",
  });
  studioStore.getState().replaceProject(project);
  if (withLayer) {
    studioStore.getState().addLayer(makeLayer(project), []);
  }
  return project;
}

describe("Studio shell components", () => {
  beforeEach(() => {
    resetStore(true);
  });

  it("renders project identity, save status and format selection", () => {
    const project = studioStore.getState().project;
    const onRename = vi.fn();
    const onFormatChange = vi.fn();
    render(
      <Topbar
        project={project}
        formats={FORMAT_PRESETS}
        saveStatus="saved"
        saveError={null}
        canUndo
        canRedo={false}
        editingTool={null}
        onSave={() => undefined}
        onUndo={() => undefined}
        onRedo={() => undefined}
        onRename={onRename}
        onFormatChange={onFormatChange}
        onNewProject={() => undefined}
      onProjectData={() => undefined}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Saved locally");
    expect(screen.getByRole("combobox", { name: "Project format" })).toHaveValue(
      "instagram-4-5",
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Project format" }), {
      target: { value: "instagram-story" },
    });
    expect(onFormatChange).toHaveBeenCalledWith("instagram-story");

    const name = screen.getByRole("textbox", { name: "Project name" });
    fireEvent.change(name, { target: { value: "Campaign One" } });
    fireEvent.blur(name);
    expect(onRename).toHaveBeenCalledWith("Campaign One");
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("exposes Image, Vector, Type, Shapes, BEND and Generate as live", () => {
    render(
      <ToolRail
        layerCount={1}
        activeView="canvas"
        onCanvas={() => undefined}
        onOpenTool={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /Vector/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Image/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Type/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Shapes/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Generate/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Video/ })).toBeEnabled();
    expect(screen.getAllByText("Live")).toHaveLength(6);
    expect(screen.getByText("1 layer")).toBeInTheDocument();
  });

  it("lists, hides and locks real project layers", () => {
    render(
      <LayersPanel
        onOpenTool={() => undefined}
        onEditLayer={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: "Layers" })).toBeInTheDocument();
    expect(screen.getByText("Vector artwork")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Hide layer Vector artwork/ }));
    expect(studioStore.getState().project.layers[0].visible).toBe(false);
    expect(
      screen.getByRole("button", { name: /Show layer Vector artwork/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Lock layer Vector artwork/ }));
    expect(studioStore.getState().project.layers[0].locked).toBe(true);
  });

  it("edits Vector layer metadata and host transforms from the inspector", () => {
    render(
      <InspectorPanel
        onEditLayer={() => undefined}
        onContinueInVector={() => undefined}
        onUseAsTypePattern={() => undefined}
        onUseAsImageInput={() => undefined}
        onGenerateLayouts={() => undefined}
        onAnimateInBend={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: "Inspector" })).toBeInTheDocument();
    expect(screen.getByText("Vector editor")).toBeInTheDocument();
    expect(screen.getByText("rev 1")).toBeInTheDocument();

    const name = screen.getByLabelText("Layer name");
    fireEvent.change(name, { target: { value: "Republished artwork" } });
    fireEvent.blur(name);
    expect(studioStore.getState().project.layers[0].name).toBe("Republished artwork");

    const x = screen.getByLabelText("X");
    fireEvent.change(x, { target: { value: "320" } });
    fireEvent.blur(x);
    expect(studioStore.getState().project.layers[0].transform.x).toBe(320);

    const opacity = screen.getByLabelText(/Opacity/);
    fireEvent.change(opacity, { target: { value: "55" } });
    fireEvent.blur(opacity);
    expect(studioStore.getState().project.layers[0].opacity).toBeCloseTo(0.55);

    expect(screen.getAllByRole("button", { name: "Edit in Vector" })).toHaveLength(1);
  });
});
