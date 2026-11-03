/* 作戦名：神話の国 プロローグ — 動き。
   はじめて開く: 受信 → 幕開け（3D映像＋司令の声）→ 任命式（名前・写真・誓い）→ 身分証 → 出発日
   2回目から: 受信 → 出発までの日数と、その日の指令。記録はこのスマホの中だけ（localStorage）。 */
function $(id){ return document.getElementById(id); }
var KEY='prologue-v1', P=load();
function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'{}')||{}; }catch(e){ return {}; } }
function save(){ try{ localStorage.setItem(KEY,JSON.stringify(P)); }catch(e){} }
function show(id){ ['gate','film','room'].forEach(function(s){ $(s).hidden=s!==id; }); }
function step(id){ ['stName','stPhoto','stOath','stCard','stDate','home'].forEach(function(s){ $(s).hidden=s!==id; }); }

/* ===================== 司令の声 ===================== */
// 声は本編と同じ録音（../voice）。口の動きは声の大きさの記録（../voice/env.json）
var VOICE={}, ENV={}, player=new Audio(), cur=null, playStart=0, speaking=false, gen=0;
var voiceReady=fetch('../voice/index.json').then(function(r){ return r.json(); }).then(function(j){ VOICE=j.boss||{}; }).catch(function(){});
fetch('../voice/env.json').then(function(r){ return r.json(); }).then(function(j){ ENV=j; }).catch(function(){});
player.addEventListener('playing',function(){ playStart=performance.now(); });
function bossMouth(){
  if(!speaking||!cur||player.paused) return 0;
  var e=ENV[cur], pt=player.currentTime>0.05?player.currentTime:(performance.now()-playStart)/1000, k=Math.floor(pt*25);
  return e&&k<e.length?(+e[k])/9:0;
}
// 先に読みこんだ声（ファイル名 → blob の URL）。幕開けは映像と時刻を合わせるので、流す前にまとめて読む
var PRE={};
function preload(texts){ return voiceReady.then(function(){ return preload1(texts); }); }
function preload1(texts){
  var fs=[]; texts.forEach(function(t){ sentences(t).forEach(function(x){ var f=VOICE[x]; if(f&&!PRE[f]&&fs.indexOf(f)<0) fs.push(f); }); });
  return Promise.all(fs.map(function(f){ return fetch('../voice/'+f).then(function(r){ return r.blob(); }).then(function(b){ PRE[f]=URL.createObjectURL(b); }).catch(function(){}); }));
}
// 声は1文（。まで）ごとに録音してある（本編と同じ区切り方）
function sentences(t){ return (String(t||'').match(/[^。！？]+[。！？]*」?/g)||[]).map(function(x){ return x.trim(); }).filter(Boolean); }
// 1文だけ話す。字幕はその1文に切りかえ、声が終わったら次へ
function say1(t,el,my){
  el.textContent=t;
  return new Promise(function(ok){
    var f=VOICE[t], done=false;
    function fin(){ if(done) return; done=true; if(my===gen) speaking=false; ok(my===gen); }
    if(!f){ setTimeout(fin,900+t.length*160); return; }
    cur=f; speaking=true; player.src=PRE[f]||('../voice/'+f);
    player.onended=fin; player.onerror=fin;
    player.onloadedmetadata=function(){ if(isFinite(player.duration)) setTimeout(fin,player.duration*1000+2500); };
    setTimeout(fin,6000+t.length*300); // 止まったときの保険
    player.play().catch(fin);
  });
}
// セリフを話す（1文ずつ）。字幕は el に出す（省略すると司令の吹き出し）
function say(t,el){
  var my=++gen; el=el||$('say');
  return sentences(t).reduce(function(p,x,i){ return p.then(function(go){ if(!go) return false; return (i?new Promise(function(ok){ setTimeout(function(){ ok(my===gen); },180); }):Promise.resolve(true)).then(function(g){ return g&&say1(x,el,my); }); }); },Promise.resolve(true));
}
function sayAll(list,el){ return list.reduce(function(p,t){ return p.then(function(go){ return go===false?false:say(t,el).then(function(g){ return g&&new Promise(function(ok){ setTimeout(function(){ ok(true); },450); }); }); }); },Promise.resolve(true)); }
function hush(){ gen++; speaking=false; player.pause(); }

/* ===================== 幕開け ===================== */
var filmUrl=null;
function playFilm(after){
  show('film'); $('filmCap').textContent='';
  var v=$('filmV'), filmDone=false, talkDone=false, skipped=false;
  function next(){ if(filmDone&&talkDone){ hush(); after(); } }
  v.onended=function(){ filmDone=true; next(); };
  $('skipFilm').onclick=function(){ skipped=true; v.pause(); hush(); filmDone=talkDone=true; next(); };
  $('filmCap').textContent='受信中…';
  Promise.all([filmUrl?Promise.resolve(filmUrl):fetch('../film/prologue.mp4').then(function(r){ return r.blob(); }).then(function(b){ return filmUrl=URL.createObjectURL(b); }), preload(PROLOGUE.open)])
    .then(function(r){ $('filmCap').textContent=''; v.src=r[0]; v.currentTime=0; return v.play(); })
    .catch(function(){ filmDone=true; next(); });
  // 各セリフは、映像の決まった秒になってから始める（読み込みが遅れても映像とずれない）。最後の「任命式を始める」は司令の画面で
  var lines=PROLOGUE.open.slice(0,-1);
  function at(sec){ return new Promise(function(ok){ (function w(){ if(skipped||filmDone||v.currentTime>=sec) ok(); else setTimeout(w,100); })(); }); }
  lines.reduce(function(p,t,i){ return p.then(function(go){ if(go===false||skipped) return false; return at(PROLOGUE.openCue[i]||0).then(function(){ return skipped?false:say(t,$('filmCap')); }); }); },Promise.resolve(true))
    .then(function(){ if(skipped) return; talkDone=true; next(); });
}

/* ===================== 任命式 ===================== */
function room(){ show('room'); }
function startAppoint(){
  room(); step(null);
  say(PROLOGUE.open[PROLOGUE.open.length-1]).then(function(){ step('stName'); $('nameIn').value=P.name||''; say(PROLOGUE.name); });
}
$('nameOk').onclick=function(){
  var n=$('nameIn').value.trim(); if(!n){ $('nameIn').focus(); return; }
  P.name=n; save(); $('nameIn').blur(); step('stPhoto'); say(PROLOGUE.photo);
};
$('photoBtn').onclick=function(){ $('photoIn').click(); };
$('photoSkip').onclick=function(){ P.photo=null; save(); toOath(); };
$('photoIn').onchange=function(){
  var f=this.files&&this.files[0]; this.value=''; if(!f) return;
  var img=new Image(), u=URL.createObjectURL(f);
  img.onload=function(){
    // 真ん中を正方形に切って、小さくして保存する
    var s=Math.min(img.width,img.height), c=document.createElement('canvas'); c.width=c.height=420;
    c.getContext('2d').drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,420,420);
    URL.revokeObjectURL(u); P.photo=c.toDataURL('image/jpeg',0.85); save(); toOath();
  };
  img.src=u;
};
function toOath(){ step('stOath'); $('oathText').textContent=PROLOGUE.oath; $('ring').style.setProperty('--p',0); say(PROLOGUE.oathAsk); }
// 指紋のところを1.6秒押し続けると、誓いが受理される
(function(){
  var t0=0, raf=0, held=false, F=$('finger');
  function tick(){ var p=Math.min(1,(performance.now()-t0)/1600); $('ring').style.setProperty('--p',Math.round(p*100)); if(p>=1){ held=false; sworn(); return; } if(held) raf=requestAnimationFrame(tick); }
  F.addEventListener('pointerdown',function(e){ e.preventDefault(); held=true; t0=performance.now(); tick(); });
  ['pointerup','pointerleave','pointercancel'].forEach(function(ev){ F.addEventListener(ev,function(){ if(!held) return; held=false; cancelAnimationFrame(raf); $('ring').style.setProperty('--p',0); }); });
  F.addEventListener('contextmenu',function(e){ e.preventDefault(); });
  F.addEventListener('touchstart',function(e){ e.preventDefault(); },{passive:false}); // 長押しで虫眼鏡や文字選択が出ないように
})();
function sworn(){
  if(!P.no) P.no=100+Math.floor(Math.random()*900);
  P.appointed=P.appointed||Date.now(); save();
  if(window.BossGL) BossGL.act('bow');
  step(null);
  say(PROLOGUE.appointed).then(function(){ return makeCard(); }).then(function(){ step('stCard'); return say(PROLOGUE.card); });
}

/* ===================== 身分証 ===================== */
var cardBlob=null;
function ymd(t){ var d=new Date(t); return d.getFullYear()+'.'+('0'+(d.getMonth()+1)).slice(-2)+'.'+('0'+d.getDate()).slice(-2); }
function loadImg(src){ return new Promise(function(ok){ var i=new Image(); i.onload=function(){ ok(i); }; i.onerror=function(){ ok(null); }; i.src=src; }); }
function makeCard(){
  // 身分証に使う書体は、描く前に読みこんでおく（読みこまれる前に描くと別の書体になる）
  var fonts=document.fonts?Promise.all(["400 46px 'Dela Gothic One'","900 22px 'Zen Maru Gothic'"].map(function(f){ return document.fonts.load(f,'別班身分証作戦名神話の国司令ヤマタNo.0123456789'); })).catch(function(){}):null;
  return Promise.all([fonts, loadImg(P.photo||'../boss.png')]).then(function(r){
    var img=r[1], W=1000, H=630, c=document.createElement('canvas'); c.width=W; c.height=H;
    var g=c.getContext('2d'), F="'Zen Maru Gothic','Hiragino Sans',sans-serif", D="'Dela Gothic One','Hiragino Sans',sans-serif";
    g.fillStyle='#101826'; g.fillRect(0,0,W,H);
    // 細い斜線の地紋
    g.strokeStyle='rgba(255,255,255,.035)'; g.lineWidth=2; for(var x=-H;x<W;x+=14){ g.beginPath(); g.moveTo(x,H); g.lineTo(x+H,0); g.stroke(); }
    g.fillStyle='#B03A2E'; g.fillRect(0,0,W,92);
    g.fillStyle='#fff'; g.font='400 46px '+D; g.fillText('別班',40,64);
    g.font='900 22px '+F; g.fillText('身分証　作戦名：神話の国',170,58);
    g.font='700 14px ui-monospace,Menlo,monospace'; g.textAlign='right'; g.fillText('TOP SECRET',W-36,56); g.textAlign='left';
    // 写真（なければ司令の絵の顔）
    g.save(); g.beginPath(); g.roundRect?g.roundRect(48,128,300,380,16):g.rect(48,128,300,380); g.clip();
    g.fillStyle='#1E2A3D'; g.fillRect(48,128,300,380);
    if(img){ if(P.photo){ var s=Math.min(img.width,img.height); g.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,48-40,128,380,380); } else g.drawImage(img,170,70,330,418,48,128,300,380); }
    g.restore(); g.strokeStyle='#F0B94A'; g.lineWidth=3; g.strokeRect(48,128,300,380);
    // 文字
    function lbl(t,y){ g.fillStyle='#A9B4C4'; g.font='900 18px '+F; g.fillText(t,400,y); }
    lbl('氏名',160); g.fillStyle='#F1F3F6'; var n=P.name||'', fs=54; g.font='900 '+fs+'px '+F; while(fs>24&&g.measureText(n).width>560){ fs-=2; g.font='900 '+fs+'px '+F; } g.fillText(n,400,222);
    lbl('所属',272); g.fillStyle='#F1F3F6'; g.font='900 26px '+F; g.fillText('別班　島根作戦部隊',400,308);
    lbl('エージェント番号',356); g.fillStyle='#F0B94A'; g.font='400 40px '+D; g.fillText('No. '+P.no,400,402);
    lbl('任命日',448); g.fillStyle='#F1F3F6'; g.font='900 26px '+F; g.fillText(ymd(P.appointed),400,484);
    g.fillStyle='#A9B4C4'; g.font='900 18px '+F; g.fillText('任命者　別班司令　ヤマタ',400,560);
    // 司令の印
    g.save(); g.translate(880,540); g.rotate(-0.15); g.strokeStyle='#E5634B'; g.lineWidth=5; g.beginPath(); g.arc(0,0,54,0,7); g.stroke();
    g.fillStyle='#E5634B'; g.font='400 30px '+D; g.textAlign='center'; g.fillText('司令',0,-2); g.font='900 16px '+F; g.fillText('ヤマタ',0,26); g.restore();
    g.fillStyle='rgba(255,255,255,.4)'; g.font='12px ui-monospace,Menlo,monospace'; g.fillText('OPERATION SHINWA / BEPPAN SPECIAL UNIT / THIS CARD DOES NOT EXIST',48,606);
    return new Promise(function(ok){ c.toBlob(function(b){ cardBlob=b; $('cardImg').src=URL.createObjectURL(b); ok(); },'image/png'); });
  });
}
$('cardSave').onclick=function(){
  if(!cardBlob) return;
  var file=new File([cardBlob],'beppan-card.png',{type:'image/png'});
  if(navigator.canShare&&navigator.canShare({files:[file]})) navigator.share({files:[file],title:'別班 身分証'}).catch(function(){});
  else { var a=document.createElement('a'); a.href=URL.createObjectURL(cardBlob); a.download='beppan-card.png'; a.click(); }
};
$('cardOk').onclick=function(){ if(P.date&&cardReturn) return home(); step('stDate'); $('dateIn').value=P.date||''; say(PROLOGUE.askDate); };
var cardReturn=false;

/* ===================== 出発日と、毎日の指令 ===================== */
$('dateOk').onclick=function(){ var v=$('dateIn').value; if(!v) return; P.date=v; save(); say(PROLOGUE.dateSet).then(function(){ home(true); }); step(null); };
$('dateLater').onclick=function(){ P.date=null; save(); step(null); say(PROLOGUE.noDate).then(function(){ home(true); }); };
function dayNum(s){ var p=s.split('-'); return Math.round(Date.UTC(+p[0],p[1]-1,+p[2])/864e5); }
function todayNum(){ var d=new Date(); return Math.round(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/864e5); }
// 今日の指令: 出発の前日は前夜、当日は当日、それより前は任命した日から1日ひとつ
function order(){
  if(!P.date) return {lbl:'待機中',t:PROLOGUE.noDate,left:null};
  var left=dayNum(P.date)-todayNum();
  if(left<0) return {lbl:'作戦終了',t:PROLOGUE.after,left:left};
  if(left===0) return {lbl:'作戦当日',t:PROLOGUE.day0,left:0};
  if(left===1) return {lbl:'前夜の指令',t:PROLOGUE.eve,left:1};
  var a=new Date(P.appointed), since=Math.max(0,todayNum()-Math.round(Date.UTC(a.getFullYear(),a.getMonth(),a.getDate())/864e5));
  return {lbl:'本日の指令',t:PROLOGUE.daily[since%PROLOGUE.daily.length],left:left,since:since};
}
function home(speakNow){
  room(); step('home'); var o=order();
  $('count').innerHTML=o.left==null?'<span>出発日：未定</span>':o.left>0?'<span>出発まで あと</span><b>'+o.left+'</b><span>日</span>':o.left===0?'<b>作戦当日</b>':'<b>作戦終了</b>';
  $('orderLbl').textContent=o.lbl; $('orderT').textContent=o.t;
  var past=[]; if(o.since) for(var i=Math.max(0,o.since-PROLOGUE.daily.length+1);i<o.since;i++) past.push(PROLOGUE.daily[i%PROLOGUE.daily.length]);
  $('past').hidden=!past.length; $('pastList').innerHTML=past.map(function(t){ return '<li>'+t.replace(/[&<>]/g,'')+'</li>'; }).join('');
  // その日はじめて開いたときは、司令が読み上げる
  var k=todayNum()+':'+o.t.length;
  if(speakNow!==false && P.heard!==k){ P.heard=k; save(); say(o.t); } else $('say').textContent=o.t;
}
$('orderPlay').onclick=function(){ say(order().t); };
$('againFilm').onclick=function(){ hush(); playFilm(function(){ home(false); }); };
$('showCard').onclick=function(){ cardReturn=true; makeCard().then(function(){ step('stCard'); say(PROLOGUE.card); }); };
$('howMain').onclick=function(){ alert('作戦アプリは、ホーム画面の「神話作戦」のアイコンから開いてください。\nまだホーム画面にない場合は、Safari で https://minetaka829.github.io/shinwa-sakusen/ を開き、共有メニューの「ホーム画面に追加」で置いてください。'); };
$('changeDate').onclick=function(){ step('stDate'); $('dateIn').value=P.date||''; say(PROLOGUE.askDate); };

/* ===================== はじめに ===================== */
if(window.BossGL) BossGL.init($('cv'),$('fx'),'../boss.png');
$('gateNote').textContent=P.appointed?'おかえり、'+(P.name||'エージェント')+'。':'';
$('recv').onclick=function(){
  // 声を出せるようにする（iPhone は、押した操作の中で一度鳴らす必要がある）
  player.src='../voice/silence.m4a'; player.play().catch(function(){});
  if(P.appointed) home(); else playFilm(startAppoint);
};
