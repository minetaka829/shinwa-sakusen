// 模擬走行用に、各区間の実際の道路の経路を OSRM から取ってきて tools/sim-routes.json に保存する（点検用）。
import fs from 'node:fs';
import vm from 'node:vm';
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../story.js', import.meta.url), 'utf8'), ctx);
const { DAYS, START_POS } = ctx;
const out = [];
for (let d = 0; d < DAYS.length; d++) {
  let from = d === 0 ? START_POS[0] : DAYS[d - 1].m[DAYS[d - 1].m.length - 1].ll;
  out[d] = [];
  for (const m of DAYS[d].m) {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${m.ll[1]},${m.ll[0]}?overview=full&geometries=geojson`;
    const j = await (await fetch(url)).json();
    const r = j.routes[0];
    out[d].push({ km: Math.round(r.distance / 100) / 10, min: Math.round(r.duration / 60), path: r.geometry.coordinates.map(([lng, lat]) => [+lat.toFixed(5), +lng.toFixed(5)]) });
    console.log(`${d + 1}日目 → ${m.n}: ${(r.distance / 1000).toFixed(1)}km ${Math.round(r.duration / 60)}分`);
    from = m.ll;
    await new Promise((ok) => setTimeout(ok, 1200));
  }
}
fs.writeFileSync(new URL('./sim-routes.json', import.meta.url), JSON.stringify(out));
