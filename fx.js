/* 作戦名：神話の国 — 画面の演出（空の色・敵の割り込み・目標確保・作戦映像と標的ファイル）。
   映像は film/ にある mp4（tools/film で書き出したもの）。一覧は film/index.json。 */

/* ===================== 空の色（日の出・日の入りから） ===================== */
// その日の日の出・日の入り（分。0時から）。島根あたりの緯度経度で、誤差は数分
function sunMinutes(date){
  var lat=35.3, lng=132.8, r=Math.PI/180;
  var n=Math.floor((Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())-Date.UTC(date.getFullYear(),0,0))/864e5);
  var g=2*Math.PI/365*(n-1);
  var eq=229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
  var dec=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
  var ha=Math.acos(Math.cos(90.833*r)/(Math.cos(lat*r)*Math.cos(dec))-Math.tan(lat*r)*Math.tan(dec))/r;
  var noon=720-4*lng-eq+540; // 日本時間
  return {rise:noon-4*ha, set:noon+4*ha};
}
function skyPhase(d){
  var s=sunMinutes(d), m=d.getHours()*60+d.getMinutes();
  if(m<s.rise-40||m>s.set+45) return 'night';
  if(m<s.rise+40) return 'dawn';
  if(m>s.set) return 'dusk';
  if(m>s.set-70) return 'gold';
  return 'day';
}
function applySky(){ $('console').dataset.sky=skyPhase(new Date()); }
setInterval(applySky,60000);

/* ===================== 敵の割り込み ===================== */
// setWho（app.js）から呼ばれる。割り込みの始まりだけ、画面が一瞬強く乱れる
var enemyOn=false;
function enemyScreen(on){
  var c=$('console'); if(on===enemyOn) return; enemyOn=on;
  c.classList.toggle('enemyOn',on);
  if(on && window.BossGL) BossGL.act('startle');
  if(on && !moving()){ c.classList.remove('hijack'); void c.offsetWidth; c.classList.add('hijack'); }
}

/* ===================== 目標確保（到着） ===================== */
function lockOn(name){
  if(window.BossGL) BossGL.act('hop');
  var w=$('lock'); $('lockName').textContent=name;
  w.hidden=false; w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
  clearTimeout(lockOn.t); lockOn.t=setTimeout(function(){ w.hidden=true; },2900);
}

/* ===================== 作戦映像と標的ファイル ===================== */
var FILM={films:[],legs:{}}, filmUrl=null, filmFast=0, filmKind=null;
fetch('film/index.json').then(function(r){return r.json();}).then(function(j){FILM=j;}).catch(function(){});
function hasFilm(n){ return FILM.films.indexOf(n)>=0; }
function filmSeen(k){ return ST.talk['film-'+k]; }
// 走っている間は映像も絵も出さない（スマホは運転する人の前のホルダーにある）。
// 「止まっている」= 新しい GPS の位置があって、4秒以上ほぼ動いていない。位置が分からないときは止まっているとみなさない
var calmSince=null;
function gpsFresh(){ return demo ? !!pos : !!(pos && lastFix && Date.now()-lastFix.t<20000); }
function stopped(){ return gpsFresh() && calmSince && Date.now()-calmSince>4000; }
function moving(){ return !!pos && speed>3; }
setInterval(function(){ calmSince = gpsFresh() && speed<1.5 ? (calmSince||Date.now()) : null; },1000);
function hm(t){ var d=new Date(t); return d.getHours()+':'+('0'+d.getMinutes()).slice(-2); }
// 次の目的地の標的ファイル: 距離・到着予定・その場所の注意（営業時間など）
function targetFile(d,i){
  var m=DAYS[d].m[i], L=NAV[d+'-'+i]||{}, info=(window.SITE_INFO||{})[m.n]||{}, rows=[];
  rows.push(['目標',m.n]);
  rows.push(['座標','N '+m.ll[0].toFixed(4)+'　E '+m.ll[1].toFixed(4)]);
  if(L.km) rows.push(['距離','約'+Math.round(L.km)+'km　所要 約'+(L.min>=60?Math.floor(L.min/60)+'時間'+(L.min%60?L.min%60+'分':''):L.min+'分')]);
  if(L.min) rows.push(['到着予定',hm(Date.now()+L.min*60000)+'ごろ']);
  if(window.siteClosed&&siteClosed(m.n,new Date())) rows.push(['注意','今日は休みの日']);
  if(info.hours) rows.push(['営業',info.hours]);
  if(info.note) rows.push(['注意',info.note]);
  if(m.ms) rows.push(['任務',m.ms]);
  return rows;
}
function showFilm(kind,name,title,rows,opt){
  var box=$('film'), v=$('filmV'); opt=opt||{};
  v.onended=opt.onEnded||null; v.ontimeupdate=opt.onTime||null; $('filmPop').hidden=true;
  filmKind=kind; $('filmTtl').textContent=title;
  $('filmFile').innerHTML=(rows||[]).map(function(r,k){ return '<div class="row" style="animation-delay:'+(0.6+k*0.35)+'s"><span>'+escapeHtml(r[0])+'</span><b>'+escapeHtml(r[1])+'</b></div>'; }).join('');
  v.hidden=true; v.controls=false; box.hidden=false; filmFast=0; var my=++showFilm.n;
  $('filmNav').hidden=kind!=='leg'; if(kind==='leg') $('filmNav').href=navUrl(day,idx);
  if(!name || !hasFilm(name)) return;
  // 映像は保存済みのものを blob にして流す（iPhone は Service Worker 経由の動画を途中から読めないため）
  caches.open(FILM_CACHE).then(function(c){ return c.match('film/'+name+'.mp4'); })
    .then(function(r){ return r||fetch('film/'+name+'.mp4'); })
    .then(function(r){ return r.ok?r.blob():null; })
    .then(function(b){
      if(!b||box.hidden||my!==showFilm.n) return;
      if(filmUrl) URL.revokeObjectURL(filmUrl);
      filmUrl=URL.createObjectURL(b); v.src=filmUrl; v.hidden=false; v.currentTime=0;
      v.play().catch(function(){ v.controls=true; }); // 低電力モードなどで自動再生できないときは、再生ボタンを出す
    }).catch(function(){});
}
showFilm.n=0;
function closeFilm(){
  reelUrls.forEach(function(u){ URL.revokeObjectURL(u); }); reelUrls=[]; clearTimeout(dayReel.t);
  var v=$('filmV'); $('film').hidden=true; v.pause(); v.removeAttribute('src'); v.load();
  if(filmUrl){ URL.revokeObjectURL(filmUrl); filmUrl=null; }
  filmKind=null;
}
// 走り出したら閉じる（3秒続けて動いていたら）。絵も同じ
setInterval(function(){
  filmFast = moving() ? filmFast+1 : 0;
  if(filmFast>=3){ if(!$('film').hidden) closeFilm(); if(!$('art').hidden) hideArt(); }
},1000);
// 自動で出すのは、止まっているときだけ。出せる場面になったら、その場で出す
setInterval(function(){
  if(!running || !stopped() || !$('film').hidden || !$('art').hidden || !$('lock').hidden) return;
  var now=Date.now(), k=key(idx);
  if(phase==='drive' && now-((ST.legAt||{})[k]||0)<15*60000) legFilm(day,idx);
  else if(phase==='onsite' && now-((ST.at||{})[k]||0)<20*60000) siteFilm(day,idx);
  else if(phase==='end' && (isHeard('recap'+day)||pending['recap'+day])) dayReel(day);
},2000);
// 区間の始まり: 飛行映像＋標的ファイル（止まっているときだけ。一度見たら自動では出さない）
function legFilm(d,i,force){
  var k='leg-'+d+'-'+i;
  if(!force && (filmSeen(k) || !stopped())) return;
  if(!force && !hasFilm(k)) return;
  ST.talk['film-'+k]=1; save();
  showFilm('leg',k,'作戦区域 '+(d+1)+'-'+(i+1),targetFile(d,i));
}
// 現地に着いた: 歩く順路の映像（駐車場 → 見どころ）
function siteFilm(d,i,force){
  var k='site-'+d+'-'+i;
  if(!force && (filmSeen(k) || !hasFilm(k) || !stopped())) return;
  ST.talk['film-'+k]=1; save();
  var w=(window.SITE_WALK||{})[DAYS[d].m[i].n]||{pts:[]};
  showFilm('site',k,'現地偵察：'+DAYS[d].m[i].n,w.pts.map(function(p,n){ return [String(n+1),p[0]+'　'+p[1]]; }));
}
var reelUrls=[];
// 一日のふりかえり: その日の全行程の映像に、任務地を通る瞬間その場所の写真を重ねる。終わったら次の日の予告編
function dayReel(d,force){
  var k='day-'+d;
  if(!hasFilm(k) || (!force && (filmSeen(k) || !stopped()))) return;
  ST.talk['film-'+k]=1; save();
  allPhotos().then(function(ps){
    var mine=ps.filter(function(p){ return p.day===d; }), at=((FILM.days||{})[d]||{}).at||[], shown={};
    var done=DAYS[d].m.filter(function(m,i){ return ST.done[d+'-'+i] && !(ST.skipped||{})[d+'-'+i]; }).length;
    showFilm('day',k,'作戦記録　'+DAYS[d].label,[['任務',done+' / '+DAYS[d].m.length+' 完了'],['走行','約'+Math.round((ST.km[d]||0)/1000)+'km'],['写真',mine.length+'枚']],{
      onTime:function(){
        var t=this.currentTime;
        at.forEach(function(s,i){
          if(shown[i] || t<s-0.2) return; shown[i]=1;
          var p=mine.filter(function(x){ return x.i===i; })[0]; if(!p) return;
          var u=URL.createObjectURL(p.blob); reelUrls.push(u);
          $('filmPopImg').src=u; $('filmPopCap').textContent=DAYS[d].m[i].n; $('filmPop').hidden=false;
          clearTimeout(dayReel.t); dayReel.t=setTimeout(function(){ $('filmPop').hidden=true; },2300);
        });
      },
      onEnded:function(){
        if(d<DAYS.length-1 && hasFilm('trailer-'+(d+1))) setTimeout(function(){ if(!$('film').hidden) showFilm('trailer','trailer-'+(d+1),'次の作戦',[]); },1500);
      }
    });
  });
}
// メニューの「作戦映像」: いまの場面の映像をもう一度
function replayFilm(){
  if(phase==='end' && hasFilm('day-'+day)) dayReel(day,true);
  else if(phase==='onsite' && hasFilm('site-'+day+'-'+idx)) siteFilm(day,idx,true); else legFilm(day,idx,true);
}
// エンディングの後ろで、3日間の全経路の映像を流す
function endingFilm(){
  var v=$('endV'); if(!hasFilm('ending')) return;
  caches.open(FILM_CACHE).then(function(c){ return c.match('film/ending.mp4'); }).then(function(r){ return r||fetch('film/ending.mp4'); })
    .then(function(r){ return r.ok?r.blob():null; }).then(function(b){ if(!b||$('ending').hidden) return; if(v.src&&v.src.indexOf('blob:')===0) URL.revokeObjectURL(v.src); v.src=URL.createObjectURL(b); v.hidden=false; v.play().catch(function(){}); }).catch(function(){});
}

/* ===================== ナビ開始（止まっているときだけ出す） ===================== */
setInterval(function(){
  var b=$('navBtn'); if(!b) return;
  // 区間の始めは止まったらすぐ。途中は30秒以上止まっているとき（休憩など）だけ出す。信号待ちのたびに出ないように
  var fresh15=Date.now()-((ST.legAt||{})[key(idx)]||0)<15*60000, rest=calmSince&&Date.now()-calmSince>30000;
  var show=running && phase==='drive' && (!pos || (fresh15?stopped():rest)) && (!pos || hav(pos,M().ll)>1000);
  if(show) b.href=navUrl(day,idx);
  b.hidden=!show;
},1000);

/* ===================== 映像を端末に保存する ===================== */
var FILM_CACHE='mythops-film';
function cacheFilms(cb){
  if(!('caches' in window)) return cb&&cb(0,0);
  fetch('film/index.json',{cache:'no-cache'}).then(function(r){return r.json();}).then(function(j){
    FILM=j; var list=j.films, done=0;
    return caches.open(FILM_CACHE).then(function(c){
      var k=0;
      function next(){
        if(k>=list.length) return cb&&cb(done,list.length);
        var u='film/'+list[k++]+'.mp4';
        c.match(u).then(function(hit){
          if(hit){ done++; cb&&cb(done,list.length,true); return next(); }
          fetch(u).then(function(r){ return r.ok?c.put(u,r):null; }).then(function(){ done++; cb&&cb(done,list.length,true); next(); }).catch(next);
        });
      }
      next();
    });
  }).catch(function(){ cb&&cb(0,0); });
}

/* ===================== 出発前の準備点検 ===================== */
// 家の Wi-Fi で、前の晩までに一度開いておく画面。自動で確かめられるものは確かめ、残りは自分で印をつける
var READY_MANUAL=[
  ['gmap','Google マップのアプリを入れて、CarPlay で映ることを確かめた'],
  ['back','「ナビ開始」でナビが始まったら、iPhone の画面はこのアプリに戻す（車の画面は Google マップのまま。戻さないと司令が話せない）'],
  ['lock','設定 → 画面表示と明るさ → 自動ロック を「なし」にした（走行中に画面が消えると、司令が止まる）'],
  ['book','宿と食事の予約をした（予約の一覧は Claude から渡されたもの）'],
  ['tire','冬用タイヤ（またはチェーン）を用意した'],
  ['volume','マナーモードを切り、音量を上げた']
];
function readyRow(id,label,state,note,btn){
  return '<li class="rd '+(state||'')+'" id="rd-'+id+'"><span class="mk">'+(state==='ok'?'OK':state==='ng'?'要対応':'確認中')+'</span><div><b>'+escapeHtml(label)+'</b>'+
    (note?'<small>'+escapeHtml(note)+'</small>':'')+(btn?'<button data-act="'+id+'">'+escapeHtml(btn)+'</button>':'')+'</div></li>';
}
function setRow(id,label,state,note,btn){ var e=$('rd-'+id); if(e) e.outerHTML=readyRow(id,label,state,note,btn); }
openReady.n=0;
function openReady(){
  ST.ready=ST.ready||{};
  $('readyList').innerHTML=[
    readyRow('voice','司令の声を保存'),readyRow('film','作戦映像を保存'),readyRow('keep','保存した声と映像を消されないようにする'),
    readyRow('geo','位置情報'),readyRow('sp','Spotify'),readyRow('wake','走行中も画面を消さない'),
    '<li class="rd man"><b>実際に鳴らして確かめる（物語の中身は出ません）</b></li>',
    readyRow('tvoice','司令の声が鳴るか','','','鳴らす'),readyRow('tmix','Spotify の曲と声が同時に聞こえるか','','Spotify と連携してから','曲と声を鳴らす'),
    readyRow('tfilm','作戦映像が再生できるか','','','再生する'),readyRow('tboss','司令の絵の動きがなめらかか','','別のページで、ボタンを押して動きを見る','確かめる')
  ].join('')+READY_MANUAL.map(function(x){
    return '<li class="rd man"><label><input type="checkbox" data-k="'+x[0]+'"'+(ST.ready[x[0]]?' checked':'')+'><b>'+escapeHtml(x[1])+'</b></label></li>';
  }).join('');
  $('ready').hidden=false;
  // 声: app.js の保存の進み具合をそのまま見せる
  var my=++openReady.n;
  (function voice(){ if($('ready').hidden||my!==openReady.n) return; var t=$('offline').textContent, ok=/保存ずみ/.test(t); setRow('voice','司令の声を保存',ok?'ok':'',t.replace('オフライン用の声：','')); if(!ok) setTimeout(voice,1500); })();
  cacheFilms(function(n,all){ setRow('film','作戦映像を保存',all&&n>=all?'ok':'',all?n+' / '+all+' 本':'映像はまだありません'); });
  if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().then(function(p){
    navigator.storage.estimate().then(function(e){ setRow('keep','保存した声と映像を消されないようにする',p?'ok':'ng',(p?'許可されました':'許可されませんでした。ホーム画面のアイコンから開くと許可されやすくなります')+'（使用 '+Math.round((e.usage||0)/1048576)+'MB）'); });
  }); else setRow('keep','保存した声と映像を消されないようにする','ng','この端末では確かめられません');
  navigator.geolocation.getCurrentPosition(function(p){ setRow('geo','位置情報','ok','精度 約'+Math.round(p.coords.accuracy)+'m'); },
    function(){ setRow('geo','位置情報','ng','許可されていません。設定 → Safari（またはホーム画面のアプリ）→ 位置情報 を「使用中のみ許可」に'); },{timeout:15000});
  if(!spReady()) setRow('sp','Spotify','ng','まだ連携していません','連携する');
  else spDevice(true).then(function(id){ setRow('sp','Spotify',id?'ok':'ng',id?'つながりました':'Spotify のアプリを一度開いて、何か再生してから戻ってください','もう一度確かめる'); });
  setRow('wake','走行中も画面を消さない','wakeLock' in navigator?'ok':'ng',('wakeLock' in navigator?'使えます。ただし iOS 18.4 より前のホーム画面アプリでは効かないことがあります。':'この iPhone では使えません。')+'念のため、設定 → 画面表示と明るさ → 自動ロック を「なし」に');
}
// 実機での確認: 声を1文鳴らして、最後まで再生できたか（聞こえたかは本人が印をつける）
function testVoice(id,label){
  var f=(VOICE.boss||{})['こちらヤマタ司令。']; if(!f){ setRow(id,label,'ng','声の一覧が読めていません'); return; }
  unlockAudio && unlockAudio();
  clip(f).then(function(u){
    var t0=performance.now(); player.onended=function(){ setRow(id,label,'ok','最後まで再生できました（'+((performance.now()-t0)/1000).toFixed(1)+'秒）。聞こえなければ、音量とマナーモードを確かめてください','もう一度'); };
    player.onerror=function(){ setRow(id,label,'ng','再生できませんでした','もう一度'); };
    player.src=u; return player.play();
  }).catch(function(e){ setRow(id,label,'ng','再生が止められました（'+(e&&e.name||'')+'）','もう一度'); });
}
// 作戦映像を1本、数秒だけ流してみる
function testFilm(){
  var L='作戦映像が再生できるか', v=$('filmV');
  showFilm('test','leg-0-0','再生の確認',[['確認','数秒で閉じます']]);
  var t0=Date.now(), w=setInterval(function(){
    if(v.currentTime>1){ clearInterval(w); closeFilm(); setRow('tfilm',L,'ok','再生できました','もう一度'); }
    else if(Date.now()-t0>12000){ clearInterval(w); closeFilm(); setRow('tfilm',L,'ng',v.controls?'自動で再生されませんでした（低電力モードだと止まります。映像の再生ボタンで見られます）':'再生できませんでした','もう一度'); }
  },300);
}
// 結果を文字でまとめてコピー（物語の中身は含まない）
function copyReady(){
  var txt=[].slice.call(document.querySelectorAll('#readyList .rd')).map(function(li){ return li.innerText.replace(/\n+/g,' / '); }).join('\n');
  txt+='\n端末: '+navigator.userAgent+'\n画面: '+screen.width+'×'+screen.height+' 表示中 '+innerWidth+'×'+innerHeight+(navigator.standalone?'（ホーム画面のアプリ）':'（Safari）');
  (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(function(){ $('readyCopy').textContent='コピーしました'; }).catch(function(){ prompt('この文を選んでコピーしてください',txt); });
}
$('readyBtn').onclick=openReady;
$('readyCopy').onclick=copyReady;
$('readyClose').onclick=function(){ $('ready').hidden=true; };
$('readyList').onclick=function(e){
  var a=e.target.getAttribute('data-act'); if(a==='sp') spReady()?openReady():spLogin();
  if(a==='tvoice') testVoice('tvoice','司令の声が鳴るか');
  if(a==='tmix'){ if(!spReady()){ setRow('tmix','Spotify の曲と声が同時に聞こえるか','ng','先に Spotify と連携してください','曲と声を鳴らす'); return; } cue('start'); setRow('tmix','Spotify の曲と声が同時に聞こえるか','','曲を流しています。3秒後に司令が話します'); setTimeout(function(){ testVoice('tmix','Spotify の曲と声が同時に聞こえるか'); },3500); }
  if(a==='tfilm') testFilm();
  if(a==='tboss') location.href='boss-preview.html';
  if(a==='copy') copyReady();
  var k=e.target.getAttribute('data-k'); if(k){ ST.ready=ST.ready||{}; ST.ready[k]=e.target.checked; save(); }
};

/* ===================== 作戦資料（物語の場面で画面に出す絵） ===================== */
// 物語の一節に art:'orochi' があると、その間だけ出る（app.js の fx:'art:…'）
var ART={
  // 古い絵ふうのオロチ。頭は8つ（数えられるよう、はっきり離して描く）
  orochi:function(){
    var heads='', necks='', n=8;
    for(var k=0;k<n;k++){
      var a=-160+k*(140/(n-1)), r=a*Math.PI/180, len=k%2?150:118;
      var hx=200+Math.cos(r)*len*1.05, hy=300+Math.sin(r)*len*1.15, cx=200+Math.cos(r)*55+(k%2?14:-14), cy=300+Math.sin(r)*70;
      necks+='<path d="M200 300 Q'+cx.toFixed(0)+' '+cy.toFixed(0)+' '+hx.toFixed(0)+' '+hy.toFixed(0)+'" stroke="#2C2A26" stroke-width="15" fill="none" stroke-linecap="round"/>'+
             '<path d="M200 300 Q'+cx.toFixed(0)+' '+cy.toFixed(0)+' '+hx.toFixed(0)+' '+hy.toFixed(0)+'" stroke="#8C3B2E" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="3 6"/>';
      var dir=hx<200?-1:1, rot=(a+90)*0.35;
      heads+='<g transform="translate('+hx.toFixed(0)+' '+hy.toFixed(0)+') rotate('+rot.toFixed(0)+') scale('+dir+' 1)">'+
        '<path d="M-12 6 Q-14 -14 6 -16 Q26 -14 30 -2 Q24 8 6 9 Z" fill="#3B2F25" stroke="#1B1611" stroke-width="2"/>'+
        '<path d="M28 -1 L40 -4 M28 1 L40 4" stroke="#C0392B" stroke-width="2.5" stroke-linecap="round"/>'+
        '<circle cx="8" cy="-7" r="3.6" fill="#E8B83A"/><circle cx="8.6" cy="-7" r="1.5" fill="#1B1611"/></g>';
    }
    return '<svg viewBox="0 0 400 400" role="img" aria-label="八つの頭をもつオロチの古い絵">'+
      '<defs><radialGradient id="paper" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#EFE3C4"/><stop offset="1" stop-color="#C9B48A"/></radialGradient></defs>'+
      '<rect width="400" height="400" rx="10" fill="url(#paper)"/>'+
      // 左上の雲のすみに、白い小さな頭がひとつ、うっすらのぞいている（気づいた人だけが分かる）
      '<g opacity=".9"><path d="M30 92 q12 -22 34 -12 q10 -18 30 -6 q22 -4 22 16 q14 6 4 18 H34 q-14 -4 -4 -16z" fill="#F4ECD8" stroke="#D8C9A6" stroke-width="2"/>'+
      '<g transform="translate(82 98) rotate(-8)"><path d="M-10 4 Q-12 -10 4 -12 Q18 -11 21 -2 Q17 6 4 7 Z" fill="#FBF8F1" stroke="#CDBE9C" stroke-width="1.5"/><circle cx="6" cy="-5" r="1.8" fill="#B8A67E"/></g>'+
      '<path d="M40 104 h76" stroke="#F4ECD8" stroke-width="10" stroke-linecap="round"/></g>'+
      '<g opacity=".35" fill="none" stroke="#7A6A4C" stroke-width="2"><path d="M20 340 Q80 320 140 345 T260 340 T380 335"/><path d="M20 362 Q90 345 160 366 T300 360 T380 358"/></g>'+
      necks+heads+
      '<ellipse cx="200" cy="318" rx="70" ry="30" fill="#2C2A26"/><ellipse cx="200" cy="314" rx="58" ry="20" fill="#5A3A2A"/>'+
      '<path d="M140 330 Q110 360 70 352 M260 330 Q300 362 340 350" stroke="#2C2A26" stroke-width="11" fill="none" stroke-linecap="round"/>'+
      '<text x="372" y="42" font-size="22" fill="#8C3B2E" font-family="serif" writing-mode="vertical-rl" font-weight="700">八岐大蛇之図</text>'+
      '<rect x="22" y="22" width="62" height="24" fill="#B03A2E"/><text x="53" y="40" font-size="14" fill="#F7EAD0" text-anchor="middle" font-weight="900">作戦資料</text>'+
      '</svg>';
  }
};
function showArt(name){ var f=ART[name]; if(!f||moving()) return; $('artBox').innerHTML=f(); $('art').hidden=false; clearTimeout(showArt.t); showArt.t=setTimeout(hideArt,90000); }
function hideArt(){ $('art').hidden=true; }
