// film/index.json を作る（制作用）。書き出し済みの映像の一覧と、ふりかえり映像で任務地を通る秒。
// 使い方: node tools/film/index.mjs
import fs from 'node:fs';
const dir = new URL('../../film/', import.meta.url);
const films = fs.readdirSync(dir).filter((f) => f.endsWith('.mp4')).map((f) => f.replace(/\.mp4$/, '')).sort();
const days = {};
for (const f of fs.readdirSync(dir).filter((f) => /^day-\d\.json$/.test(f))) days[f.match(/\d/)[0]] = JSON.parse(fs.readFileSync(new URL(f, dir)));
fs.writeFileSync(new URL('index.json', dir), JSON.stringify({ films, days }));
console.log('映像', films.length, '本');
