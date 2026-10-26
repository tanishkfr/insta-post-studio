document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const $ = id => document.getElementById(id);
  // The four faces the Letterform sliders blend between. Sans is the default.
  const FACES = {
    sans:   px => `700 ${px}px "Instrument Sans", Inter, system-ui, sans-serif`,
    serif:  px => `400 ${px}px "DM Serif Display", Georgia, "Times New Roman", serif`,
    mono:   px => `700 ${px}px "JetBrains Mono", "Courier New", ui-monospace, monospace`,
    script: px => `400 ${px}px "Pacifico", "Brush Script MT", cursive`
  };
  const FONT = FACES.sans;
  const MASK_PX = 200;            // grid mask resolution: pixels per em
  const UP = 1.4, DOWN = 0.6;   // em above / below the baseline kept in each glyph bitmap
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // Light inks are shown (and exported) on black so they stay visible.
  function bgFor(hex) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.75 ? '#000000' : '#ffffff';
  }

  /* ================= State ================= */
  // Master motif: strokes (fractions of the square drawing canvas) + optional image.
  // Instances are derived from it on every render; nothing is edited per copy.
  const S = {
    strokes: [], thickness: 8, img: null, imgRect: null, imgBase: null, imgScale: 1, top: 'doodle', ink: '#193438',
    text: 'Bend', spacing: 0.09, motifSize: 1.1, letterSize: 180, tracking: 0.02,
    rotation: 0, variation: 0, weight: 1,
    serif: 0, mono: 0, script: 0, stretch: 1, slant: 0,
    motifVersion: 0
  };

  /* ================= Stage switching ================= */
  const tabs = { draw: $('tab-draw'), type: $('tab-type') };
  const panels = { draw: $('panel-draw'), type: $('panel-type') };
  function showStage(name) {
    for (const k in tabs) {
      const on = k === name;
      tabs[k].setAttribute('aria-selected', on);
      tabs[k].tabIndex = on ? 0 : -1;
      panels[k].hidden = !on;
    }
    if (name === 'draw') sizeDraw(); else scheduleRender();
  }
  tabs.draw.onclick = () => showStage('draw');
  tabs.type.onclick = () => showStage('type');
  $('to-type').onclick = () => { showStage('type'); tabs.type.focus(); };
  $('to-draw').onclick = $('empty-go').onclick = () => { showStage('draw'); tabs.draw.focus(); };
  document.querySelector('.tabs').addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const next = tabs.draw.getAttribute('aria-selected') === 'true' ? 'type' : 'draw';
      showStage(next); tabs[next].focus();
    }
  });

  /* ================= Status ================= */
  function say(msg, kind) {
    const el = $('status');
    el.textContent = msg; el.className = 'status' + (kind ? ' ' + kind : '');
  }

  /* ================= Motif geometry ================= */
  function motifBounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y, r = 0) => {
      x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r);
      x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r);
    };
    if (S.img) { const r = S.imgRect; add(r.x, r.y); add(r.x + r.w, r.y + r.h); }
    for (const s of S.strokes) for (const p of s.pts) add(p[0], p[1], s.w * S.weight / 2);
    return isFinite(x0) ? { x0, y0, x1, y1 } : null;
  }
  const hasMotif = () => !!motifBounds();

  function strokePath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(s.pts[0][0], s.pts[0][1]);
    if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.0001, s.pts[0][1]);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0], s.pts[i][1]);
  }

  // Normalised motif sprite: longest side of the motif's bounding box fills `px`.
  const spriteCache = new Map();
  function sprite(px) {
    const key = [px, S.weight, S.ink, S.motifVersion].join('|');
    if (spriteCache.has(key)) return spriteCache.get(key);
    if (spriteCache.size > 12) spriteCache.clear();
    const b = motifBounds();
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const x = c.getContext('2d');
    const m = Math.max(b.x1 - b.x0, b.y1 - b.y0) || 1e-3;
    x.translate(px / 2, px / 2);
    x.scale(px / m, px / m);
    x.translate(-(b.x0 + b.x1) / 2, -(b.y0 + b.y1) / 2);
    const paintImg = () => {
      if (!S.img) return;
      x.globalAlpha = Math.min(1, S.weight);
      x.drawImage(S.img, S.imgRect.x, S.imgRect.y, S.imgRect.w, S.imgRect.h);
      x.globalAlpha = 1;
    };
    const paintInk = () => {
      x.strokeStyle = S.ink; x.lineCap = x.lineJoin = 'round';
      for (const s of S.strokes) { x.lineWidth = s.w * S.weight; strokePath(x, s); x.stroke(); }
    };
    if (S.top === 'image') { paintInk(); paintImg(); } else { paintImg(); paintInk(); }
    spriteCache.set(key, c);
    return c;
  }

  /* ================= Stage 1: drawing ================= */
  const dc = $('draw'), dctx = dc.getContext('2d');
  let dSide = 0, current = null;

  function sizeDraw() {
    const r = dc.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    dSide = r.width;
    dc.width = Math.round(r.width * dpr);
    dc.height = Math.round(r.height * dpr);
    redrawDraw();
  }
  function redrawDraw() {
    if (!dSide) return;
    const k = dc.width / dSide;
    dctx.setTransform(k, 0, 0, k, 0, 0);
    dctx.fillStyle = bgFor(S.ink); dctx.fillRect(0, 0, dSide, dSide);
    const paintImg = () => { if (S.img) { const r = S.imgRect; dctx.drawImage(S.img, r.x * dSide, r.y * dSide, r.w * dSide, r.h * dSide); } };
    const paintInk = () => {
      dctx.save();
      dctx.scale(dSide, dSide);
      dctx.strokeStyle = S.ink; dctx.lineCap = dctx.lineJoin = 'round';
      for (const s of S.strokes) { dctx.lineWidth = s.w; strokePath(dctx, s); dctx.stroke(); }
      dctx.restore();
    };
    if (S.top === 'image') { paintInk(); paintImg(); } else { paintImg(); paintInk(); }
    updateImageControls();
  }
  // Image size and layer order only make sense once there is something to size or layer.
  function updateImageControls() {
    const both = !!S.img && S.strokes.length > 0;
    $('remove-image').disabled = !S.img;
    $('imgSize').disabled = !S.img;
    $('imgSize').value = Math.round(S.imgScale * 100);
    $('imgSize-out').textContent = Math.round(S.imgScale * 100) + '%';
    Sliders.paint($('imgSize'));
    for (const k of ['doodle', 'image']) {
      const b = $('layer-' + k);
      b.disabled = !both;
      b.setAttribute('aria-checked', String(S.top === k));
    }
    $('layer-help').textContent = both ? 'Choose which one covers the other.' : 'Add a drawing and an image to choose which sits on top.';
  }
  new ResizeObserver(sizeDraw).observe(dc);

  const toPoint = e => {
    const r = dc.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  function motifChanged() { S.motifVersion++; redrawDraw(); scheduleRender(); }

  dc.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dc.setPointerCapture(e.pointerId);
    current = { w: S.thickness / 600, pts: [toPoint(e)] };
    S.strokes.push(current);
    redrawDraw();
  });
  dc.addEventListener('pointermove', e => {
    if (!current) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) current.pts.push(toPoint(ev));
    redrawDraw();
  });
  const endStroke = () => { if (current) { current = null; motifChanged(); } };
  dc.addEventListener('pointerup', endStroke);
  dc.addEventListener('pointercancel', endStroke);

  $('undo').onclick = () => { S.strokes.pop(); motifChanged(); };
  $('clear').onclick = () => { S.strokes = []; S.img = null; S.imgRect = null; S.imgBase = null; S.imgScale = 1; motifChanged(); };
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !panels.draw.hidden && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault(); S.strokes.pop(); motifChanged();
    }
  });
  $('remove-image').onclick = () => { S.img = null; S.imgRect = null; S.imgBase = null; S.imgScale = 1; motifChanged(); };
  // Resize the image around its own centre.
  $('imgSize').addEventListener('input', e => {
    if (!S.img) return;
    const k = +e.target.value / 100, r = S.imgRect, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const w = S.imgBase.w * k, h = S.imgBase.h * k;
    S.imgScale = k; S.imgRect = { x: cx - w / 2, y: cy - h / 2, w, h };
    motifChanged();
  });
  for (const k of ['doodle', 'image']) $('layer-' + k).onclick = () => { S.top = k; motifChanged(); };
  $('upload').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f), im = new Image();
    im.onload = () => {
      const sc = 0.84 / Math.max(im.naturalWidth, im.naturalHeight);
      const w = im.naturalWidth * sc, h = im.naturalHeight * sc;
      S.img = im; S.imgBase = { w, h }; S.imgScale = 1; S.imgRect = { x: 0.5 - w / 2, y: 0.5 - h / 2, w, h };
      motifChanged(); say('Image added as pattern', 'ok');
    };
    im.onerror = () => say('That file could not be read as an image', 'error');
    im.src = url;
    e.target.value = '';
  };

  /* ================= Controls ================= */
  // [id, key, converter, formatter, recommended range in slider units (or null)]
  const ctrls = [
    ['thickness', 'thickness', v => v, v => `${v}`, null],
    ['spacing', 'spacing', v => v / 100, v => `${v}% of letter`, [3, 12]],
    ['motifSize', 'motifSize', v => v / 100, v => `${v}% of cell`, [60, 140]],
    ['letterSize', 'letterSize', v => v, v => `${v} px`, null],
    ['tracking', 'tracking', v => v / 100, v => `${v}%`, [0, 15]],
    ['rotation', 'rotation', v => v, v => `${v}°`, null],
    ['variation', 'variation', v => v / 100, v => `${v}%`, [0, 40]],
    ['weight', 'weight', v => v / 100, v => `${v}%`, [50, 150]],
    ['serif', 'serif', v => v / 100, v => `${v}%`, null],
    ['mono', 'mono', v => v / 100, v => `${v}%`, null],
    ['script', 'script', v => v / 100, v => `${v}%`, null],
    ['stretch', 'stretch', v => v / 100, v => `${v}%`, [70, 150]],
    ['slant', 'slant', v => v, v => `${v}°`, [-10, 20]]
  ];
  const flagged = new Set();
  function checkLegibility() {
    let msg = '';
    if (flagged.size) msg = `Past the recommended range: ${[...flagged].join(', ')}. Letters may be hard to read.`;
    else if (S.motifSize * S.spacing > 0.16) msg = 'The pattern is large for these letters. Letters may be hard to read.';
    $('legibility').textContent = msg;
  }
  for (const [id, key, conv, fmt, rec] of ctrls) {
    const el = $(id), out = $(id + '-out');
    const name = document.querySelector(`label[for="${id}"]`).textContent;
    Sliders.init(el, rec);
    const update = () => {
      const v = +el.value;
      S[key] = conv(v); out.textContent = fmt(v) + Sliders.note(rec, v);
      const warn = Sliders.zone(rec, v) !== 'ok';
      out.classList.toggle('warn', warn);
      if (warn) flagged.add(name); else flagged.delete(name);
    };
    el.addEventListener('input', () => {
      update(); checkLegibility();
      if (id === 'weight') S.motifVersion++;
      scheduleRender();
    });
    update();
  }
  Sliders.init($('imgSize'), null);
  checkLegibility();
  $('ink').addEventListener('input', e => { S.ink = e.target.value; S.motifVersion++; redrawDraw(); scheduleRender(); });
  $('text').addEventListener('input', e => { S.text = e.target.value; scheduleRender(); });

  /* ================= Letterform: glyph bitmaps & grid ================= */
  // Each glyph is drawn from up to four faces. When several are active their shapes are blended
  // (blur, mix, then sharpen), so the sliders morph the letters instead of swapping fonts.
  // Stretch and slant are plain transforms applied while drawing.
  const mc = document.createElement('canvas');
  const mx = mc.getContext('2d', { willReadFrequently: true });
  const hasFilter = 'filter' in mx;
  const bmpCache = new Map();
  let cacheKey = '';

  function weights() {
    const sum = S.serif + S.mono + S.script, base = Math.max(0, 1 - sum), tot = base + sum || 1;
    return [['sans', base], ['serif', S.serif], ['mono', S.mono], ['script', S.script]]
      .map(([f, w]) => [f, w / tot]).filter(([, w]) => w > 0.001);
  }
  const styleKey = () => [S.serif, S.mono, S.script, S.stretch, S.slant].join('|');
  function syncCache() {
    const k = styleKey();
    if (k !== cacheKey) { bmpCache.clear(); cacheKey = k; }
    if (bmpCache.size > 400) bmpCache.clear();
  }
  const shear = () => Math.tan(S.slant * Math.PI / 180);

  // Bitmap of one character at R pixels per em. Returns advance (em), size, and alpha data when asked.
  function glyphBitmap(ch, R, withData) {
    syncCache();
    const key = ch + '|' + R + '|' + (withData ? 1 : 0);
    if (bmpCache.has(key)) return bmpCache.get(key);
    const ws = weights(), st = S.stretch, sh = shear();
    let adv = 0;
    const advs = ws.map(([f, w]) => {
      mx.font = FACES[f](R);
      const a = mx.measureText(ch).width / R * st;
      adv += a * w; return a;
    });
    // Room for overhang and for the slant, which pushes the top of the letter sideways.
    const ovh = 0.35 * Math.max(1, st);
    const padL = ovh + (sh >= 0 ? sh * DOWN : -sh * UP), padR = ovh + (sh >= 0 ? sh * UP : -sh * DOWN);
    const W = Math.max(2, Math.ceil((adv + padL + padR) * R)), H = Math.ceil((UP + DOWN) * R), base = UP * R;
    const blend = ws.length > 1;
    const layers = ws.map(([f], i) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true });
      if (blend && hasFilter) x.filter = `blur(${(R * 0.03).toFixed(2)}px)`;
      x.font = FACES[f](R); x.textBaseline = 'alphabetic'; x.fillStyle = '#000';
      x.setTransform(st, 0, -sh, 1, padL * R + (adv - advs[i]) / 2 * R, base);
      x.fillText(ch, 0, 0);
      return { c, x };
    });
    let canvas = layers[0].c, data = null;
    if (blend) {
      const ds = layers.map(l => l.x.getImageData(0, 0, W, H).data);
      const out = new ImageData(W, H), od = out.data, k = hasFilter ? 5 : 2.5;
      for (let p = 3; p < od.length; p += 4) {
        let a = 0;
        for (let i = 0; i < ds.length; i++) a += ds[i][p] * ws[i][1];
        const v = (a / 255 - 0.5) * k + 0.5;
        od[p] = v <= 0 ? 0 : v >= 1 ? 255 : v * 255;
      }
      canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      canvas.getContext('2d').putImageData(out, 0, 0);
      data = od;
    } else if (withData) {
      data = layers[0].x.getImageData(0, 0, W, H).data;
    }
    const m = { adv, W, H, R, base, padL: padL * R, canvas, data, pure: !blend, face: ws[0] ? ws[0][0] : 'sans' };
    bmpCache.set(key, m);
    return m;
  }
  const getMask = ch => glyphBitmap(ch, MASK_PX, true);

  const hash = (a, b, c) => {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // Grid anchored at the glyph origin (x = 0, baseline y = 0); units are ems, y down.
  // One instance per cell centre that lies inside the character mask.
  function glyphInstances(ch) {
    const m = getMask(ch), sp = S.spacing, out = [];
    const pl = m.padL / MASK_PX;
    const i0 = Math.floor(-pl / sp), i1 = Math.ceil((m.adv + (m.W / MASK_PX - m.adv - pl)) / sp);
    const j0 = Math.floor(-UP / sp), j1 = Math.ceil(DOWN / sp);
    const code = ch.codePointAt(0);
    for (let j = j0; j <= j1; j++) {
      const cy = (j + 0.5) * sp, py = Math.round(m.base + cy * MASK_PX);
      if (py < 0 || py >= m.H) continue;
      for (let i = i0; i <= i1; i++) {
        const cx = (i + 0.5) * sp, px = Math.round(m.padL + cx * MASK_PX);
        if (px < 0 || px >= m.W) continue;
        if (m.data[(py * m.W + px) * 4 + 3] < 128) continue;
        const r = S.rotation + S.variation * 180 * (hash(code, i, j) * 2 - 1);
        out.push({ x: cx, y: cy, r });
      }
    }
    return out;
  }

  /* ================= Layout & render ================= */
  function layout() {
    const lines = S.text.split('\n'), items = [];
    let maxW = 0;
    lines.forEach((ln, li) => {
      let x = 0, any = false;
      for (const ch of ln) { const m = getMask(ch); items.push({ ch, x, li }); x += m.adv + S.tracking; any = true; }
      maxW = Math.max(maxW, any ? x - S.tracking : 0);
    });
    return { items, maxW, nLines: lines.length, lh: 1.25 };
  }

  function renderComposition(scale, bg) {
    const size = S.letterSize, L = layout(), pad = 0.2 * size, ASC = 1.2, DESC = 0.5;
    // Slant pushes the top of a letter sideways (right for forward slant), so the canvas grows to match.
    const shr = shear(), exL = Math.max(0, shr >= 0 ? shr * DESC : -shr * ASC) * size + 0.1 * size;
    const exR = Math.max(0, shr >= 0 ? shr * ASC : -shr * DESC) * size + 0.1 * size;
    const W = Math.max(1, Math.ceil(L.maxW * size + pad * 2 + exL + exR));
    const H = Math.ceil((ASC + (L.nLines - 1) * L.lh + DESC) * size + pad * 2);
    scale = Math.min(scale, 6000 / Math.max(W, H));
    const out = document.createElement('canvas');
    out.width = Math.ceil(W * scale); out.height = Math.ceil(H * scale);
    const o = out.getContext('2d');
    if (bg) { o.fillStyle = bg; o.fillRect(0, 0, out.width, out.height); }

    // Pattern layer: instances of the master motif, then clipped to the letters.
    const layer = document.createElement('canvas');
    layer.width = out.width; layer.height = out.height;
    const p = layer.getContext('2d');
    const motifPx = S.motifSize * S.spacing * size;
    const spr = sprite(clamp(Math.ceil(motifPx * scale * 1.5), 16, 512));
    p.scale(scale, scale);
    const baseY = li => pad + (ASC + li * L.lh) * size;
    for (const it of L.items) {
      const gx = pad + exL + it.x * size, gy = baseY(it.li);
      for (const n of glyphInstances(it.ch)) {
        p.save();
        p.translate(gx + n.x * size, gy + n.y * size);
        p.rotate(n.r * Math.PI / 180);
        p.drawImage(spr, -motifPx / 2, -motifPx / 2, motifPx, motifPx);
        p.restore();
      }
    }
    // All letters go onto ONE mask first; clipping per glyph would intersect them away.
    const maskLayer = document.createElement('canvas');
    maskLayer.width = out.width; maskLayer.height = out.height;
    const q = maskLayer.getContext('2d');
    q.scale(scale, scale);
    q.fillStyle = '#000'; q.textBaseline = 'alphabetic';
    const Rhi = clamp(Math.ceil(size * scale), 64, 700), st = S.stretch, sh = shear();
    for (const it of L.items) {
      const gx = pad + exL + it.x * size, gy = baseY(it.li), m = getMask(it.ch);
      if (m.pure) {                                   // one face: draw it directly, sharp at any size
        q.save(); q.translate(gx, gy); q.transform(st, 0, -sh, 1, 0, 0);
        q.font = FACES[m.face](size); q.fillText(it.ch, 0, 0); q.restore();
      } else {                                        // blended faces: use the blended bitmap
        const b = glyphBitmap(it.ch, Rhi, false);
        q.drawImage(b.canvas, gx - b.padL / Rhi * size, gy - b.base / Rhi * size, b.W / Rhi * size, b.H / Rhi * size);
      }
    }
    p.setTransform(1, 0, 0, 1, 0, 0);
    p.globalCompositeOperation = 'destination-in';
    p.drawImage(maskLayer, 0, 0);
    o.drawImage(layer, 0, 0);
    return { canvas: out, W, H };
  }

  const pv = $('preview'), pvx = pv.getContext('2d');
  let raf = 0;
  function scheduleRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawPreview(); }); }
  function drawPreview() {
    if (panels.type.hidden) return;
    $('preview').parentElement.style.background = bgFor(S.ink);
    const empty = !hasMotif() || !S.text.replace(/\s/g, '');
    $('empty').hidden = hasMotif();
    if (empty) { pv.width = pv.height = 1; pv.style.width = '0'; return; }
    const { canvas, W, H } = renderComposition(Math.min(window.devicePixelRatio || 1, 2), null);
    pv.width = canvas.width; pv.height = canvas.height;
    pv.style.width = W + 'px';
    pvx.drawImage(canvas, 0, 0);
  }

  /* ================= Export helpers ================= */
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $('export-png').onclick = () => {
    if (!hasMotif()) return say('Draw a pattern before exporting', 'error');
    if (!S.text.replace(/\s/g, '')) return say('Enter some text before exporting', 'error');
    const { canvas } = renderComposition(3, bgFor(S.ink));
    canvas.toBlob(b => {
      if (!b) return say('PNG export failed. Try a smaller letter size.', 'error');
      download(b, 'motif-type.png'); say('PNG exported', 'ok');
    }, 'image/png');
  };

  /* ---------- OTF: motif → vector polygons in a unit square ---------- */
  function rdp(p, e) {
    if (p.length < 3) return p;
    const a = p[0], b = p[p.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    let md = 0, mi = 0;
    for (let i = 1; i < p.length - 1; i++) {
      const d = len ? Math.abs(dx * (a[1] - p[i][1]) - (a[0] - p[i][0]) * dy) / len : Math.hypot(p[i][0] - a[0], p[i][1] - a[1]);
      if (d > md) { md = d; mi = i; }
    }
    if (md > e) return rdp(p.slice(0, mi + 1), e).slice(0, -1).concat(rdp(p.slice(mi), e));
    return [a, b];
  }

  function circlePoly(c, r, n = 10) {
    return Array.from({ length: n }, (_, k) => [c[0] + r * Math.cos(k / n * 2 * Math.PI), c[1] + r * Math.sin(k / n * 2 * Math.PI)]);
  }

  function strokeOutline(raw, hw) {
    const pts = raw.filter((p, i) => i === 0 || Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]) > 1e-6);
    const n = pts.length;
    if (n < 2) return circlePoly(pts[0], hw);
    const seg = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dy);
      seg.push([-dy / l, dx / l]);
    }
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = seg[Math.max(i - 1, 0)], b = seg[Math.min(i, n - 2)];
      let nx = a[0] + b[0], ny = a[1] + b[1];
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const f = hw / Math.max(nx * b[0] + ny * b[1], 0.5);
      L.push([pts[i][0] + nx * f, pts[i][1] + ny * f]);
      R.push([pts[i][0] - nx * f, pts[i][1] - ny * f]);
    }
    const cap = (c, a0, dir) => Array.from({ length: 5 }, (_, k) => {
      const a = a0 + dir * Math.PI * (k + 1) / 6;
      return [c[0] + hw * Math.cos(a), c[1] + hw * Math.sin(a)];
    });
    const endA = Math.atan2(seg[n - 2][1], seg[n - 2][0]);
    const startA = Math.atan2(seg[0][1], seg[0][0]) + Math.PI;
    return L.concat(cap(pts[n - 1], endA, -1), R.reverse(), cap(pts[0], startA, 1));
  }

  function motifPolygons() {
    const b = motifBounds();
    const m = Math.max(b.x1 - b.x0, b.y1 - b.y0) || 1e-3;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const U = p => [(p[0] - cx) / m, (p[1] - cy) / m];
    const polys = [];
    if (S.img) {                                    // photo → 1-bit grid of dark runs
      const r = S.imgRect, long = 12, tw = r.w >= r.h ? long : Math.max(3, Math.round(long * r.w / r.h));
      const th = r.w >= r.h ? Math.max(3, Math.round(long * r.h / r.w)) : long;
      const t = document.createElement('canvas'); t.width = tw; t.height = th;
      const x = t.getContext('2d', { willReadFrequently: true });
      x.fillStyle = '#fff'; x.fillRect(0, 0, tw, th); x.drawImage(S.img, 0, 0, tw, th);
      const d = x.getImageData(0, 0, tw, th).data;
      for (let j = 0; j < th; j++) {
        let start = -1;
        for (let i = 0; i <= tw; i++) {
          const q = (j * tw + i) * 4;
          const dark = i < tw && (0.299 * d[q] + 0.587 * d[q + 1] + 0.114 * d[q + 2]) < 140;
          if (dark && start < 0) start = i;
          if (!dark && start >= 0) {
            const x0 = r.x + start / tw * r.w, x1 = r.x + i / tw * r.w, y0 = r.y + j / th * r.h, y1 = r.y + (j + 1) / th * r.h;
            polys.push([U([x0, y0]), U([x1, y0]), U([x1, y1]), U([x0, y1])]);
            start = -1;
          }
        }
      }
    }
    for (const s of S.strokes) {
      const pts = rdp(s.pts, 0.004).map(U);
      polys.push(strokeOutline(pts, s.w * S.weight / 2 / m));
    }
    return polys;
  }

  const tick = () => new Promise(r => setTimeout(r, 0));

  $('export-otf').onclick = async () => {
    const btn = $('export-otf');
    if (!hasMotif()) return say('Draw a pattern before exporting', 'error');
    if (!window.opentype) return say('Font library did not load. Check your connection and reload.', 'error');
    btn.classList.add('loading');
    try {
      const polys = motifPolygons();
      const unit = S.motifSize * S.spacing;            // motif size in ems
      const chars = [' '];
      for (let c = 33; c <= 126; c++) chars.push(String.fromCharCode(c));
      const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() })];
      for (let g = 0; g < chars.length; g++) {
        const ch = chars[g], m = getMask(ch), path = new opentype.Path();
        for (const n of glyphInstances(ch)) {
          const a = n.r * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
          for (const poly of polys) {
            const pts = poly.map(p => {
              const X = p[0] * unit, Y = p[1] * unit;
              return [Math.round((n.x + X * co - Y * si) * 1000), Math.round(-(n.y + X * si + Y * co) * 1000)];
            });
            let area = 0;
            for (let i = 0; i < pts.length; i++) { const q = pts[(i + 1) % pts.length]; area += pts[i][0] * q[1] - q[0] * pts[i][1]; }
            if (Math.abs(area) < 2) continue;
            if (area < 0) pts.reverse();                 // one winding direction → overlaps merge
            path.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
            path.close();
          }
        }
        glyphs.push(new opentype.Glyph({
          name: ch === ' ' ? 'space' : 'uni' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'),
          unicode: ch.codePointAt(0),
          advanceWidth: Math.max(50, Math.round((m.adv + S.tracking) * 1000)),
          path
        }));
        if (g % 6 === 0) { say(`Building glyphs ${g + 1} of ${chars.length}`); await tick(); }
      }
      const font = new opentype.Font({
        familyName: 'Motif Type', styleName: 'Regular', unitsPerEm: 1000,
        ascender: 950, descender: -300, glyphs
      });
      download(new Blob([font.toArrayBuffer()], { type: 'font/otf' }), 'MotifType-Regular.otf');
      say('OTF exported', 'ok');
    } catch (err) {
      console.error(err);
      say('OTF export failed. Try a larger motif spacing.', 'error');
    } finally {
      btn.classList.remove('loading');
    }
  };

  /* ================= Init ================= */
  sizeDraw();
  window.addEventListener('resize', () => { sizeDraw(); scheduleRender(); });
  if (document.fonts && document.fonts.load) {
    Promise.all(Object.values(FACES).map(f => document.fonts.load(f(200), 'Aag'))).catch(() => {})
      .then(() => { bmpCache.clear(); scheduleRender(); });
  }
});
