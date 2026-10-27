import type { SharedLayer } from "@studio/contracts";
import { toolNav, type NavToolId } from "../project/defaultProject";

type LiveTool = Extract<
  NavToolId,
  "image" | "vector" | "typography" | "shapes" | "generate" | "bend"
>;

interface ToolRailProps {
  layerCount: number;
  activeView: NavToolId | "canvas";
  onCanvas: () => void;
  onOpenTool: (tool: LiveTool) => void;
}

/**
 * The Studio tool navigation. The routing authority remains the host store;
 * this component only presents the same live tool destinations as a compact
 * horizontal tab row beneath the project header.
 */
export function ToolRail({
  layerCount,
  activeView,
  onCanvas,
  onOpenTool,
}: ToolRailProps) {
  return (
    <nav className="toolnav" aria-label="Studio tools">
      <div className="toolnav-track">
        <button
          type="button"
          className="toolnav-item toolnav-canvas"
          data-testid="tool-canvas"
          aria-current={activeView === "canvas" ? "page" : undefined}
          onClick={onCanvas}
        >
          <span className="toolnav-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span className="toolnav-label">Canvas</span>
          <span className="sr-only">
            {layerCount ? `${layerCount} layer${layerCount === 1 ? "" : "s"}` : "Project overview"}
          </span>
        </button>

        <span className="toolnav-rule" aria-hidden="true" />

        {toolNav.map((tool) => {
          const enabled = tool.status === "live";
          return (
            <button
              key={tool.id}
              type="button"
              className="toolnav-item"
              data-testid={`tool-${tool.id}`}
              aria-current={activeView === tool.id ? "page" : undefined}
              onClick={() => onOpenTool(tool.id as LiveTool)}
              disabled={!enabled}
              title={
                enabled
                  ? `${tool.label} — ${tool.discipline}`
                  : "This editor is not available yet."
              }
            >
              <span className="toolnav-index" aria-hidden="true">
                {tool.index}
              </span>
              <span className="toolnav-label">{tool.label}</span>
              <span className="sr-only">{enabled ? "Live" : "Soon"}</span>
            </button>
          );
        })}
      </div>
      <div id="studio-session-controls" />
    </nav>
  );
}

export function layerIcon(layer: SharedLayer): string {
  if (layer.sourceTool === "bend") return "B";
  if (layer.sourceTool === "typography") return "T";
  if (layer.sourceTool === "shapes") return "S";
  if (layer.sourceTool === "generate") return "G";
  if (layer.sourceTool === "image") return "I";
  if (layer.sourceTool === "vector") return "V";
  return "•";
}
