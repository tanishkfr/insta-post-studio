# 001 — Split press easing from color easing

- **Status**: TODO
- **Commit**: 379c331
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 1 file, small

## Problem

Every button shares one transition, so color changes use the same strong ease-out as the press scale. Color and hover changes should use `ease`. The curve is also inlined instead of a token.

```css
/* src/index.css:25 — current */
button {
  cursor: pointer;
  transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1), background-color 140ms cubic-bezier(0.23, 1, 0.32, 1), color 140ms cubic-bezier(0.23, 1, 0.32, 1), border-color 140ms cubic-bezier(0.23, 1, 0.32, 1);
}
```

## Target

```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}

button {
  cursor: pointer;
  transition: transform 140ms var(--ease-out), background-color 140ms ease, color 140ms ease, border-color 140ms ease;
}
```

Keep the reduced-motion block as it is: color transitions only, no transform.

## Repo conventions to follow

- Motion lives in `src/index.css`. There is no separate tokens file for easing. Add the custom properties on `:root` in that file.
- Press scale stays `scale(0.97)` at `src/index.css` `button:active:not(:disabled)`.

## Steps

1. In `src/index.css`, add a `:root` block with `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);`, and `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);`.
2. Replace the `button` transition so `transform` uses `140ms var(--ease-out)` and `background-color`, `color`, and `border-color` use `140ms ease`.

## Boundaries

- Do NOT change durations.
- Do NOT add a motion library.
- Do NOT animate panel open or close.
- If the `button` rule no longer matches this excerpt, STOP.

## Verification

- **Mechanical**: `npx tsc --noEmit` is not affected by CSS. Reload `http://localhost:5173/`.
- **Feel check**: hover a tool button and confirm the color starts without the delayed punch of ease-out. Press it and confirm the scale still starts immediately. In Rendering, enable `prefers-reduced-motion` and confirm the button does not scale.
- **Done when**: transform is the only property using `--ease-out` on `button`.
