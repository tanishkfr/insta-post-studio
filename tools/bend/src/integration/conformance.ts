import { normalizeProject } from "../engine/core/project";
import { decodeBendPackage, type BendPackageManifest } from "../engine/package/bendPackage";
import type { BendProject } from "../engine/core/types";
import type { BendRenderedMedia, BendStillMedia } from "./contract";
import { BendIntegrationContractError, HostSourceMismatchError, type BendContractIssue } from "./errors";
import { validateRenderedMedia, validateStillMedia } from "./validation";
import { getProjectVersion } from "./version";

export interface VerifiedEditableSource {
  project: BendProject;
  sourceProjectId: string;
  sourceVersion: string;
  manifest: BendPackageManifest;
  byteLength: number;
  assetIds: string[];
}

export interface BendHandoffVerification {
  sourceProjectId: string;
  sourceVersion: string;
  video: BendRenderedMedia;
  still: BendStillMedia | null;
  editable: VerifiedEditableSource;
}

/**
 * Validate an editable `.bendpkg` without writing it into BEND's local stores.
 * Hosts can use this before accepting, moving, or caching a source package.
 */
export async function verifyEditableSource(
  input: Blob | ArrayBuffer | Uint8Array,
  expected?: { sourceProjectId?: string; sourceVersion?: string },
): Promise<VerifiedEditableSource> {
  const decoded = await decodeBendPackage(input);
  const project = normalizeProject(decoded.project);
  const sourceVersion = getProjectVersion(project);
  const issues: BendContractIssue[] = [];

  if (!decoded.manifest.complete) {
    issues.push({ code: "source.complete", message: "The editable package is marked incomplete." });
  }
  if (expected?.sourceProjectId && project.id !== expected.sourceProjectId) {
    issues.push({ code: "source.projectId", message: "The editable package belongs to a different source project." });
  }
  if (expected?.sourceVersion && sourceVersion !== expected.sourceVersion) {
    issues.push({ code: "source.version", message: "The editable package does not match the expected source revision." });
  }
  const missingAssetIds = Object.keys(project.assets).filter((assetId) => !decoded.assets[assetId]);
  if (missingAssetIds.length > 0) {
    issues.push({ code: "source.assets", message: `The editable package is missing ${missingAssetIds.length} referenced source asset${missingAssetIds.length === 1 ? "" : "s"}.` });
  }
  if (issues.length > 0) throw new BendIntegrationContractError("The editable BEND package does not satisfy the handoff contract.", issues);

  return {
    project,
    sourceProjectId: project.id,
    sourceVersion,
    manifest: decoded.manifest,
    byteLength: decoded.byteLength,
    assetIds: Object.keys(decoded.assets).sort(),
  };
}

/**
 * Check that the video, still, and editable source belong to one source
 * revision. This is deliberately host-agnostic; it performs no writes.
 */
export async function verifyBendHandoff(input: {
  project: BendProject;
  video: BendRenderedMedia;
  still?: BendStillMedia | null;
  editableSource: Blob | ArrayBuffer | Uint8Array;
}): Promise<BendHandoffVerification> {
  const issues = validateRenderedMedia(input.video, input.project);
  if (input.still) issues.push(...validateStillMedia(input.still, input.project));
  if (issues.length > 0) throw new BendIntegrationContractError("The BEND handoff artifacts do not satisfy the integration contract.", issues);

  const expectedVersion = getProjectVersion(input.project);
  const editable = await verifyEditableSource(input.editableSource, {
    sourceProjectId: input.project.id,
    sourceVersion: expectedVersion,
  });
  if (input.still && input.still.sourceVersion !== expectedVersion) throw new HostSourceMismatchError();
  return {
    sourceProjectId: input.project.id,
    sourceVersion: expectedVersion,
    video: input.video,
    still: input.still ?? null,
    editable,
  };
}
