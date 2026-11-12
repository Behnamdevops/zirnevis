// Caption engine: grouping + canvas drawing. The SAME draw function is used for preview and export,
// so what you see is exactly what gets rendered into the MP4.

const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const SENTENCE_END = /[.!?؟…:؛]$/;
const SOFT_END = /[،,]$/;

/** Turn a flat word list into caption groups ("pages"). */
export function buildGroups(words, { maxWords = 4, maxChars = 28, gap = 0.55 } = {}) {
  const groups = [];
  let cur = null;
  const flush = () => { if (cur && cur.words.length) groups.push(cur); cur = null; };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur) {
      const chars = cur.words.reduce((a, x) => a + x.text.length + 1, 0) + w.text.length;
      const pause = prev ? w.start - prev.end : 0;
      if (cur.words.length >= maxWords || chars > maxChars || pause > gap ||
          (prev && SENTENCE_END.test(prev.text)) ||
          (prev && SOFT_END.test(prev.text) && cur.words.length >= Math.ceil(maxWords / 2))) flush();
    }
    if (!cur) cur = { first: i, words: [] };
    cur.words.push(w);
  });
  flush();
  for (const g of groups) {
    g.start = g.words[0].start;
    g.end = g.words[g.words.length - 1].end;
  }
  groups.forEach((g, i) => {
    const next = groups[i + 1];
    // keep the caption on screen through short pauses so it doesn't flicker
    g.showUntil = next ? Math.min(next.start, g.end + 0.7) : g.end + 0.7;
  });
  return groups;
}

// ---------- easing ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const elastic = (x) => 1 - Math.cos(x * Math.PI * 3.5) * Math.exp(-5 * x);

function hexA(hex, a) {
  if (!hex) return 'transparent';
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function entrance(kind, p) {
  // returns {alpha, scale, dy(in em)}
  p = clamp(p);
  switch (kind) {
    case 'fade': return { alpha: easeOut(p), scale: 1, dy: 0 };
    case 'pop': return { alpha: clamp(p * 3), scale: 0.6 + 0.4 * easeOutBack(p), dy: 0 };
    case 'slide': return { alpha: easeOut(p), scale: 1, dy: (1 - easeOut(p)) * 0.6 };
    case 'rise': return { alpha: easeOut(p), scale: 0.9 + 0.1 * easeOut(p), dy: (1 - easeOut(p)) * 0.45 };
    case 'bounce': return { alpha: clamp(p * 4), scale: p >= 1 ? 1 : 0.3 + 0.7 * elastic(p), dy: 0 };
    case 'zoom': return { alpha: easeOut(p), scale: 1.6 - 0.6 * easeOut(p), dy: 0 };
    default: return { alpha: 1, scale: 1, dy: 0 };
  }
}

const RAINBOW = ['#FFD60A', '#34C759', '#FF375F', '#0A84FF', '#FF9F0A', '#BF5AF2'];

/**
 * Draw the caption for time t (seconds) onto ctx sized W x H.
 * s = style object (see presets.js)
 */
export function drawCaptions(ctx, W, H, t, groups, s, sizeMul = 1) {
  const g = groups.find((x) => t >= x.start - 0.02 && t < x.showUntil);
  if (!g) return;

  const k = (Math.min(W, H) / 1080) * sizeMul;
  const fontPx = s.fontSize * k;
  const font = `${s.fontWeight} ${fontPx}px "${s.fontFamily}", "Vazirmatn", sans-serif`;
  ctx.save();
  ctx.font = font;
  ctx.textBaseline = 'middle';

  const rtl = RTL_RE.test(g.words.map((w) => w.text).join(' '));
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';

  // active word = last word that has started
  let active = -1;
  g.words.forEach((w, i) => { if (t >= w.start) active = i; });
  if (active === -1) active = 0;

  const items = s.mode === 'single' ? [active] : g.words.map((_, i) => i);

  // ---- layout (computed on the full group so words don't jump when revealing) ----
  // extra room so an enlarged active word (or its box) doesn't overlap its neighbours
  const space = ctx.measureText(' ').width * (s.wordGap ?? 1) +
    fontPx * Math.max(0, s.activeScale - 1) * 1.6 + (s.activeBox || s.wordBox ? fontPx * 0.42 : 0) +
    ((s.strokeWidth || 0) + (s.stroke2Width || 0)) * k * 1.4;
  const maxW = W * s.maxWidth;
  const ws = items.map((i) => ({ i, w: g.words[i], width: ctx.measureText(g.words[i].text).width }));
  const lines = [];
  let line = [], lw = 0;
  for (const it of ws) {
    const add = (line.length ? space : 0) + it.width;
    if (line.length && lw + add > maxW) { lines.push({ items: line, width: lw }); line = []; lw = 0; }
    lw += (line.length ? space : 0) + it.width;
    line.push(it);
  }
  if (line.length) lines.push({ items: line, width: lw });

  const lh = fontPx * s.lineHeight;
  const blockH = lh * lines.length;
  const cx = W / 2;
  const top = H * s.posY - blockH / 2;
  lines.forEach((ln, li) => {
    const y = top + lh * (li + 0.5);
    let x = rtl ? cx + ln.width / 2 : cx - ln.width / 2;
    for (const it of ln.items) {
      it.cx = rtl ? x - it.width / 2 : x + it.width / 2;
      it.y = y;
      x += (rtl ? -1 : 1) * (it.width + space);
    }
  });
  const byIndex = new Map(ws.map((it) => [it.i, it]));

  // ---- group entrance ----
  const ge = entrance(s.groupAnim, (t - g.start) / 0.22);
  ctx.globalAlpha = ge.alpha;
  if (ge.scale !== 1 || ge.dy) {
    const cy = H * s.posY;
    ctx.translate(cx, cy + ge.dy * fontPx);
    ctx.scale(ge.scale, ge.scale);
    ctx.translate(-cx, -cy);
  }

  const visible = (i) => s.mode !== 'reveal' || t >= g.words[i].start || i === 0;

  // ---- line background bar ----
  if (s.bgOpacity > 0) {
    ctx.fillStyle = hexA(s.bgColor, s.bgOpacity);
    for (const ln of lines) {
      const vis = ln.items.filter((it) => visible(it.i));
      if (!vis.length) continue;
      const xs = vis.flatMap((it) => [it.cx - it.width / 2, it.cx + it.width / 2]);
      const padX = fontPx * 0.35, padY = fontPx * 0.12;
      const x0 = Math.min(...xs) - padX, x1 = Math.max(...xs) + padX;
      ctx.beginPath();
      ctx.roundRect(x0, vis[0].y - lh / 2 + padY / 2, x1 - x0, lh - padY, s.bgRadius * k);
      ctx.fill();
    }
  }


  const padX = fontPx * 0.18, padY = fontPx * 0.06;
  const boxH = fontPx * 1.15 + padY * 2;

  // ---- active word box (glides from the previous word) ----
  const act = byIndex.get(active);
  if (s.activeBox && act && t >= g.words[active].start - 0.02) {
    let bx = act.cx, bw = act.width;
    const prev = byIndex.get(active - 1);
    const p = clamp((t - g.words[active].start) / 0.12);
    if (prev && prev.y === act.y && p < 1) {
      const e = easeOut(p);
      bx = prev.cx + (act.cx - prev.cx) * e;
      bw = prev.width + (act.width - prev.width) * e;
    }
    const bs = s.mode === 'single' ? 1 : 1 + (s.activeScale - 1) * easeOut(clamp((t - g.words[active].start) / 0.1));
    ctx.save();
    if (s.boxShadow) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 18 * k; ctx.shadowOffsetY = 6 * k; }
    ctx.fillStyle = s.activeBoxColor;
    ctx.beginPath();
    const w = (bw + padX * 2) * bs, h = boxH * bs;
    ctx.roundRect(bx - w / 2, act.y - h / 2, w, h, s.activeBoxRadius * k);
    ctx.fill();
    ctx.restore();
  }

  // ---- words ----
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const noShadow = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };
  const paint = (c1, c2) => {
    if (!c2) return c1;
    const gr = ctx.createLinearGradient(0, -fontPx * 0.45, 0, fontPx * 0.45);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    return gr;
  };

  for (const it of ws) {
    const i = it.i, w = g.words[i];
    if (!visible(i)) continue;
    const isActive = i === active && t >= w.start - 0.02 && t < w.end + 0.6;
    const spoken = t >= w.start;

    let color = s.textColor, color2 = s.gradient ? s.gradientTo : null;
    if (s.fillSpoken && spoken) { color = s.spokenColor; color2 = null; }
    if (isActive && s.highlightActive) {
      color = s.rainbow ? RAINBOW[(g.first + i) % RAINBOW.length] : s.activeColor;
      color2 = s.gradient && s.activeGradientTo && !s.rainbow ? s.activeGradientTo : null;
    }
    if (!spoken && s.dimUpcoming) { color = hexA(color, 0.45); color2 = color2 && hexA(color2, 0.45); }

    const we = (s.mode === 'reveal' || s.mode === 'single' || s.wordAnimAll)
      ? entrance(s.wordAnim, (t - w.start) / 0.2) : { alpha: 1, scale: 1, dy: 0 };
    const emph = isActive && s.mode !== 'single' ? 1 + (s.activeScale - 1) * easeOut(clamp((t - w.start) / 0.1)) : 1;
    const sc = we.scale * emph;

    ctx.save();
    ctx.globalAlpha *= we.alpha;
    ctx.translate(it.cx, it.y + we.dy * fontPx);
    if (s.rotate && (isActive || s.wordBox)) ctx.rotate((s.rotate * Math.PI) / 180 * ((g.first + i) % 2 ? 1 : -1) * (isActive ? 1 : 0.5));
    ctx.scale(sc, sc);

    // per-word sticker box
    if (s.wordBox && !(isActive && s.activeBox)) {
      ctx.save();
      if (s.boxShadow) { ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 14 * k; ctx.shadowOffsetY = 5 * k; }
      ctx.fillStyle = s.wordBoxColor;
      ctx.beginPath();
      ctx.roundRect(-it.width / 2 - padX, -boxH / 2, it.width + padX * 2, boxH, s.activeBoxRadius * k);
      ctx.fill();
      ctx.restore();
    }

    // outer passes carry the shadow; inner passes don't (avoids muddy double shadows)
    const passes = [];
    if (s.stroke2Width > 0) passes.push({ color: s.stroke2Color, width: (s.strokeWidth + s.stroke2Width) * k * 2 });
    if (s.strokeWidth > 0) passes.push({ color: s.strokeColor, width: s.strokeWidth * k * 2 });
    const setShadow = () => {
      if (s.shadowOpacity > 0) {
        ctx.shadowColor = hexA(s.shadowColor, s.shadowOpacity);
        ctx.shadowBlur = s.shadowBlur * k;
        ctx.shadowOffsetX = (s.shadowX || 0) * k;
        ctx.shadowOffsetY = s.shadowY * k;
      }
    };
    setShadow();
    for (const ps of passes) {
      ctx.strokeStyle = ps.color;
      ctx.lineWidth = ps.width;
      ctx.strokeText(w.text, 0, 0);
      noShadow();
    }
    if (s.glow && isActive) { ctx.shadowColor = color; ctx.shadowBlur = s.glow * k; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
    ctx.fillStyle = paint(color, color2);
    ctx.fillText(w.text, 0, 0);
    if (s.glow && isActive) { ctx.shadowBlur = s.glow * k * 0.5; ctx.fillText(w.text, 0, 0); }
    noShadow();

    // underline that grows under the active word
    if (s.underline && isActive) {
      const p = easeOut(clamp((t - w.start) / 0.18));
      const uw = (it.width + padX) * p, uh = Math.max(3, fontPx * 0.11);
      ctx.fillStyle = s.underlineColor;
      ctx.beginPath();
      ctx.roundRect(-uw / 2, fontPx * 0.58, uw, uh, uh / 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}
