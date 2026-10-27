import type {
  ProjectFormat,
  SourceToolId,
  StudioProject,
} from "@studio/contracts";
import { STUDIO_PROJECT_SCHEMA_VERSION } from "@studio/contracts";
import { createId, nowIso } from "../lib/ids";

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

export const FORMAT_PRESETS: ProjectFormat[] = [
  {
    id: "instagram-4-5",
    label: "Instagram 4:5",
    width: 1080,
    height: 1350,
    unit: "px",
    aspectRatio: 0.8,
    orientation: "portrait",
  },
  {
    id: "instagram-square",
    label: "Instagram 1:1",
    width: 1080,
    height: 1080,
    unit: "px",
    aspectRatio: 1,
    orientation: "square",
  },
  {
    id: "instagram-story",
    label: "Instagram 9:16",
    width: 1080,
    height: 1920,
    unit: "px",
    aspectRatio: 0.5625,
    orientation: "portrait",
  },
];

export const DEFAULT_FORMAT_ID = "instagram-square";

export function findFormat(formatId: string): ProjectFormat {
  const format = FORMAT_PRESETS.find((candidate) => candidate.id === formatId);
  if (!format) throw new Error(`Unknown format preset: ${formatId}`);
  return structuredClone(format);
}

export interface CreateProjectOptions {
  id?: string;
  name?: string;
  formatId?: string;
  createdAt?: string;
}

export function createStudioProject(options: CreateProjectOptions = {}): StudioProject {
  const format = findFormat(options.formatId ?? DEFAULT_FORMAT_ID);
  const timestamp = options.createdAt ?? nowIso();
  return {
    id: options.id ?? createId("project"),
    name: options.name?.trim() || "Untitled Project",
    schemaVersion: STUDIO_PROJECT_SCHEMA_VERSION,
    format,
    artboards: [
      {
        id: createId("artboard"),
        name: "Artboard 01",
        index: 0,
        width: format.width,
        height: format.height,
        background: { kind: "solid", color: "#ffffff" },
        layerOrder: [],
      },
    ],
    layers: [],
    assets: [],
    layerOrder: [],
    metadata: {
      createdAt: timestamp,
      updatedAt: timestamp,
      appVersion: "0.2.0",
      tags: ["phase-1"],
      notes: "Local-first Studio project. Binary assets live in IndexedDB.",
      sourceProjects: structuredClone(sources),
    },
  };
}

/** Deterministic fallback used by tests and before IndexedDB hydration. */
export const defaultProject: StudioProject = {
  ...createStudioProject({
    id: "project_untitled",
    name: "Untitled Project",
    formatId: DEFAULT_FORMAT_ID,
    createdAt: baselineAt,
  }),
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
};

export type NavToolId = Exclude<SourceToolId, "host">;

export interface ToolNavItem {
  id: NavToolId;
  index: string;
  label: string;
  discipline: string;
  sourcePath: string;
  status: "live" | "preserved";
}

export const toolNav: ToolNavItem[] = [
  {
    id: "image",
    index: "01",
    label: "Image",
    discipline: "Raster & filters",
    sourcePath: "tools/legacy/image/janya.html",
    status: "live",
  },
  {
    id: "vector",
    index: "02",
    label: "Vector",
    discipline: "Paths & generators",
    sourcePath: "tools/legacy/vector/arnav.html",
    status: "live",
  },
  {
    id: "typography",
    index: "03",
    label: "Type",
    discipline: "Fonts & forms",
    sourcePath: "tools/typography/",
    status: "live",
  },
  {
    id: "shapes",
    index: "04",
    label: "Shapes",
    discipline: "3D & geometry",
    sourcePath: "tools/shapes/",
    status: "live",
  },
  {
    id: "bend",
    index: "05",
    label: "Video",
    discipline: "Video & motion",
    sourcePath: "tools/bend/",
    status: "live",
  },
  {
    id: "generate",
    index: "06",
    label: "Generate",
    discipline: "Layouts & carousels",
    sourcePath: "tools/legacy/generate/generator.html",
    status: "live",
  },
];
