// Zirnevis — local server: static files, transcription proxy, fonts & settings storage.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const FONTS = path.join(DATA, 'fonts');
const CONFIG = path.join(DATA, 'config.json');
const PORT = Number((process.argv.find((a) => a.startsWith('--port=')) || '').slice(7) || process.env.PORT || 5178);

fs.mkdirSync(FONTS, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// ---------- config ----------
const DEFAULT_CONFIG = {
  keys: { gemini: '', deepgram: '', speechmatics: '' },
  geminiModel: 'gemini-3.8-flash',
  deepgramModel: 'nova-3',
  speechmaticsOP: 'enhanced',
  language: 'fa',
  presets: [],
};
async function readConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(await fsp.readFile(CONFIG, 'utf8')) }; }
  catch { return structuredClone(DEFAULT_CONFIG); }
}
async function writeConfig(cfg) { await fsp.writeFile(CONFIG, JSON.stringify(cfg, null, 2)); }
const mask = (k) => (k ? '••••' + k.slice(-4) : '');

// ---------- helpers ----------
function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function saveStream(req, file) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    req.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    req.on('error', reject);
  });
}
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-800)))));
  });
}
// Extract a small mono MP3 so uploads to the APIs stay tiny.
async function extractAudio(videoFile) {
  const out = videoFile + '.mp3';
  await run('ffmpeg', ['-y', '-i', videoFile, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', out]);
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function apiError(r, name) {
  let t = await r.text();
  try { t = JSON.stringify(JSON.parse(t)); } catch {}
  return new Error(`${name} ${r.status}: ${t.slice(0, 500)}`);
}

// ---------- providers → { words: [{text, start, end}] } ----------
async function deepgram(audio, cfg) {
  if (!cfg.keys.deepgram) throw new Error('کلید Deepgram در تنظیمات وارد نشده');
  const q = new URLSearchParams({ model: cfg.deepgramModel, language: cfg.language, punctuate: 'true', smart_format: 'true' });
  const r = await fetch('https://api.deepgram.com/v1/listen?' + q, {
    method: 'POST',
    headers: { Authorization: 'Token ' + cfg.keys.deepgram, 'Content-Type': 'audio/mpeg' },
    body: await fsp.readFile(audio),
  });
  if (!r.ok) throw await apiError(r, 'Deepgram');
  const j = await r.json();
  const words = j.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  return words.map((w) => ({ text: w.punctuated_word || w.word, start: w.start, end: w.end }));
}

async function speechmatics(audio, cfg) {
  const key = cfg.keys.speechmatics;
  if (!key) throw new Error('کلید Speechmatics در تنظیمات وارد نشده');
  const base = 'https://asr.api.speechmatics.com/v2';
  const fd = new FormData();
  fd.append('data_file', new Blob([await fsp.readFile(audio)], { type: 'audio/mpeg' }), 'audio.mp3');
  fd.append('config', JSON.stringify({
    type: 'transcription',
    transcription_config: { language: cfg.language, operating_point: cfg.speechmaticsOP || 'enhanced' },
  }));
  const auth = { Authorization: 'Bearer ' + key };
  let r = await fetch(base + '/jobs', { method: 'POST', headers: auth, body: fd });
  if (!r.ok) throw await apiError(r, 'Speechmatics');
  const { id } = await r.json();
  for (let i = 0; i < 400; i++) {
    await sleep(2500);
    r = await fetch(`${base}/jobs/${id}`, { headers: auth });
    if (!r.ok) throw await apiError(r, 'Speechmatics');
    const st = (await r.json()).job?.status;
    if (st === 'done') break;
    if (st === 'rejected' || st === 'deleted') throw new Error('Speechmatics job ' + st);
  }
  r = await fetch(`${base}/jobs/${id}/transcript?format=json-v2`, { headers: auth });
  if (!r.ok) throw await apiError(r, 'Speechmatics');
  const j = await r.json();
  const words = [];
  for (const it of j.results || []) {
    const content = it.alternatives?.[0]?.content ?? '';
    if (it.type === 'punctuation') {
      if (words.length) words[words.length - 1].text += content;
    } else if (it.type === 'word') {
      words.push({ text: content, start: it.start_time, end: it.end_time });
    }
  }
  return words;
}

async function gemini(audio, cfg) {
  const key = cfg.keys.gemini;
  if (!key) throw new Error('کلید Gemini در تنظیمات وارد نشده');
  const b64 = (await fsp.readFile(audio)).toString('base64');
  const prompt =
    'Transcribe this audio verbatim in its original language (mostly Persian/Farsi). ' +
    'Do not translate, do not summarize. Use standard Persian orthography with proper half-spaces (ZWNJ) and punctuation. ' +
    'Split into short segments of at most ~8 words, following natural pauses. ' +
    'Give each segment precise start and end times in seconds (decimals) measured from the beginning of the audio.';
  const body = {
    contents: [{ parts: [{ inline_data: { mime_type: 'audio/mpeg', data: b64 } }, { text: prompt }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { start: { type: 'NUMBER' }, end: { type: 'NUMBER' }, text: { type: 'STRING' } },
          required: ['start', 'end', 'text'],
        },
      },
    },
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.geminiModel}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await apiError(r, 'Gemini');
  const j = await r.json();
  const txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '[]';
  const segs = JSON.parse(txt);
  // Gemini gives segment timing; spread words across the segment by character length.
  const words = [];
  for (const s of segs) {
    const parts = String(s.text).trim().split(/\s+/).filter(Boolean);
    const total = parts.reduce((a, p) => a + p.length + 1, 0);
    let t = Number(s.start);
    const span = Math.max(0.05, Number(s.end) - Number(s.start));
    for (const p of parts) {
      const d = (span * (p.length + 1)) / total;
      words.push({ text: p, start: t, end: t + d });
      t += d;
    }
  }
  return words;
}

const PROVIDERS = { deepgram, speechmatics, gemini };

// ---------- key test + model lists ----------
// Newest first: compare version numbers inside model ids (gemini-3.8-flash > gemini-3.5-pro > gemini-2.5-flash).
const verOf = (id) => (id.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1] * 1;

async function geminiModels(key) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key } });
  if (!r.ok) throw await apiError(r, 'Gemini');
  const j = await r.json();
  return (j.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }))
    .filter((m) => /^gemini/.test(m.id) && !/(tts|image|live|embed|robotics|computer-use|audio-dialog|banana|customtools)/i.test(m.id))
    .sort((a, b) => verOf(b.id) - verOf(a.id) || /pro/.test(b.id) - /pro/.test(a.id) || a.id.localeCompare(b.id));
}

async function deepgramModels(lang) {
  const r = await fetch('https://api.deepgram.com/v1/models');
  if (!r.ok) throw await apiError(r, 'Deepgram');
  const j = await r.json();
  const seen = new Map();
  for (const m of j.stt || []) {
    if (!m.batch || !(m.languages || []).some((l) => l === lang || l.startsWith(lang + '-') || l === 'multi')) continue;
    const id = m.canonical_name.replace(/-general$/, '');
    if (!seen.has(id)) seen.set(id, { id, label: `${id} (${m.architecture})` });
  }
  const rank = (id) => (/nova-3/.test(id) ? 0 : /nova/.test(id) ? 1 : /whisper-large/.test(id) ? 2 : 3);
  return [...seen.values()].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

const SPEECHMATICS_MODELS = [
  { id: 'enhanced', label: 'Enhanced (دقیق‌تر)' },
  { id: 'standard', label: 'Standard (سریع‌تر)' },
];

async function testKey(provider, key, cfg) {
  if (!key) throw new Error('کلید وارد نشده');
  if (provider === 'gemini') {
    const models = await geminiModels(key);
    return { message: `کلید معتبر است — ${models.length} مدل در دسترس`, models };
  }
  if (provider === 'deepgram') {
    const r = await fetch('https://api.deepgram.com/v1/projects', { headers: { Authorization: 'Token ' + key } });
    if (!r.ok) throw await apiError(r, 'Deepgram');
    const p = (await r.json()).projects?.[0];
    return { message: 'کلید معتبر است' + (p ? ` — پروژه: ${p.name}` : ''), models: await deepgramModels(cfg.language) };
  }
  if (provider === 'speechmatics') {
    const r = await fetch('https://asr.api.speechmatics.com/v2/jobs?limit=1', { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) throw await apiError(r, 'Speechmatics');
    return { message: 'کلید معتبر است', models: SPEECHMATICS_MODELS };
  }
  throw new Error('provider نامعتبر');
}

// ---------- routes ----------
async function handleApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/config' && req.method === 'GET') {
    const c = await readConfig();
    return send(res, 200, {
      ...c,
      keys: Object.fromEntries(Object.entries(c.keys).map(([k, v]) => [k, mask(v)])),
    });
  }
  if (p === '/api/config' && req.method === 'POST') {
    const c = await readConfig();
    const b = await readJson(req);
    for (const k of Object.keys(c.keys)) {
      const v = b.keys?.[k];
      if (typeof v === 'string' && !v.startsWith('••••')) c.keys[k] = v.trim();
    }
    for (const k of ['geminiModel', 'deepgramModel', 'speechmaticsOP', 'language']) if (b[k]) c[k] = String(b[k]).trim();
    if (Array.isArray(b.presets)) c.presets = b.presets;
    await writeConfig(c);
    return send(res, 200, { ok: true });
  }

  // Test a key (the typed one, or the saved one if the field still shows the masked value) and list models.
  if (p === '/api/test' && req.method === 'POST') {
    const provider = url.searchParams.get('provider');
    const c = await readConfig();
    const b = await readJson(req);
    const typed = typeof b.key === 'string' ? b.key.trim() : '';
    const key = typed && !typed.startsWith('••••') ? typed : c.keys[provider];
    try {
      return send(res, 200, { ok: true, ...(await testKey(provider, key, c)) });
    } catch (e) {
      return send(res, 200, { ok: false, message: String(e.message || e) });
    }
  }
  // Model list without a typed key (uses the saved key; Deepgram's list is public).
  if (p === '/api/models' && req.method === 'GET') {
    const provider = url.searchParams.get('provider');
    const c = await readConfig();
    try {
      let models = [];
      if (provider === 'gemini' && c.keys.gemini) models = await geminiModels(c.keys.gemini);
      if (provider === 'deepgram') models = await deepgramModels(c.language);
      if (provider === 'speechmatics') models = SPEECHMATICS_MODELS;
      return send(res, 200, { models });
    } catch (e) {
      return send(res, 200, { models: [], error: String(e.message || e) });
    }
  }

  if (p === '/api/transcribe' && req.method === 'POST') {
    const provider = url.searchParams.get('provider');
    if (!PROVIDERS[provider]) return send(res, 400, { error: 'provider نامعتبر' });
    const tmp = path.join(os.tmpdir(), `zirnevis-${Date.now()}`);
    let audio;
    try {
      await saveStream(req, tmp);
      audio = await extractAudio(tmp);
      const words = await PROVIDERS[provider](audio, await readConfig());
      return send(res, 200, { words });
    } catch (e) {
      console.error(e);
      return send(res, 500, { error: String(e.message || e) });
    } finally {
      fsp.rm(tmp, { force: true });
      if (audio) fsp.rm(audio, { force: true });
    }
  }

  if (p === '/api/fonts' && req.method === 'GET') {
    const files = (await fsp.readdir(FONTS)).filter((f) => /\.(ttf|otf|woff2?)$/i.test(f));
    return send(res, 200, files.map((f) => ({ file: f, family: f.replace(/\.[^.]+$/, '') })));
  }
  if (p === '/api/fonts' && req.method === 'POST') {
    const name = path.basename(url.searchParams.get('name') || '');
    if (!/\.(ttf|otf|woff2?)$/i.test(name)) return send(res, 400, { error: 'فقط ttf / otf / woff / woff2' });
    await saveStream(req, path.join(FONTS, name));
    return send(res, 200, { ok: true });
  }
  if (p === '/api/fonts' && req.method === 'DELETE') {
    const name = path.basename(url.searchParams.get('name') || '');
    await fsp.rm(path.join(FONTS, name), { force: true });
    return send(res, 200, { ok: true });
  }
  send(res, 404, { error: 'not found' });
}

async function serveStatic(res, file) {
  try {
    const data = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname === '/vendor/mediabunny.js')
      return serveStatic(res, path.join(ROOT, 'node_modules/mediabunny/dist/bundles/mediabunny.min.mjs'));
    if (url.pathname.startsWith('/fonts/'))
      return serveStatic(res, path.join(FONTS, path.basename(decodeURIComponent(url.pathname))));
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain');
    return serveStatic(res, file);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: String(e) });
  }
});

const URL_ = `http://localhost:${PORT}`;
const openBrowser = () => {
  if (!process.env.NO_OPEN && !process.argv.includes('--no-open')) exec(process.platform === 'win32' ? `start "" ${URL_}` : `open ${URL_}`);
};

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    // Most likely the app is already running in another window — just open it.
    console.log(`برنامه از قبل روی ${URL_} در حال اجراست؛ همان باز می‌شود.`);
    console.log('اگر صفحه باز نشد، پنجره‌های قبلی برنامه را ببندید یا متغیر PORT را عوض کنید.');
    openBrowser();
    setTimeout(() => process.exit(0), 1500);
  } else {
    throw e;
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Zirnevis is running → ${URL_}`);
  console.log('برای بستن برنامه این پنجره را ببندید.');
  openBrowser();
});
