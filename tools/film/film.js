// 3D 映像の書き出し（制作用）。地形（AWS の標高タイル）に国土地理院の航空写真を貼り、カメラを1コマずつ動かして mp4 にする。
// 1コマごとにタイルが読み終わるのを待つので、実時間より遅くても映像はなめらかになる。
var W = 540, H = 960, FPS = 30;
var q = new URLSearchParams(location.search), JOB = q.get('job');

function log(t) { fetch('/log', { method: 'POST', body: JOB + ' ' + t + '\n' }); }
window.onerror = function (m, s, l) { log('ERROR ' + m + ' @' + l); };

/* ---------- 地図 ---------- */
var map = new maplibregl.Map({
  container: 'map', interactive: false, fadeDuration: 0, pixelRatio: 1, attributionControl: false,
  canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
  center: [133, 35.3], zoom: 9, maxPitch: 80,
  style: {
    version: 8,
    sources: {
      photo: { type: 'raster', tiles: ['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'], tileSize: 256, maxzoom: 18 },
      dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14 },
      shade: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14 },
      done: { type: 'geojson', data: line([]) },
      live: { type: 'geojson', data: line([]) },
      pts: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
    },
    layers: [
      { id: 'photo', type: 'raster', source: 'photo', paint: { 'raster-saturation': -0.35, 'raster-contrast': 0.15, 'raster-brightness-max': 0.8 } },
      { id: 'shade', type: 'hillshade', source: 'shade', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#06121c' } },
      { id: 'done', type: 'line', source: 'done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffb020', 'line-width': 3, 'line-opacity': 0.55 } },
      { id: 'glow', type: 'line', source: 'live', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ff3b30', 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.7 } },
      { id: 'live', type: 'line', source: 'live', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffe2d6', 'line-width': 3.5 } },
      { id: 'pts', type: 'circle', source: 'pts', paint: { 'circle-radius': 6, 'circle-color': '#ff3b30', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-pitch-alignment': 'map' } }
    ],
    terrain: { source: 'dem', exaggeration: 1.6 },
    sky: { 'sky-color': '#081521', 'horizon-color': '#4a6680', 'fog-color': '#1d2c3a', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35, 'atmosphere-blend': 0 }
  }
});
function line(c) { return { type: 'Feature', geometry: { type: 'LineString', coordinates: c.length > 1 ? c : [[0, 0], [0, 0]] } }; }
function idle() {
  return new Promise(function (ok) {
    var done = false, tm = setTimeout(fin, 15000);
    function fin() { if (done) return; done = true; clearTimeout(tm); ok(); }
    map.once('idle', fin); map.triggerRepaint();
  });
}

/* ---------- 計算 ---------- */
function hav(a, b) { var R = 6371000, r = Math.PI / 180, x = Math.sin((b[0] - a[0]) * r / 2), y = Math.sin((b[1] - a[1]) * r / 2); return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a[0] * r) * Math.cos(b[0] * r) * y * y)); }
function brg(a, b) { var r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r), x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r); return Math.atan2(y, x) / r; }
function ease(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }
function ramp(t, a, b) { return ease((t - a) / (b - a)); }
function lerp(a, b, w) { return a + (b - a) * w; }
function lerpAng(a, b, w) { var d = ((b - a + 540) % 360) - 180; return a + d * w; }
function mix(A, B, w) { return { center: [lerp(A.center[0], B.center[0], w), lerp(A.center[1], B.center[1], w)], zoom: lerp(A.zoom, B.zoom, w), pitch: lerp(A.pitch, B.pitch, w), bearing: lerpAng(A.bearing, B.bearing, w) }; }
// 経路（[lat,lng] の列）を、距離で引けるようにする
function track(path) {
  var cum = [0];
  for (var i = 1; i < path.length; i++) cum.push(cum[i - 1] + hav(path[i - 1], path[i]));
  var L = cum[cum.length - 1];
  function at(s) {
    s = Math.min(L, Math.max(0, s));
    var lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    var f = cum[hi] > cum[lo] ? (s - cum[lo]) / (cum[hi] - cum[lo]) : 0;
    return [lerp(path[lo][0], path[hi][0], f), lerp(path[lo][1], path[hi][1], f)];
  }
  function upto(s) { var out = []; for (var i = 0; i < path.length && cum[i] <= s; i++) out.push([path[i][1], path[i][0]]); var e = at(s); out.push([e[1], e[0]]); return out; }
  // 進む向き: 少し先の点をいくつか平均して、カーブでカメラが振れすぎないようにする
  function heading(s, ahead) {
    var x = 0, y = 0, p = at(s);
    for (var k = 1; k <= 6; k++) { var b = brg(p, at(s + ahead * k / 6)) * Math.PI / 180; x += Math.cos(b); y += Math.sin(b); }
    return Math.atan2(y, x) * 180 / Math.PI;
  }
  return { L: L, at: at, upto: upto, heading: heading };
}

/* ---------- 画面の文字（作戦画面ふう） ---------- */
var out = document.createElement('canvas'); out.width = W; out.height = H;
var g = out.getContext('2d');
var FONT = '"Hiragino Kaku Gothic ProN","Hiragino Sans",sans-serif', MONO = 'Menlo,monospace';
var RED = '#ff3b30', AMBER = '#ffb020';
function txt(s, x, y, size, col, opt) {
  opt = opt || {};
  g.font = (opt.w || 600) + ' ' + size + 'px ' + (opt.mono ? MONO : FONT);
  g.fillStyle = col; g.textAlign = opt.align || 'left'; g.textBaseline = 'alphabetic';
  g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 6; g.fillText(s, x, y); g.shadowBlur = 0;
}
function typed(s, t, cps) { return s.slice(0, Math.max(0, Math.floor(t * cps))); }
function frameDeco(t) {
  // 色調（青みがかった夕方ふう）と周辺減光
  g.fillStyle = 'rgba(10,40,70,.18)'; g.fillRect(0, 0, W, H);
  var v = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
  // 走査線
  g.fillStyle = 'rgba(255,255,255,.035)'; for (var y = (t * 40) % 4; y < H; y += 4) g.fillRect(0, y, W, 1);
  // 四隅の枠
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; var m = 18, k = 34;
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(function (c) {
    g.beginPath(); g.moveTo(c[0], c[1] + k * c[3]); g.lineTo(c[0], c[1]); g.lineTo(c[0] + k * c[2], c[1]); g.stroke();
  });
  // 点滅する REC と時刻
  if (Math.floor(t * 2) % 2 === 0) { g.fillStyle = RED; g.beginPath(); g.arc(W - 96, 44, 6, 0, 7); g.fill(); }
  txt('REC', W - 84, 50, 15, '#fff', { mono: true });
}
function reticle(p, r, a, col) {
  g.save(); g.translate(p.x, p.y); g.rotate(a); g.strokeStyle = col; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  for (var k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(r - 8, 0); g.lineTo(r + 12, 0); g.stroke(); }
  g.restore();
}
function coordStr(c) { return 'N ' + c[1].toFixed(4) + '  E ' + c[0].toFixed(4); }

/* ---------- 書き出し ---------- */
async function record(name, T, draw) {
  // 確認用: &shots=1,8,17 なら、その秒のコマだけ画像で保存して終わる
  if (q.get('shots')) {
    for (const sec of q.get('shots').split(',').map(Number)) {
      await draw(sec);
      const b = await new Promise(function (ok) { out.toBlob(ok, 'image/jpeg', 0.85); });
      await fetch('/out/' + name + '-' + sec + 's.jpg', { method: 'POST', body: b });
    }
    return log('DONE shots');
  }
  var muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H }, fastStart: 'in-memory' });
  var enc = new VideoEncoder({ output: function (c, m) { muxer.addVideoChunk(c, m); }, error: function (e) { log('ERROR enc ' + e.message); } });
  enc.configure({ codec: 'avc1.4d0028', width: W, height: H, bitrate: 1500000, framerate: FPS });
  var N = Math.round(T * FPS), t0 = performance.now();
  for (var i = 0; i < N; i++) {
    var t = i / FPS;
    await draw(t);
    var f = new VideoFrame(out, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(f, { keyFrame: i % (FPS * 2) === 0 }); f.close();
    if (enc.encodeQueueSize > 8) await new Promise(function (r) { setTimeout(r, 20); });
    if (i % 90 === 0) log(i + '/' + N + ' ' + Math.round((performance.now() - t0) / 1000) + 's');
  }
  await enc.flush(); muxer.finalize();
  await fetch('/out/' + name + '.mp4', { method: 'POST', body: muxer.target.buffer });
  log('DONE ' + name + ' ' + Math.round((performance.now() - t0) / 1000) + 's');
}

/* ---------- 区間の飛行映像: 全体を見せる → 道に沿って飛ぶ → 目的地を回る ---------- */
async function legFilm(d, i) {
  var ROUTES = await (await fetch('../sim-routes.json')).json();
  var r = ROUTES[d][i], m = DAYS[d].m[i], tr = track(r.path), dest = [m.ll[1], m.ll[0]];
  var T = 18, A1 = 2.6, A2 = 3.8, C1 = 13.2, C2 = 14.6;
  var bounds = r.path.reduce(function (b, p) { return b.extend([p[1], p[0]]); }, new maplibregl.LngLatBounds([r.path[0][1], r.path[0][0]], [r.path[0][1], r.path[0][0]]));
  var b0 = brg(r.path[0], m.ll);
  var ov = map.cameraForBounds(bounds, { padding: { top: 220, bottom: 260, left: 60, right: 60 }, bearing: b0 });
  var over = { center: [ov.center.lng, ov.center.lat], zoom: ov.zoom - 0.3, pitch: 40, bearing: b0 };
  var fz = r.km > 60 ? 11.6 : r.km > 25 ? 12.3 : 13.2, ahead = Math.max(1500, r.km * 60);
  var orbit0 = tr.heading(tr.L - ahead, ahead);
  map.getSource('pts').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: dest } }] });
  var nv = NAV[d + '-' + i] || r; // 距離と時間は Google マップの値（site.js）
  var total = Math.round(nv.km) + 'km', mins = nv.min >= 60 ? Math.floor(nv.min / 60) + '時間' + (nv.min % 60 ? nv.min % 60 + '分' : '') : nv.min + '分';
  var label = (d + 1) + '-' + (i + 1);
  await record('leg-' + d + '-' + i, T, async function (t) {
    // 線: 最初の2.4秒で全体が伸び、そのあとは走った分が明るい
    var s = t < A1 ? tr.L * ease(t / (A1 - 0.2)) : tr.L * ease((t - A1) / (C1 - A1 + 0.6));
    map.getSource('done').setData(line(tr.upto(t < A1 ? s : tr.L)));
    map.getSource('live').setData(line(tr.upto(s)));
    var A = Object.assign({}, over, { bearing: over.bearing + t * 2 });
    var sp = Math.min(tr.L, tr.L * ease((t - A2 + 0.4) / (C1 - A2 + 0.4)));
    var p = tr.at(sp), B = { center: [p[1], p[0]], zoom: fz, pitch: 62, bearing: tr.heading(sp, ahead) };
    var C = { center: dest, zoom: 15.3, pitch: 58, bearing: orbit0 + (t - C1) * 12 };
    var cam = t < A2 ? mix(A, B, ramp(t, A1, A2)) : t < C2 ? mix(B, C, ramp(t, C1, C2)) : C;
    map.jumpTo(cam);
    await idle();
    g.drawImage(map.getCanvas(), 0, 0, W, H);
    frameDeco(t);
    txt('OPERATION 神話の国', 34, 54, 14, AMBER, { mono: false, w: 700 });
    txt('作戦区域 ' + label, 34, 78, 14, '#fff', { w: 500 });
    if (t > 0.3) txt(typed('目標：' + m.n, t - 0.3, 14), 34, 128, m.n.length > 14 ? 22 : 28, '#fff', { w: 800 });
    txt('距離 ' + total + '　所要 約' + mins, 34, H - 92, 18, '#fff', { w: 700 });
    txt(coordStr(cam.center), 34, H - 60, 14, 'rgba(255,255,255,.8)', { mono: true });
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(34, H - 44, W - 68, 3);
    g.fillStyle = RED; g.fillRect(34, H - 44, (W - 68) * Math.min(1, sp / tr.L), 3);
    if (t > C1) {
      var pp = map.project(dest), w = ramp(t, C1, C2 + 0.6);
      reticle(pp, lerp(90, 34, w), t * 0.8, w > 0.98 ? RED : '#fff');
      if (t > C2 + 0.8) { g.fillStyle = 'rgba(255,59,48,.9)'; g.fillRect(W / 2 - 110, H / 2 + 150, 220, 44); txt('TARGET LOCKED', W / 2, H / 2 + 180, 20, '#fff', { mono: true, align: 'center', w: 700 }); }
    }
  });
}

/* ---------- 現地偵察: 駐車場から、歩く順に見どころを回る（SITE_WALK は site.js） ---------- */
async function siteFilm(d, i) {
  var m = DAYS[d].m[i], w = SITE_WALK[m.n]; if (!w) return log('ERROR 地点データなし ' + m.n);
  var pts = (w.park ? [['駐車場', '車はここに停める', w.park]] : []).concat(w.pts), n = pts.length, seg = 3.4, T = 3 + n * seg + 1.5;
  var ll = pts.map(function (p) { return [p[2][1], p[2][0]]; });
  map.getSource('done').setData(line(ll));
  map.setPaintProperty('done', 'line-dasharray', [1.5, 1.5]); map.setPaintProperty('done', 'line-color', '#ffffff'); map.setPaintProperty('done', 'line-width', 3);
  map.getSource('pts').setData({ type: 'FeatureCollection', features: ll.map(function (c) { return { type: 'Feature', geometry: { type: 'Point', coordinates: c } }; }) });
  var b = ll.reduce(function (bb, c) { return bb.extend(c); }, new maplibregl.LngLatBounds(ll[0], ll[0]));
  var ov = map.cameraForBounds(b, { padding: { top: 260, bottom: 300, left: 70, right: 70 } });
  var over = { center: [ov.center.lng, ov.center.lat], zoom: Math.min(17, ov.zoom), pitch: 50, bearing: 0 };
  function camAt(k, u) { var c = ll[Math.min(n - 1, k)]; return { center: c, zoom: Math.min(18, over.zoom + 1.2), pitch: 58, bearing: k * 40 + u * 6 }; }
  await record('site-' + d + '-' + i, T, async function (t) {
    var k = Math.floor((t - 3) / seg), u = (t - 3) - k * seg, cam;
    if (t < 3) cam = Object.assign({}, over, { bearing: t * 4 });
    else if (k >= n) cam = mix(camAt(n - 1, seg), over, ramp(t, 3 + n * seg, T));
    else cam = u < 1 ? mix(k ? camAt(k - 1, seg) : over, camAt(k, 0), ease(u)) : camAt(k, u);
    map.getSource('live').setData(line(ll.slice(0, Math.max(1, Math.min(n, k + 1)))));
    map.jumpTo(cam); await idle();
    g.drawImage(map.getCanvas(), 0, 0, W, H); frameDeco(t);
    txt('現地偵察', 34, 54, 14, AMBER, { w: 700 });
    txt(m.n, 34, 88, m.n.length > 12 ? 20 : 26, '#fff', { w: 800 });
    var lb = w.label || (w.min ? '歩いて 約' + w.min + '分' : ''); if (lb) txt(lb, 34, 116, 15, 'rgba(255,255,255,.85)', { w: 600 });
    // 番号つきの印
    ll.forEach(function (c, j) { var p = map.project(c); g.fillStyle = j <= k ? RED : 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(p.x, p.y - 22, 13, 0, 7); g.fill(); txt(String(w.park ? (j ? j : 'P') : j + 1), p.x, p.y - 16, 15, '#fff', { align: 'center', w: 800 }); });
    if (t >= 3 && k < n) {
      var P = pts[k]; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(24, H - 150, W - 48, 96);
      txt((w.park ? (k ? k + '. ' : '') : (k + 1) + '. ') + P[0], 40, H - 114, 22, '#fff', { w: 800 });
      txt(P[1], 40, H - 78, 15, 'rgba(255,255,255,.9)', { w: 600 });
      if (u > 0.6) reticle(map.project(ll[k]), 30, t, '#fff');
    }
  });
}

/* ---------- 一日のふりかえり: その日の全行程を上空から飛ぶ。任務地を通る秒を day-d.json に書く ---------- */
async function dayFilm(d) {
  var ROUTES = await (await fetch('../sim-routes.json')).json();
  var path = [], ends = [];
  ROUTES[d].forEach(function (l) { path = path.concat(l.path); ends.push(path.length - 1); });
  var tr = track(path), T = 32, A1 = 2.5, B2 = 29;
  var cum = [0]; for (var k = 1; k < path.length; k++) cum.push(cum[k - 1] + hav(path[k - 1], path[k]));
  var at = ends.map(function (e) { return cum[e]; });
  map.getSource('done').setData(line(tr.upto(tr.L)));
  map.getSource('pts').setData({ type: 'FeatureCollection', features: DAYS[d].m.map(function (m) { return { type: 'Feature', geometry: { type: 'Point', coordinates: [m.ll[1], m.ll[0]] } }; }) });
  var bounds = path.reduce(function (b, p) { return b.extend([p[1], p[0]]); }, new maplibregl.LngLatBounds([path[0][1], path[0][0]], [path[0][1], path[0][0]]));
  var ov = map.cameraForBounds(bounds, { padding: { top: 200, bottom: 220, left: 50, right: 50 } });
  var over = { center: [ov.center.lng, ov.center.lat], zoom: ov.zoom, pitch: 35, bearing: 0 };
  // 区間ごとに同じ時間を割り当てる（長い高速道路に時間をとられないように）
  var n = at.length, st = [0].concat(at.slice(0, -1)), slice = (B2 - A1) / n;
  var sAt = function (t) { var u = Math.min(n - 1e-6, Math.max(0, (t - A1) / slice)), k = Math.floor(u); return st[k] + (at[k] - st[k]) * ease(u - k); };
  // 任務地を通る秒（カメラが真上に来る時刻）
  var times = at.map(function (a) { for (var t = A1; t < B2; t += 1 / FPS) if (sAt(t) >= a - 1) return +t.toFixed(2); return B2; });
  await fetch('/out/day-' + d + '.json', { method: 'POST', body: JSON.stringify({ at: times, T: T }) });
  await record('day-' + d, T, async function (t) {
    var sp = sAt(t), p = tr.at(sp);
    map.getSource('live').setData(line(tr.upto(sp)));
    var B = { center: [p[1], p[0]], zoom: 11.2, pitch: 55, bearing: tr.heading(sp, 4000) };
    var cam = t < A1 + 1 ? mix(over, B, ramp(t, 0.6, A1 + 1)) : t > B2 - 1 ? mix(B, over, ramp(t, B2 - 1, T - 0.5)) : B;
    map.jumpTo(cam); await idle();
    g.drawImage(map.getCanvas(), 0, 0, W, H); frameDeco(t);
    txt('作戦記録', 34, 54, 14, AMBER, { w: 700 });
    txt(DAYS[d].label + '　' + DAYS[d].chap, 34, 84, 20, '#fff', { w: 800 });
    var k = at.filter(function (a) { return a <= sp + 1; }).length;
    if (k > 0 && k <= DAYS[d].m.length) txt('任務 ' + k + '　' + DAYS[d].m[k - 1].n, 34, H - 92, 17, '#fff', { w: 700 });
    txt(coordStr(cam.center), 34, H - 60, 14, 'rgba(255,255,255,.8)', { mono: true });
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(34, H - 44, W - 68, 3);
    g.fillStyle = RED; g.fillRect(34, H - 44, (W - 68) * Math.min(1, sp / tr.L), 3);
  });
}

/* ---------- 次の日の予告編: 行き先をいくつか、名前の一部を黒塗りにして見せる ---------- */
async function trailerFilm(d) {
  var ms = DAYS[d].m.filter(function (m) { return !m.lunch && !m.dinner && !(m.final && d < 2); }).slice(0, 4);
  var T = 4 + ms.length * 4 + 4;
  map.getSource('pts').setData({ type: 'FeatureCollection', features: ms.map(function (m) { return { type: 'Feature', geometry: { type: 'Point', coordinates: [m.ll[1], m.ll[0]] } }; }) });
  await record('trailer-' + d, T, async function (t) {
    var k = Math.floor((t - 4) / 4), u = (t - 4) - k * 4;
    if (t < 4 || k >= ms.length) {
      // 黒い画面に文字だけ（最初と最後）
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H); frameDeco(t);
      if (t < 4) { txt(typed('NEXT OPERATION', t, 9), W / 2, H / 2 - 20, 30, RED, { mono: true, align: 'center', w: 700 }); if (t > 1.8) txt('明日の作戦', W / 2, H / 2 + 26, 20, '#fff', { align: 'center' }); }
      else { var e = t - 4 - ms.length * 4; txt(DAYS[d].label, W / 2, H / 2 - 30, 20, AMBER, { align: 'center', w: 700 }); if (e > 0.6) txt(DAYS[d].chap, W / 2, H / 2 + 20, 30, '#fff', { align: 'center', w: 800 }); if (e > 2) txt('作戦開始まで、休め。', W / 2, H / 2 + 80, 16, 'rgba(255,255,255,.8)', { align: 'center' }); }
      return;
    }
    var m = ms[k], c = [m.ll[1], m.ll[0]];
    map.jumpTo({ center: c, zoom: 13.6 + u * 0.25, pitch: 62, bearing: k * 70 + u * 9 }); await idle();
    g.drawImage(map.getCanvas(), 0, 0, W, H); frameDeco(t);
    // 場面の切りかわりに一瞬ノイズ
    if (u < 0.25) { for (var y = 0; y < H; y += 6) { g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.25) + ')'; g.fillRect(0, y, W, 3); } }
    txt('目標 0' + (k + 1), 34, 64, 16, RED, { mono: true, w: 700 });
    // 名前は1文字目だけ見せて、残りは黒塗り
    txt(m.n[0], 34, 104, 26, '#fff', { w: 800 });
    var bw = Math.min(W - 100, (m.n.length - 1) * 24); g.fillStyle = '#000'; g.fillRect(64, 80, bw, 32); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1; g.strokeRect(64.5, 80.5, bw, 32);
    reticle(map.project(c), 40, t, '#fff');
    txt(coordStr(c), 34, H - 60, 14, 'rgba(255,255,255,.8)', { mono: true });
  });
}

/* ---------- エンディング: 3日間の全経路が島根の上に描かれていく ---------- */
async function endingFilm() {
  var ROUTES = await (await fetch('../sim-routes.json')).json();
  var path = []; ROUTES.forEach(function (dd) { dd.forEach(function (l) { path = path.concat(l.path); }); });
  var tr = track(path), T = 36;
  map.getSource('pts').setData({ type: 'FeatureCollection', features: [].concat.apply([], DAYS.map(function (dd) { return dd.m.map(function (m) { return { type: 'Feature', geometry: { type: 'Point', coordinates: [m.ll[1], m.ll[0]] } }; }); })) });
  var bounds = path.reduce(function (b, p) { return b.extend([p[1], p[0]]); }, new maplibregl.LngLatBounds([path[0][1], path[0][0]], [path[0][1], path[0][0]]));
  var ov = map.cameraForBounds(bounds, { padding: { top: 160, bottom: 200, left: 30, right: 30 } });
  await record('ending', T, async function (t) {
    var sp = tr.L * ease(t / 28);
    map.getSource('live').setData(line(tr.upto(sp)));
    map.jumpTo({ center: [ov.center.lng, ov.center.lat], zoom: ov.zoom + 0.15 * Math.sin(t / 6), pitch: 30 + t * 0.6, bearing: -10 + t * 1.2 }); await idle();
    g.drawImage(map.getCanvas(), 0, 0, W, H); frameDeco(t);
    txt('作戦名：神話の国', 34, 64, 24, '#fff', { w: 800 });
    txt('全行程の記録', 34, 94, 14, AMBER, { w: 700 });
    if (t > 29) { g.fillStyle = 'rgba(0,0,0,' + Math.min(0.75, (t - 29) / 3) + ')'; g.fillRect(0, 0, W, H); txt('作戦完了', W / 2, H / 2, 40, '#fff', { align: 'center', w: 800 }); }
  });
}

/* ---------- プロローグの幕開け: 日本全体から島根へ降り、3日間の土地の上を飛んで、作戦名 ---------- */
async function prologueFilm() {
  var ROUTES = await (await fetch('../sim-routes.json')).json();
  var all = []; ROUTES.forEach(function (dd) { dd.forEach(function (l) { all = all.concat(l.path); }); });
  map.getSource('done').setData(line(all.filter(function (_, k) { return k % 3 === 0; }).map(function (p) { return [p[1], p[0]]; })));
  map.setPaintProperty('done', 'line-opacity', 0.35);
  // 飛ぶ順の目印（地名は出さない）: 奥出雲 → 黄泉比良坂 → 松江 → 出雲大社 → 日御碕 → 石見銀山
  var tour = [[35.17, 133.06], [35.30, 133.10], [35.43, 133.16], [35.47, 133.05], [35.42, 132.85], [35.40, 132.69], [35.43, 132.63], [35.25, 132.55], [35.11, 132.45]];
  var tr = track(tour), T = 46, A = 6, B = 13, C = 36;
  var japan = { center: [137.5, 36.8], zoom: 4.3, pitch: 0, bearing: 0 }, shimane = { center: [132.85, 35.28], zoom: 8.8, pitch: 45, bearing: 0 };
  await record('prologue', T, async function (t) {
    var cam;
    if (t < A) cam = Object.assign({}, japan, { zoom: 4.3 + t * 0.05 });
    else if (t < B) { var w = ease((t - A) / (B - A)); cam = { center: [lerp(japan.center[0], shimane.center[0], w), lerp(japan.center[1], shimane.center[1], w)], zoom: lerp(4.6, shimane.zoom, w * w), pitch: lerp(0, 45, w), bearing: lerp(0, -10, w) }; }
    else if (t < C) {
      var u = ease((t - B) / (C - B)), sp = tr.L * u, p = tr.at(sp), F = { center: [p[1], p[0]], zoom: 11.6, pitch: 66, bearing: tr.heading(sp, 9000) };
      var into = Object.assign({}, shimane, { bearing: -10 });
      cam = t < B + 2.5 ? mix(into, F, ease((t - B) / 2.5)) : F;
    } else { var e = ease((t - C) / 6); var p2 = tr.at(tr.L); cam = mix({ center: [p2[1], p2[0]], zoom: 11.6, pitch: 66, bearing: tr.heading(tr.L - 1, 9000) }, { center: [132.85, 35.3], zoom: 9.0, pitch: 30, bearing: 15 }, e); }
    map.jumpTo(cam); await idle();
    g.drawImage(map.getCanvas(), 0, 0, W, H); frameDeco(t);
    if (t < A) { txt(typed('TOP SECRET', t - 0.5, 10), W / 2, 120, 26, RED, { mono: true, align: 'center', w: 700 }); if (t > 2.2) txt('別班　作戦記録', W / 2, 160, 16, '#fff', { align: 'center' }); }
    if (t > A && t < C) txt(coordStr(cam.center), 34, H - 60, 14, 'rgba(255,255,255,.8)', { mono: true });
    if (t > C + 2) {
      var k = Math.min(1, (t - C - 2) / 1.5); g.fillStyle = 'rgba(0,0,0,' + 0.55 * k + ')'; g.fillRect(0, 0, W, H);
      txt('作戦名', W / 2, H / 2 - 40, 20, AMBER, { align: 'center', w: 700 });
      txt('神話の国', W / 2, H / 2 + 20, 52, '#fff', { align: 'center', w: 800 });
      if (t > C + 4.5) txt('OPERATION SHINWA', W / 2, H / 2 + 64, 14, 'rgba(255,255,255,.7)', { mono: true, align: 'center' });
    }
  });
}

map.on('load', async function () {
  log('load');
  try {
    var m = JOB.match(/^leg-(\d)-(\d)$/);
    if (m) await legFilm(+m[1], +m[2]);
    var k = JOB.match(/^(day|trailer)-(\d)$/);
    if (k) await (k[1] === 'day' ? dayFilm : trailerFilm)(+k[2]);
    if (JOB === 'ending') await endingFilm();
    if (JOB === 'prologue') await prologueFilm();
    var st = JOB.match(/^site-(\d)-(\d)$/);
    if (st) await siteFilm(+st[1], +st[2]);
  } catch (e) { log('ERROR ' + e.message); }
  log('END');
});
