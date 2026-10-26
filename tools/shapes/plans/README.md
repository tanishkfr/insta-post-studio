# Animation plans

| Plan | Title | Severity | Status |
| --- | --- | --- | --- |
| 001 | Split press easing from color easing | MEDIUM | TODO |
| 002 | Keep press scale on fine pointers | MEDIUM | TODO |

Run 001 first, then 002. They both edit `src/index.css` and 002 assumes the reduced-motion block is still present.

Panel show and hide stay instant. Those controls are used many times a session, so adding a drawer animation would make them feel slow.
