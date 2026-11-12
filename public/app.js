import { buildGroups, drawCaptions } from './render.js';
import { PRESETS, BASE, BUILTIN_FONTS } from './presets.js';

const $ = (s) => document.querySelector(s);
const el = (tag, { dataset, style, ...props } = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(e.dataset, dataset);
  if (style) e.style.cssText = style;
  e.append(...kids);
  return e;
};

const state = {
  file: null,
  words: [],
  groups: [],
  style: { ...PRESETS[0].style },
  presetId: PRESETS[0].id,
  offset: 0,
  config: null,
  customFonts: [],
};

// ---------------- utils ----------------
const fmt = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60); const s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
const fmtMs = (t) => `${fmt(t)}.${String(Math.floor(((t || 0) % 1) * 10))}`;
function setStatus(node, msg, kind = '') { node.textContent = msg; node.className = 'status ' + kind; }
const storeKey = () => state.file && `zirnevis:${state.file.name}:${state.file.size}`;
function persist() { try { if (storeKey()) localStorage.setItem(storeKey(), JSON.stringify({ words: state.words, offset: state.offset })); } catch {} }
function restore() { try { const v = JSON.parse(localStorage.getItem(storeKey()) || 'null'); if (v?.words?.length) { state.words = v.words; state.offset = v.offset || 0; return true; } } catch {} return false; }
try { const s = JSON.parse(localStorage.getItem('zirnevis:style') || 'null'); if (s) { state.style = { ...BASE, ...s.style }; state.presetId = s.presetId; } } catch {}
const saveStyleLocal = () => { try { localStorage.setItem('zirnevis:style', JSON.stringify({ style: state.style, presetId: state.presetId })); } catch {} };

// ---------------- video ----------------
const video = $('#video');
const overlay = $('#overlay');
const octx = overlay.getContext('2d');

function loadFile(file) {
  if (!file || !file.type.startsWith('video')) return;
  state.file = file;
  video.src = URL.createObjectURL(file);
  $('#drop').classList.add('hidden');
  $('#player').classList.remove('hidden');
  $('#btnTranscribe').disabled = false;
  state.words = [];
  state.offset = 0;
  if (restore()) setStatus($('#status'), 'زیرنویس قبلی این ویدیو بازیابی شد.', 'ok');
  else setStatus($('#status'), '');
  $('#offset').value = state.offset;
  regroup();
}
video.addEventListener('loadedmetadata', () => {
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  fitOverlay();
});
let lastFit = '';
function fitOverlay() {
  const r = video.getBoundingClientRect(), pr = video.parentElement.getBoundingClientRect();
  const key = [r.width, r.height, r.left - pr.left, r.top - pr.top].join();
  if (key === lastFit) return;
  lastFit = key;
  Object.assign(overlay.style, { width: r.width + 'px', height: r.height + 'px', left: r.left - pr.left + 'px', top: r.top - pr.top + 'px' });
}
new ResizeObserver(fitOverlay).observe($('#frame'));

const drawAt = (ctx, W, H, t) => drawCaptions(ctx, W, H, t - state.offset, state.groups, state.style);

let lastCur = -2;
function loop() {
  if (overlay.width) {
    fitOverlay();
    octx.clearRect(0, 0, overlay.width, overlay.height);
    drawAt(octx, overlay.width, overlay.height, video.currentTime);
  }
  const d = video.duration || 0;
  if (!seeking) $('#seek').value = d ? (video.currentTime / d) * 1000 : 0;
  $('#time').textContent = `${fmt(video.currentTime)} / ${fmt(d)}`;
  $('#btnPlay').textContent = video.paused ? '▶' : '❚❚';
  // highlight current line in the editor
  const t = video.currentTime - state.offset;
  const cur = state.groups.findIndex((g) => t >= g.start && t < g.showUntil);
  if (cur !== lastCur) {
    document.querySelectorAll('.line.current').forEach((n) => n.classList.remove('current'));
    const n = document.querySelector(`.line[data-i="${cur}"]`);
    if (n) { n.classList.add('current'); if (!video.paused) n.scrollIntoView({ block: 'nearest' }); }
    lastCur = cur;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

let seeking = false;
$('#seek').addEventListener('input', (e) => { seeking = true; video.currentTime = (e.target.value / 1000) * (video.duration || 0); });
$('#seek').addEventListener('change', () => (seeking = false));
$('#btnPlay').onclick = () => (video.paused ? video.play() : video.pause());
video.addEventListener('click', () => (video.paused ? video.play() : video.pause()));
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && !e.target.isContentEditable && state.file) {
    e.preventDefault(); video.paused ? video.play() : video.pause();
  }
});

const drop = $('#drop');
['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
document.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
$('#fileInput').onchange = (e) => loadFile(e.target.files[0]);
$('#fileInput2').onchange = (e) => loadFile(e.target.files[0]);

// ---------------- tabs ----------------
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('hidden', x.id !== 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'style') drawThumbs();
}));

// ---------------- transcription ----------------
$('#btnTranscribe').onclick = async () => {
  if (!state.file) return;
  if (state.words.length && !confirm('زیرنویس فعلی جایگزین شود؟')) return;
  const provider = $('#provider').value;
  const btn = $('#btnTranscribe');
  btn.disabled = true;
  const t0 = Date.now();
  const tick = setInterval(() => setStatus($('#status'), `در حال تبدیل گفتار به متن با ${provider}… ${Math.round((Date.now() - t0) / 1000)} ثانیه`), 500);
  try {
    const r = await fetch('/api/transcribe?provider=' + provider, { method: 'POST', body: state.file });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.statusText);
    if (!j.words.length) throw new Error('گفتاری پیدا نشد.');
    state.words = j.words;
    state.offset = 0; $('#offset').value = 0;
    regroup(); persist();
    clearInterval(tick);
    setStatus($('#status'), `✓ ${j.words.length} کلمه در ${Math.round((Date.now() - t0) / 1000)} ثانیه`, 'ok');
  } catch (e) {
    clearInterval(tick);
    setStatus($('#status'), 'خطا: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
};
$('#offset').oninput = (e) => { state.offset = Number(e.target.value) || 0; persist(); };

// ---------------- transcript editor ----------------
function regroup() {
  state.groups = buildGroups(state.words, { maxWords: state.style.maxWords, maxChars: state.style.maxChars || 30 });
  renderLines();
  $('#btnExport').disabled = !state.file;
}

function renderLines() {
  const box = $('#lines');
  box.replaceChildren();
  lastCur = -2;
  state.groups.forEach((g, gi) => {
    const txt = el('div', { className: 'txt', contentEditable: 'true', textContent: g.words.map((w) => w.text).join(' ') });
    txt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); txt.blur(); } });
    txt.addEventListener('blur', () => editGroup(gi, txt.textContent));
    const time = el('span', { className: 't mono', textContent: fmtMs(g.start + state.offset), title: 'رفتن به این زمان' });
    time.onclick = () => { video.currentTime = g.start + state.offset + 0.01; };
    txt.addEventListener('focus', () => { video.pause(); video.currentTime = g.start + state.offset + 0.01; });
    const del = el('button', { className: 'del', textContent: '✕', title: 'حذف این خط' });
    del.onclick = () => { state.words.splice(g.first, g.words.length); regroup(); persist(); };
    box.append(el('div', { className: 'line', dataset: { i: gi } }, time, txt, del));
  });
}

function editGroup(gi, text) {
  const g = state.groups[gi];
  if (!g) return;
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const old = g.words.map((w) => w.text);
  if (tokens.join(' ') === old.join(' ')) return;
  let nw;
  if (tokens.length === g.words.length) {
    nw = g.words.map((w, i) => ({ ...w, text: tokens[i] }));
  } else {
    // redistribute timing across the group span by character length
    const total = tokens.reduce((a, t) => a + t.length + 1, 0);
    const span = g.end - g.start;
    let t = g.start;
    nw = tokens.map((tok) => { const d = (span * (tok.length + 1)) / total; const w = { text: tok, start: t, end: t + d }; t += d; return w; });
  }
  state.words.splice(g.first, g.words.length, ...nw);
  regroup(); persist();
}

// ---------------- SRT ----------------
const srtTime = (t) => { const ms = Math.round(Math.max(0, t) * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
$('#srtOut').onclick = () => {
  const srt = state.groups.map((g, i) => `${i + 1}\n${srtTime(g.start + state.offset)} --> ${srtTime(g.end + state.offset)}\n${g.words.map((w) => w.text).join(' ')}\n`).join('\n');
  const a = el('a', { href: URL.createObjectURL(new Blob(['﻿' + srt], { type: 'text/plain' })), download: (state.file?.name || 'subtitle').replace(/\.[^.]+$/, '') + '.srt' });
  a.click();
};
$('#srtIn').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const parse = (s) => { const [h, m, rest] = s.trim().split(':'); return +h * 3600 + +m * 60 + parseFloat(rest.replace(',', '.')); };
  const words = [];
  for (const block of (await f.text()).replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n').filter(Boolean);
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split('-->').map(parse);
    const tokens = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean);
    const total = tokens.reduce((x, t) => x + t.length + 1, 0);
    let t = a;
    for (const tok of tokens) { const d = ((b - a) * (tok.length + 1)) / total; words.push({ text: tok, start: t, end: t + d }); t += d; }
  }
  state.words = words; state.offset = 0; $('#offset').value = 0;
  regroup(); persist();
  setStatus($('#status'), `✓ ${words.length} کلمه از SRT وارد شد`, 'ok');
  e.target.value = '';
};

// ---------------- fonts ----------------
const allFonts = () => [...BUILTIN_FONTS, ...state.customFonts.map((f) => f.family)];
async function loadCustomFonts() {
  const list = await (await fetch('/api/fonts')).json();
  for (const f of list) {
    if (state.customFonts.some((x) => x.family === f.family)) continue;
    try {
      const face = new FontFace(f.family, `url("/fonts/${encodeURIComponent(f.file)}")`);
      document.fonts.add(await face.load());
      state.customFonts.push(f);
    } catch (e) { console.warn('font failed', f, e); }
  }
  state.customFonts = state.customFonts.filter((x) => list.some((f) => f.family === x.family));
  renderFontList();
  buildStyleForm();
}
function renderFontList() {
  const box = $('#fontList');
  box.replaceChildren();
  for (const fam of allFonts()) {
    const custom = state.customFonts.find((f) => f.family === fam);
    const item = el('div', { className: 'font-item' },
      el('span', { className: 'sample', textContent: 'سلام دنیا ۱۲۳', style: `font-family:"${fam}"` }),
      el('small', { textContent: fam + (custom ? '' : ' (پیش‌فرض)') }));
    const use = el('button', { className: 'ghost', textContent: 'استفاده' });
    use.onclick = () => setStyle({ fontFamily: fam });
    item.append(use);
    if (custom) {
      const del = el('button', { className: 'ghost', textContent: '🗑' });
      del.onclick = async () => { if (!confirm(`فونت ${fam} حذف شود؟`)) return; await fetch('/api/fonts?name=' + encodeURIComponent(custom.file), { method: 'DELETE' }); await loadCustomFonts(); };
      item.append(del);
    }
    box.append(item);
  }
}
$('#fontIn').onchange = async (e) => {
  for (const f of e.target.files) await fetch('/api/fonts?name=' + encodeURIComponent(f.name), { method: 'POST', body: f });
  e.target.value = '';
  await loadCustomFonts();
};
async function ensureFont(s = state.style) {
  try { await document.fonts.load(`${s.fontWeight} 40px "${s.fontFamily}"`, 'سلام'); } catch {}
}

// ---------------- styles ----------------
const SECTIONS = [
  ['متن و چیدمان', [
    ['fontFamily', 'فونت', 'font'], ['fontWeight', 'ضخامت', 'select', [300, 400, 500, 600, 700, 800, 900]],
    ['fontSize', 'اندازه', 'range', 30, 200, 1], ['posY', 'ارتفاع', 'range', 0.1, 0.95, 0.01],
    ['maxWidth', 'عرض حداکثر', 'range', 0.4, 0.98, 0.01], ['lineHeight', 'فاصله خطوط', 'range', 0.9, 2, 0.05],
    ['wordGap', 'فاصله کلمات', 'range', 0.5, 3, 0.1],
    ['maxWords', 'کلمه در هر صفحه', 'range', 1, 12, 1], ['maxChars', 'حداکثر حروف', 'range', 8, 70, 1],
    ['mode', 'نمایش', 'select', [['line', 'کل جمله'], ['reveal', 'کلمه‌به‌کلمه ظاهر شود'], ['single', 'فقط یک کلمه']]],
  ]],
  ['رنگ‌ها', [
    ['textColor', 'رنگ متن', 'color'], ['gradient', 'گرادیان', 'check'], ['gradientTo', 'رنگ دوم گرادیان', 'color'],
    ['highlightActive', 'هایلایت کلمه‌ی فعلی', 'check'],
    ['activeColor', 'رنگ کلمه‌ی فعلی', 'color'], ['activeGradientTo', 'رنگ دوم کلمه‌ی فعلی', 'color'], ['rainbow', 'رنگین‌کمانی', 'check'],
    ['activeScale', 'بزرگ‌نمایی کلمه', 'range', 1, 1.5, 0.01],
    ['fillSpoken', 'رنگ کلمات گفته‌شده', 'check'], ['spokenColor', 'رنگ گفته‌شده', 'color'],
    ['dimUpcoming', 'کم‌رنگ کردن کلمات بعدی', 'check'],
  ]],
  ['جعبه و پس‌زمینه', [
    ['activeBox', 'جعبه پشت کلمه‌ی فعلی', 'check'], ['activeBoxColor', 'رنگ جعبه', 'color'], ['activeBoxRadius', 'گردی جعبه', 'range', 0, 60, 1],
    ['wordBox', 'جعبه پشت همه کلمات', 'check'], ['wordBoxColor', 'رنگ جعبه کلمات', 'color'], ['boxShadow', 'سایه جعبه', 'check'],
    ['underline', 'خط زیر کلمه‌ی فعلی', 'check'], ['underlineColor', 'رنگ خط زیر', 'color'],
    ['bgOpacity', 'نوار پس‌زمینه', 'range', 0, 1, 0.05], ['bgColor', 'رنگ نوار', 'color'], ['bgRadius', 'گردی نوار', 'range', 0, 60, 1],
  ]],
  ['حاشیه، سایه و درخشش', [
    ['strokeWidth', 'ضخامت حاشیه', 'range', 0, 20, 0.5], ['strokeColor', 'رنگ حاشیه', 'color'],
    ['stroke2Width', 'حاشیه‌ی دوم', 'range', 0, 20, 0.5], ['stroke2Color', 'رنگ حاشیه‌ی دوم', 'color'],
    ['shadowOpacity', 'سایه', 'range', 0, 1, 0.05], ['shadowColor', 'رنگ سایه', 'color'],
    ['shadowBlur', 'نرمی سایه', 'range', 0, 60, 1], ['shadowX', 'سایه افقی', 'range', -20, 20, 1], ['shadowY', 'سایه عمودی', 'range', -20, 30, 1],
    ['glow', 'درخشش نئونی', 'range', 0, 80, 1],
  ]],
  ['انیمیشن', [
    ['groupAnim', 'ورود جمله', 'select', [['none', 'بدون'], ['fade', 'محو'], ['pop', 'پاپ'], ['slide', 'بالا آمدن'], ['zoom', 'زوم'], ['bounce', 'فنری']]],
    ['wordAnim', 'ورود کلمه', 'select', [['none', 'بدون'], ['fade', 'محو'], ['pop', 'پاپ'], ['rise', 'بالا آمدن'], ['zoom', 'زوم'], ['bounce', 'فنری']]],
    ['wordAnimAll', 'انیمیشن کلمه در حالت کل جمله', 'check'], ['rotate', 'چرخش کلمه‌ی فعلی', 'range', 0, 12, 0.5],
  ]],
];

function setStyle(patch, fromPreset = false) {
  const regroupNeeded = 'maxWords' in patch || 'maxChars' in patch;
  Object.assign(state.style, patch);
  if (!fromPreset) state.presetId = null;
  saveStyleLocal();
  if (regroupNeeded || fromPreset) regroup();
  if ('fontFamily' in patch || 'fontWeight' in patch) ensureFont();
  buildStyleForm();
  markPreset();
}

function buildStyleForm() {
  const form = $('#styleForm');
  const s = state.style;
  form.replaceChildren();
  for (const [title, fields] of SECTIONS) {
    form.append(el('h4', { textContent: title }));
    for (const [key, label, type, a, b, step] of fields) {
      let input, v = el('span', { className: 'v' });
      if (type === 'range') {
        input = el('input', { type: 'range', min: a, max: b, step, value: s[key] ?? a });
        v.textContent = s[key];
        input.oninput = () => { v.textContent = input.value; state.style[key] = Number(input.value); state.presetId = null; markPreset(); saveStyleLocal(); };
        input.onchange = () => { if (key === 'maxWords' || key === 'maxChars') regroup(); };
      } else if (type === 'color') {
        input = el('input', { type: 'color', value: s[key] || '#ffffff' });
        input.oninput = () => { state.style[key] = input.value; state.presetId = null; markPreset(); saveStyleLocal(); };
      } else if (type === 'check') {
        input = el('input', { type: 'checkbox', checked: !!s[key] });
        input.onchange = () => setStyle({ [key]: input.checked });
      } else {
        const opts = type === 'font' ? allFonts().map((f) => [f, f]) : a.map((o) => (Array.isArray(o) ? o : [o, o]));
        input = el('select');
        for (const [val, txt] of opts) input.append(el('option', { value: val, textContent: txt, selected: String(s[key]) === String(val) }));
        if (type === 'font') input.style.fontFamily = `"${s.fontFamily}"`;
        input.onchange = () => setStyle({ [key]: typeof s[key] === 'number' ? Number(input.value) : input.value });
      }
      form.append(el('div', { className: 'field' }, el('label', { textContent: label }), input, v));
    }
  }
}

const userPresets = () => state.config?.presets || [];
function allPresets() { return [...PRESETS, ...userPresets().map((p) => ({ ...p, user: true, style: { ...BASE, ...p.style } }))]; }

const SAMPLE = ['این', 'یه', 'زیرنویس', 'خفنه'].map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.38 }));
function drawThumbs() {
  document.querySelectorAll('.preset canvas').forEach((c) => {
    const p = allPresets().find((x) => x.id === c.dataset.id);
    if (!p) return;
    const ctx = c.getContext('2d');
    const gr = ctx.createLinearGradient(0, 0, c.width, c.height);
    gr.addColorStop(0, '#3a3f5c'); gr.addColorStop(1, '#5b3d55');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, c.width, c.height);
    const st = { ...p.style, posY: 0.5, maxWidth: 0.92 };
    const groups = buildGroups(SAMPLE, { maxWords: 4, maxChars: 99 });
    drawCaptions(ctx, c.width, c.height, 0.85, groups, st, st.mode === 'single' ? 1.6 : 2.1);
  });
}
function renderPresets() {
  const grid = $('#presetGrid');
  grid.replaceChildren();
  for (const p of allPresets()) {
    const b = el('button', { className: 'preset', dataset: { id: p.id }, style: 'position:relative' },
      el('canvas', { width: 480, height: 300, dataset: { id: p.id } }), el('span', { textContent: p.name }));
    b.onclick = async () => { state.presetId = p.id; setStyle({ ...p.style }, true); await ensureFont(); drawThumbs(); };
    if (p.user) {
      const x = el('span', { textContent: '✕', title: 'حذف', style: 'position:absolute;top:2px;left:6px;padding:0;color:#fff;cursor:pointer' });
      x.onclick = async (e) => { e.stopPropagation(); if (!confirm(`استایل «${p.name}» حذف شود؟`)) return; state.config.presets = userPresets().filter((q) => q.id !== p.id); await savePresets(); };
      b.append(x);
    }
    grid.append(b);
  }
  markPreset();
  drawThumbs();
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.classList.toggle('active', b.dataset.id === state.presetId)); }
async function savePresets() {
  await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presets: state.config.presets }) });
  renderPresets();
}
$('#btnSavePreset').onclick = async () => {
  const name = prompt('اسم استایل:');
  if (!name) return;
  const id = 'u' + Date.now();
  state.config.presets = [...userPresets(), { id, name, style: { ...state.style } }];
  state.presetId = id;
  await savePresets();
};

// ---------------- settings ----------------
const PROVS = ['speechmatics', 'deepgram', 'gemini'];
const MODEL_FIELD = { speechmatics: 'speechmaticsOP', deepgram: 'deepgramModel', gemini: 'geminiModel' };
state.models = {};

async function loadConfig() { state.config = await (await fetch('/api/config')).json(); }
const postConfig = (body) => fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function fillModels(select, models, current) {
  select.replaceChildren();
  const list = [...(models || [])];
  if (current && !list.some((m) => m.id === current)) list.unshift({ id: current, label: current + (models?.length ? ' (در لیست نیست)' : '') });
  for (const m of list) select.append(el('option', { value: m.id, textContent: m.label === m.id ? m.id : `${m.id} — ${m.label}`, selected: m.id === current }));
}
async function fetchModels(p) {
  try { const j = await (await fetch('/api/models?provider=' + p)).json(); if (j.models?.length) state.models[p] = j.models; } catch {}
  return state.models[p] || [];
}

$('#btnSettings').onclick = async () => {
  await loadConfig();
  const f = $('#settings form');
  f.elements.language.value = state.config.language || 'fa';
  for (const p of PROVS) {
    f.elements[p].value = state.config.keys[p] || '';
    const box = f.querySelector(`.prov[data-p="${p}"]`);
    const ts = box.querySelector('.tstatus');
    ts.className = 'tstatus';
    ts.textContent = state.config.keys[p] ? 'کلید ذخیره شده — برای بررسی «تست» را بزنید' : 'کلید وارد نشده';
    fillModels(f.elements[MODEL_FIELD[p]], state.models[p], state.config[MODEL_FIELD[p]]);
    fetchModels(p).then((m) => fillModels(f.elements[MODEL_FIELD[p]], m, f.elements[MODEL_FIELD[p]].value));
  }
  $('#settings').showModal();
};

document.querySelectorAll('#settings .prov').forEach((box) => {
  const p = box.dataset.p;
  box.querySelector('.test').onclick = async () => {
    const st = box.querySelector('.tstatus');
    const btn = box.querySelector('.test');
    st.className = 'tstatus'; st.textContent = 'در حال بررسی…';
    btn.disabled = true;
    try {
      const j = await (await fetch('/api/test?provider=' + p, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: box.querySelector(`input[name="${p}"]`).value }),
      })).json();
      st.className = 'tstatus ' + (j.ok ? 'ok' : 'err');
      st.textContent = (j.ok ? '✓ ' : '✕ ') + j.message;
      if (j.ok && j.models?.length) {
        state.models[p] = j.models;
        const sel = $('#settings form').elements[MODEL_FIELD[p]];
        fillModels(sel, j.models, sel.value);
      }
    } catch (e) {
      st.className = 'tstatus err'; st.textContent = '✕ ' + e.message;
    } finally { btn.disabled = false; }
  };
});

$('#settings').addEventListener('close', async () => {
  if ($('#settings').returnValue !== 'save') return;
  const f = $('#settings form');
  const body = { keys: {}, language: f.elements.language.value };
  for (const p of PROVS) { body.keys[p] = f.elements[p].value; body[MODEL_FIELD[p]] = f.elements[MODEL_FIELD[p]].value; }
  await postConfig(body);
  await loadConfig();
  refreshModelPick();
});

// quick model switch next to the provider dropdown
async function refreshModelPick() {
  const p = $('#provider').value;
  const sel = $('#modelPick');
  fillModels(sel, state.models[p], state.config?.[MODEL_FIELD[p]]);
  const models = await fetchModels(p);
  if ($('#provider').value === p) fillModels(sel, models, state.config?.[MODEL_FIELD[p]]);
}
$('#provider').onchange = () => { try { localStorage.setItem('zirnevis:provider', $('#provider').value); } catch {} refreshModelPick(); };
$('#modelPick').onchange = async () => {
  const field = MODEL_FIELD[$('#provider').value];
  await postConfig({ [field]: $('#modelPick').value });
  state.config[field] = $('#modelPick').value;
};
try { const pv = localStorage.getItem('zirnevis:provider'); if (pv) $('#provider').value = pv; } catch {}

// ---------------- export ----------------
let abort = null;
$('#btnExport').onclick = async () => {
  if (abort) { abort.abort(); return; }
  if (!state.groups.length && !confirm('هنوز زیرنویسی ندارید. ویدیو بدون زیرنویس ساخته شود؟')) return;
  const btn = $('#btnExport'), bar = $('#progBar'), st = $('#exportStatus');
  video.pause();
  await ensureFont();
  abort = new AbortController();
  btn.textContent = 'لغو';
  $('#prog').classList.remove('hidden');
  $('#download').classList.add('hidden');
  const t0 = Date.now();
  try {
    const { exportVideo } = await import('./export.js');
    const blob = await exportVideo(state.file, drawAt, (p) => {
      bar.style.width = (p * 100).toFixed(1) + '%';
      setStatus(st, `در حال ساخت… ${Math.round(p * 100)}٪`);
    }, abort.signal);
    const a = $('#download');
    a.href = URL.createObjectURL(blob);
    a.download = state.file.name.replace(/\.[^.]+$/, '') + '-subtitled.mp4';
    a.classList.remove('hidden');
    setStatus(st, `✓ آماده شد (${(blob.size / 1048576).toFixed(1)} مگابایت، ${Math.round((Date.now() - t0) / 1000)} ثانیه)`, 'ok');
  } catch (e) {
    setStatus(st, e.name === 'ConversionCanceledError' ? 'لغو شد.' : 'خطا: ' + e.message, e.name === 'ConversionCanceledError' ? '' : 'err');
    console.error(e);
  } finally {
    abort = null;
    btn.textContent = 'ساخت ویدیوی نهایی MP4';
  }
};

// ---------------- boot ----------------
(async () => {
  await loadConfig();
  refreshModelPick();
  buildStyleForm();
  renderPresets();
  renderFontList();
  await loadCustomFonts();
  await Promise.all(BUILTIN_FONTS.map((f) => document.fonts.load(`700 40px "${f}"`, 'سلام').catch(() => {})));
  await ensureFont();
  renderPresets();
  renderFontList();
})();
window.__state = state; // handy for debugging
