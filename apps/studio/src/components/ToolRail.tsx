import type { SharedLayer } from "@studio/contracts";
import { toolNav, type NavToolId } from "../project/defaultProject";
import { StudioToolRail } from "../phase5a/components";
import "../phase5a/components.css";

type LiveTool = Extract<
  NavToolId,
  "image" | "vector" | "typography" | "shapes" | "generate" | "bend"
>;

interface ToolRailProps {
  layerCount: number;
  activeView: "canvas";
  onCanvas: () => void;
  onOpenTool: (tool: LiveTool) => void;
}

export function ToolRail({
  layerCount,
  activeView,
  onCanvas,
  onOpenTool,
}: ToolRailProps) {
  return (
    <StudioToolRail
      tools={toolNav.map((tool) => ({
        id: tool.id, name: tool.label, purpose: tool.discipline,
        enabled: tool.status === "live",
        reason: tool.status === "live" ? undefined : "This editor is not available yet.",
      }))}
      canvasDetail={layerCount ? `${layerCount} layer${layerCount === 1 ? "" : "s"}` : "Project overview"}
      showAvailability
      active={activeView === "canvas" ? "compose" : activeView}
      onCompose={onCanvas}
      onTool={(id) => {
        const tool = toolNav.find((candidate) => candidate.id === id && candidate.status === "live");
        if (tool) onOpenTool(tool.id as LiveTool);
      }}
    />
  );
}

export function layerIcon(layer: SharedLayer): string {
  if (layer.kind === "vector") return "?";
  if (layer.kind === "typography") return "T";
  if (layer.kind === "shapes") return "?";
  if (layer.kind === "generated-layout") return "?";
  if (layer.kind === "video") return "?";
  if (layer.kind === "image") return "?";
  return "?";
}
