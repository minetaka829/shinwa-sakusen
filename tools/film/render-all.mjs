// 作戦映像をまとめて書き出す（制作用）。tools/film/server.py を 8780 番で動かしてから実行する。
// 使い方: node tools/film/render-all.mjs [ジョブ名...]   （省略すると全部）
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import vm from 'node:vm';
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../../story.js', import.meta.url), 'utf8'), ctx);
const jobs = process.argv.slice(2);
if (!jobs.length) {
  vm.runInContext(fs.readFileSync(new URL('../../site.js', import.meta.url), 'utf8'), ctx);
  ctx.DAYS.forEach((d, di) => d.m.forEach((m, i) => jobs.push(`leg-${di}-${i}`)));
  ctx.DAYS.forEach((d, di) => d.m.forEach((m, i) => { if (ctx.SITE_WALK[m.n]) jobs.push(`site-${di}-${i}`); }));
  jobs.push('day-0', 'day-1', 'day-2', 'trailer-1', 'trailer-2', 'ending');
}
const LOG = new URL('../../film/log.txt', import.meta.url);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof = process.env.FILM_PROFILE || '/tmp/film-profile';
for (const job of jobs) {
  const before = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').length : 0;
  const c = spawn(CHROME, ['--headless=new', '--no-first-run', `--user-data-dir=${prof}`, '--window-size=540,960', '--enable-gpu', '--use-angle=metal',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', `http://127.0.0.1:8780/tools/film/render.html?job=${job}`], { stdio: 'ignore' });
  const t0 = Date.now();
  await new Promise((ok) => {
    const iv = setInterval(() => {
      const s = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').slice(before) : '';
      if (s.includes(`${job} END`) || Date.now() - t0 > 20 * 60000) { clearInterval(iv); ok(); }
    }, 2000);
  });
  c.kill();
  const tail = fs.readFileSync(LOG, 'utf8').slice(before);
  console.log(job, /ERROR/.test(tail) ? 'エラー ' + tail.match(/ERROR.*/)[0] : 'OK', Math.round((Date.now() - t0) / 1000) + '秒');
  await new Promise((ok) => setTimeout(ok, 1500));
}
