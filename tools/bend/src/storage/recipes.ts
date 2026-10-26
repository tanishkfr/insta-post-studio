import { normalizeMotionRecipe, type MotionRecipe } from "../engine/recipes/recipes";

const STORAGE_KEY = "bend-motion-recipes-v1";

export function loadLocalRecipes(): MotionRecipe[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      try { return [normalizeMotionRecipe(value)]; } catch { return []; }
    });
  } catch {
    return [];
  }
}

export function saveLocalRecipes(recipes: MotionRecipe[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes.slice(0, 48)));
}

export function upsertLocalRecipe(recipe: MotionRecipe): MotionRecipe[] {
  const next = [...loadLocalRecipes().filter((candidate) => candidate.id !== recipe.id), normalizeMotionRecipe(recipe)];
  saveLocalRecipes(next);
  return next;
}

export function removeLocalRecipe(id: string): MotionRecipe[] {
  const next = loadLocalRecipes().filter((recipe) => recipe.id !== id);
  saveLocalRecipes(next);
  return next;
}

export function duplicateLocalRecipe(recipe: MotionRecipe): MotionRecipe[] {
  const copy = normalizeMotionRecipe({ ...recipe, id: `local-${Date.now().toString(36)}`, name: `${recipe.name} copy` });
  return upsertLocalRecipe(copy);
}

export function importLocalRecipe(text: string): MotionRecipe[] {
  const recipe = normalizeMotionRecipe(JSON.parse(text) as unknown);
  return upsertLocalRecipe({ ...recipe, id: recipe.id.startsWith("local-") ? recipe.id : `local-${recipe.id}` });
}

export function exportRecipe(recipe: MotionRecipe): string {
  return JSON.stringify(recipe, null, 2);
}
