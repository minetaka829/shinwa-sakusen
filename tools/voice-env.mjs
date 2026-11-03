// 口の動き用に、司令の声の大きさを1秒25コマで記録する → voice/env.json（{ファイル名: "0347..."}）
// 使い方: node tools/voice-env.mjs   （声を録り直したら、続けて実行する）
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const dir = new URL('../voice/', import.meta.url).pathname;
const idx = JSON.parse(fs.readFileSync(dir + 'index.json'));
const files = [...new Set(Object.values(idx.boss))];
const tmp = path.join(os.tmpdir(), 'env-' + process.pid + '.wav');
const out = {};
for (const f of files) {
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@8000', '-c', '1', dir + f, tmp]);
  const b = fs.readFileSync(tmp);
  let o = 12; while (o < b.length - 8 && b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
  const n = b.readUInt32LE(o + 4) / 2, s0 = o + 8, step = 320; // 8000Hz ÷ 25
  const rms = [];
  for (let k = 0; k * step < n; k++) {
    let sum = 0, c = 0;
    for (let i = k * step; i < Math.min(n, (k + 1) * step); i++) { const v = b.readInt16LE(s0 + i * 2) / 32768; sum += v * v; c++; }
    rms.push(Math.sqrt(sum / Math.max(1, c)));
  }
  const top = [...rms].sort((a, z) => a - z)[Math.floor(rms.length * 0.95)] || 1;
  out[f] = rms.map((v) => Math.min(9, Math.round(9 * Math.pow(v / top, 0.8)))).join('');
}
fs.unlinkSync(tmp);
fs.writeFileSync(dir + 'env.json', JSON.stringify(out));
console.log('記録した声', files.length, '本', Math.round(fs.statSync(dir + 'env.json').size / 1024) + 'KB');
