import type { SourceToolId, StudioProject } from "@studio/contracts";
import { STUDIO_PROJECT_SCHEMA_VERSION } from "@studio/contracts";

const baselineAt = "2026-10-26T00:00:00.000Z";

const sources = [
  {
    tool: "image" as const,
    repositoryUrl: "https://github.com/nithilaprakash18/Insta-post",
    branch: "main",
    commitSha: "3eac3c7f5228e8324c6b245eb3011b86762b1d25",
    importedPath: "tools/legacy/image/janya.html",
    license: "No licence declared upstream; permission required before reuse.",
  },
  {
    tool: "vector" as const,
    repositoryUrl: "https://github.com/nithilaprakash18/Insta-post",
    branch: "main",
    commitSha: "3eac3c7f5228e8324c6b245eb3011b86762b1d25",
    importedPath: "tools/legacy/vector/arnav.html",
    license: "No licence declared upstream; permission required before reuse.",
  },
  {
    tool: "generate" as const,
    repositoryUrl: "https://github.com/nithilaprakash18/Insta-post",
    branch: "main",
    commitSha: "3eac3c7f5228e8324c6b245eb3011b86762b1d25",
    importedPath: "tools/legacy/generate/generator.html",
    license: "No licence declared upstream; permission required before reuse.",
  },
  {
    tool: "shapes" as const,
    repositoryUrl: "https://github.com/rajshekharbasu/shapes",
    branch: "main",
    commitSha: "08fea0e00d43f2b955f34e6e341c4f2aaba427ca",
    importedPath: "tools/shapes",
    license: "No licence declared upstream; permission required before reuse.",
  },
  {
    tool: "typography" as const,
    repositoryUrl: "https://github.com/anushkaaaajain/Online-Type-Tool",
    branch: "main",
    commitSha: "7a7fcfbcb97d4defc402f41da723c95b6de735ac",
    importedPath: "tools/typography",
    license: "No licence declared upstream; bundled font credits retained.",
  },
  {
    tool: "bend" as const,
    repositoryUrl: "https://github.com/tanishkfr/Bend",
    branch: "polish/phase-8.1.1-ui",
    commitSha: "7f2d69c272d2a4607ff45f2575c650ac3b6cfb43",
    importedPath: "tools/bend",
    license: "Private upstream project; third-party notices preserved.",
  },
] satisfies StudioProject["metadata"]["sourceProjects"];

export const defaultProject: StudioProject = {
  id: "project_untitled",
  name: "Untitled Project",
  schemaVersion: STUDIO_PROJECT_SCHEMA_VERSION,
  format: {
    id: "instagram-post-square",
    label: "Instagram post",
    width: 1080,
    height: 1080,
    unit: "px",
    aspectRatio: 1,
    orientation: "square",
  },
  artboards: [
    {
      id: "artboard_01",
      name: "Artboard 01",
      index: 0,
      width: 1080,
      height: 1080,
      background: { kind: "solid", color: "#ffffff" },
      layerOrder: [],
    },
  ],
  layers: [],
  assets: [],
  layerOrder: [],
  metadata: {
    createdAt: baselineAt,
    updatedAt: baselineAt,
    appVersion: "0.1.0",
    tags: ["phase-0"],
    notes: "In-memory foundation project. Persistence arrives in a later phase.",
    sourceProjects: sources,
  },
};

export type NavToolId = Exclude<SourceToolId, "host">;

export interface ToolNavItem {
  id: NavToolId;
  index: string;
  label: string;
  discipline: string;
  sourcePath: string;
}

export const toolNav: ToolNavItem[] = [
  {
    id: "image",
    index: "01",
    label: "Image",
    discipline: "Raster & filters",
    sourcePath: "tools/legacy/image/janya.html",
  },
  {
    id: "vector",
    index: "02",
    label: "Vector",
    discipline: "Paths & generators",
    sourcePath: "tools/legacy/vector/arnav.html",
  },
  {
    id: "typography",
    index: "03",
    label: "Type",
    discipline: "Fonts & forms",
    sourcePath: "tools/typography/",
  },
  {
    id: "shapes",
    index: "04",
    label: "Shapes",
    discipline: "3D & geometry",
    sourcePath: "tools/shapes/",
  },
  {
    id: "bend",
    index: "05",
    label: "BEND",
    discipline: "Video & motion",
    sourcePath: "tools/bend/",
  },
  {
    id: "generate",
    index: "06",
    label: "Generate",
    discipline: "Layouts & carousels",
    sourcePath: "tools/legacy/generate/generator.html",
  },
];
