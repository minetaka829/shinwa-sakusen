// 模擬走行の記録を点検する: 流れなかった話・声の抜け・エラー・曲の指示（点検用）
// 使い方: node tools/sim-check.mjs <記録.jsonl>
import fs from 'node:fs';
import vm from 'node:vm';
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['story.js', 'route.js', 'plot.js']) vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx);
const idx = JSON.parse(fs.readFileSync(new URL('../voice/index.json', import.meta.url), 'utf8'));
const log = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const said = log.filter((x) => x.k === 'say'), saidSet = new Set(said.map((x) => x.t));
const split = (t) => (String(t).match(/[^。！？]+[。！？]*」?/g) || []).map((s) => s.trim()).filter(Boolean);
const first = (p) => split(typeof p === 'string' ? p : (p.t || p.ask))[0];
// 重複の判定は、話の冒頭が短い一言（「フン。」など）だと別の話と区別できないので、最初の長めの文で見る
const firstLong = (p) => split(typeof p === 'string' ? p : [p.t, p.ask].filter(Boolean).join('')).find((x) => x.length >= 8) || first(p);
const out = [];
out.push(`発話 ${said.length}、声のファイルなし ${said.filter((x) => !(idx[x.who] || {})[x.t]).length}、エラー ${log.filter((x) => x.k === 'error').length}`);
log.filter((x) => x.k === 'error').forEach((x) => out.push('  エラー ' + x.t));
const miss = [];
vm.runInContext('LEGTALK', ctx).forEach((d, di) => d.forEach((leg, i) => (leg || []).forEach((p, k) => { if (!saidSet.has(first(p))) miss.push(`${di + 1}日目 to:${i} 区間の語り#${k} ${first(p)}`); })));
for (const n of ['SCENE', 'SECRET', 'ENEMY']) vm.runInContext(n, ctx).forEach((d, di) => d.forEach((x) => { if (!saidSet.has(first(x))) miss.push(`${di + 1}日目 ${n} ${Object.keys(x).filter((k) => /approach|after|arrive|depart/.test(k)).map((k) => k + ':' + x[k]).join(',')} ${first(x)}`); }));
vm.runInContext('ROUTE', ctx).forEach((r, di) => ['road', 'caution', 'hidden', 'detour'].forEach((t) => (r[t] || []).forEach((p) => { const pre = t === 'hidden' ? ctx.LINES.hidden : t === 'detour' ? ctx.LINES.detour : ''; if (!saidSet.has(first(pre + p.t))) miss.push(`${di + 1}日目 ${t} ${p.n}`); })));
out.push(`流れなかったもの ${miss.length}`); miss.forEach((m) => out.push('  ' + m));
// 物語の話は1回だけ流れるはず（同じ話の最初の文が2回以上出たら重複）
const cnt = {}; said.forEach((x) => { cnt[x.t] = (cnt[x.t] || 0) + 1; });
const storyFirsts = [];
vm.runInContext('LEGTALK', ctx).forEach((d) => d.forEach((leg) => (leg || []).forEach((p) => storyFirsts.push(firstLong(p)))));
for (const n of ['SCENE', 'SECRET', 'ENEMY']) vm.runInContext(n, ctx).forEach((d) => d.forEach((x) => storyFirsts.push(firstLong(x))));
const dup = [...new Set(storyFirsts)].filter((t) => t && cnt[t] > 1 && storyFirsts.filter((u) => u === t).length < cnt[t]);
out.push(`2回以上流れた物語 ${dup.length}`); dup.forEach((t) => out.push(`  ${cnt[t]}回 ${t}`));
log.filter((x) => x.k === 'state' || x.k === 'chaos').forEach((x) => out.push(`  ${x.k} ${x.clock} ${x.t}`));
out.push('曲の指示:');
log.filter((x) => x.k === 'spotify' && /PUT \/me\/player\/play/.test(x.t)).forEach((x) => out.push(`  ${x.clock} ${x.t.replace(/spotify:(track|playlist):/g, '').replace(/PUT \/me\/player\/play /, '')}`));
console.log(out.join('\n'));
