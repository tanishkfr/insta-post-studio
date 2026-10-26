# 002 — Keep press scale on fine pointers

- **Status**: TODO
- **Commit**: 379c331
- **Severity**: MEDIUM
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file, small

## Problem

`button:active` scales every button, including ones activated from the keyboard with Enter or Space. Undo, redo, and the transform tools are used constantly. Keyboard-initiated actions should not move.

```css
/* src/index.css:30 — current */
button:active:not(:disabled) {
  transform: scale(0.97);
}
```

Pointer press feedback should stay. It is the correct response to a click.

## Target

```css
@media (hover: hover) and (pointer: fine) {
  button:active:not(:disabled) {
    transform: scale(0.97);
  }
}
```

Remove the unscoped `button:active:not(:disabled)` rule. Leave the reduced-motion rule that sets `transform: none`.

## Repo conventions to follow

- Hover color is already gated the same way at `src/index.css` inside `@media (hover: hover) and (pointer: fine)`.

## Steps

1. Delete the unscoped `button:active:not(:disabled) { transform: scale(0.97); }` rule.
2. Add the same rule inside the existing `@media (hover: hover) and (pointer: fine)` block.

## Boundaries

- Do NOT remove the reduced-motion override.
- Do NOT change the scale amount.
- If plan 001 has already edited the transition line, do not revert it.

## Verification

- **Feel check**: click a shape button with a mouse and confirm it scales to 0.97 and returns. Tab to Undo and press Enter. The button must not scale. Enable reduced motion and confirm a mouse press also does not scale.
- **Done when**: the scale rule exists only inside the fine-pointer media query.
