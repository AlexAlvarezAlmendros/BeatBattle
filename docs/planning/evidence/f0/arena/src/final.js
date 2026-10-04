/* BeatBattle · ARENA · piezas generadas por código y navegación de menú de juego.
   Script clásico (no módulo) para que funcione abriendo el HTML con file://. */
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  if (Q.has('still')) document.documentElement.classList.add('still');
  if (Q.has('serio')) document.documentElement.classList.add('modo-serio');

  /* ─── utilidades deterministas ─── */
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    let a = typeof seed === 'number' ? seed >>> 0 : hash(String(seed));
    return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const TAU = Math.PI * 2;
  function setup(canvas, w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = w || canvas.clientWidth; h = h || canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  /* ─── trama halftone: tamaño de punto = fn(u, v) ∈ [0, 1] ─── */
  function halftone(canvas, o) {
    const { ctx, w, h } = setup(canvas);
    const cell = o.cell || 10, ang = ((o.angle == null ? 45 : o.angle) * Math.PI) / 180, max = o.max == null ? 0.72 : o.max, min = o.min || 0;
    if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, w, h); }
    ctx.fillStyle = o.color || '#ff003c';
    const ca = Math.cos(ang), sa = Math.sin(ang), d = Math.hypot(w, h) / 2 + cell;
    for (let i = -d; i <= d; i += cell) for (let j = -d; j <= d; j += cell) {
      const x = w / 2 + i * ca - j * sa, y = h / 2 + i * sa + j * ca;
      if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue;
      const r = cell * (min + (max - min) * clamp(o.fn(x / w, y / h), 0, 1));
      if (r < 0.35) continue;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }

  /* ─── onda determinista ─── */
  function waveData(seed, n) {
    const R = rng(seed + ':wave'); n = n || 128;
    const f = [1 + R() * 2, 3 + R() * 5, 9 + R() * 9], p = [R() * TAU, R() * TAU, R() * TAU], out = [];
    for (let i = 0; i < n; i++) {
      const u = i / n; let v = 0.55 * Math.sin(u * TAU * f[0] + p[0]) + 0.3 * Math.sin(u * TAU * f[1] + p[1]) + 0.2 * Math.sin(u * TAU * f[2] + p[2]);
      v = 0.5 + 0.5 * v; v = v * 0.75 + R() * 0.25; out.push(clamp(v, 0.06, 1));
    }
    return out;
  }
  function wave(canvas, seed, o) {
    o = o || {};
    const { ctx, w, h } = setup(canvas);
    const bw = o.bar || 3, gap = o.gap || 2, n = Math.floor(w / (bw + gap)), d = waveData(seed, n), played = o.played || 0, R = rng(seed + ':detail');
    for (let i = 0; i < n; i++) {
      const v = clamp(d[i] * (0.55 + R() * 0.45), 0.08, 1), bh = Math.max(2, v * h), x = i * (bw + gap);
      ctx.fillStyle = x / w < played ? (o.on || '#ff003c') : (o.off || '#3a3a3e');
      ctx.fillRect(x, (h - bh) / 2, bw, bh);
    }
    if (played > 0 && o.head !== false) {
      const x = Math.round(played * w);
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x - 3, 0, 6, h);
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, 0, 2, h);
    }
  }

  /* ─── portadas generativas: emblema de puntos con presupuesto de tinta cerrado ───
     8 familias de forma × pliegues (tonalidad) × anillos (BPM) × giro/fase (semilla = id de la entrada).
     Todas: mismo fondo, mismo tamaño, misma galleta, MISMA área de tinta roja (11,5 % del disco) y
     MISMA área de blanco (1,6 %), repartidas en tres bandas radiales igualadas → misma luminancia media. */
  const FAMILIES = ['espiral', 'estallido', 'flor', 'engranaje', 'ondas', 'eclipse', 'aspa', 'zigzag'];
  function coverSpec(seed, o) {
    o = o || {};
    const R = rng(seed + ':cover');
    const fam = o.family != null ? o.family : Math.floor(R() * FAMILIES.length);
    const key = o.key == null ? Math.floor(R() * 12) : o.key;
    const bpm = o.bpm || 90;
    return { fam, key, folds: 3 + (key % 6), rings: 13,
      twist: (R() < 0.5 ? -1 : 1) * (0.25 + clamp((bpm - 60) / 120, 0, 1) * 0.9), phase: R() * TAU, sharp: 1 + R() * 2, off: 0.3 + R() * 0.12, rot: R() * TAU,
      accent: (fam + 2 + Math.floor(R() * 5)) % FAMILIES.length };
  }
  function famT(f, th, rho, p, wv) {
    const n = p.folds;
    switch (FAMILIES[f]) {
      case 'espiral': return 0.5 + 0.5 * Math.cos(n * th + p.phase + p.twist * rho * 9);
      case 'estallido': { const s = (((n * th + p.phase) / TAU) % 1 + 1) % 1; return Math.pow(1 - Math.abs(s - 0.5) * 2, p.sharp) * (0.3 + 0.7 * rho); }
      case 'flor': { const c = Math.abs(Math.cos((n * (th + p.phase)) / 2)); const env = 0.28 + 0.7 * Math.pow(c, 0.85); return clamp((env - rho) * 5 + 0.1, 0, 1) * (0.75 + 0.25 * Math.cos(rho * 20)); }
      case 'engranaje': { if (rho > 0.64) return Math.cos(n * 2 * th + p.phase) > 0.05 ? 1 : 0; if (rho > 0.5) return 0; return 0.5 + 0.5 * Math.cos(rho * Math.PI * 5 + p.phase); }
      case 'ondas': { const band = 0.5 + 0.5 * Math.cos(rho * Math.PI * (3 + n * 0.6) + p.phase); return 0.1 + 0.9 * Math.pow(band, 1.2) * (0.55 + 0.45 * wv); }
      case 'eclipse': { const x = rho * Math.cos(th), y = rho * Math.sin(th), ox = p.off * Math.cos(p.rot), oy = p.off * Math.sin(p.rot); return clamp((Math.hypot(x - ox, y - oy) - 0.52) * 6, 0, 1) * (0.7 + 0.3 * Math.cos(th * n * 2 + p.phase)); }
      case 'aspa': { const a = Math.pow(0.5 + 0.5 * Math.cos(n * (th + p.twist * rho * 2.4) + p.phase), 5); return a * (0.35 + 0.65 * rho) + (rho < 0.26 ? 0.35 : 0); }
      case 'zigzag': { const tri = Math.abs(((((n * th + p.phase) / TAU) % 1) + 1) % 1 * 2 - 1); const rr = 0.52 + 0.34 * tri; return Math.exp(-Math.pow((rho - rr) / 0.09, 2)) + 0.85 * Math.exp(-Math.pow((rho - rr * 0.52) / 0.07, 2)); }
    }
    return 0;
  }
  const INK_RED = 0.115, INK_WHITE = 0.016;
  function solveScale(rs, rmax, target) {
    let lo = 0, hi = 50;
    for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; let a = 0; for (let i = 0; i < rs.length; i++) { const r = Math.min(rs[i] * m, rmax); a += Math.PI * r * r; } if (a < target) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function coverDots(seed, o) {
    const p = coverSpec(seed, o), K = p.rings, r0 = 0.15, r1 = 0.92, cell = (r1 - r0) / (K - 1), wv = waveData(seed, 128);
    const red = [], white = [];
    for (let k = 0; k < K; k++) {
      const rk = r0 + cell * k, n = Math.max(8, Math.round((TAU * rk) / cell));
      for (let m = 0; m < n; m++) {
        const th = (m / n) * TAU + (k % 2) * (Math.PI / n), w = wv[(Math.floor((th / TAU) * 128) + k * 9) % 128];
        const isWhite = k % 3 === 1;
        const t = isWhite ? 0.15 + 0.85 * clamp(famT(p.accent, th, rk, p, w), 0, 1) : clamp(famT(p.fam, th, rk, p, w), 0, 1);
        (isWhite ? white : red).push({ x: Math.cos(th) * rk, y: Math.sin(th) * rk, t, rho: rk });
      }
    }
    // igualación parcial por bandas radiales (interior, media, exterior)
    const bands = [[0, 0.42], [0.42, 0.68], [0.68, 2]];
    const S = bands.map(() => 0), C = bands.map(() => 0);
    red.forEach((d) => { const b = bands.findIndex(([a, z]) => d.rho >= a && d.rho < z); d.b = b; S[b] += d.t * d.t; C[b]++; });
    const f = S.reduce((a, b) => a + b, 0) / C.reduce((a, b) => a + b, 0);
    const mult = S.map((s, b) => Math.sqrt(clamp(1 + 0.6 * (f / Math.max(1e-6, s / C[b]) - 1), 0.4, 2.4)));
    red.forEach((d) => { d.t *= mult[d.b]; });
    const rmax = cell * 0.62, disk = Math.PI;
    const kr = solveScale(red.map((d) => d.t * cell * 0.56), rmax, INK_RED * disk);
    const kw = solveScale(white.map((d) => d.t * cell * 0.56), rmax, INK_WHITE * disk);
    red.forEach((d) => { d.r = Math.min(d.t * cell * 0.56 * kr, rmax); });
    white.forEach((d) => { d.r = Math.min(d.t * cell * 0.56 * kw, rmax); });
    return { p, red, white, rmax };
  }
  function drawCover(ctx, s, dots, rot, kRed, kWhite) {
    const cx = s / 2, cy = s / 2, R = s * 0.46;
    ctx.clearRect(0, 0, s, s);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.66);
    g.addColorStop(0, '#3a0a16'); g.addColorStop(0.55, '#1a040a'); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let k = 0; k < 24; k++) { ctx.rotate(TAU / 24); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, -s * 0.05); ctx.lineTo(s, s * 0.05); ctx.fill(); }
    ctx.restore();
    const put = (arr, col, k) => { ctx.fillStyle = col; arr.forEach((d) => { const r = Math.min(d.r * k, d.rmax) * R; if (r < 0.45) return; ctx.beginPath(); ctx.arc(cx + d.x * R, cy + d.y * R, r, 0, TAU); ctx.fill(); }); };
    if (dots) { put(dots.red, '#ff003c', kRed); put(dots.white, 'rgba(255,255,255,0.94)', kWhite); }
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.085, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ff003c'; ctx.lineWidth = Math.max(2, s * 0.011); ctx.beginPath(); ctx.arc(cx, cy, s * 0.07, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.014, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, s * 0.485, 0, TAU); ctx.stroke();
  }
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  /* medida de una portada: «rojo» = proporción media de tinta roja (exceso de R sobre G y B, 0–1) y
     luminancia relativa media (WCAG). Es la misma medida que usa el test de integridad. */
  function measure(ctx, w, h) {
    const px = ctx.getImageData(0, 0, w, h).data; let red = 0, L = 0;
    for (let i = 0; i < px.length; i += 4) { const r = px[i], g = px[i + 1], b = px[i + 2]; red += Math.max(0, r - Math.max(g, b)) / 255; L += 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
    const n = px.length / 4; return { red: red / n, lum: L / n };
  }
  /* El área de tinta se fija por cálculo; después, unas pasadas de medida ajustan el rojo (a la
     proporción de rojo de referencia) y el blanco (a la luminancia de referencia), porque el
     antialiasing y los solapes de puntos pequeños cambian lo que se ve. En producción lo hace
     `packages/covers`, igual en cliente y servidor. */
  const REF = {};
  function cover(canvas, seed, o) {
    o = o || {};
    if (!o.size && !canvas.clientWidth) return;
    const { ctx, w } = setup(canvas, o.size, o.size), s = w, pw = canvas.width, ph = canvas.height;
    const dots = coverDots(seed, o); [dots.red, dots.white].forEach((a) => a.forEach((d) => { d.rmax = dots.rmax; }));
    const key = pw + 'x' + ph;
    if (!REF[key]) { drawCover(ctx, s, null, 0, 1, 1); const base = measure(ctx, pw, ph); const ref = coverDots('referencia', { family: 0, key: 4, bpm: 92 }); [ref.red, ref.white].forEach((a) => a.forEach((d) => { d.rmax = ref.rmax; })); drawCover(ctx, s, ref, ref.p.rot, 1, 1); REF[key] = { base, target: measure(ctx, pw, ph) }; }
    const { base, target } = REF[key];
    let kr = 1, kw = 1;
    for (let it = 0; it < 5; it++) {
      drawCover(ctx, s, dots, dots.p.rot, kr, kw); const m = measure(ctx, pw, ph);
      const rr = (target.red - base.red) / Math.max(1e-6, m.red - base.red), rl = (target.lum - base.lum) / Math.max(1e-6, m.lum - base.lum);
      if (Math.abs(rr - 1) < 0.008 && Math.abs(rl - 1) < 0.008) break;
      kr *= Math.sqrt(clamp(rr, 0.6, 1.6));
      // el blanco corrige lo que el rojo no explica de la luminancia
      kw *= Math.sqrt(clamp(1 + (rl - 1) * 2.2, 0.5, 1.8));
    }
    drawCover(ctx, s, dots, dots.p.rot, kr, kw);
    canvas.dataset.family = FAMILIES[dots.p.fam];
  }
  /* medición para el test de integridad: proporción de rojo y luminancia media */
  function coverStats(canvas) { return measure(canvas.getContext('2d'), canvas.width, canvas.height); }

  /* ─── logo del juego (en producción: SVG de contornos generado en el build) ─── */
  function logo(opts) {
    opts = opts || {};
    const id = opts.id || 'lg', depth = opts.depth || 12, compact = !!opts.compact;
    const lines = compact
      ? [{ t: 'BEAT', x: 0, y: 150, size: 168, len: 470, face: `url(#${id}-face-red)` }, { t: 'BATTLE', x: 500, y: 150, size: 168, len: 760, face: `url(#${id}-face)` }]
      : [{ t: 'BEAT', x: 392, y: 168, size: 168, len: 560, face: `url(#${id}-face-red)` }, { t: 'BATTLE', x: 24, y: 384, size: 214, len: 940, face: `url(#${id}-face)` }];
    const vb = compact ? '-20 -10 1300 190' : '-20 -10 1040 440';
    const text = (l, extra) => `<text x="${l.x}" y="${l.y}" font-size="${l.size}" textLength="${l.len}" lengthAdjust="spacingAndGlyphs" ${extra}>${l.t}</text>`;
    let ext = '';
    for (let i = depth; i >= 1; i--) ext += `<g transform="translate(${i * 0.9},${i * 1.1})">${lines.map((l) => text(l, `fill="url(#${id}-dots)"`)).join('')}</g>`;
    const bars = compact ? [] : [{ y: 46, h: 18, x0: 150, c: 'w' }, { y: 76, h: 34, x0: 40, c: 'r' }, { y: 122, h: 12, x0: 214, c: 'w' }, { y: 142, h: 22, x0: 96, c: 'r' }];
    const trail = bars.map((b) => { const s = b.h * 0.42, x1 = 470; return `<polygon points="${b.x0 + s},${b.y} ${x1 + s},${b.y} ${x1},${b.y + b.h} ${b.x0},${b.y + b.h}" fill="url(#${id}-fade${b.c})"/>`; }).join('');
    return `<svg class="logo-svg" viewBox="${vb}" role="img" aria-label="Beat Battle"><defs>
  <pattern id="${id}-dots" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#e6003a"/><circle cx="4" cy="4" r="2.3" fill="#7a001f"/></pattern>
  <linearGradient id="${id}-face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".52" stop-color="#fff"/><stop offset=".52" stop-color="#d2d2d6"/><stop offset="1" stop-color="#f2f2f4"/></linearGradient>
  <linearGradient id="${id}-fadew" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity=".95"/></linearGradient>
  <linearGradient id="${id}-fader" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff003c" stop-opacity="0"/><stop offset=".45" stop-color="#ff003c"/></linearGradient>
  <linearGradient id="${id}-face-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4a70"/><stop offset=".52" stop-color="#ff003c"/><stop offset=".52" stop-color="#d4002f"/><stop offset="1" stop-color="#ff1a4f"/></linearGradient>
  <filter id="${id}-kl" x="-8%" y="-12%" width="116%" height="130%"><feMorphology in="SourceAlpha" operator="dilate" radius="8" result="d1"/><feFlood flood-color="#000"/><feComposite in2="d1" operator="in" result="k"/><feMorphology in="SourceAlpha" operator="dilate" radius="11" result="d2"/><feFlood flood-color="#fff"/><feComposite in2="d2" operator="in" result="wl"/><feMerge><feMergeNode in="wl"/><feMergeNode in="k"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs><g>${trail}</g>
<g font-family="Anybody" font-style="italic" font-weight="900" style="font-stretch:150%" filter="url(#${id}-kl)">${ext}${lines.map((l) => text(l, `fill="${l.face}" stroke="#000" stroke-width="5" paint-order="stroke" stroke-linejoin="round"`)).join('')}</g></svg>`;
  }
  function wordmark(o) {
    const id = o.id, depth = o.depth || 10;
    const text = (l, extra) => `<text x="${l.x}" y="${l.y}" font-size="${l.size}" ${l.len ? `textLength="${l.len}" lengthAdjust="spacingAndGlyphs"` : ''} ${extra}>${l.t}</text>`;
    let ext = ''; for (let i = depth; i >= 1; i--) ext += `<g transform="translate(${i * 0.9},${i * 1.1})">${o.lines.map((l) => text(l, `fill="url(#${id}-dots)"`)).join('')}</g>`;
    return `<svg viewBox="${o.viewBox}" role="img" aria-label="${o.label || ''}" style="display:block;width:100%;height:auto;overflow:visible"><defs>
  <pattern id="${id}-dots" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#e6003a"/><circle cx="4" cy="4" r="2.3" fill="#7a001f"/></pattern>
  <linearGradient id="${id}-face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".52" stop-color="#fff"/><stop offset=".52" stop-color="#d2d2d6"/><stop offset="1" stop-color="#f2f2f4"/></linearGradient>
  <linearGradient id="${id}-face-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4a70"/><stop offset=".52" stop-color="#ff003c"/><stop offset=".52" stop-color="#d4002f"/><stop offset="1" stop-color="#ff1a4f"/></linearGradient>
  <filter id="${id}-kl" x="-15%" y="-15%" width="130%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="${o.kl || 8}" result="d1"/><feFlood flood-color="#000"/><feComposite in2="d1" operator="in" result="k"/><feMorphology in="SourceAlpha" operator="dilate" radius="${(o.kl || 8) + 3}" result="d2"/><feFlood flood-color="#fff"/><feComposite in2="d2" operator="in" result="wl"/><feMerge><feMergeNode in="wl"/><feMergeNode in="k"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs><g font-family="Anybody" font-style="italic" font-weight="900" style="font-stretch:${o.stretch || 150}%" filter="url(#${id}-kl)">${ext}${o.lines.map((l) => text(l, `fill="${l.red ? `url(#${id}-face-red)` : `url(#${id}-face)`}" stroke="#000" stroke-width="5" paint-order="stroke" stroke-linejoin="round"`)).join('')}</g></svg>`;
  }

  /* ─── silueta del jurado: siempre la misma para todos (TÚ) ─── */
  function juror(o) {
    o = o || {}; const id = o.id || 'jr';
    const body = 'M14 470 C22 396 66 356 130 338 L160 330 C171 322 177 310 178 296 L222 296 C223 310 229 322 240 330 L270 338 C334 356 378 396 386 470 Z';
    const collar = 'M128 342 C146 368 172 380 200 380 C228 380 254 368 272 342 C258 334 246 328 238 320 C228 334 215 342 200 342 C185 342 172 334 162 320 C154 328 142 334 128 342 Z';
    const head = 'M200 80 C254 80 288 122 288 184 C288 248 254 302 200 302 C146 302 112 248 112 184 C112 122 146 80 200 80 Z';
    const band = 'M104 198 C100 112 146 62 200 62 C254 62 300 112 296 198';
    return `<svg viewBox="0 0 400 470" class="juror-svg" aria-hidden="true"><defs>
  <pattern id="${id}-dots" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="9" height="9" fill="#e6003a"/><circle cx="4.5" cy="4.5" r="2.5" fill="#7a001f"/></pattern>
  <pattern id="${id}-ht" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="3.5" cy="3.5" r="1.9" fill="#ff003c"/></pattern>
  <linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".95" stop-color="#fff" stop-opacity="1"/></linearGradient>
  <mask id="${id}-m"><rect width="400" height="470" fill="url(#${id}-rim)"/></mask>
  <clipPath id="${id}-c"><path d="${body}"/><path d="${head}"/></clipPath>
  <clipPath id="${id}-L"><rect x="0" y="0" width="200" height="470"/></clipPath>
  <clipPath id="${id}-R"><rect x="200" y="0" width="200" height="470"/></clipPath>
</defs>
<g transform="translate(13,11)" fill="url(#${id}-dots)"><path d="${body}"/><path d="${head}"/><path d="${band}" fill="none" stroke="url(#${id}-dots)" stroke-width="22"/><rect x="74" y="152" width="50" height="96" rx="14"/><rect x="276" y="152" width="50" height="96" rx="14"/></g>
<g stroke="#000" stroke-width="10" stroke-linejoin="round"><path d="${body}" fill="#0b0b0d"/><path d="${head}" fill="#0b0b0d"/></g>
<g clip-path="url(#${id}-c)"><rect x="0" y="0" width="400" height="470" fill="url(#${id}-ht)" mask="url(#${id}-m)"/></g>
<path d="${collar}" fill="#17171a" stroke="#000" stroke-width="6" stroke-linejoin="round"/>
<path d="M187 362 L184 424 M213 362 L216 424" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
<g fill="none" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${id}-L)"><path d="${body}" stroke="#fff" stroke-width="4"/><path d="${head}" stroke="#fff" stroke-width="4"/></g>
<g fill="none" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${id}-R)"><path d="${body}" stroke="#ff003c" stroke-width="5"/><path d="${head}" stroke="#ff003c" stroke-width="5"/></g>
<path d="${band}" fill="none" stroke="#000" stroke-width="30" stroke-linecap="round"/><path d="${band}" fill="none" stroke="#ff003c" stroke-width="18" stroke-linecap="round"/><path d="M114 168 C114 112 150 78 200 78" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".9"/>
<g stroke="#000" stroke-width="8"><rect x="74" y="150" width="50" height="96" rx="14" fill="#ff003c"/><rect x="276" y="150" width="50" height="96" rx="14" fill="#ff003c"/></g>
<rect x="86" y="166" width="9" height="62" rx="4" fill="#fff" opacity=".9"/><rect x="288" y="166" width="9" height="62" rx="4" fill="#fff" opacity=".5"/>
</svg>`;
  }
  /* ─── vinilo-medalla en la paleta del sello: 1 rojo con corona, 2 blanco, 3 granate ─── */
  function medal(place, o) {
    o = o || {};
    const lab = place === 1 ? '#ff003c' : place === 2 ? '#ffffff' : '#4a0d1c', rim = place === 3 ? '#ffffff' : lab;
    let grooves = ''; for (let r = 20; r < 46; r += 3.2) grooves += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="1"/>`;
    const crown = place === 1 ? `<path d="M37 56 L35 42 L43 49 L50 38 L57 49 L65 42 L63 56 Z" fill="#000"/>` : `<text x="50" y="57" text-anchor="middle" font-family="Oxanium" font-weight="800" font-size="20" fill="${place === 2 ? '#000' : '#fff'}">${place}</text>`;
    return `<svg viewBox="0 0 100 100" class="medal" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#0b0b0d" stroke="${rim}" stroke-width="3"/>${grooves}<path d="M18 30 A38 38 0 0 1 40 13" stroke="rgba(255,255,255,.35)" stroke-width="3" fill="none"/><circle cx="50" cy="50" r="19" fill="${lab}" stroke="${place === 3 ? '#fff' : 'none'}" stroke-width="2"/>${crown}<circle cx="50" cy="50" r="2.4" fill="${place === 2 ? '#000' : '#000'}"/></svg>`;
  }

  /* ─── vinilo-sol de la semana (trama) ─── */
  function vinyl(canvas, o) {
    o = o || {};
    if (!canvas.clientWidth) return;
    const { ctx, w } = setup(canvas), s = w, cx = s / 2, cy = s / 2, R = s / 2;
    ctx.fillStyle = '#060606'; ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, TAU); ctx.fill();
    const cell = o.cell || Math.max(5, s / 34);
    for (let y = -R; y <= R; y += cell) for (let x = -R; x <= R; x += cell) {
      const yy = y + ((Math.round(x / cell) % 2) * cell) / 2, d = Math.hypot(x, yy) / R;
      if (d > 0.97 || d < 0.36) continue;
      const t = clamp(0.25 + 0.75 * Math.pow(1 - Math.abs(d - 0.7) / 0.34, 1.2) * (0.6 + 0.4 * Math.cos(Math.atan2(yy, x) * 3 + d * 8)), 0, 1);
      ctx.fillStyle = '#ff003c'; ctx.beginPath(); ctx.arc(cx + x, cy + yy, cell * 0.46 * t, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1; for (let r = 0.4; r < 0.97; r += 0.06) { ctx.beginPath(); ctx.arc(cx, cy, R * r, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = '#ff003c'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.32, 0, TAU); ctx.fill();
    ctx.fillStyle = '#000'; ctx.font = `italic 900 ${Math.round(R * 0.2)}px Anybody`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(o.label || 'S41', cx, cy - R * 0.1);
    ctx.font = `700 ${Math.max(7, Math.round(R * 0.07))}px Oxanium`; ctx.fillText(o.sub || '92 BPM', cx, cy + R * 0.14);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy + R * 0.01, R * 0.025, 0, TAU); ctx.fill();
  }

  /* ─── textura de ruido para los sellos de goma ─── */
  function noiseMask() {
    const c = document.createElement('canvas'); c.width = c.height = 180; const x = c.getContext('2d'), R = rng('sello');
    x.fillStyle = '#000'; x.fillRect(0, 0, 180, 180); x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 520; i++) { x.globalAlpha = 0.25 + R() * 0.75; x.beginPath(); x.arc(R() * 180, R() * 180, 0.4 + R() * 1.6, 0, TAU); x.fill(); }
    document.documentElement.style.setProperty('--noise', `url(${c.toDataURL()})`);
  }

  /* ─── ajuste del alias: baja la anchura (150 → 105 %) y luego el cuerpo hasta caber ─── */
  function fit(el) {
    const max = +el.dataset.fit || el.parentElement.clientWidth, minSize = +(el.dataset.min || 24);
    let st = 150, size = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontStretch = st + '%'; el.style.whiteSpace = 'nowrap';
    const lines = el.querySelectorAll('span').length ? [...el.querySelectorAll('span')] : [el];
    const tooWide = () => lines.some((l) => l.scrollWidth > max + 0.5 || l.getBoundingClientRect().width > max + 0.5);
    while (tooWide() && st > 105) { st -= 5; el.style.fontStretch = st + '%'; }
    while (tooWide() && size > minSize) { size -= 1; el.style.fontSize = size + 'px'; }
  }

  /* ─── limitador global de destellos: nunca más de 3 en 1 s (WCAG 2.3.1) ─── */
  const Flash = { t: [], request() { const now = performance.now(); this.t = this.t.filter((x) => now - x < 1000); if (this.t.length >= 3) return false; this.t.push(now); return true; } };

  /* ─── navegación de menú de juego: foco itinerante, el foco ES la selección ─── */
  function roving(root, o) {
    const items = [...root.querySelectorAll(o.items)].filter((el) => !el.hasAttribute('data-skip'));
    if (!items.length) return null;
    let i = Math.max(0, items.findIndex((el) => el.hasAttribute('data-start')));
    const role = items[0].getAttribute('role');
    function set(n, focus) {
      n = o.wrap === false ? clamp(n, 0, items.length - 1) : (n + items.length) % items.length;
      items.forEach((el, j) => { el.tabIndex = j === n ? 0 : -1; if (role === 'option') el.setAttribute('aria-selected', String(j === n)); if (role === 'radio' && o.checkOnMove !== false) el.setAttribute('aria-checked', String(j === n)); });
      i = n; if (focus) items[n].focus({ preventScroll: true }); if (o.onMove) o.onMove(items[n], n);
    }
    root.addEventListener('keydown', (e) => {
      const cols = o.cols || 1, k = e.key; let n = null;
      if (o.mode === 'grid') { if (k === 'ArrowRight') n = i + 1; if (k === 'ArrowLeft') n = i - 1; if (k === 'ArrowDown') n = i + cols; if (k === 'ArrowUp') n = i - cols; if (n != null && (n < 0 || n >= items.length)) n = (n + items.length) % items.length; }
      else if (o.mode === 'h') { if (k === 'ArrowRight') n = i + 1; if (k === 'ArrowLeft') n = i - 1; }
      else { if (k === 'ArrowDown') n = i + 1; if (k === 'ArrowUp') n = i - 1; }
      if (k === 'Home') n = 0; if (k === 'End') n = items.length - 1;
      if (n != null) { e.preventDefault(); set(n, true); return; }
      if (k === 'Enter' || (k === ' ' && o.spaceActivates)) { e.preventDefault(); if (o.onActivate) o.onActivate(items[i], i); }
    });
    items.forEach((el, j) => { el.addEventListener('pointerenter', () => set(j, true)); el.addEventListener('click', (e) => { if (o.onActivate) { e.preventDefault(); set(j, true); o.onActivate(items[j], j); } }); });
    if (o.initMove === false) { items.forEach((el, j) => { el.tabIndex = j === i ? 0 : -1; }); if (o.autofocus) items[i].focus({ preventScroll: true }); }
    else set(i, !!o.autofocus);
    return { set, get index() { return i; }, items };
  }
  /* teclas globales de la pantalla (Esc, Q/E, F, J, S, 1–5…) */
  function keys(map) {
    document.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
      const fn = map[e.key] || map[e.key.toLowerCase()]; if (fn) { e.preventDefault(); fn(e); }
    });
  }
  /* región viva compartida (anunciador accesible) */
  function say(msg) { let r = document.getElementById('anunciador'); if (!r) return; r.textContent = ''; setTimeout(() => { r.textContent = msg; }, 60); }

  function paintAll() {
    noiseMask();
    document.querySelectorAll('canvas[data-cover]').forEach((c) => cover(c, c.dataset.cover, { bpm: +c.dataset.bpm || 90, key: c.dataset.key == null ? undefined : +c.dataset.key }));
    document.querySelectorAll('canvas[data-wave]').forEach((c) => wave(c, c.dataset.wave, { played: +c.dataset.played || 0, bar: +c.dataset.bar || 3, gap: +c.dataset.gap || 2, off: c.dataset.off, on: c.dataset.on, head: c.dataset.head !== 'no' }));
    document.querySelectorAll('canvas[data-vinyl]').forEach((c) => vinyl(c, { label: c.dataset.vinyl, sub: c.dataset.sub }));
    document.querySelectorAll('[data-logo]').forEach((el) => { el.innerHTML = logo({ id: el.dataset.logo, compact: el.hasAttribute('data-compact') }); });
    document.querySelectorAll('[data-juror]').forEach((el) => { el.innerHTML = juror({ id: el.dataset.juror }); });
    document.querySelectorAll('[data-medal]').forEach((el) => { el.innerHTML = medal(+el.dataset.medal); });
    document.querySelectorAll('[data-fit]').forEach(fit);
    if (window.paintScreen) window.paintScreen();
    document.documentElement.dataset.painted = '1';
  }

  window.Arena = { rng, hash, halftone, cover, coverDots, coverStats, coverSpec, FAMILIES, wave, waveData, logo, wordmark, juror, medal, vinyl, fit, roving, keys, say, Flash, paintAll };
  const go = () => (document.fonts && document.fonts.ready ? document.fonts.ready.then(paintAll) : paintAll());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
