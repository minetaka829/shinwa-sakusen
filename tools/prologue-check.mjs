// プロローグが予告したことが、本編にちゃんとあるかを確かめる。
// 本編（story.js / route.js / site.js / index.html）を直したら `node tools/prologue-check.mjs` を流す。
// プロローグは出発前に済ませてしまうので、本編側を変えて約束が消えると、旅の途中で話がつながらなくなる。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['story.js', 'route.js', 'site.js', 'plot.js', 'prologue/script.js']) vm.runInContext(read(f), ctx, { filename: f });
const P = vm.runInContext('PROLOGUE', ctx);
const pro = new Set(vm.runInContext('prologueLines()', ctx));
const all = vm.runInContext('voiceLines()', ctx);
const main = Object.values(all).flat().filter((t) => !pro.has(t)).join('\n');
const voice = JSON.parse(read('voice/index.json')).boss || {};
const split = (t) => (String(t).match(/[^。！？]+[。！？]*」?/g) || []).map((s) => s.trim()).filter(Boolean);

// [プロローグの約束, 本編にあるべきもの]
const promises = [
  ['誓い「' + P.oath + '」', () => main.includes('見て、聞いて、数えて、無事に帰る') && P.oath.includes('見て、聞いて、数えて、無事に帰る')],
  ['「何度も、数えろと命じる」', () => (main.match(/数え/g) || []).length >= 5],
  ['「白いものを見つけたら、声に出して報告」', () => /白い/.test(main)],
  ['「たたらの炉は何日…現地で確かめろ」', () => /炉は何日/.test(main)],
  ['「VIVANT…現地で確かめろ」', () => /VIVANT/.test(main)],
  ['「正体不明の無線が入る」', () => /無線/.test(main)],
  ['「出雲そば・割子そば」', () => /割子/.test(main + read('site.js'))],
  ['「石段と坂」', () => /石段|階段/.test(main) && /坂/.test(main)],
  ['「前夜の指令書を聞け」', () => read('index.html').includes('前夜の指令書')],
  ['「神話作戦のアイコン」', () => JSON.parse(read('manifest.webmanifest')).short_name === '神話作戦'],
];

let bad = 0;
for (const [what, ok] of promises) {
  const pass = ok();
  if (!pass) bad++;
  console.log((pass ? 'OK ' : 'NG ') + what);
}
const missing = [...pro].flatMap(split).filter((s) => !voice[s]);
console.log(missing.length ? 'NG プロローグの声がない文 ' + missing.length + ': ' + missing.slice(0, 5).join(' / ') : 'OK プロローグの声はすべてある');
if (missing.length) bad++;
process.exit(bad ? 1 : 0);
