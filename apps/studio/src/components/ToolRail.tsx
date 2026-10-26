import type { SharedLayer } from "@studio/contracts";
import { toolNav } from "../project/defaultProject";

interface ToolRailProps {
  layerCount: number;
  activeView: "canvas" | "vector";
  onCanvas: () => void;
  onOpenVector: () => void;
}

export function ToolRail({
  layerCount,
  activeView,
  onCanvas,
  onOpenVector,
}: ToolRailProps) {
  return (
    <aside className="toolrail" aria-label="Tool navigation">
      <button
        type="button"
        className="canvas-nav"
        aria-current={activeView === "canvas" ? "page" : undefined}
        onClick={onCanvas}
      >
        <span className="canvas-nav-glyph" aria-hidden="true">
          <i />
          <i />
        </span>
        <span>
          <strong>Canvas</strong>
          <small>{layerCount ? `${layerCount} layer${layerCount === 1 ? "" : "s"}` : "Project overview"}</small>
        </span>
      </button>

      <div className="rail-heading">
        <span>Tools</span>
        <span className="rail-count">{String(toolNav.length).padStart(2, "0")}</span>
      </div>

      <nav className="tool-list" aria-label="Editing tools">
        {toolNav.map((tool) => {
          const isLive = tool.status === "live";
          return (
            <button
              key={tool.id}
              type="button"
              className={`tool-nav-item${isLive ? " is-live" : " is-locked"}`}
              onClick={isLive ? onOpenVector : undefined}
              disabled={!isLive}
              data-testid={`tool-${tool.id}`}
              title={isLive ? "Open Vector editor" : `${tool.label} integration arrives in a later phase`}
            >
              <span className="tool-index">{tool.index}</span>
              <span className="tool-copy">
                <strong>{tool.label}</strong>
                <small>{tool.discipline}</small>
              </span>
              <span className={`tool-availability${isLive ? " live" : ""}`}>
                {isLive ? "Live" : "Soon"}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="rail-footer">
        <div className="rail-status">
          <span className="status-dot" aria-hidden="true" />
          <span>Vector is integrated</span>
        </div>
        <p>One shared project · local-first storage</p>
      </div>
    </aside>
  );
}

export function layerIcon(layer: SharedLayer): string {
  return layer.kind === "vector" ? "◈" : "▧";
}
