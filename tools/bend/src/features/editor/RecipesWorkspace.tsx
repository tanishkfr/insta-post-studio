import { Copy, Download, FileDown, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useEditorStore } from "../../app/store";
import type { BendLayer, BendProject } from "../../engine/core/types";
import { applyMotionRecipe, BUILTIN_MOTION_RECIPES, recipeFromLayer, type MotionRecipe, type RecipeApplyMode } from "../../engine/recipes/recipes";
import { duplicateLocalRecipe, exportRecipe, importLocalRecipe, loadLocalRecipes, removeLocalRecipe, upsertLocalRecipe } from "../../storage/recipes";
import { RecipePreview } from "./RecipePreview";
import { motionTokens } from "../../styles/motion";

interface RecipesWorkspaceProps {
  project: BendProject;
  activeLayer: BendLayer | null;
}

export function RecipesWorkspace({ project, activeLayer }: RecipesWorkspaceProps) {
  const commit = useEditorStore((state) => state.commit);
  const setActiveLayer = useEditorStore((state) => state.setActiveLayer);
  const [localRecipes, setLocalRecipes] = useState(loadLocalRecipes);
  const [selectedId, setSelectedId] = useState(BUILTIN_MOTION_RECIPES[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const recipes = useMemo(() => [...BUILTIN_MOTION_RECIPES, ...localRecipes], [localRecipes]);
  const selected = recipes.find((recipe) => recipe.id === selectedId) ?? recipes[0];
  const isLocal = Boolean(selected && localRecipes.some((recipe) => recipe.id === selected.id));

  if (!selected) return <div className="empty-inspector">No motion recipes are available.</div>;

  const apply = (mode: RecipeApplyMode) => {
    try {
      const result = applyMotionRecipe(project, selected, activeLayer?.id ?? null, mode);
      commit(`${mode === "replace" ? "Apply" : "Append"} ${selected.name}`, () => result.project);
      setActiveLayer(result.layerId);
      setMessage(`${mode === "replace" ? "Applied" : "Appended"} to ${result.layerId === activeLayer?.id ? "the active layer" : "a new layer"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recipe could not be applied.");
    }
  };

  const saveCurrent = () => {
    if (!activeLayer) {
      setMessage("Select a layer before saving a recipe.");
      return;
    }
    const saved = recipeFromLayer(activeLayer, `${activeLayer.name} motion`);
    const next = upsertLocalRecipe(saved);
    setLocalRecipes(next);
    setSelectedId(saved.id);
    setMessage("Saved to local recipes.");
  };

  const duplicate = () => {
    const next = duplicateLocalRecipe(selected);
    setLocalRecipes(next);
    setSelectedId(next.at(-1)?.id ?? selected.id);
    setMessage("Duplicated locally.");
  };

  const remove = () => {
    if (!isLocal) return;
    const next = removeLocalRecipe(selected.id);
    setLocalRecipes(next);
    setSelectedId(BUILTIN_MOTION_RECIPES[0]?.id ?? "");
    setMessage("Removed local recipe.");
  };

  const rename = () => {
    if (!isLocal) return;
    setRenameValue(selected.name);
    setRenameOpen(true);
  };

  const applyRename = () => {
    if (!isLocal) return;
    const name = renameValue.trim();
    if (!name) return;
    const next = upsertLocalRecipe({ ...selected, name });
    setLocalRecipes(next);
    setSelectedId(selected.id);
    setRenameOpen(false);
    setMessage("Renamed local recipe.");
  };

  const importRecipe = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = importLocalRecipe(await file.text());
      setLocalRecipes(next);
      setSelectedId(next.at(-1)?.id ?? selected.id);
      setMessage("Imported and validated locally.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recipe import failed.");
    }
  };

  const download = () => {
    const blob = new Blob([exportRecipe(selected)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selected.id}.bend-recipe.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <section className="recipes-workspace" aria-label="Motion recipes">
    <div className="recipes-library">
      <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Motion recipes</h3><p className="inspector-help">Ready-made combinations of movement and effects. Apply one, then edit its parts.</p></div><span className="inspector-kicker">{recipes.length} recipes</span></div>
      <div className="recipe-list" role="listbox" aria-label="Motion recipe library">
        <p className="recipe-list-label">BEND LIBRARY</p>
        {BUILTIN_MOTION_RECIPES.map((recipe) => <RecipeListItem key={recipe.id} recipe={recipe} selected={recipe.id === selected.id} onClick={() => setSelectedId(recipe.id)} />)}
        {localRecipes.length > 0 && <p className="recipe-list-label">LOCAL</p>}
        {localRecipes.map((recipe) => <RecipeListItem key={recipe.id} recipe={recipe} selected={recipe.id === selected.id} onClick={() => setSelectedId(recipe.id)} />)}
      </div>
      <div className="recipe-library-actions"><button type="button" className="small-action" onClick={saveCurrent}><Save size={13} /> Save layer</button><button type="button" className="small-action" onClick={() => importRef.current?.click()}><Upload size={13} /> Import</button><input ref={importRef} className="sr-only" type="file" accept="application/json,.json" aria-label="Import motion recipe" onChange={(event) => void importRecipe(event.target.files?.[0])} /></div>
    </div>
    <div className="recipe-detail">
      <div className="recipe-detail-copy"><span className="inspector-kicker">{labelize(selected.targetCompatibility)} · {labelize(selected.timingPolicy)}</span><h3>{selected.name}</h3><p>{selected.description}</p><div className="recipe-tags">{selected.requiredCapabilities.map((capability) => <span key={capability}>{capability}</span>)}</div></div>
      <RecipePreview recipe={selected} />
      <div className="recipe-actions"><button type="button" className="recipe-apply-button" onClick={() => apply("replace")}><Plus size={14} /> Apply / replace</button><button type="button" className="small-action" onClick={() => apply("append")}>Append to layer</button></div>
      <div className="recipe-actions recipe-secondary-actions"><button type="button" className="small-action" onClick={download}><Download size={13} /> Export JSON</button>{isLocal && <><button type="button" className="small-action" onClick={duplicate}><Copy size={13} /> Duplicate</button><button type="button" className="small-action" onClick={rename}><FileDown size={13} /> Rename</button><button type="button" className="small-action is-danger" onClick={remove}><Trash2 size={13} /> Delete</button></>}</div>
      {message && <p className="recipe-message" role="status">{message}</p>}
      <p className="inspector-help">Built-in recipes remain immutable. Apply is undoable, and local recipes are stored in this browser only.</p>
    </div>
    <AnimatePresence initial={false}>
    {renameOpen && <motion.div key="rename-recipe-dialog" className="dialog-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTokens.transition.quick} onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameOpen(false); }}>
      <motion.div className="dialog dialog-compact" role="dialog" aria-modal="true" aria-labelledby="rename-recipe-title" initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.99 }} transition={motionTokens.transition.standard}>
        <div className="dialog-header"><div><p className="eyebrow">Local recipe</p><h2 id="rename-recipe-title">Rename recipe</h2></div><button type="button" className="dialog-close" onClick={() => setRenameOpen(false)} aria-label="Close rename dialog"><X size={16} /></button></div>
        <label className="dialog-field"><span>Name</span><input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyRename(); if (event.key === "Escape") setRenameOpen(false); }} /></label>
        <div className="dialog-actions"><button type="button" className="dialog-secondary" onClick={() => setRenameOpen(false)}>Cancel</button><button type="button" className="dialog-primary" onClick={applyRename}>Save name</button></div>
      </motion.div>
    </motion.div>}
    </AnimatePresence>
  </section>;
}

function RecipeListItem({ recipe, selected, onClick }: { recipe: MotionRecipe; selected: boolean; onClick: () => void }) {
  return <button type="button" className={selected ? "recipe-list-item is-selected" : "recipe-list-item"} role="option" aria-selected={selected} onClick={onClick}><span><strong>{recipe.name}</strong><small>{recipe.requiredCapabilities.slice(0, 2).join(" · ") || "motion"}</small></span><em>{labelize(recipe.targetCompatibility)}</em></button>;
}

function labelize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}
