import { getProjectDuration, normalizeProject } from "../engine/core/project";
import { ASPECT_PRESETS } from "../engine/core/types";
import type { BendProject } from "../engine/core/types";
import type { BendHostComposition, BendHostLayer, BendRenderedMedia, BendStillMedia } from "./contract";
import { BEND_INTEGRATION_VERSION } from "./contract";
import { BendIntegrationContractError, type BendContractIssue } from "./errors";
import { getProjectVersion } from "./version";

export const HOST_PLAYBACK_POLICIES = ["loop", "hold-last-frame", "trim-to-host"] as const;
export const HOST_AUDIO_POLICIES = ["source", "muted"] as const;
export const HOST_EDIT_STATUSES = ["committed", "editing", "rendering", "error"] as const;

export function validateRenderedMedia(media: BendRenderedMedia, project?: BendProject): BendContractIssue[] {
  const issues: BendContractIssue[] = [];
  if (!media || media.kind !== "video") issue(issues, "media.kind", "Rendered media must declare kind \"video\".");
  if (!media) return issues;

  blobIssue(issues, "media.blob", media.blob, "Rendered video");
  blobIssue(issues, "media.poster", media.poster, "Rendered poster");
  if (isBlobLike(media.poster) && media.poster.type && media.poster.type !== "image/png") {
    issue(issues, "media.poster.mime", `The rendered poster must be image/png, received ${media.poster.type}.`);
  }
  positive(issues, "media.width", media.width, "Rendered width");
  positive(issues, "media.height", media.height, "Rendered height");
  positive(issues, "media.fps", media.fps, "Rendered FPS");
  positive(issues, "media.duration", media.duration, "Rendered duration");
  if (isFinitePositive(media.width) && isFinitePositive(media.height) && Number.isFinite(media.aspectRatio)) {
    const expected = media.width / media.height;
    if (Math.abs(media.aspectRatio - expected) > 0.01) {
      issue(issues, "media.aspectRatio", `Aspect ratio ${media.aspectRatio} does not match ${media.width} x ${media.height}.`);
    }
  }
  nonEmpty(issues, "media.mimeType", media.mimeType, "Rendered MIME type");
  nonEmpty(issues, "media.container", media.container, "Rendered container");
  nonEmpty(issues, "media.sourceProjectId", media.sourceProjectId, "Source project id");
  nonEmpty(issues, "media.sourceVersion", media.sourceVersion, "Source version");
  if (media.codec !== null && typeof media.codec !== "string") {
    issue(issues, "media.codec", "Codec must be a string or null.");
  }
  if (typeof media.audioPresent !== "boolean") {
    issue(issues, "media.audioPresent", "Audio presence must be explicit.");
  }
  if (media.audioMessage !== undefined && typeof media.audioMessage !== "string") {
    issue(issues, "media.audioMessage", "Audio message must be a string when present.");
  }
  if (media.mimeType && media.container) {
    const mime = media.mimeType.toLowerCase();
    if (mime.includes("mp4") && media.container !== "mp4") {
      issue(issues, "media.container", "Container does not match the MP4 MIME type.");
    }
    if (mime.includes("webm") && media.container !== "webm") {
      issue(issues, "media.container", "Container does not match the WebM MIME type.");
    }
  }

  if (project) {
    const source = normalizeProject(project);
    nonEmpty(issues, "project.id", source.id, "Project id");
    if (media.sourceProjectId !== source.id) {
      issue(issues, "media.sourceProjectId", "Rendered media belongs to a different source project.");
    }
    const expectedVersion = getProjectVersion(source);
    if (media.sourceVersion !== expectedVersion) {
      issue(issues, "media.sourceVersion", "Rendered media does not match the current editable source revision.");
    }
    if (Number.isFinite(media.aspectRatio) && Math.abs(media.aspectRatio - source.canvas.width / source.canvas.height) > 0.01) {
      issue(issues, "media.aspectRatio", "Rendered aspect ratio does not match the composition aspect ratio.");
    }
    if (media.fps !== source.canvas.fps) {
      issue(issues, "media.fps", `Rendered FPS ${media.fps} does not match the composition FPS ${source.canvas.fps}.`);
    }
    const expectedDuration = getProjectDuration(source);
    if (Number.isFinite(media.duration) && Math.abs(media.duration - expectedDuration) > 0.1) {
      issue(issues, "media.duration", `Rendered duration ${media.duration} does not match the composition duration ${expectedDuration}.`);
    }
  }
  return issues;
}

export function validateStillMedia(still: BendStillMedia, project?: BendProject): BendContractIssue[] {
  const issues: BendContractIssue[] = [];
  if (!still || still.kind !== "still") issue(issues, "still.kind", "Still media must declare kind \"still\".");
  if (!still) return issues;

  blobIssue(issues, "still.blob", still.blob, "Rendered still");
  if (isBlobLike(still.blob) && still.blob.type && still.blob.type !== "image/png") {
    issue(issues, "still.mime", `The rendered still must be image/png, received ${still.blob.type}.`);
  }
  if (still.mimeType !== "image/png") issue(issues, "still.mimeType", "Still MIME type must be image/png.");
  positive(issues, "still.width", still.width, "Still width");
  positive(issues, "still.height", still.height, "Still height");
  if (!Number.isFinite(still.timestamp) || still.timestamp < 0) issue(issues, "still.timestamp", "Still timestamp must be a finite non-negative value.");
  nonEmpty(issues, "still.sourceProjectId", still.sourceProjectId, "Source project id");
  nonEmpty(issues, "still.sourceVersion", still.sourceVersion, "Source version");

  if (project) {
    const source = normalizeProject(project);
    if (still.sourceProjectId !== source.id) issue(issues, "still.sourceProjectId", "Still belongs to a different source project.");
    if (still.sourceVersion !== getProjectVersion(source)) issue(issues, "still.sourceVersion", "Still does not match the current editable source revision.");
    if (still.width !== source.canvas.width || still.height !== source.canvas.height) {
      issue(issues, "still.dimensions", "Still dimensions do not match the composition.");
    }
    if (Number.isFinite(still.timestamp) && still.timestamp > getProjectDuration(source) + 0.001) {
      issue(issues, "still.timestamp", "Still timestamp is outside the composition duration.");
    }
  }
  return issues;
}

export function validateHostLayer(layer: BendHostLayer): BendContractIssue[] {
  const issues: BendContractIssue[] = [];
  if (!layer || typeof layer !== "object") return [{ code: "host.layer", message: "Host layer is not an object." }];

  nonEmpty(issues, "host.layer.id", layer.id, "Host layer id");
  nonEmpty(issues, "host.layer.sourceProjectId", layer.sourceProjectId, "Source project id");
  nonEmpty(issues, "host.layer.sourceVersion", layer.sourceVersion, "Source version");
  nonEmpty(issues, "host.layer.renderedMediaId", layer.renderedMediaId, "Rendered media reference");
  nonEmpty(issues, "host.layer.posterMediaId", layer.posterMediaId, "Poster media reference");
  nonEmpty(issues, "host.layer.editablePackageId", layer.editablePackageId, "Editable package reference");
  positive(issues, "host.layer.duration", layer.duration, "Layer duration");
  positive(issues, "host.layer.fps", layer.fps, "Layer FPS");
  positive(issues, "host.layer.width", layer.width, "Layer width");
  positive(issues, "host.layer.height", layer.height, "Layer height");
  if (!layer.transform || typeof layer.transform !== "object") {
    issue(issues, "host.layer.transform", "Host transform is required.");
  } else {
    finite(issues, "host.layer.transform.x", layer.transform.x, "Host X");
    finite(issues, "host.layer.transform.y", layer.transform.y, "Host Y");
    finite(issues, "host.layer.transform.rotation", layer.transform.rotation, "Host rotation");
    if (!isFinitePositive(layer.transform.scale)) issue(issues, "host.layer.transform.scale", "Host scale must be greater than zero.");
  }
  if (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) {
    issue(issues, "host.layer.opacity", "Host opacity must be between 0 and 1.");
  }
  if (!Number.isInteger(layer.stackingOrder) || layer.stackingOrder < 0) {
    issue(issues, "host.layer.stackingOrder", "Stacking order must be a non-negative integer.");
  }
  finite(issues, "host.layer.timelineOffset", layer.timelineOffset, "Timeline offset");
  if (!HOST_PLAYBACK_POLICIES.includes(layer.playback)) issue(issues, "host.layer.playback", "Unsupported host playback policy.");
  if (!HOST_AUDIO_POLICIES.includes(layer.audioPolicy)) issue(issues, "host.layer.audioPolicy", "Unsupported host audio policy.");
  if (!HOST_EDIT_STATUSES.includes(layer.editStatus)) issue(issues, "host.layer.editStatus", "Unsupported host edit status.");
  nonEmpty(issues, "host.layer.renderedMimeType", layer.renderedMimeType, "Rendered MIME type");
  if (layer.renderedCodec !== null && typeof layer.renderedCodec !== "string") issue(issues, "host.layer.renderedCodec", "Rendered codec must be a string or null.");
  if (typeof layer.audioPresent !== "boolean") issue(issues, "host.layer.audioPresent", "Audio presence must be explicit.");
  if (layer.audioMessage !== undefined && typeof layer.audioMessage !== "string") issue(issues, "host.layer.audioMessage", "Audio message must be a string when present.");
  return issues;
}

export function validateHostComposition(composition: BendHostComposition): BendContractIssue[] {
  const issues: BendContractIssue[] = [];
  if (!composition || typeof composition !== "object") return [{ code: "host.composition", message: "Host composition is not an object." }];
  if (composition.integrationVersion !== BEND_INTEGRATION_VERSION) {
    issue(issues, "host.composition.integrationVersion", `Unsupported integration version ${String(composition.integrationVersion)}; expected ${BEND_INTEGRATION_VERSION}.`);
  }
  nonEmpty(issues, "host.composition.id", composition.id, "Host composition id");
  if (!(composition.aspect in ASPECT_PRESETS)) issue(issues, "host.composition.aspect", "Unsupported host aspect ratio.");
  positive(issues, "host.composition.width", composition.width, "Host width");
  positive(issues, "host.composition.height", composition.height, "Host height");
  positive(issues, "host.composition.duration", composition.duration, "Host duration");
  if (!Number.isFinite(composition.updatedAt)) issue(issues, "host.composition.updatedAt", "Host composition timestamp is invalid.");
  if (!composition.foreground || typeof composition.foreground !== "object") {
    issue(issues, "host.composition.foreground", "Host foreground record is required.");
  }
  if (!Array.isArray(composition.layers)) {
    issue(issues, "host.composition.layers", "Host layers must be an array.");
  } else {
    const seen = new Set<string>();
    composition.layers.forEach((layer, index) => {
      if (seen.has(layer.id)) issue(issues, `host.composition.layers[${index}].id`, `Duplicate host layer id ${layer.id}.`);
      seen.add(layer.id);
      validateHostLayer(layer).forEach((layerIssue) => issues.push({ ...layerIssue, code: `host.composition.layers[${index}].${layerIssue.code}` }));
    });
  }
  return issues;
}

export function assertValidRenderedMedia(media: BendRenderedMedia, project?: BendProject): void {
  assertIssues(validateRenderedMedia(media, project), "The rendered BEND media does not satisfy the handoff contract.");
}

export function assertValidStillMedia(still: BendStillMedia, project?: BendProject): void {
  assertIssues(validateStillMedia(still, project), "The rendered BEND still does not satisfy the handoff contract.");
}

export function assertValidHostLayer(layer: BendHostLayer): void {
  assertIssues(validateHostLayer(layer), "The BEND host layer record is invalid.");
}

export function assertValidHostComposition(composition: BendHostComposition): void {
  assertIssues(validateHostComposition(composition), "The host composition does not satisfy the BEND integration contract.");
}

function assertIssues(issues: BendContractIssue[], message: string): void {
  if (issues.length > 0) throw new BendIntegrationContractError(message, issues);
}

function issue(issues: BendContractIssue[], code: string, message: string): void {
  issues.push({ code, message });
}

function blobIssue(issues: BendContractIssue[], code: string, value: Blob, label: string): void {
  if (!isBlobLike(value)) {
    issue(issues, code, `${label} is not a Blob.`);
    return;
  }
  if (value.size <= 0) issue(issues, code, `${label} is empty.`);
}

function isBlobLike(value: unknown): value is Blob {
  return Boolean(value) && typeof value === "object"
    && typeof (value as Blob).size === "number"
    && typeof (value as Blob).arrayBuffer === "function";
}

function nonEmpty(issues: BendContractIssue[], code: string, value: unknown, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) issue(issues, code, `${label} is required.`);
}

function positive(issues: BendContractIssue[], code: string, value: number, label: string): void {
  if (!isFinitePositive(value)) issue(issues, code, `${label} must be a finite value greater than zero.`);
}

function finite(issues: BendContractIssue[], code: string, value: number, label: string): void {
  if (!Number.isFinite(value)) issue(issues, code, `${label} must be finite.`);
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
