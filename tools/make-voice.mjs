// 全セリフを VOICEVOX エンジンで録音し、効果音も作って、voice/*.m4a と voice/index.json を書き出す。
// 使い方: VOICEVOX エンジンを起動してから `node tools/make-voice.mjs`
// セリフは story.js / route.js / plot.js から読む（story.js の voiceLines()）。文面を直したら再実行するだけでよい。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'voice');
const ENGINE = process.env.VOICEVOX_URL || 'http://127.0.0.1:50021';
const VOICES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/voice.json'), 'utf8'));
const RATE = 24000;

// --- セリフを集める（アプリと同じ定義をそのまま使う） ---
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['story.js', 'route.js', 'site.js', 'plot.js']) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
}
const READ = vm.runInContext('READ', ctx);
const lines = vm.runInContext('voiceLines()', ctx);

// アプリの sentences() と同じ区切り方
const split = (t) => (String(t).match(/[^。！？]+[。！？]*」?/g) || []).map((s) => s.trim()).filter(Boolean);
const reading = (s) => READ.reduce((a, r) => a.replace(r[0], r[1]), s);

// --- WAV の読み書き ---
function readWav(buf) {
  let o = 12, data = null;
  while (o < buf.length) {
    const id = buf.toString('ascii', o, o + 4), n = buf.readUInt32LE(o + 4);
    if (id === 'data') { data = buf.subarray(o + 8, o + 8 + n); break; }
    o += 8 + n;
  }
  const s = new Float32Array(data.length / 2);
  for (let i = 0; i < s.length; i++) s[i] = data.readInt16LE(i * 2) / 32768;
  return s;
}
function writeWav(file, s) {
  const b = Buffer.alloc(44 + s.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + s.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(s.length * 2, 40);
  for (let i = 0; i < s.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
}
function toM4a(wav, file) {
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '48000', wav, file]);
  fs.unlinkSync(wav);
}

// 無線ごしの声: 低音と高音を削り、少し歪ませ、ノイズを足す
function radio(s) {
  const out = new Float32Array(s.length), hp = Math.exp(-2 * Math.PI * 350 / RATE), lp = 1 - Math.exp(-2 * Math.PI * 2600 / RATE);
  let x1 = 0, y1 = 0, l1 = 0, l2 = 0;
  for (let i = 0; i < s.length; i++) {
    const h = hp * (y1 + s[i] - x1); x1 = s[i]; y1 = h;
    l1 += lp * (h - l1); l2 += lp * (l1 - l2);
    out[i] = Math.tanh(l2 * 2.2) * 0.8 + (Math.random() * 2 - 1) * 0.025;
  }
  return out;
}

// 大きく聞こえるように: ピークをそろえてから、やわらかく圧縮して小さい音を持ち上げる（loud の数字が強さ）
function loud(s, k) {
  let peak = 0;
  for (const x of s) peak = Math.max(peak, Math.abs(x));
  const g = peak > 0 ? 1 / peak : 1, n = Math.tanh(k);
  return s.map((x) => Math.tanh(x * g * k) / n * 0.97);
}

// --- 効果音（その場で合成） ---
const T = (sec) => Math.round(sec * RATE);
function sfx(name) {
  const rnd = () => Math.random() * 2 - 1;
  let s;
  if (name === 'radio') { // 無線を開く「ザッ」＋小さなクリック
    s = new Float32Array(T(0.22)); let lo = 0;
    for (let i = 0; i < s.length; i++) { lo += 0.35 * (rnd() - lo); s[i] = (i < T(0.16) ? lo * 0.5 * (1 - i / T(0.16)) : 0) + (i > T(0.18) && i < T(0.185) ? 0.4 : 0); }
  } else if (name === 'enemy') { // 割り込み: ノイズと乱れた電子音
    s = new Float32Array(T(0.8)); let f = 300;
    for (let i = 0; i < s.length; i++) { if (i % T(0.04) === 0) f = 180 + Math.random() * 800; const g = Math.random() < 0.85 ? 1 : 0; s[i] = (rnd() * 0.35 + Math.sign(Math.sin(2 * Math.PI * f * i / RATE)) * 0.18) * g * (1 - i / s.length * 0.5); }
  } else if (name === 'approach') { // 接近: 低い鼓動を3回
    s = new Float32Array(T(1.3));
    for (const st of [0, 0.42, 0.84]) for (let i = 0; i < T(0.3); i++) { const t = i / RATE, e = Math.exp(-t * 14); s[T(st) + i] += (Math.sin(2 * Math.PI * 110 * t) * 0.6 + Math.sin(2 * Math.PI * 220 * t) * 0.25) * e; }
  } else if (name === 'alert') { // 警告: 高低2音を2回
    s = new Float32Array(T(0.8)); const tones = [[0, 960], [0.17, 720], [0.4, 960], [0.57, 720]];
    for (const [st, f] of tones) for (let i = 0; i < T(0.13); i++) { const t = i / RATE, e = Math.min(1, i / 200) * Math.min(1, (T(0.13) - i) / 200); s[T(st) + i] += Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.22 * e; }
  } else if (name === 'fanfare') { // 任務完了: ドミソド
    s = new Float32Array(T(1.4)); const notes = [[0, 523.25, 0.13], [0.14, 659.25, 0.13], [0.28, 783.99, 0.13], [0.42, 1046.5, 0.9]];
    for (const [st, f, d] of notes) for (let i = 0; i < T(d); i++) { const t = i / RATE, e = Math.min(1, i / 300) * Math.exp(-t * (d > 0.5 ? 3 : 8)), tri = 2 / Math.PI * Math.asin(Math.sin(2 * Math.PI * f * t)); s[T(st) + i] += (tri * 0.35 + Math.sin(4 * Math.PI * f * t) * 0.08) * e; }
  } else { // 無音（iOS の再生許可用）
    s = new Float32Array(T(0.1));
  }
  return s;
}

// --- 録音 ---
async function synth(text, v) {
  const q = await (await fetch(`${ENGINE}/audio_query?speaker=${v.speaker}&text=${encodeURIComponent(text)}`, { method: 'POST' })).json();
  Object.assign(q, v.params, { outputSamplingRate: RATE });
  const r = await fetch(`${ENGINE}/synthesis?speaker=${v.speaker}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
  if (!r.ok) throw new Error(`synthesis failed: ${r.status} ${text}`);
  let s = readWav(Buffer.from(await r.arrayBuffer()));
  if (v.radio) s = radio(s);
  if (v.loud) s = loud(s, v.loud);
  return s;
}

fs.mkdirSync(OUT, { recursive: true });
const index = { sfx: {} };
let made = 0, total = 0;
for (const who of Object.keys(VOICES)) {
  const v = VOICES[who], tag = JSON.stringify(v);
  index[who] = {};
  for (const s of [...new Set((lines[who] || []).flatMap(split))]) {
    const id = crypto.createHash('sha1').update(tag + '\n' + reading(s)).digest('hex').slice(0, 12);
    const file = path.join(OUT, id + '.m4a');
    if (!fs.existsSync(file)) { const wav = file.replace(/\.m4a$/, '.wav'); writeWav(wav, await synth(reading(s), v)); toM4a(wav, file); made++; }
    index[who][s] = id + '.m4a'; total++;
  }
}
for (const name of ['radio', 'enemy', 'approach', 'alert', 'fanfare', 'silence']) {
  const f = name === 'silence' ? 'silence.m4a' : `sfx-${name}.m4a`, file = path.join(OUT, f);
  if (!fs.existsSync(file) || process.env.REMAKE_SFX) { const wav = file.replace(/\.m4a$/, '.wav'); writeWav(wav, sfx(name)); toM4a(wav, file); }
  if (name !== 'silence') index.sfx[name] = f;
}
// 使わなくなった録音を消す
const keep = new Set(['silence.m4a', 'index.json', ...Object.values(index.sfx), ...Object.keys(VOICES).flatMap((w) => Object.values(index[w]))]);
for (const f of fs.readdirSync(OUT)) if (!keep.has(f)) fs.unlinkSync(path.join(OUT, f));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(`セリフ ${total} 文（新しく録音 ${made} 文）`);
