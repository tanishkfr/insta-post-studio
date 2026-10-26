document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function bgFor(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.75 ? '#000000' : '#ffffff';
  }
  const hexRgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

  /* ================= Font catalogue ================= */
  const STANDARD = [
    ['Arial', 'Arial, Helvetica, sans-serif'], ['Helvetica', 'Helvetica, Arial, sans-serif'],
    ['Verdana', 'Verdana, Geneva, sans-serif'], ['Tahoma', 'Tahoma, Geneva, sans-serif'],
    ['Trebuchet MS', '"Trebuchet MS", Helvetica, sans-serif'], ['Impact', 'Impact, "Arial Narrow Bold", sans-serif'],
    ['Georgia', 'Georgia, serif'], ['Times New Roman', '"Times New Roman", Times, serif'],
    ['Palatino', '"Palatino Linotype", Palatino, "Book Antiqua", serif'], ['Garamond', 'Garamond, "Times New Roman", serif'],
    ['Courier New', '"Courier New", Courier, monospace'], ['Brush Script MT', '"Brush Script MT", cursive'],
    ['Comic Sans MS', '"Comic Sans MS", "Comic Sans", cursive']
  ];

  // The open-source fonts live in the fonts/ folder and are packed into fonts-data.js (see build-fonts.py).
  // To add a font: put the file in fonts/, add a line here, run build-fonts.py.
  //   [display name, file in fonts/, designers, year, source, caps-only?]
  const SOURCES = {
    typotheque: { label: 'Typothèque of ESA le 75', url: 'https://typotheque.le75.be/', license: 'SIL Open Font License' },
    fonderie: { label: 'Fonderie Download', url: 'https://fonderie.download/', license: 'WTFPL licence' }
  };
  const OPEN = [
    ['Barlow-TypoDesBois', 'barlow-typodesbois.otf', 'Eric Eribon, Lucie Danloy, Nicoletta Molino, Sofia D. Pimentel', 2019, 'typotheque'],
    ['Ding Dong', 'ding-dong.otf', 'Victor Dubien', 2022, 'typotheque'],
    ['Elastic', 'elastic.otf', 'Dries Hamels, Florjent Nuhiji, Olivia Marly', 2019, 'typotheque'],
    ['Goozette', 'goozette.otf', 'Alexandra Lambert, Madeleine Barbaroux', 2020, 'typotheque'],
    ['Rami', 'rami.otf', 'Justine Douard', 2023, 'typotheque', true],
    ['SpaceNotoriousRounded', 'spacenotoriousrounded.otf', 'Michaël Dewilder, Structure Baton', 2018, 'typotheque'],
    ['Beast', 'beast.otf', 'Tanguy Vanlaeys', '', 'fonderie'],
    ['Crédible', 'credible.otf', 'JLFC', 2019, 'fonderie']
  ];

  const fonts = [
    ...STANDARD.map(([name, stack]) => ({ kind: 'system', name, stack })),
    ...OPEN.map(([name, file, designers, year, source, caps], i) => ({
      kind: 'open', name, file, designers, year, source, caps: !!caps, family: `typefont${i}`, status: 'loading'
    }))
  ];

  /* ================= State ================= */
  const S = { font: fonts[0], text: 'Custom type', size: 160, tracking: 0, weight: 400, ink: '#193438', strength: 0, brush: 120 };
  function say(msg, kind) { const el = $('status'); el.textContent = msg; el.className = 'status' + (kind ? ' ' + kind : ''); }

  const stackOf = f => f.kind === 'system' ? f.stack : (f.status === 'ready' ? `"${f.family}", sans-serif` : null);
  const shown = (f, t) => f.caps ? t.toUpperCase() : t;

  /* ================= Font list ================= */
  const rowEls = new Map();
  function buildList() {
    const root = $('font-groups');
    root.textContent = '';
    rowEls.clear();
    const add = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; root.appendChild(e); return e; };
    const link = (p, s) => { const a = document.createElement('a'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = s.label; p.append(a); };
    const put = f => { const r = row(f); rowEls.set(f, r); root.appendChild(r); };

    add('h2', 'group-head', 'Standard fonts');
    add('p', 'group-note', 'Common fonts found on most devices. Availability depends on your device.');
    fonts.filter(f => f.kind === 'system').forEach(put);

    add('h2', 'group-head', 'Open-source fonts');
    for (const key of ['typotheque', 'fonderie']) {
      const list = fonts.filter(f => f.source === key);
      if (!list.length) continue;
      const note = add('p', 'group-note');
      note.append(key === 'typotheque' ? 'From the ' : 'From ');
      link(note, SOURCES[key]);
      note.append(`. ${SOURCES[key].license}.`);
      list.forEach(put);
    }
  }
  function refreshRow(f) { const old = rowEls.get(f); if (!old) return; const r = row(f); old.replaceWith(r); rowEls.set(f, r); }

  function row(f) {
    const b = document.createElement('button');
    b.className = 'font-row';
    b.setAttribute('aria-current', f === S.font);
    const name = document.createElement('span'); name.className = 'font-name';
    // The name is set in the font itself, so the list works as a specimen.
    const prev = document.createElement('span'); prev.className = 'font-preview'; prev.textContent = shown(f, f.name);
    const st = stackOf(f);
    if (st) prev.style.fontFamily = st;
    name.appendChild(prev);
    if (f.kind === 'open') {
      const m = document.createElement('span'); m.className = 'font-meta';
      m.textContent = f.status === 'failed' ? `${f.name} could not be loaded` : [f.year, f.designers].filter(Boolean).join(' · ');
      name.appendChild(m);
    }
    b.appendChild(name);
    if (f.kind === 'open' && f.status !== 'ready') {
      const s = document.createElement('span'); s.className = 'font-state'; s.textContent = f.status === 'failed' ? 'Unavailable' : 'Loading…'; b.appendChild(s);
    }
    b.onclick = () => select(f);
    return b;
  }

  function select(f) {
    S.font = f;
    if (f.kind === 'open' && f.status !== 'ready') loadOne(f); // loads now (or retries) and redraws by itself
    document.querySelectorAll('.font-row[aria-current]').forEach(r => r.setAttribute('aria-current', String(rowEls.get(f) === r)));
    updateCredit();
    render();
  }

  function updateCredit() {
    const f = S.font, el = $('credit');
    el.textContent = '';
    if (f.kind === 'system') { el.textContent = `${f.name} is a system font. How it looks depends on your device.`; return; }
    const src = SOURCES[f.source];
    el.append(f.name);
    if (f.designers) el.append(` by ${f.designers}`);
    if (f.year) el.append(` (${f.year})`);
    el.append(`. ${src.license}. Font from `);
    const a = document.createElement('a'); a.href = src.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = src.label;
    el.append(a, '. Please credit the designers if you use it.');
    if (f.caps) el.append(' This font has capital letters only, so your text is shown in capitals.');
  }

  /* ================= Loading the fonts ================= */
  function bytesOf(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  // Sources, in order: the packed fonts-data.js, then the file in the fonts/ folder.
  async function fontBytes(f) {
    if (window.FONT_DATA && window.FONT_DATA[f.file]) return bytesOf(window.FONT_DATA[f.file]);
    const r = await fetch('fonts/' + f.file);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for fonts/' + f.file);
    return r.arrayBuffer();
  }
  const pending = new Map();
  function loadOne(f) {
    if (f.status === 'ready') return Promise.resolve();
    if (pending.has(f)) return pending.get(f);
    f.status = 'loading'; refreshRow(f);
    const p = (async () => {
      try {
        const face = new FontFace(f.family, await fontBytes(f));
        await face.load();
        document.fonts.add(face);
        f.status = 'ready';
      } catch (err) { console.error(f.name, err); f.status = 'failed'; }
      pending.delete(f);
      refreshRow(f);
      if (f === S.font) { updateCredit(); render(); }
    })();
    pending.set(f, p);
    return p;
  }
  async function loadAll() {
    const open = fonts.filter(f => f.kind === 'open');
    await Promise.all(open.map(loadOne));
    const bad = open.filter(f => f.status === 'failed').length;
    if (bad) say(`${bad} font${bad > 1 ? 's' : ''} could not be loaded. Click one to try again.`, 'error');
    else say('Fonts ready', 'ok');
  }

  /* ================= Controls ================= */
  // [element id, state key, converter, formatter, recommended range in slider units (or null)]
  const ctrls = [
    ['size', 'size', v => v, v => `${v} px`, [60, 260]],
    ['tracking', 'tracking', v => v / 100, v => `${v}%`, [-3, 15]],
    ['weight', 'weight', v => v, v => `${v}`, [300, 600]],
    ['strength', 'strength', v => v, v => `${v}%`, [0, 70]],
    ['brush', 'brush', v => v, v => `${v} px`, [50, 200]]
  ];
  for (const [id, key, conv, fmt, rec] of ctrls) {
    const el = $(id), out = $(id + '-out');
    Sliders.init(el, rec);
    const upd = () => {
      const v = +el.value;
      S[key] = conv(v);
      out.textContent = fmt(v) + Sliders.note(rec, v);
      out.classList.toggle('warn', Sliders.zone(rec, v) !== 'ok');
    };
    el.addEventListener('input', () => {
      upd();
      if (id === 'strength') $('preview').classList.toggle('distort', S.strength > 0);
      if (id === 'size' || id === 'tracking' || id === 'weight') render();
    });
    upd();
  }
  $('ink').addEventListener('input', e => { S.ink = e.target.value; render(); });
  $('text').addEventListener('input', e => { S.text = e.target.value; render(); });

  /* ================= Rendering ================= */
  const cv = $('preview'), cx = cv.getContext('2d', { willReadFrequently: true });
  const src = document.createElement('canvas'), sx = src.getContext('2d', { willReadFrequently: true });
  const hasLS = 'letterSpacing' in sx;
  let srcData = null, dpr = 1, cssW = 300, cssH = 200;

  // The distortion lives on its own plane measured in CSS pixels. The plane only grows: changing the
  // font, text, size, spacing or weight (or resizing the window) never crops, moves or clears it.
  // Only "Reset distortion" empties it. The limits below sit above the largest canvas draw() allows,
  // so long text can never outgrow the plane.
  const FIELD_MAX_W = 16384, FIELD_MAX_H = 16384;
  const CANVAS_MAX_SIDE = 16000, CANVAS_MAX_AREA = 40e6;   // device pixels
  let field = null, FW = 0, FH = 0, dirty = null;      // field: Float32Array(FW*FH*2), values in CSS px
  function resetField() { field = null; FW = FH = 0; dirty = null; }
  function ensureField(w, h) {
    w = Math.min(FIELD_MAX_W, Math.ceil(w / 64) * 64); h = Math.min(FIELD_MAX_H, Math.ceil(h / 64) * 64);
    if (field && w <= FW && h <= FH) return;
    const nw = Math.max(w, FW), nh = Math.max(h, FH), nf = new Float32Array(nw * nh * 2);
    if (field) for (let y = 0; y < FH; y++) nf.set(field.subarray(y * FW * 2, (y + 1) * FW * 2), y * nw * 2);
    field = nf; FW = nw; FH = nh;
  }

  function metrics(ln, ls) {
    if (hasLS) { sx.letterSpacing = ls + 'px'; return sx.measureText(ln).width; }
    let w = 0; for (const ch of ln) w += sx.measureText(ch).width + ls; return w;
  }
  function paint(ln, x, y, ls, stroke) {
    if (hasLS) { sx.letterSpacing = ls + 'px'; stroke ? sx.strokeText(ln, x, y) : sx.fillText(ln, x, y); return; }
    for (const ch of ln) { stroke ? sx.strokeText(ch, x, y) : sx.fillText(ch, x, y); x += sx.measureText(ch).width + ls; }
  }

  let raf = 0;
  function render() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }

  function draw() {
    const wrap = $('preview-wrap'), stack = stackOf(S.font), f = S.font;
    wrap.style.background = bgFor(S.ink);
    const notice = $('notice');
    if (!stack) {
      cv.style.display = 'none'; notice.hidden = false;
      notice.style.background = 'var(--color-background)';
      $('notice-text').textContent = f.status === 'failed' ? `${f.name} could not be loaded.` : `Loading ${f.name}…`;
      return;
    }
    notice.hidden = true; cv.style.display = 'block';

    const size = S.size, ls = S.tracking * size, pad = size * 0.3, lineH = size * 1.2;
    const lines = shown(f, S.text).split('\n');
    const fontStr = `${size}px ${stack}`;
    sx.font = fontStr;
    const textW = Math.max(0, ...lines.map(l => metrics(l, ls)));
    const W = Math.max(300, Math.ceil(textW + pad * 2), wrap.clientWidth - 34);
    const H = Math.max(200, Math.ceil(lines.length * lineH + pad * 2));
    // Very long text: lower the pixel density instead of exceeding what a canvas can hold.
    dpr = Math.min(window.devicePixelRatio || 1, 2, CANVAS_MAX_SIDE / W, CANVAS_MAX_SIDE / H, Math.sqrt(CANVAS_MAX_AREA / (W * H)));
    const pw = Math.ceil(W * dpr), ph = Math.ceil(H * dpr);
    if (src.width !== pw || src.height !== ph) {
      src.width = cv.width = pw; src.height = cv.height = ph;
    }
    cssW = W; cssH = H;
    cv.style.width = W + 'px'; cv.style.height = 'auto';   // auto keeps the aspect ratio when max-width shrinks it

    sx.setTransform(1, 0, 0, 1, 0, 0); sx.clearRect(0, 0, pw, ph);
    sx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sx.font = fontStr; sx.textBaseline = 'alphabetic'; sx.fillStyle = S.ink; sx.strokeStyle = S.ink; sx.lineJoin = 'round';
    const y0 = pad + size * 0.9;
    lines.forEach((ln, i) => paint(ln, pad, y0 + i * lineH, ls, false));

    // Weight: 400 = font as drawn; heavier grows the outline, lighter erodes it.
    const w = S.weight;
    if (w !== 400) {
      const t = w > 400 ? (w - 400) / 500 * 0.07 * size : (400 - w) / 300 * 0.05 * size;
      sx.lineWidth = t;
      if (w < 400) { sx.globalCompositeOperation = 'destination-out'; sx.strokeStyle = '#000'; }
      lines.forEach((ln, i) => paint(ln, pad, y0 + i * lineH, ls, true));
      sx.globalCompositeOperation = 'source-over';
    }
    srcData = sx.getImageData(0, 0, pw, ph);
    paintFull();
  }

  // Draw the undistorted text, then warp the part of it that the field touches.
  function paintFull() {
    if (!srcData) return;
    cx.putImageData(srcData, 0, 0);
    if (field && dirty) warp(dirty);
  }
  // Re-draw only the box `b` (CSS px). Pixels outside it are untouched, which keeps dragging fast on long text.
  function warp(b) {
    if (!srcData || !field) return;
    const w = srcData.width, h = srcData.height, sd = srcData.data;
    const x0 = Math.max(0, Math.floor(b.x0 * dpr)), x1 = Math.min(w - 1, Math.ceil(b.x1 * dpr));
    const y0 = Math.max(0, Math.floor(b.y0 * dpr)), y1 = Math.min(h - 1, Math.ceil(b.y1 * dpr));
    const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
    if (rw <= 0 || rh <= 0) return;
    const out = cx.createImageData(rw, rh), od = out.data;
    const [r, g, bl] = hexRgb(S.ink);
    for (let y = y0; y <= y1; y++) {
      const gy = y / dpr, iy = gy | 0, ty = gy - iy;
      for (let x = x0; x <= x1; x++) {
        const o = 4 * ((y - y0) * rw + (x - x0)), s0 = 4 * (y * w + x);
        const gx = x / dpr, ix = gx | 0, tx = gx - ix;
        let fx = 0, fy = 0;
        if (ix < FW - 1 && iy < FH - 1) {   // outside the field there is no distortion
          const k = 2 * (iy * FW + ix), k2 = k + 2 * FW;
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
          fx = (field[k] * w00 + field[k + 2] * w10 + field[k2] * w01 + field[k2 + 2] * w11) * dpr;
          fy = (field[k + 1] * w00 + field[k + 3] * w10 + field[k2 + 1] * w01 + field[k2 + 3] * w11) * dpr;
        }
        if (Math.abs(fx) < 0.01 && Math.abs(fy) < 0.01) {
          od[o] = sd[s0]; od[o + 1] = sd[s0 + 1]; od[o + 2] = sd[s0 + 2]; od[o + 3] = sd[s0 + 3];
          continue;
        }
        const px = x - fx, py = y - fy;
        let a = 0;
        if (px >= 0 && py >= 0 && px < w - 1 && py < h - 1) {
          const jx = px | 0, jy = py | 0, ux = px - jx, uy = py - jy, j = jy * w + jx;
          a = (sd[4 * j + 3] * (1 - ux) + sd[4 * (j + 1) + 3] * ux) * (1 - uy) +
              (sd[4 * (j + w) + 3] * (1 - ux) + sd[4 * (j + w + 1) + 3] * ux) * uy;
        }
        od[o] = r; od[o + 1] = g; od[o + 2] = bl; od[o + 3] = a;
      }
    }
    cx.putImageData(out, x0, y0);
  }

  /* ---------- Cursor distortion: drag to push edges ---------- */
  let last = null, pRaf = 0, pend = null;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cssW, (e.clientY - r.top) / r.height * cssH]; };
  cv.addEventListener('pointerdown', e => {
    if (S.strength <= 0) return;
    cv.setPointerCapture(e.pointerId); last = pos(e);
  });
  cv.addEventListener('pointermove', e => {
    if (!last) return;
    const p = pos(e), dx = p[0] - last[0], dy = p[1] - last[1];
    last = p;
    const R = S.brush, amp = S.strength / 100, lim = R * 0.6;   // R = brush radius in CSS px
    ensureField(cssW, cssH);
    const bx0 = Math.max(0, Math.floor(p[0] - R)), bx1 = Math.min(FW - 1, Math.ceil(p[0] + R));
    const by0 = Math.max(0, Math.floor(p[1] - R)), by1 = Math.min(FH - 1, Math.ceil(p[1] + R));
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const d = Math.hypot(x - p[0], y - p[1]);
      if (d >= R) continue;
      const k = 0.5 * (1 + Math.cos(Math.PI * d / R)) * amp, i = 2 * (y * FW + x);   // 1 at the centre, 0 with no step at the edge
      field[i] = clamp(field[i] + dx * k, -lim, lim);
      field[i + 1] = clamp(field[i + 1] + dy * k, -lim, lim);
    }
    dirty = dirty ? { x0: Math.min(dirty.x0, bx0), x1: Math.max(dirty.x1, bx1), y0: Math.min(dirty.y0, by0), y1: Math.max(dirty.y1, by1) }
                  : { x0: bx0, x1: bx1, y0: by0, y1: by1 };
    pend = pend ? { x0: Math.min(pend.x0, bx0), x1: Math.max(pend.x1, bx1), y0: Math.min(pend.y0, by0), y1: Math.max(pend.y1, by1) }
                : { x0: bx0, x1: bx1, y0: by0, y1: by1 };
    if (!pRaf) pRaf = requestAnimationFrame(() => { pRaf = 0; const b = pend; pend = null; if (b) warp(b); });
  });
  const endDrag = () => { last = null; };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  $('reset-distort').onclick = () => { resetField(); paintFull(); };

  /* ================= Export ================= */
  $('export-png').onclick = () => {
    if (cv.style.display === 'none' || !cv.width) return say('Add this font before exporting', 'error');
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    const x = c.getContext('2d'); x.fillStyle = bgFor(S.ink); x.fillRect(0, 0, c.width, c.height); x.drawImage(cv, 0, 0);
    c.toBlob(b => {
      if (!b) return say('PNG export failed. Try a smaller size.', 'error');
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${S.font.name.replace(/\s+/g, '-')}.png`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      say('PNG exported', 'ok');
    }, 'image/png');
  };

  /* ================= Init ================= */
  buildList(); updateCredit(); render();
  loadAll();
  window.addEventListener('resize', render);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
});
