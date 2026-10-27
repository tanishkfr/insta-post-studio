import { useEffect, useRef, useState } from "react";
import { studioStore, useStudioStore } from "../state/projectStore";

export function ArtboardBar() {
  const project = useStudioStore((state) => state.project);
  const activeArtboardId = useStudioStore((state) => state.activeArtboardId);
  const artboards = project.artboards
    .slice()
    .sort((left, right) => left.index - right.index);
  const active =
    artboards.find((artboard) => artboard.id === activeArtboardId) ?? artboards[0];
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(active?.name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftName(active?.name ?? "");
    setRenaming(false);
    setConfirmDelete(false);
  }, [active?.id, active?.name]);

  useEffect(() => {
    if (!renaming) return;
    renameRef.current?.focus();
    renameRef.current?.select();
  }, [renaming]);

  if (!active) return null;

  function commitRename() {
    const next = draftName.trim();
    if (next && next !== active.name) {
      studioStore.getState().renameArtboard(active.id, next);
    } else {
      setDraftName(active.name);
    }
    setRenaming(false);
  }

  const activeIndex = artboards.findIndex((artboard) => artboard.id === active.id);
  const canDelete = artboards.length > 1;

  return (
    <div className="artboard-bar" role="group" aria-label="Artboards" data-testid="artboard-bar">
      <div className="artboard-tabs" role="group" aria-label="Artboard list">
        {artboards.map((artboard) => {
          const selected = artboard.id === active.id;
          return (
            <button
              key={artboard.id}
              type="button"
              className={`artboard-tab${selected ? " is-active" : ""}`}
              aria-current={selected ? "page" : undefined}
              aria-label={`${artboard.name}, ${artboard.layerOrder.length} layer${artboard.layerOrder.length === 1 ? "" : "s"}`}
              data-testid={`artboard-tab-${artboard.id}`}
              onClick={() => studioStore.getState().setActiveArtboard(artboard.id)}
              title={`Switch to ${artboard.name}`}
            >
              <span className="artboard-tab-index" aria-hidden="true">
                {String(artboard.index + 1).padStart(2, "0")}
              </span>
              <span className="artboard-tab-name">{artboard.name}</span>
              <span className="artboard-tab-count" aria-hidden="true">
                {artboard.layerOrder.length}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          className="artboard-add"
          data-testid="add-artboard"
          onClick={() => studioStore.getState().addArtboard()}
          title="Create a new artboard"
        >
          + Artboard
        </button>
      </div>

      <div className="artboard-actions">
        {renaming ? (
          <label className="artboard-rename">
            <span className="sr-only">Artboard name</span>
            <input
              ref={renameRef}
              value={draftName}
              maxLength={80}
              aria-label="Artboard name"
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitRename();
                }
                if (event.key === "Escape") {
                  setDraftName(active.name);
                  setRenaming(false);
                }
              }}
            />
          </label>
        ) : null}

        {confirmDelete ? (
          <span className="artboard-delete-confirm" role="alert">
            <span>Delete “{active.name}”?</span>
            <button
              type="button"
              className="mini-button danger"
              data-testid="confirm-delete-artboard"
              onClick={() => {
                studioStore.getState().deleteArtboard(active.id);
                setConfirmDelete(false);
              }}
            >
              Delete
            </button>
            <button
              type="button"
              className="mini-button"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </span>
        ) : (
          <>
            <button
              type="button"
              className="mini-button"
              data-testid="duplicate-artboard"
              aria-label={`Duplicate artboard ${active.name}`}
              title="Duplicate this artboard and its layers"
              onClick={() => studioStore.getState().duplicateArtboard(active.id)}
            >
              ⧉
            </button>
            <button
              type="button"
              className="mini-button"
              data-testid="rename-artboard"
              aria-label={`Rename artboard ${active.name}`}
              title="Rename this artboard"
              onClick={() => setRenaming(true)}
            >
              Rename
            </button>
            <button
              type="button"
              className="mini-button"
              data-testid="move-artboard-left"
              aria-label={`Move artboard ${active.name} earlier`}
              title="Move earlier"
              disabled={activeIndex <= 0}
              onClick={() => studioStore.getState().reorderArtboard(active.id, "left")}
            >
              ←
            </button>
            <button
              type="button"
              className="mini-button"
              data-testid="move-artboard-right"
              aria-label={`Move artboard ${active.name} later`}
              title="Move later"
              disabled={activeIndex < 0 || activeIndex >= artboards.length - 1}
              onClick={() => studioStore.getState().reorderArtboard(active.id, "right")}
            >
              →
            </button>
            <button
              type="button"
              className="mini-button danger"
              data-testid="delete-artboard"
              aria-label={`Delete artboard ${active.name}`}
              title={canDelete ? "Delete this artboard" : "A project needs at least one artboard"}
              disabled={!canDelete}
              onClick={() => setConfirmDelete(true)}
            >
              ×
            </button>
          </>
        )}
      </div>
    </div>
  );
}
