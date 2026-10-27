import type { StudioProject } from "@studio/contracts";
import { useEffect, useRef, useState } from "react";
import { assetRepository, projectRepository } from "../storage/instances";
import { auditAssetUsage, type AssetUsageAudit } from "../storage/assetAudit";
import { downloadBlob } from "../studio/compositionExport";
import {
  exportProjectPackage,
  importProjectPackage,
  MAX_PACKAGE_BYTES,
  type ProjectPackageImportResult,
} from "../studio/projectPackage";

interface ProjectDataDialogProps {
  project: StudioProject;
  onAdopt: (project: StudioProject, revision: number) => void;
  onClose: () => void;
}

type Status = "idle" | "working" | "success" | "error" | "cancelled";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The project operation failed.";
}

export function ProjectDataDialog({ project, onAdopt, onClose }: ProjectDataDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState<{ filename: string; bytes: number } | null>(null);
  const [imported, setImported] = useState<ProjectPackageImportResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audit, setAudit] = useState<AssetUsageAudit | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const working = status === "working";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLButtonElement>("[data-project-close]")?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  function close() {
    if (working) return;
    onClose();
  }

  function cancel() {
    abortRef.current?.abort();
  }

  async function exportPackage() {
    if (working) return;
    setStatus("working");
    setError(null);
    setExported(null);
    setImported(null);
    setProgress(0);
    setStage("Collecting project assets");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await exportProjectPackage({
        project,
        assets: assetRepository,
        signal: controller.signal,
        onProgress: (value, label) => {
          setProgress(Math.min(1, Math.max(0, value)));
          setStage(label);
        },
      });
      if (controller.signal.aborted) return;
      downloadBlob(result.blob, result.filename);
      setExported({ filename: result.filename, bytes: result.blob.size });
      setProgress(1);
      setStage("Project package downloaded");
      setStatus("success");
    } catch (caught) {
      if (controller.signal.aborted) {
        setStatus("cancelled");
        setStage("Export cancelled");
        return;
      }
      setStatus("error");
      setError(errorMessage(caught));
      setStage("Export failed");
    } finally {
      abortRef.current = null;
    }
  }

  async function importPackage(file: File) {
    if (working) return;
    setStatus("working");
    setError(null);
    setExported(null);
    setImported(null);
    setProgress(0);
    setStage("Validating project package");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await importProjectPackage({
        bytes,
        assets: assetRepository,
        projects: projectRepository,
        signal: controller.signal,
        onProgress: (value, label) => {
          setProgress(Math.min(1, Math.max(0, value)));
          setStage(label);
        },
      });
      if (controller.signal.aborted) return;
      onAdopt(result.project, result.revision);
      setImported(result);
      setProgress(1);
      setStage("Project imported");
      setStatus("success");
    } catch (caught) {
      if (controller.signal.aborted) {
        setStatus("cancelled");
        setStage("Import cancelled");
        return;
      }
      setStatus("error");
      setError(errorMessage(caught));
      setStage("Import failed");
    } finally {
      abortRef.current = null;
    }
  }

  async function runAudit() {
    setAuditError(null);
    try {
      setAudit(await auditAssetUsage({
        projects: projectRepository,
        assets: assetRepository,
        currentProject: project,
      }));
    } catch (caught) {
      setAuditError(errorMessage(caught));
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="project-data-dialog"
      aria-labelledby="project-data-title"
      data-testid="project-data-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (working) cancel();
        else close();
      }}
    >
      <header className="dialog-head">
        <div>
          <span className="eyebrow">Portability</span>
          <h2 id="project-data-title">Project data</h2>
        </div>
        <button
          type="button"
          className="mini-button"
          data-project-close=""
          onClick={close}
          disabled={working}
          aria-label="Close project data"
        >
          ×
        </button>
      </header>

      <p className="dialog-copy">
        Back up the complete editable project, including every native source document and
        referenced asset. A rendered PNG is not a project backup.
      </p>

      <section className="project-data-section" aria-labelledby="project-export-title">
        <div>
          <h3 id="project-export-title">Export Studio project</h3>
          <p>
            One ZIP with <code>project.json</code>, assets, source-state blobs, masks and BEND
            packages. Every entry is hashed and the archive is reopened for verification
            before download.
          </p>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => void exportPackage()}
          disabled={working}
          data-testid="export-project-package"
        >
          Export project package
        </button>
      </section>

      <section className="project-data-section" aria-labelledby="project-import-title">
        <div>
          <h3 id="project-import-title">Import Studio project</h3>
          <p>
            A package is validated completely before anything is written. A duplicate
            project ID becomes a new copy; an existing project is never overwritten. The
            maximum package size is {formatBytes(MAX_PACKAGE_BYTES)}.
          </p>
        </div>
        <label className="button project-import-label">
          Choose package
          <input
            type="file"
            accept=".zip,application/zip"
            data-testid="import-project-package-input"
            disabled={working}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setSelectedFile(file);
              if (file) void importPackage(file);
              event.target.value = "";
            }}
          />
        </label>
      </section>

      {working ? (
        <div className="export-progress" data-testid="project-package-progress">
          <div className="export-progress-head">
            <span role="status" aria-live="polite">
              {stage || "Working…"}
            </span>
            <strong>{Math.round(progress * 100)}%</strong>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Project package progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <i style={{ transform: `scaleX(${progress})` }} />
          </div>
          <button type="button" className="button small" onClick={cancel}>
            Cancel
          </button>
        </div>
      ) : null}

      {status === "error" && error ? (
        <p className="publish-error export-error" role="alert" data-testid="project-package-error">
          <strong>Project data operation failed</strong>
          <span>{error}</span>
        </p>
      ) : null}

      {status === "cancelled" ? (
        <p className="inline-note" role="status">
          Operation cancelled. No project record was written.
        </p>
      ) : null}

      {status === "success" && exported ? (
        <div className="export-success" role="status" data-testid="project-package-success">
          <strong>Project package downloaded</strong>
          <span>
            {exported.filename} · {formatBytes(exported.bytes)}
          </span>
        </div>
      ) : null}

      {status === "success" && imported ? (
        <div className="export-success" role="status" data-testid="project-package-success">
          <strong>Project imported</strong>
          <span>
            {imported.assetsImported} assets and {imported.sourceStatesImported} source
            documents restored. {imported.remappedProjectId
              ? "Saved as a new project because that project ID already existed."
              : "The project was restored with its original ID."}
          </span>
          {imported.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
          {selectedFile ? <span>Source: {selectedFile.name}</span> : null}
        </div>
      ) : null}

      <section className="project-data-section asset-audit" aria-labelledby="asset-audit-title">
        <div>
          <h3 id="asset-audit-title">Storage audit</h3>
          <p>
            Read-only check across every saved project. It reports abandoned asset records
            without deleting them; persisted undo history is not available in IndexedDB.
          </p>
        </div>
        <button
          type="button"
          className="button small"
          onClick={() => void runAudit()}
          data-testid="run-asset-audit"
        >
          Run audit
        </button>
      </section>

      {audit ? (
        <div className="asset-audit-result" data-testid="asset-audit-result">
          <dl>
            <div>
              <dt>Projects scanned</dt>
              <dd>{audit.projectsScanned}</dd>
            </div>
            <div>
              <dt>Assets scanned</dt>
              <dd>{audit.assetsScanned}</dd>
            </div>
            <div>
              <dt>Unreferenced assets</dt>
              <dd>{audit.unreferencedAssets.length}</dd>
            </div>
            <div>
              <dt>Unreferenced source docs</dt>
              <dd>{audit.unreferencedSourceStates.length}</dd>
            </div>
            <div>
              <dt>Missing references</dt>
              <dd>{audit.missingAssetReferences.length + audit.missingSourceStateReferences.length}</dd>
            </div>
            <div>
              <dt>Abandoned bytes</dt>
              <dd>{formatBytes(audit.unreferencedAssetBytes)}</dd>
            </div>
          </dl>
          {audit.unreferencedAssets.length > 0 ? (
            <ul>
              {audit.unreferencedAssets.slice(0, 5).map((asset) => (
                <li key={asset.id}>
                  {asset.name} · {asset.kind} · {formatBytes(asset.byteSize)}
                </li>
              ))}
              {audit.unreferencedAssets.length > 5 ? (
                <li>+{audit.unreferencedAssets.length - 5} more</li>
              ) : null}
            </ul>
          ) : (
            <p className="inline-note">No unreferenced asset records were found.</p>
          )}
          <p className="inline-note">
            Dry run only. Nothing was deleted, including records that look abandoned.
          </p>
        </div>
      ) : null}

      {auditError ? (
        <p className="inline-error" role="alert">
          {auditError}
        </p>
      ) : null}

      <footer className="dialog-actions">
        <button type="button" className="button" onClick={close} disabled={working}>
          Close
        </button>
      </footer>
    </dialog>
  );
}
