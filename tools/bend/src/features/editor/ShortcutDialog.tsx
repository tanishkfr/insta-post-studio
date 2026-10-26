import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { motion } from "motion/react";
import { motionTokens } from "../../styles/motion";

const SHORTCUT_GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: "Playback and navigation",
    items: [
      ["Space", "Play or pause preview"],
      ["Left / Right", "Step one frame"],
      ["Shift + Left / Right", "Jump one second"],
      ["Up / Down", "Previous or next edit point"],
      ["Home / End", "Start or end of the edit"],
      ["Shift + F", "Zoom timeline to fit"],
    ],
  },
  {
    title: "Edit the selected clip",
    items: [
      ["S", "Split at the playhead"],
      ["Delete", "Delete and leave a gap"],
      ["Shift + Delete", "Ripple delete and close the gap"],
      ["Ctrl/Cmd + D", "Duplicate at the end of V1"],
      ["Alt + Left / Right", "Move the clip earlier or later"],
    ],
  },
  {
    title: "Project",
    items: [
      ["Ctrl/Cmd + Z", "Undo"],
      ["Ctrl/Cmd + Shift + Z", "Redo"],
      ["Ctrl/Cmd + Y", "Redo (alternate)"],
      ["Shift + M", "Open the media library"],
      ["?", "Open this shortcut reference"],
      ["Escape", "Close a dialog or cancel crop"],
    ],
  },
];

export function ShortcutDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])") ?? []);
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
  }, [onClose]);
  return <motion.div className="dialog-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTokens.transition.quick} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.div className="dialog shortcut-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="shortcut-title" aria-describedby="shortcut-description" initial={{ opacity: 0, y: 10, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.99 }} transition={motionTokens.transition.standard}>
      <div className="dialog-header"><div><p className="eyebrow">Keyboard / reference</p><h2 className="dialog-title" id="shortcut-title">Shortcuts</h2></div><button type="button" ref={closeRef} className="dialog-close" onClick={onClose} aria-label="Close shortcut reference"><X size={18} /></button></div>
      <p className="dialog-copy" id="shortcut-description">Shortcuts pause while you type, drag a slider, or use a dialog or menu. Browser shortcuts keep their normal behavior outside BEND's editing actions.</p>
      <div className="shortcut-groups">
        {SHORTCUT_GROUPS.map((group) => <section className="shortcut-group" key={group.title} aria-label={group.title}>
          <h3>{group.title}</h3>
          <dl>{group.items.map(([keys, description]) => <div key={`${keys}-${description}`}><dt><kbd>{keys}</kbd></dt><dd>{description}</dd></div>)}</dl>
        </section>)}
      </div>
      <div className="dialog-actions"><button type="button" className="button button-primary" onClick={onClose}>Done</button></div>
    </motion.div>
  </motion.div>;
}
