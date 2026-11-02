// 全セリフを VOICEVOX エンジンで録音し、voice/*.m4a と voice/index.json を作る。
// 使い方: VOICEVOX エンジンを起動してから `node tools/make-voice.mjs`
// セリフは index.html の DATA 部分（BGM / DAYS / LINES / READ）から読むので、文面を直したら再実行するだけでよい。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'voice');
const ENGINE = process.env.VOICEVOX_URL || 'http://127.0.0.1:50021';
const VOICE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/voice.json'), 'utf8'));

// --- セリフを集める（アプリと同じ定義をそのまま使う） ---
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const data = html.slice(html.indexOf('var BGM='), html.indexOf('/* ===================== HELPERS'));
const ctx = {};
vm.runInNewContext(data + ';this.BGM=BGM;this.DAYS=DAYS;this.LINES=LINES;this.READ=READ;', ctx);
const { BGM, DAYS, LINES, READ } = ctx;

const texts = [];
for (const d of DAYS) {
  texts.push(d.open, ...d.talk);
  for (const m of d.m) texts.push(m.ap, m.os + LINES.mission + m.ms, LINES.next(m.n), LINES.skipTo(m.n));
}
for (const b of Object.values(BGM)) texts.push(LINES.bgm(b.n));
for (const v of Object.values(LINES)) if (typeof v === 'string') texts.push(v);

// アプリの sentences() と同じ区切り方
const split = (t) => (t.match(/[^。！？]+[。！？]*」?/g) || []).map((s) => s.trim()).filter(Boolean);
const reading = (s) => READ.reduce((a, r) => a.replace(r[0], r[1]), s);
const all = [...new Set(texts.flatMap(split))];

// --- 録音 ---
async function synth(text, file) {
  const q = await (await fetch(`${ENGINE}/audio_query?speaker=${VOICE.speaker}&text=${encodeURIComponent(text)}`, { method: 'POST' })).json();
  Object.assign(q, VOICE.params, { outputSamplingRate: 24000 });
  const r = await fetch(`${ENGINE}/synthesis?speaker=${VOICE.speaker}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q),
  });
  if (!r.ok) throw new Error(`synthesis failed: ${r.status} ${text}`);
  const wav = file.replace(/\.m4a$/, '.wav');
  fs.writeFileSync(wav, Buffer.from(await r.arrayBuffer()));
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '48000', wav, file]);
  fs.unlinkSync(wav);
}

fs.mkdirSync(OUT, { recursive: true });
const index = {};
const tag = JSON.stringify(VOICE);
let made = 0;
for (const s of all) {
  const id = crypto.createHash('sha1').update(tag + '\n' + reading(s)).digest('hex').slice(0, 12);
  const file = path.join(OUT, id + '.m4a');
  if (!fs.existsSync(file)) { await synth(reading(s), file); made++; }
  index[s] = id + '.m4a';
}
// iOS で最初のタップのうちに再生を許可させるための無音
const silence = path.join(OUT, 'silence.m4a');
if (!fs.existsSync(silence)) {
  const wav = silence.replace('.m4a', '.wav');
  const n = 2400, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(24000, 24); b.writeUInt32LE(48000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(wav, b);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '48000', wav, silence]);
  fs.unlinkSync(wav);
}
// 使わなくなった録音を消す
const keep = new Set([...Object.values(index), 'silence.m4a', 'index.json']);
for (const f of fs.readdirSync(OUT)) if (!keep.has(f)) fs.unlinkSync(path.join(OUT, f));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 0));
console.log(`セリフ ${all.length} 文（新しく録音 ${made} 文）`);
