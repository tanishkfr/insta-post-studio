import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Film, X } from "lucide-react";
import { motion } from "motion/react";
import type { BendLayer, MediaAssetRecord } from "../../engine/core/types";
import type { MediaInspection } from "../../engine/media/media";
import { canPreserveTiming, planSourceReplacement, type SourceDurationPolicy } from "../../engine/media/replacement";
import { motionTokens } from "../../styles/motion";

export interface SourceReplacementCandidate {
  layer: Extract<BendLayer, { kind: "video" }>;
  assetId: string;
  previous: MediaAssetRecord | null;
  file: File;
  metadata: { width: number; height: number; duration: number };
  inspection: MediaInspection;
}

interface ReplaceSourceDialogProps {
  candidate: SourceReplacementCandidate;
  onCancel: () => void;
  onConfirm: (policy: SourceDurationPolicy) => void;
}

export function ReplaceSourceDialog({ candidate, onCancel, onConfirm }: ReplaceSourceDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [policy, setPolicy] = useState<SourceDurationPolicy>(() => canPreserveTiming(candidate.layer, candidate.metadata) ? "preserve-timing" : "fit-source");
  const preserveAvailable = canPreserveTiming(candidate.layer, candidate.metadata);
  const plan = useMemo(() => planSourceReplacement(candidate.layer, candidate.metadata, policy), [candidate.layer, candidate.metadata, policy]);
  const durationChanged = Math.abs(candidate.layer.timeline.duration - plan.timelineDuration) > 0.001;

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])") ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      returnFocus?.focus();
    };
  }, [onCancel]);

  return (
    <motion.div className="dialog-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTokens.transition.quick} onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <motion.div className="dialog replace-source-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="replace-source-title" aria-describedby="replace-source-description" initial={{ opacity: 0, y: 10, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.99 }} transition={motionTokens.transition.standard}>
        <div className="dialog-header"><div><p className="eyebrow">Edit / source</p><h2 className="dialog-title" id="replace-source-title">Replace footage?</h2></div><button type="button" ref={closeRef} className="dialog-close" onClick={onCancel} aria-label="Close replace source dialog"><X size={18} /></button></div>
        <p className="dialog-copy" id="replace-source-description">BEND keeps the layer's transform, crop, appearance, effects, animation, timing position, lock, visibility, mute state, and stacking order. The original source remains available to any other layer that uses it.</p>
        <div className="source-compare" role="group" aria-label="Source comparison">
          <div><span className="inspector-kicker">Current</span><strong>{candidate.previous?.name ?? "Missing source"}</strong><small>{candidate.previous ? `${candidate.previous.width} × ${candidate.previous.height} · ${candidate.previous.duration.toFixed(2)}s` : "No media record"}</small></div>
          <ArrowRight size={16} aria-hidden="true" />
          <div><span className="inspector-kicker">Replacement</span><strong>{candidate.file.name}</strong><small>{candidate.metadata.width} × {candidate.metadata.height} · {candidate.metadata.duration.toFixed(2)}s</small></div>
        </div>
        <section className="replace-policy" aria-label="Duration policy">
          <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Duration policy</h3><p className="inspector-help">The new source is {Math.abs(candidate.metadata.duration - candidate.layer.timeline.duration) < 0.01 ? "the same duration" : candidate.metadata.duration > candidate.layer.timeline.duration ? "longer" : "shorter"} than the current clip.</p></div><Film size={15} aria-hidden="true" /></div>
          <label className={preserveAvailable ? "replace-policy-option" : "replace-policy-option is-disabled"}>
            <input type="radio" name="source-duration-policy" value="preserve-timing" checked={policy === "preserve-timing"} disabled={!preserveAvailable} onChange={() => setPolicy("preserve-timing")} />
            <span><strong>Keep edit timing</strong><small>{preserveAvailable ? `Keep the ${candidate.layer.timeline.duration.toFixed(2)}s clip and use the first ${candidate.layer.timeline.duration.toFixed(2)}s of the new source. Timeline placement and keyframe timing stay unchanged.` : "Unavailable because the replacement is shorter than the existing clip. Use Fit to new source."}</small></span>
          </label>
          <label className="replace-policy-option">
            <input type="radio" name="source-duration-policy" value="fit-source" checked={policy === "fit-source"} onChange={() => setPolicy("fit-source")} />
            <span><strong>Fit layer to new source</strong><small>Use the full {candidate.metadata.duration.toFixed(2)}s source. Existing keyframes and animation remain saved, but moments beyond the new end will not play.</small></span>
          </label>
        </section>
        {plan.animationBeyondEnd > 0 && <p className="replace-warning" role="status">{plan.animationBeyondEnd} keyframe{plan.animationBeyondEnd === 1 ? "" : "s"} sit beyond the new layer end and will remain saved but unreachable until the clip is extended.</p>}
        {durationChanged && <p className="replace-note">Resulting clip: {plan.timelineDuration.toFixed(2)}s · trim {plan.trimStart.toFixed(2)}–{plan.trimEnd.toFixed(2)}s · starts at {candidate.layer.timeline.start.toFixed(2)}s.</p>}
        <div className="dialog-actions"><button type="button" className="dialog-secondary" onClick={onCancel}>Cancel</button><button type="button" className="dialog-primary" onClick={() => onConfirm(plan.policy)}>Replace footage</button></div>
      </motion.div>
    </motion.div>
  );
}
