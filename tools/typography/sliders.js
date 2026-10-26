/* Shared slider component for every page.
   The track itself shows the recommended range: teal = recommended, tan = past it.
   Sliders without a recommended range show a plain progress fill instead. */
(function () {
  const HALF = 9; // half the thumb width in px, so the zones line up with the thumb centre
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const frac = (el, v) => (v - +el.min) / (+el.max - +el.min);
  const at = f => f <= 0 ? '0px' : f >= 1 ? '100%' : `calc(${HALF}px + (100% - ${HALF * 2}px) * ${f})`;

  function zone(rec, v) { return !rec ? 'ok' : v < rec[0] ? 'low' : v > rec[1] ? 'high' : 'ok'; }
  // Words next to the value, so the warning never relies on colour alone.
  function note(rec, v) { const z = zone(rec, v); return z === 'low' ? ' · too low' : z === 'high' ? ' · too high' : ''; }

  function paint(el) {
    const rec = el._rec, v = +el.value;
    if (rec) {
      const a = at(clamp01(frac(el, rec[0]))), b = at(clamp01(frac(el, rec[1])));
      el.style.setProperty('--track',
        `linear-gradient(to right, var(--color-tan) 0, var(--color-tan) ${a}, var(--color-accent) ${a}, var(--color-accent) ${b}, var(--color-tan) ${b}, var(--color-tan) 100%)`);
      el.dataset.zone = zone(rec, v);
    } else {
      const p = at(clamp01(frac(el, v)));
      el.style.setProperty('--track',
        `linear-gradient(to right, var(--color-accent) 0, var(--color-accent) ${p}, var(--color-track) ${p}, var(--color-track) 100%)`);
    }
  }
  function init(el, rec) {
    el._rec = rec || null;
    el.addEventListener('input', () => paint(el));
    paint(el);
  }
  window.Sliders = { init, paint, zone, note };
})();
