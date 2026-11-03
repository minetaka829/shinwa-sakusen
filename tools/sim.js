// 3日間の模擬走行（点検用）。index.html?sim で読み込まれ、時計を早回しして全行程を自動で走る。
// 流れた発話・効果音・曲の指示を順に記録し、tools/sim-server.py へ送る。本番では読み込まれない。
(function () {
  var K = 100; // 時計の速さ（1秒を100秒として進める）
  var RealDate = Date, realNow = performance.now.bind(performance);
  var base = new RealDate('2026-12-05T08:30:00+09:00').getTime(), real0 = realNow();
  function now() { return base + (realNow() - real0) * K; }
  function FakeDate() {
    var a = Array.prototype.slice.call(arguments);
    if (!(this instanceof FakeDate)) return new RealDate(now()).toString();
    return a.length ? new (Function.prototype.bind.apply(RealDate, [null].concat(a)))() : new RealDate(now());
  }
  FakeDate.prototype = RealDate.prototype; FakeDate.now = now; FakeDate.UTC = RealDate.UTC; FakeDate.parse = RealDate.parse;
  window.Date = FakeDate;
  var st = window.setTimeout, si = window.setInterval;
  window.setTimeout = function (f, ms) { return st(f, (ms || 0) / K); };
  window.setInterval = function (f, ms) { return si(f, Math.max(4, (ms || 0) / K)); };
  function setClock(iso) { base = new RealDate(iso).getTime(); real0 = realNow(); }
  function hhmm() { var d = new RealDate(now()); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

  var buf = [];
  function log(o) { o.clock = hhmm(); buf.push(o); }
  function flush() { if (!buf.length) return; var b = buf; buf = []; fetch('/log', { method: 'POST', keepalive: true, body: b.map(function (x) { return JSON.stringify(x); }).join('\n') + '\n' }); }
  si(flush, 2000);
  window.SIM = { log: log, flush: flush };

  window.addEventListener('load', function () {
    var errors = [];
    window.addEventListener('error', function (e) { log({ k: 'error', t: e.message + ' @' + e.lineno }); });
    // 発話: 字幕が変わるたびに記録（話し手・残りkm・状態）
    var lastSay = '';
    new MutationObserver(function () {
      var t = document.getElementById('say').textContent; if (!t || t === lastSay) return; lastSay = t;
      var who = document.getElementById('sub').classList.contains('enemy') ? 'enemy' : 'boss';
      var file = (VOICE[who] || {})[t];
      log({ k: 'say', who: who, t: t, day: day, idx: idx, phase: phase, km: pos ? Math.round(hav(pos, M().ll) / 100) / 10 : null, voice: file ? 1 : 0 });
    }).observe(document.getElementById('say'), { childList: true, characterData: true, subtree: true });
    // 効果音と曲
    var origClip = window.clip;
    window.clip = function (f) { if (/^sfx-/.test(f)) log({ k: 'sfx', t: f }); return origClip(f); };
    window.spReady = function () { return true; };
    window.spApi = function (p, o) {
      log({ k: 'spotify', t: (o && o.method || 'GET') + ' ' + p.replace(/\?.*/, '') + (o && o.body ? ' ' + o.body : '') });
      if (p === '/me/player/devices') return Promise.resolve({ ok: true, status: 200, json: function () { return { devices: [{ id: 'ph', type: 'Smartphone', is_active: true }] }; } });
      if (p.indexOf('currently-playing') >= 0) return Promise.resolve({ ok: true, status: 200, json: function () { return { item: { duration_ms: 200000 }, progress_ms: 2000 }; } });
      if (p === '/me/player') return Promise.resolve({ ok: true, status: 200, json: function () { return { is_playing: true }; } });
      return Promise.resolve({ ok: true, status: 204, json: function () { return {}; } });
    };
    // 到着したら写真を1枚撮ったことにする
    var origArrive = window.arrive;
    window.arrive = function () {
      origArrive.apply(this, arguments); log({ k: 'arrive', t: M().n, day: day, idx: idx });
      var c = document.createElement('canvas'); c.width = 8; c.height = 8;
      c.toBlob(function (b) { addPhoto(b); });
    };
    var origComplete = window.complete;
    window.complete = function (auto) { log({ k: 'complete', t: M().n, day: day, idx: idx, auto: !!auto }); return origComplete.apply(this, arguments); };

    voiceOn = false; // 無音で、文の長さに応じた時間だけ待つ
    // 本番と同じ「本番（GPS）」で走る（進み具合も保存される）。GPS は止めて、こちらで位置を送る。
    navigator.geolocation.watchPosition = function () { return 1; };
    navigator.geolocation.clearWatch = function () {};
    var q = new URLSearchParams(location.search), scenario = q.get('scenario') || 'ideal';
    // 「開き直し」はページを本当に読み込み直す。直前の時計・日にち・車の位置だけをここに覚えておく
    var resume = null; try { resume = JSON.parse(sessionStorage.getItem('simResume') || 'null'); sessionStorage.removeItem('simResume'); } catch (e) {}
    if (resume) { base = resume.now; real0 = realNow(); log({ k: 'chaos', t: 'reloaded' }); }
    else {
      log({ k: 'phase', t: 'scenario ' + scenario });
      try { localStorage.removeItem('mythops-v1'); } catch (e) {}
      ST = fresh({});
    }
    var rnd = (function () { var x = 12345; return function () { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; })();
    var starts = ['2026-12-05T08:30:00+09:00', '2026-12-06T08:45:00+09:00', '2026-12-07T08:30:00+09:00'];
    function runDay(d, again) {
      if (d > 2) {
        log({ k: 'state', t: JSON.stringify({ mute: ST.mute, onsite: ST.onsite }) });
        log({ k: 'phase', t: 'ending' });
        document.getElementById('endBtn').hidden = false; openEnding();
        var w = si(function () { if (!speaking) { clearInterval(w); log({ k: 'phase', t: 'done' }); flush(); } }, 50);
        return;
      }
      if (q.get('days') && q.get('days').indexOf(String(d + 1)) < 0) return runDay(d + 1);
      if (!again) { setClock(starts[d]); log({ k: 'phase', t: 'day' + (d + 1) + ' start' }); }
      document.getElementById('daysel').value = String(d);
      document.getElementById('mReal').click(); document.getElementById('go').click();
      drive(); // 実際の道路に沿って走る
      var quiet = 0;
      var w = si(function () {
        // 夕食で終わる日は、宿に着いたことにして「今夜の報告を聞く」を押す
        if (phase === 'end' && !speaking && !queue.length && !document.getElementById('doneBtn').hidden) { log({ k: 'chaos', t: 'inn: 今夜の報告を聞く' }); document.getElementById('doneBtn').click(); }
        quiet = (phase === 'end' && !speaking && !queue.length) ? quiet + 1 : 0;
        if (quiet > 40) {
          clearInterval(w); log({ k: 'phase', t: 'day' + (d + 1) + ' end' });
          clearInterval(demoTimer); clearInterval(clockTimer); running = false;
          st(function () { document.getElementById('console').hidden = true; document.getElementById('start').hidden = false; runDay(d + 1); }, 200);
        }
      }, 50);
    }
    // 実際の道路（tools/sim-routes.json）に沿って、区間の平均速度の8割で走る。任務地では40分過ごす。
    var ROUTES = null, legKey = resume ? resume.legKey : null, at = 0, stay = resume ? resume.stay : 0, resumeAt = resume ? resume.at : null;
    fetch('tools/sim-routes.json').then(function (r) { return r.json(); }).then(function (j) { ROUTES = j; });
    function drive() {
      demoTimer = setInterval(function () {
        if (!ROUTES) return;
        if (scenario === 'chaos' && rnd() < 0.0003) { // ときどき（1時間に1回くらい）、アプリを閉じてページごと開き直す
          log({ k: 'chaos', t: 'reopen (reload)' });
          clearInterval(demoTimer); stopVoice(); flush(); // アプリを閉じたのと同じく、話の途中でも声はその場で止まる
          sessionStorage.setItem('simResume', JSON.stringify({ now: now(), day: day, legKey: legKey, at: at, pos: pos, stay: stay, seed: rnd() }));
          st(function () { location.reload(); }, 300);
          return;
        }
        if (scenario === 'chaos' && rnd() < 0.0004) { log({ k: 'chaos', t: 'voice off/on' }); document.getElementById('voice').click(); document.getElementById('voice').click(); }
        if (scenario === 'nogps') { // 位置なし: 着いたら押す、話し終えたら完了を押す
          // 着くのは Google の所要時間がたってから（その間、道中の話は時間で流れる）
          var L = NAV[day + '-' + idx], t0 = (ST.legAt || {})[day + '-' + idx];
          if (phase === 'drive' && !speaking && (!L || !t0 || Date.now() - t0 > L.min * 60000)) { stay = 0; document.getElementById('here').click(); }
          else if (phase === 'onsite' && !speaking && ++stay > 60) { stay = 0; document.getElementById('doneBtn').click(); }
          return;
        }
        if (phase === 'onsite') {
          speed = 0.8; if (!speaking) stay++;
          if (stay > 40 * 60) {
            stay = 0;
            if (scenario === 'chaos' && rnd() < 0.5) { log({ k: 'chaos', t: 'double done' }); document.getElementById('doneBtn').click(); }
            document.getElementById('doneBtn').click();
          }
          tick(); return;
        }
        if (scenario === 'skip' && day === 2 && idx === 5 && !window._skipped && ST.done['2-4']) { window._skipped = 1; log({ k: 'chaos', t: 'skip at izumo' }); document.getElementById('skip').click(); }
        if (phase === 'end') { speed = 0; return; }
        var r = ROUTES[day][idx], k = day + '-' + idx;
        if (legKey !== k) { legKey = k; at = 0; resumeAt = null; log({ k: 'leg', t: M().n, km: r.km }); }
        if (resumeAt != null) { at = resumeAt; resumeAt = null; } // 開き直し: 走っていた位置から続ける
        var v = r.km * 1000 / (r.min * 60) * 0.8, left = v; // m/s
        while (left > 0 && at < r.path.length - 1) {
          var seg = hav(r.path[at], r.path[at + 1]);
          if (seg > left) { var f = left / seg; r.path[at] = [r.path[at][0] + (r.path[at + 1][0] - r.path[at][0]) * f, r.path[at][1] + (r.path[at + 1][1] - r.path[at][1]) * f]; left = 0; }
          else { left -= seg; at++; }
        }
        pos = r.path[at].slice();
        if (at >= r.path.length - 1) { speed = 0.5; } else { speed = v; ST.km[day] = (ST.km[day] || 0) + v; }
        trackDriving(Date.now());
        tick();
      }, 1000);
    }
    // 3日目の続き: 前日の終点から始まるよう、デモは前日の最後の地点から出発する
    if (resume) st(function () { var x = resume.seed; rnd = (function () { var y = Math.floor(x * 2147483648); return function () { y = (y * 1103515245 + 12345) % 2147483648; return y / 2147483648; }; })(); runDay(resume.day, true); }, 500);
    else if (/[?&]sim\b/.test(location.search)) st(function () { try { indexedDB.deleteDatabase('mythops'); } catch (e) {} runDay(Number((location.search.match(/day=(\d)/) || [])[1] || 1) - 1); }, 500);
  });
})();
