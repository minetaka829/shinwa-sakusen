// 模擬走行の記録を、実際に流れた順の台本に起こす（点検用）。
// 使い方: node tools/sim-transcript.mjs <記録.jsonl> > 台本.txt
import fs from 'node:fs';
const log = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const out = [];
let lastWho = null;
for (const x of log) {
  if (x.k === 'phase') { out.push(`\n==================== ${x.t}（${x.clock}）====================`); lastWho = null; }
  else if (x.k === 'leg') { out.push(`\n--- ${x.clock} 走り出し → 次の目的地「${x.t}」（道のり約${x.km}km）---`); lastWho = null; }
  else if (x.k === 'arrive') { out.push(`\n--- ${x.clock} 到着「${x.t}」 ---`); lastWho = null; }
  else if (x.k === 'complete') { out.push(`--- ${x.clock} 任務完了${x.auto ? '（自動）' : ''}「${x.t}」 ---`); lastWho = null; }
  else if (x.k === 'chaos') out.push(`  ＊＊ ${x.clock} 操作: ${x.t}`);
  else if (x.k === 'spotify' && /PUT \/me\/player\/play/.test(x.t)) {
    const b = x.t.replace(/^[^{]*/, ''); let name = '';
    try { const j = JSON.parse(b); name = j.context_uri ? 'ドライブ用プレイリスト' : '曲 ' + j.uris.map((u) => u.split(':').pop()).join(','); } catch (e) { name = b; }
    out.push(`  ♪ ${x.clock} ${name}`);
  } else if (x.k === 'say') {
    const who = x.who === 'enemy' ? 'シコメ（無線）' : '司令';
    const head = who !== lastWho ? `${x.clock} 残り${x.km}km ${who}：` : '    ';
    out.push(head + x.t); lastWho = who;
  } else if (x.k === 'error') out.push(`  !! エラー ${x.t}`);
}
console.log(out.join('\n'));
