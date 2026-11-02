/* 作戦名：神話の国 — アプリの動き。
   データ（セリフ・地点）は story.js / route.js / plot.js にある。 */

/* ===================== HELPERS ===================== */
function $(id){return document.getElementById(id);}
function hav(a,b){var R=6371000,t=Math.PI/180,dLa=(b[0]-a[0])*t,dLo=(b[1]-a[1])*t,x=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(a[0]*t)*Math.cos(b[0]*t)*Math.sin(dLo/2)*Math.sin(dLo/2);return 2*R*Math.asin(Math.sqrt(x));}
// random line, never the same twice in a row
var lastPick={};
function pick(a,k){ var i; do{ i=Math.floor(Math.random()*a.length); }while(a.length>1&&i===lastPick[k]); lastPick[k]=i; return a[i]; }
function escapeHtml(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function load(){try{return JSON.parse(localStorage.getItem('mythops-v1')||'{}')||{};}catch(e){return {};}}
var demoMode=false;
function save(){if(demoMode)return;try{localStorage.setItem('mythops-v1',JSON.stringify(ST));}catch(e){}}
function fresh(s){s.done=s.done||{};s.idx=s.idx||{};s.heard=s.heard||{};s.km=s.km||{};s.talk=s.talk||{};s.gourmet=s.gourmet||{};return s;}
var ST=fresh(load());
function R(d){return (window.ROUTE&&ROUTE[d])||{};}

/* boss (original guide character: a white serpent commander in shades and a headset) */
var BOSS='<defs><radialGradient id="halo" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#26364F"/><stop offset="1" stop-color="#0E1520" stop-opacity="0"/></radialGradient>'+
 '<linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7FBF8"/><stop offset="1" stop-color="#CADBCF"/></linearGradient>'+
 '<clipPath id="lens"><rect x="88" y="80" width="104" height="26" rx="10"/></clipPath></defs>'+
 '<circle cx="120" cy="120" r="116" fill="url(#halo)"/>'+
 '<ellipse cx="124" cy="214" rx="86" ry="14" fill="#05080D" opacity=".55"/>'+
 '<path d="M58 204 C98 222 168 222 196 198 C214 180 212 160 200 150" stroke="#D6E5DA" stroke-width="28" fill="none" stroke-linecap="round"/>'+
 '<path d="M54 196 C40 160 80 146 120 156 C166 168 196 150 186 118" stroke="url(#skin)" stroke-width="34" fill="none" stroke-linecap="round"/>'+
 '<ellipse cx="140" cy="94" rx="64" ry="50" fill="url(#skin)"/>'+
 '<path d="M122 48 l7 -15 l7 15 M146 46 l7 -15 l7 15" stroke="#F0B94A" stroke-width="5" fill="none" stroke-linejoin="round"/>'+
 '<path d="M84 84 C78 54 104 38 134 40" stroke="#141A24" stroke-width="6" fill="none" stroke-linecap="round"/>'+
 '<rect x="72" y="78" width="18" height="30" rx="8" fill="#141A24"/>'+
 '<path d="M80 108 C82 126 94 134 110 134" stroke="#141A24" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="112" cy="134" r="5" fill="#F0B94A"/>'+
 '<rect x="84" y="76" width="112" height="34" rx="14" fill="#141A24"/>'+
 '<rect x="92" y="81" width="42" height="24" rx="9" fill="#2E3D55"/><rect x="146" y="81" width="42" height="24" rx="9" fill="#2E3D55"/>'+
 '<g clip-path="url(#lens)"><g transform="skewX(-20)"><rect class="glint" x="150" y="70" width="9" height="46" fill="#fff"/></g></g>'+
 '<path d="M190 84 C200 80 206 74 208 68" stroke="#141A24" stroke-width="3" fill="none" stroke-linecap="round"/>'+
 '<ellipse class="mouth" style="transform-origin:156px 126px" cx="156" cy="126" rx="14" ry="5" fill="#C2452D"/>';
// gradient/clip ids must be unique per copy (a copy inside a hidden screen breaks the other one)
function boss(p){return BOSS.replace(/id="(\w+)"/g,'id="'+p+'$1"').replace(/url\(#(\w+)\)/g,'url(#'+p+'$1)');}
$('boss').innerHTML=boss('a'); $('bossStart').innerHTML=boss('b');

/* ===================== VOICE =====================
   Every line is pre-recorded with VOICEVOX (voice/*.m4a, listed in voice/index.json:
   {boss:{sentence:file}, enemy:{...}, sfx:{name:file}}).
   The queue holds sentences and sound effects; the sentence on air is the subtitle.
   A sentence with no recording falls back to the phone's own speech engine. */
var voiceOn=true, jaVoice=null, lastLine=null, VOICE={boss:{},enemy:{},sfx:{}};
fetch('voice/index.json').then(function(r){return r.json();}).then(function(j){VOICE=j; saveVoices();}).catch(function(){});
// keep every recording on the phone for places with no signal (the service worker caches each one fetched)
function saveVoices(){
  if(!('caches' in window)) return;
  var files=[]; Object.keys(VOICE).forEach(function(g){ Object.keys(VOICE[g]).forEach(function(k){ var f=VOICE[g][k]; if(files.indexOf(f)<0) files.push(f); }); });
  caches.open('mythops-voice').then(function(c){ return c.keys().then(function(ks){ ks.forEach(function(r){ if(files.indexOf(r.url.split('/voice/')[1])<0) c.delete(r); }); return ks; }); }).then(function(ks){
    var have={}; ks.forEach(function(r){ have[r.url.split('/voice/')[1]]=1; });
    var todo=files.filter(function(f){return !have[f];}), done=files.length-todo.length;
    function show(){ $('offlineStart').textContent=$('offline').textContent=done>=files.length?'オフライン用の声：保存ずみ（'+files.length+'）':'オフライン用の声：保存中 '+done+' / '+files.length; }
    show();
    function worker(){ var f=todo.shift(); if(!f) return Promise.resolve(); return fetch('voice/'+f).then(function(r){ if(r.ok){done++; show();} }).catch(function(){}).then(worker); }
    return Promise.all([worker(),worker(),worker(),worker()]).then(show);
  }).catch(function(){});
}
function pickVoice(){var v=(window.speechSynthesis&&speechSynthesis.getVoices())||[];jaVoice=v.filter(function(x){return /^ja/i.test(x.lang);}).sort(function(a,b){return (b.localService?1:0)-(a.localService?1:0);})[0]||null;}
if(window.speechSynthesis){pickVoice();speechSynthesis.onvoiceschanged=pickVoice;}
try{ if(navigator.audioSession) navigator.audioSession.type='transient'; }catch(e){}
var player=new Audio(); player.preload='auto';
var queue=[], speaking=false, gen=0, gapTimer=null;
// Recordings are loaded as blobs: iOS Safari will not play audio from the offline cache otherwise.
var clips={};
function clip(f){ return clips[f]||(clips[f]=fetch('voice/'+f).then(function(r){ if(!r.ok)throw 0; return r.blob(); }).then(function(b){ return URL.createObjectURL(b); }).catch(function(e){ delete clips[f]; throw e; })); }
function sentences(t){ return (String(t||'').match(/[^。！？]+[。！？]*」?/g)||[]).map(function(s){return s.trim();}).filter(Boolean); }
function reading(s){ READ.forEach(function(r){ s=s.replace(r[0],r[1]); }); return s; }
function fileOf(it){ return it.pause||it.music?null:it.sfx?VOICE.sfx[it.sfx]:(VOICE[it.who]||{})[it.t]; }
function talking(on){ $('bossBox').classList.toggle('talking',on); }
function fitSub(){
  var box=$('say').parentNode, fs=Math.min(28,Math.max(19,window.innerWidth*0.058));
  box.style.setProperty('--subFs',fs+'px');
  while(fs>15 && $('say').scrollHeight>box.clientHeight-30){ fs-=1; box.style.setProperty('--subFs',fs+'px'); }
}
function stopVoice(){ gen++; clearTimeout(gapTimer); queue=[]; speaking=false; player.pause(); if(window.speechSynthesis)speechSynthesis.cancel(); talking(false); }
// items: [{t,who}|{sfx}] ; opts.queue: wait for the current talk instead of cutting in
// drop sound effects that would stack up: radio right before an interrupt, or an interrupt while the enemy is already on air
function tidy(items){
  var out=[], who=null;
  items.forEach(function(it,k){
    if(it.sfx){
      var next=items.slice(k+1).filter(function(x){return x.t;})[0];
      if(it.sfx==='radio' && items[k+1] && items[k+1].sfx==='enemy') return;
      if(it.sfx==='enemy' && who==='enemy' && next && next.who==='enemy') return;
      if(it.sfx==='radio' && who==='enemy' && next && next.who==='enemy') return;
      if(out.length && out[out.length-1].sfx===it.sfx) return;
    } else if(it.t) who=it.who;
    out.push(it);
  });
  return out;
}
function play(items,opts){
  items=tidy(items);
  if(!items.length) return;
  if(!(opts&&opts.queue&&speaking)) stopVoice();
  if(!(opts&&opts.noRepeat)) lastLine=(opts&&opts.queue&&speaking&&lastLine)?lastLine.concat(items):items.slice();
  queue=queue.concat(items);
  if(!speaking) nextItem();
}
function lines(text,who){ return sentences(text).map(function(s){return {t:s,who:who||'boss'};}); }
// a story part: string or {t, ask, ans, wait} (silence after the question so people can answer)
function part(p,who){
  if(typeof p==='string') return lines(p,who);
  var a=lines(p.t,who);
  if(p.ask) a=a.concat(lines(p.ask,who),[{pause:p.wait||6}]);
  return a.concat(lines(p.ans,who));
}
function say(text,opts){
  var items=lines(text,opts&&opts.who);
  if(opts&&opts.sfx) items.unshift({sfx:opts.sfx});
  play(items,opts);
}
function nextItem(){
  var my=++gen, it=queue.shift();
  if(it==null){ speaking=false; talking(false); setWho('boss'); return; }
  speaking=true;
  function after(){ if(my!==gen)return; talking(false); gapTimer=setTimeout(function(){ if(my===gen) nextItem(); },it.sfx?60:280); }
  function silent(){ talking(false); gapTimer=setTimeout(function(){ if(my===gen) nextItem(); },it.sfx?0:Math.max(1800,it.t.length*170)); }
  if(it.pause){ talking(false); gapTimer=setTimeout(function(){ if(my===gen) nextItem(); },voiceOn?it.pause*1000:600); return; }
  if(it.music){ cue(it.music); gapTimer=setTimeout(function(){ if(my===gen) nextItem(); },(it.hold||0)*1000); return; }
  if(!it.sfx){ setWho(it.who); $('say').textContent=it.t; fitSub(); }
  if(!voiceOn) return silent();
  var f=fileOf(it);
  if(f){
    clip(f).then(function(url){
      if(my!==gen) return;
      player.onended=after; player.onerror=after;
      player.src=url; if(!it.sfx) talking(it.who==='boss');
      player.play().catch(function(){ if(my===gen) silent(); });
      if(queue[0]&&fileOf(queue[0])) clip(fileOf(queue[0]));
    }).catch(function(){ if(my===gen) silent(); });
  } else if(!it.sfx && window.speechSynthesis){
    var u=new SpeechSynthesisUtterance(reading(it.t));
    u.lang='ja-JP'; if(jaVoice) u.voice=jaVoice; u.rate=1.02;
    u.onend=u.onerror=after; talking(true); speechSynthesis.speak(u);
  } else silent();
}
function setWho(w){ var e=w==='enemy'; $('sub').classList.toggle('enemy',e); $('who').textContent=e?ENEMY_NAME:'ヤマタ司令'; $('bossBox').classList.toggle('jammed',e); }
window.addEventListener('resize',fitSub);

/* ===================== WAKE LOCK ===================== */
var wake=null;
function chip(id,text,ok){ $(id).textContent=text; $(id).className='chip '+(ok?'on':'off'); refreshWarn(); }
function refreshWarn(){ var w=['cGps','cWake'].filter(function(id){return $(id).classList.contains('off');}).map(function(id){return $(id).textContent;}); $('warn').hidden=!w.length; $('warn').textContent=w.join('・'); }
function keepAwake(){
  if(!('wakeLock' in navigator)){chip('cWake','画面ON 非対応',false);return;}
  navigator.wakeLock.request('screen').then(function(w){wake=w;chip('cWake','画面ON',true);w.addEventListener('release',function(){chip('cWake','画面ON 切れ',false);});}).catch(function(){chip('cWake','画面ON 不可',false);});
}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&running)keepAwake();});

/* ===================== STATE MACHINE ===================== */
var day=0, idx=0, running=false, demo=false;
var pos=null, speed=0, slowSince=null, phase='drive', leftSince=null, spokenAp={}, lastBgm=null, talkOn=true;
function D(){return DAYS[day];}
function M(){return D().m[idx];}
function key(i){return day+'-'+i;}
function heard(k){ if(ST.heard[k]) return true; ST.heard[k]=1; save(); return false; }

function setTarget(i,announce){
  idx=Math.max(0,Math.min(D().m.length-1,i)); ST.idx[day]=idx; save();
  phase='drive'; slowSince=null; leftSince=null;
  $('onsite').hidden=true; $('doneBtn').hidden=true; $('photoBtn').hidden=true;
  $('tName').textContent=M().n;
  $('bgmName').textContent=DRIVE_PLAYLIST.n; $('bgmBtn').href='https://open.spotify.com/playlist/'+DRIVE_PLAYLIST.id;
  renderProgress();
  if(announce) say(LINES.next(M().n));
  updateDist();
}
function fmtDist(m){return m>=1000?{v:(m/1000).toFixed(m>=10000?0:1),u:'km'}:{v:String(Math.round(m/10)*10),u:'m'};}
function updateDist(){
  if(!pos){$('tDist').innerHTML='--<small>km</small>';return;}
  var d=hav(pos,M().ll), f=fmtDist(d);
  $('tDist').innerHTML=f.v+'<small>'+f.u+'</small>';
}
function tick(){
  if(!pos) return;
  var m=M(), d=hav(pos,m.ll), now=Date.now();
  // approach briefing (+ enemy radio planned for this approach)
  var apR=Math.max(2500,m.r*5);
  if(phase==='drive' && d<apR && !spokenAp[key(idx)]){
    spokenAp[key(idx)]=1;
    play([{sfx:'approach'}].concat(replaced('approach',idx)?[]:lines(m.ap), storyItems('approach',idx), [{music:'approach'}]),{queue:true});
  }
  // arrival: inside radius and slow for 12s
  if(phase==='drive' && d<=m.r){
    if(speed<2.5){ if(!slowSince) slowSince=now; if(now-slowSince>12000) arrive(); }
    else slowSince=null;
  } else if(phase==='drive') slowSince=null;
  // leaving after onsite -> auto complete
  if(phase==='onsite' && !m.final){
    if(d>Math.max(700,m.r*2.2) && speed>4){ if(!leftSince) leftSince=now; if(now-leftSince>45000) complete(true); }
    else leftSince=null;
  }
  // just left the previous mission (about 700 m away): the story may continue on the road
  if(phase==='drive' && idx>0 && hav(pos,D().m[idx-1].ll)>700 && !ST.heard['dep'+day+'-'+(idx-1)]){
    heard('dep'+day+'-'+(idx-1)); play(storyItems('depart',idx-1),{queue:true});
  }
  if(phase==='drive') checkPoints(d<apR);
  updateDist();
}
// roadside guide, cautions, hidden missions and detours along the way
function near(p,r0){ return (p.to==null||p.to===idx) && hav(pos,p.ll)<(p.r||r0); }
function checkPoints(nearTarget){
  var r=R(day);
  (r.caution||[]).forEach(function(p,i){ if(near(p,1500) && !heard('c'+day+'-'+i)) say(p.t,{queue:true,sfx:'alert'}); });
  if(nearTarget||muted()) return;
  (r.road||[]).forEach(function(p,i){ if(near(p,1000) && !heard('r'+day+'-'+i)) say(p.t,{queue:true,sfx:'radio'}); });
  (r.hidden||[]).forEach(function(p,i){ if(near(p,800) && !heard('h'+day+'-'+i)) say(LINES.hidden+p.t,{queue:true,sfx:'alert'}); });
  (r.detour||[]).forEach(function(p,i){ if(near(p,3000) && !ST.heard['d'+day+'-'+i] && hasSlack()){ heard('d'+day+'-'+i); say(LINES.detour+p.t,{queue:true,sfx:'radio'}); } });
}
// ahead of schedule: the rest of today still fits before sunset with time to spare
function hasSlack(){
  var ms=D().m, p=pos, mins=0;
  for(var i=idx;i<ms.length;i++){ if(ST.done[key(i)]) continue; mins+=hav(p,ms[i].ll)*1.4/1000/40*60+(ms[i].final?0:40); p=ms[i].ll; }
  var n=new Date(), sun=new Date(n); sun.setHours(16,50,0,0);
  return n.getTime()+(mins+45)*60000<sun.getTime();
}
function arrive(){
  phase='onsite'; slowSince=null; musicStop();
  var m=M(), pose=(POSE[day]||[])[idx];
  $('onsite').hidden=false; $('doneBtn').hidden=false; $('photoBtn').hidden=false;
  $('oName').textContent=m.n;
  $('oViv').hidden=!m.viv; $('oViv').textContent=m.viv||'';
  $('oMission').innerHTML='<b>任務</b>　'+escapeHtml(m.ms)+(pose?'<br><b>撮影</b>　'+escapeHtml(pose):'');
  $('doneBtn').textContent=m.final?'本日の作戦 終了':'任務完了';
  var own=replaced('arrive',idx)?[]:lines(m.os+LINES.mission+m.ms);
  play([{sfx:'radio'}].concat(own, storyItems('arrive',idx), pose&&!muted()?lines(LINES.pose+pose):[]),{queue:true});
}
function complete(auto){
  ST.done[key(idx)]=1; save();
  var st=$('stamp'); st.hidden=false; setTimeout(function(){st.hidden=true;},1500);
  var done=idx, extra=storyItems('after',done);
  if(M().final){ phase='end'; $('doneBtn').hidden=true; $('photoBtn').hidden=true; renderProgress(); recap(extra); return; }
  var next=idx+1;
  setTimeout(function(){
    play([{sfx:'fanfare'}].concat(lines(auto?LINES.autoDone:LINES.done), extra, lines(LINES.next(D().m[next].n)), [{music:'drive'}]));
    setTarget(next,false);
  },300);
}
// a story item can take over the commander's own line at that moment (replace:true)
function replaced(kind,i){ return [SCENE,SECRET,ENEMY].some(function(g){ return (g[day]||[]).some(function(x){ return x[kind]===i && x.replace; }); }); }
// the commander is off the air (mute:true ... unmute:true): no chatter, guides or detours meanwhile
function muted(){ return ST.mute===day; }
// what the story says at a moment: kind 'approach' or 'after', for mission i (each said once)
function storyItems(kind,i){
  var out=[], themed=false;
  // the enemy's theme plays once, before the first time the enemy speaks in this moment
  function theme(x){ if(themed||x.noTheme) return [{sfx:'enemy'}]; themed=true; return [{music:'enemy',hold:7},{sfx:'enemy'}]; }
  [['s',SCENE],['k',SECRET]].forEach(function(g){
    (g[1][day]||[]).forEach(function(x,j){
      if(x[kind]!==i || heard(g[0]+day+'-'+j)) return;
      if(x.mute) ST.mute=day; if(x.unmute) ST.mute=null;
      out=out.concat(x.who==='enemy'?theme(x):[], part(x,x.who), x.who==='enemy'?[{sfx:'radio'}]:[], x.music?[{music:x.music}]:[]);
    });
  });
  (ENEMY[day]||[]).forEach(function(e,j){
    if(e[kind]!==i || heard('e'+day+'-'+j)) return;
    out=out.concat(theme(e),lines(e.t,'enemy'),[{sfx:'radio'}],lines(e.reply));
    var prev='boss';
    (e.more||[]).forEach(function(m){
      if(m.who!==prev) out.push({sfx:m.who==='enemy'?'enemy':'radio'});
      out=out.concat(part(m,m.who)); prev=m.who;
    });
    if(e.music) out.push({music:e.music});
  });
  if(themed && !(out.length && out[out.length-1].music)) out.push({music:'drive'});
  return out;
}
function renderProgress(){
  var ms=D().m, n=0;
  $('prog').innerHTML=ms.map(function(x,i){var c=ST.done[key(i)]?'done':(i===idx?'cur':'');if(ST.done[key(i)])n++;return '<span class="'+c+'"></span>';}).join('');
  $('progLbl').textContent='任務 '+n+' / '+ms.length;
  $('list').innerHTML=ms.map(function(x,i){var c=ST.done[key(i)]?'done':(i===idx?'cur':'');return '<li class="'+c+'"><span class="d"></span><span>'+escapeHtml(x.n)+'</span></li>';}).join('');
  $('dayLbl').textContent=D().label; $('chapLbl').textContent=D().chap; $('dayLbl').style.color=D().col;
  renderGourmet();
}

/* ===================== DAY END: RECAP / ENDING ===================== */
function recap(extra){
  photoCount(day).then(function(np){
    var ms=D().m, n=ms.filter(function(x,i){return ST.done[key(i)];}).length;
    var km=Math.max(10,Math.min(600,Math.round((ST.km[day]||0)/10000)*10));
    var r=RECAP[day]||{};
    var t=LINES.recapHead+LINES.recapKm(km)+LINES.recapDone(Math.min(n,12))+LINES.recapPhoto(np)+(n>=ms.length?LINES.praiseAll:LINES.praise)+[].concat(r.secret||[]).join('')+(r.next||'');
    play([{sfx:'fanfare'}].concat(extra, lines(t)));
    if(day===2) setTimeout(function(){ $('endBtn').hidden=false; },500);
  });
}

/* ===================== GPS ===================== */
var watchId=null, lastFix=null, driveSince=null, stopSince=null;
function onFix(p){
  var c=[p.coords.latitude,p.coords.longitude], t=p.timestamp||Date.now(), acc=p.coords.accuracy||0;
  var sp=p.coords.speed;
  if((sp==null||isNaN(sp)) && lastFix){var dt=(t-lastFix.t)/1000; sp=dt>0?hav(lastFix.c,c)/dt:0;}
  if(lastFix && acc<60){ var seg=hav(lastFix.c,c); if(seg<3000){ ST.km[day]=(ST.km[day]||0)+seg; } }
  speed=sp||0; pos=c; lastFix={c:c,t:t};
  chip('cGps','GPS ±'+Math.round(acc)+'m',true);
  $('geoInfo').textContent='位置情報：精度 約'+Math.round(acc)+'m・速度 '+Math.round(speed*3.6)+'km/h';
  trackDriving(t);
  tick();
}
function onGeoErr(e){ chip('cGps','GPS 不可',false); if(e.code===1) say(LINES.noGeo); }
function startGps(){
  if(!('geolocation' in navigator)){onGeoErr({code:0});return;}
  watchId=navigator.geolocation.watchPosition(onFix,onGeoErr,{enableHighAccuracy:true,maximumAge:2000,timeout:20000});
}
// continuous driving time (a stop of 10 minutes resets it)
function trackDriving(t){
  if(speed>5){ stopSince=null; if(!driveSince) driveSince=t; if(t-driveSince>90*60000){ driveSince=t; say(TIME.longDrive,{queue:true,sfx:'radio'}); } }
  else { if(!stopSince) stopSince=t; if(t-stopSince>10*60000) driveSince=null; }
}

/* ===================== DEMO ===================== */
var demoTimer=null, demoPause=0;
function startDemo(){
  pos=(day===0?START_POS[0]:DAYS[day-1].m[DAYS[day-1].m.length-1].ll).slice();
  $('cMode').hidden=false; chip('cGps','デモ走行',true);
  demoTimer=setInterval(function(){
    if(phase==='onsite'){ speed=0.8; if(!speaking) demoPause+=1; if(demoPause>4){demoPause=0; complete(false);} tick(); return; }
    if(phase==='end'){ speed=0; return; }
    var tgt=M().ll, d=hav(pos,tgt);
    var step=Math.min(d, 700); // fast-forward
    if(d<M().r*0.5){ speed=0.5; tick(); return; }
    if(speaking && d<Math.max(2500,M().r*5)+800){ tick(); return; } // let the story play before arriving
    var f=step/d; pos=[pos[0]+(tgt[0]-pos[0])*f,pos[1]+(tgt[1]-pos[1])*f]; speed=15;
    ST.km[day]=(ST.km[day]||0)+step;
    $('geoInfo').textContent='デモ走行中（実際の位置は使っていません）';
    tick();
  },1000);
}

/* ===================== TALK: myths, trivia, time & weather ===================== */
var talkTimer=null, clockTimer=null, lastTalk=0;
function startTalk(){
  clearInterval(talkTimer); lastTalk=Date.now();
  talkTimer=setInterval(function(){
    if(!talkOn||phase!=='drive'||!pos||speaking||muted()) return;
    if(Date.now()-lastTalk<(demo?12000:6*60000)) return;
    if(hav(pos,M().ll)<Math.max(2500,M().r*5)) return;
    var s=ST.talk[day]||(ST.talk[day]={n:0,myth:0,triv:0});
    var myth=MYTH[day]||[], triv=R(day).trivia||D().talk||[];
    var useMyth=(s.n%2===0 && s.myth<myth.length) || s.triv>=triv.length;
    if(useMyth && s.myth<myth.length){ play([{sfx:'radio'}].concat(part(myth[s.myth++])),{queue:true}); }
    else if(s.triv<triv.length){ say(triv[s.triv++],{queue:true,sfx:'radio'}); }
    else return;
    s.n++; lastTalk=Date.now(); save();
  }, 3000);
}
function startClock(){
  clearInterval(clockTimer);
  function check(){
    if(phase==='end') return;
    var n=new Date(), h=n.getHours()+n.getMinutes()/60;
    if(muted()) return;
    if(h>=12 && h<12.5 && !heard('noon'+day)) say(TIME.noon,{queue:true,sfx:'radio'});
    if(h>=16.9 && h<18 && !heard('sunset'+day)) say(TIME.sunset,{queue:true,sfx:'radio'});
  }
  check(); clockTimer=setInterval(check,60000);
  weather(); setInterval(weather,30*60000);
}
function weather(){
  if(!pos||demo) return;
  fetch('https://api.open-meteo.com/v1/forecast?latitude='+pos[0].toFixed(3)+'&longitude='+pos[1].toFixed(3)+'&current=temperature_2m,weather_code')
    .then(function(r){return r.json();}).then(function(j){
      var c=j.current||{}, w=c.weather_code, t=c.temperature_2m;
      var k=(w>=71&&w<=77)||w===85||w===86?'snow':(w>=51&&w<=67)||(w>=80&&w<=82)?'rain':(t!=null&&t<=0)?'freeze':(w<=1&&new Date().getHours()<11)?'clear':null;
      if(k && !heard('w'+k+day)) say(TIME[k],{queue:true,sfx:'radio'});
    }).catch(function(){});
}

/* ===================== PHOTOS & REPORT ===================== */
var dbp=null;
function db(){ return dbp||(dbp=new Promise(function(ok,ng){ var r=indexedDB.open('mythops',1); r.onupgradeneeded=function(){ r.result.createObjectStore('photos',{keyPath:'id',autoIncrement:true}); }; r.onsuccess=function(){ok(r.result);}; r.onerror=function(){ng(r.error);}; })); }
function allPhotos(){ return db().then(function(d){ return new Promise(function(ok){ var q=d.transaction('photos').objectStore('photos').getAll(); q.onsuccess=function(){ok(q.result||[]);}; q.onerror=function(){ok([]);}; }); }).catch(function(){return [];}); }
function photoCount(d){ return allPhotos().then(function(a){ return a.filter(function(p){return p.day===d;}).length; }); }
function addPhoto(file){
  // shrink to 1600px so the report stays light
  return new Promise(function(ok){
    var img=new Image(), url=URL.createObjectURL(file);
    img.onload=function(){ var s=Math.min(1,1600/Math.max(img.width,img.height)), c=document.createElement('canvas'); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s); c.getContext('2d').drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url); c.toBlob(ok,'image/jpeg',0.85); };
    img.onerror=function(){ ok(file); };
    img.src=url;
  }).then(function(blob){ return db().then(function(d){ return new Promise(function(ok){ var tx=d.transaction('photos','readwrite'); tx.objectStore('photos').add({day:day,i:idx,name:M().n,time:Date.now(),blob:blob}); tx.oncomplete=ok; tx.onerror=ok; }); }); });
}
$('photoBtn').onclick=function(){ $('photoIn').click(); };
$('photoIn').onchange=function(){ var f=this.files&&this.files[0]; this.value=''; if(!f||demoMode&&false) return; addPhoto(f).then(function(){ say(pick(PHOTO_REPLY,'photo'),{queue:true}); }); };

function openReport(){
  allPhotos().then(function(ps){
    var html=DAYS.map(function(d,di){
      var items=d.m.map(function(m,i){
        var mine=ps.filter(function(p){return p.day===di&&p.i===i;});
        var done=ST.done[di+'-'+i];
        return '<li class="'+(done?'done':'')+'"><span class="mk">'+(done?'完了':'—')+'</span><span class="nm">'+escapeHtml(m.n)+'</span>'+
          (mine.length?'<span class="ph">'+mine.map(function(p){return '<img alt="" src="'+URL.createObjectURL(p.blob)+'">';}).join('')+'</span>':'')+'</li>';
      }).join('');
      return '<section><h3>'+escapeHtml(d.label)+'　'+escapeHtml(d.chap)+'</h3><ul>'+items+'</ul></section>';
    }).join('');
    $('reportBody').innerHTML=html; $('report').hidden=false;
  });
}
// one tall image per trip: title, then every mission with its first photo
function reportImage(){
  return allPhotos().then(function(ps){
    var W=1080, rows=[];
    DAYS.forEach(function(d,di){ rows.push({h:d}); d.m.forEach(function(m,i){ var p=ps.filter(function(x){return x.day===di&&x.i===i;})[0]; if(ST.done[di+'-'+i]||p) rows.push({m:m,p:p,done:ST.done[di+'-'+i]}); }); });
    return Promise.all(rows.map(function(r){ return r.p?new Promise(function(ok){ var im=new Image(); im.onload=function(){r.img=im;ok();}; im.onerror=ok; im.src=URL.createObjectURL(r.p.blob); }):null; })).then(function(){
      var H=260+rows.reduce(function(a,r){return a+(r.h?110:(r.img?560:90));},0)+120, c=document.createElement('canvas'); c.width=W; c.height=H;
      var g=c.getContext('2d'); g.fillStyle='#0E1520'; g.fillRect(0,0,W,H);
      g.fillStyle='#F0B94A'; g.font='900 34px sans-serif'; g.fillText('極秘　作戦報告書',60,100);
      g.fillStyle='#F1F3F6'; g.font='900 64px sans-serif'; g.fillText('作戦名：神話の国',60,190);
      var y=260;
      rows.forEach(function(r){
        if(r.h){ g.fillStyle='#A9B4C4'; g.font='900 34px sans-serif'; g.fillText(r.h.label+'　'+r.h.chap,60,y+60); y+=110; return; }
        g.fillStyle=r.done?'#7FC97A':'#A9B4C4'; g.font='900 36px sans-serif'; g.fillText((r.done?'■ ':'□ ')+r.m.n,60,y+50); y+=80;
        if(r.img){ var s=Math.min(960/r.img.width,460/r.img.height), w=r.img.width*s, h=r.img.height*s; g.drawImage(r.img,60,y,w,h); y+=480; }
        else y+=10;
      });
      g.fillStyle='#A9B4C4'; g.font='700 28px sans-serif'; g.fillText('ヤマタ司令　承認',W-360,H-60);
      return new Promise(function(ok){ c.toBlob(ok,'image/jpeg',0.88); });
    });
  });
}
$('reportSave').onclick=function(){
  var b=this; b.disabled=true; b.textContent='作っています…';
  reportImage().then(function(blob){
    var f=new File([blob],'作戦報告書.jpg',{type:'image/jpeg'});
    if(navigator.canShare&&navigator.canShare({files:[f]})) return navigator.share({files:[f],title:'作戦報告書'}).catch(function(){});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='作戦報告書.jpg'; a.click();
  }).then(function(){ b.disabled=false; b.textContent='画像にして保存・共有'; });
};
$('reportBtn').onclick=openReport;
$('reportClose').onclick=function(){ $('report').hidden=true; };

var endTimer=null;
function openEnding(){
  allPhotos().then(function(ps){
    $('ending').hidden=false; $('menu').hidden=true;
    var i=0, show=function(){
      if(!ps.length){ $('endCap').textContent='作戦名：神話の国　完'; return; }
      var p=ps[i%ps.length]; $('endImg').style.opacity=0;
      setTimeout(function(){ $('endImg').src=URL.createObjectURL(p.blob); $('endImg').style.opacity=1; $('endCap').textContent=p.name; },600);
      i++;
    };
    show(); clearInterval(endTimer); endTimer=setInterval(show,4500);
    play([{sfx:'fanfare'}].concat(lines(ENDING),[{pause:3},{sfx:'enemy'}],lines(ENDING_EXTRA.t,'enemy'),[{sfx:'radio'}],lines(ENDING_EXTRA.reply),[{music:'ending'}]));
  });
}
$('endBtn').onclick=openEnding;
$('endClose').onclick=function(){ clearInterval(endTimer); $('ending').hidden=true; };

/* ===================== GOURMET ===================== */
function renderGourmet(){
  var g=R(day).gourmet||[];
  $('gourmetCard').hidden=!g.length;
  $('gourmetList').innerHTML=g.map(function(x,i){ var k=day+'-'+i; return '<li><label><input type="checkbox" data-k="'+k+'"'+(ST.gourmet[k]?' checked':'')+'><span><b>'+escapeHtml(x.n)+'</b>'+(x.where?'<small>'+escapeHtml(x.where)+'</small>':'')+'</span></label></li>'; }).join('');
}
$('gourmetList').onchange=function(e){
  var k=e.target.dataset.k; if(!k) return;
  ST.gourmet[k]=e.target.checked; save();
  if(e.target.checked) say(pick(GOURMET_REPLY,'gourmet'),{queue:true});
};

/* ===================== SPOTIFY =====================
   Authorization Code with PKCE (no secret). Needs SPOTIFY_ID (story.js) and Premium.
   Plays the mission's playlist on the phone's Spotify app when the BGM changes. */
var SP_KEY='mythops-sp', SP_REDIRECT=location.origin+location.pathname;
function spTok(){ try{return JSON.parse(localStorage.getItem(SP_KEY)||'null');}catch(e){return null;} }
function spReady(){ return !!(SPOTIFY_ID&&spTok()); }
function b64url(buf){ return btoa(String.fromCharCode.apply(null,new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function spLogin(){
  var v=b64url(crypto.getRandomValues(new Uint8Array(48)));
  localStorage.setItem(SP_KEY+'-v',v);
  crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)).then(function(h){
    location.href='https://accounts.spotify.com/authorize?'+new URLSearchParams({response_type:'code',client_id:SPOTIFY_ID,redirect_uri:SP_REDIRECT,code_challenge_method:'S256',code_challenge:b64url(h),scope:'user-modify-playback-state user-read-playback-state'});
  });
}
function spSave(j){ var t={a:j.access_token,r:j.refresh_token||(spTok()||{}).r,x:Date.now()+(j.expires_in-60)*1000}; localStorage.setItem(SP_KEY,JSON.stringify(t)); return t; }
function spToken(body){ return fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)}).then(function(r){ if(!r.ok) throw r.status; return r.json(); }).then(spSave); }
function spAccess(){
  var t=spTok(); if(!t) return Promise.reject('none');
  if(Date.now()<t.x) return Promise.resolve(t.a);
  return spToken({grant_type:'refresh_token',refresh_token:t.r,client_id:SPOTIFY_ID}).then(function(n){return n.a;});
}
function spApi(path,opt){ return spAccess().then(function(a){ opt=opt||{}; opt.headers={'Authorization':'Bearer '+a,'Content-Type':'application/json'}; return fetch('https://api.spotify.com/v1'+path,opt); }); }
// scene music: a mood track for a moment of the story, then back to the drive playlist
var musicOn=false, cueN=0, backTimer=null;
function cue(name){
  if(!spReady()) return;
  if(phase==='onsite' && (name==='drive'||name==='enemy'||name==='approach')) return; // out of the car
  var my=++cueN, home=name==='drive' && day===2 && M().final && MUSIC.home.length;
  clearTimeout(backTimer); musicOn=true;
  spDevice().then(function(dv){
    if(!dv||my!==cueN) return;
    if(name==='drive' && !home){
      return spApi('/me/player/shuffle?state=true&device_id='+dv,{method:'PUT'}).catch(function(){}).then(function(){
        return spApi('/me/player/play?device_id='+dv,{method:'PUT',body:JSON.stringify({context_uri:'spotify:playlist:'+DRIVE_PLAYLIST.id})});
      }).then(function(r){ return spCheck(r,'「'+DRIVE_PLAYLIST.n+'」'); }).then(function(ok){ if(ok===true){ var prev=$('spState').textContent; spNote((/流せません/.test(prev)?prev+'　かわりに':'連携中：')+'「'+DRIVE_PLAYLIST.n+'」を再生'); } });
    }
    var ids=home?MUSIC.home:(MUSIC[name]||[]);
    if(!ids.length) return cue('drive');
    return spApi('/me/player/play?device_id='+dv,{method:'PUT',body:JSON.stringify({uris:ids.map(function(i){return 'spotify:track:'+i;})})}).then(function(r){ return spCheck(r,'場面の曲'); }).then(function(ok){
      if(ok!==true){ if(name!=='drive') cue('drive'); return; }
      spNote('連携中：場面の曲を再生');
      if(home||name==='ending') return; // the way home and the ending play out
      // when the mood track ends, go back to the drive playlist
      setTimeout(function(){
        spApi('/me/player/currently-playing').then(function(r){return r.status===200?r.json():null;}).then(function(j){
          if(!j||!j.item||my!==cueN) return;
          backTimer=setTimeout(function(){ if(my===cueN && phase!=='onsite') cue('drive'); },Math.max(1000,j.item.duration_ms-(j.progress_ms||0)-1500));
        }).catch(function(){});
      },2500);
    });
  });
}
function musicStop(){ if(!spReady()||!musicOn) return; musicOn=false; ++cueN; clearTimeout(backTimer); spApi('/me/player/pause',{method:'PUT'}).catch(function(){}); }
// the phone's Spotify app, made the active player (a command to an idle device fails)
function spDevice(){
  return spApi('/me/player/devices').then(function(r){return r.json();}).then(function(j){
    var ds=j.devices||[], dv=ds.filter(function(x){return x.is_active;})[0]||ds.filter(function(x){return x.type==='Smartphone';})[0]||ds[0];
    if(!dv){ spNote('Spotify のアプリが見つかりません。一度 Spotify を開いてください。'); say(LINES.spNoDevice,{queue:true}); flashBgm(); return null; }
    if(dv.is_active) return dv.id;
    return spApi('/me/player',{method:'PUT',body:JSON.stringify({device_ids:[dv.id],play:false})}).then(function(){ return dv.id; });
  }).catch(function(){ spNote('Spotify につながりません。'); return null; });
}
// a failed command is shown in the menu instead of passing silently
function spCheck(r,what){
  if(r.ok||r.status===204) return true;
  return r.json().catch(function(){return {};}).then(function(j){ spNote(what+'を流せませんでした（'+r.status+(j.error&&j.error.message?'：'+j.error.message:'')+'）'); flashBgm(); return false; });
}
function spNote(t){ $('spState').textContent=t; }
function flashBgm(){ ['bgmCard','menuBtn'].forEach(function(id){var e=$(id);e.classList.remove('flash');void e.offsetWidth;e.classList.add('flash');}); }
function renderSpotify(){
  $('spRow').hidden=!SPOTIFY_ID;
  $('spLogin').hidden=spReady(); $('spPlayNow').hidden=!spReady();
  if(!spReady()) spNote('連携すると、場面に合わせて曲が自動で切りかわります（Premium が必要）。');
  else if(!$('spState').textContent||/連携すると/.test($('spState').textContent)) spNote('Spotify と連携中。ふだんは「'+DRIVE_PLAYLIST.n+'」、山場では場面の曲が流れます。');
}
$('spLogin').onclick=spLogin;
$('spPlayNow').onclick=function(){ cue('drive'); };
// back from Spotify's sign-in page
(function spReturn(){
  var q=new URLSearchParams(location.search), code=q.get('code');
  if(!code||!SPOTIFY_ID) return;
  history.replaceState(null,'',SP_REDIRECT);
  spToken({grant_type:'authorization_code',code:code,redirect_uri:SP_REDIRECT,client_id:SPOTIFY_ID,code_verifier:localStorage.getItem(SP_KEY+'-v')||''})
    .then(function(){ $('startNote').textContent='Spotify と連携しました。'; renderSpotify(); })
    .catch(function(){ $('startNote').textContent='Spotify との連携に失敗しました。もう一度試してください。'; });
})();
renderSpotify();

/* ===================== WIRING ===================== */
var mode='real';
function unlockAudio(){
  if(window.speechSynthesis){var u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u);}
  player.src='voice/silence.m4a'; player.play().catch(function(){});
}
$('mReal').onclick=function(){mode='real';$('mReal').setAttribute('aria-pressed','true');$('mDemo').setAttribute('aria-pressed','false');$('modeNote').textContent='位置情報で自動的に進みます。スマホをホルダーに付けて使ってください。';};
$('mDemo').onclick=function(){mode='demo';$('mDemo').setAttribute('aria-pressed','true');$('mReal').setAttribute('aria-pressed','false');$('modeNote').textContent='家で試す用です。車が高速で自動走行し、各地点で止まって案内します。';};
(function initStart(){
  var t=new Date(), ds=t.getFullYear()+'-'+(t.getMonth()+1)+'-'+t.getDate();
  var map={'2026-12-5':0,'2026-12-6':1,'2026-12-7':2};
  $('daysel').value=String(map[ds]!=null?map[ds]:(ST.day||0));
  if(ST.done['2-'+(DAYS[2].m.length-1)]) $('endBtn').hidden=false;
})();
function showConsole(brief){
  $('start').hidden=true; $('console').hidden=false;
  $('console').classList.toggle('brief',!!brief);
}
$('briefBtn').onclick=function(){
  unlockAudio(); phase='brief'; showConsole(true);
  $('dayLbl').textContent='前夜'; $('chapLbl').textContent='作戦の概要'; $('dayLbl').style.color='';
  $('doneBtn').hidden=false; $('doneBtn').textContent='スタート画面へ戻る';
  say(BRIEF,{sfx:'radio'});
};
$('go').onclick=function(){
  demo=(mode==='demo');
  if(demoMode&&!demo){ demoMode=false; ST=fresh(load()); }
  day=+$('daysel').value; ST.day=day; save();
  if(demo){ demoMode=true; ST=fresh({day:day}); }
  phase='drive'; spokenAp={};
  showConsole(false);
  keepAwake(); unlockAudio();
  running=true; lastBgm=null;
  var i=ST.idx[day]||0; while(ST.done[key(i)]&&i<D().m.length-1)i++;
  setTarget(i,false);
  var h=new Date().getHours();
  say(D().open,{sfx:'radio'});
  if(h<10) say(TIME.morning,{queue:true});
  cue('start');
  if(demo){ startDemo(); } else startGps();
  startTalk(); startClock();
};
$('again').onclick=function(){ if(lastLine) play(lastLine,{noRepeat:true}); };
$('voice').onclick=function(){ voiceOn=!voiceOn; this.setAttribute('aria-pressed',String(voiceOn)); this.querySelector('span').textContent=voiceOn?'声 ON':'声 OFF'; if(!voiceOn)stopVoice(); };
$('here').onclick=function(){ if(phase==='drive') arrive(); $('menu').hidden=true; };
$('skip').onclick=function(){ if(phase==='end')return; if(M().final){arrive();return;} var n=idx+1, beats=storyItems('approach',idx).concat(storyItems('arrive',idx),storyItems('after',idx)); play(lines(LINES.skipTo(D().m[n].n)).concat(beats)); setTarget(n,false); $('menu').hidden=true; };
$('doneBtn').onclick=function(){
  if(phase==='brief'){ stopVoice(); $('console').hidden=true; $('console').classList.remove('brief'); $('start').hidden=false; $('doneBtn').hidden=true; return; }
  complete(false);
};
$('menuBtn').onclick=function(){ this.classList.remove('flash'); renderSpotify(); $('menu').hidden=false; };
$('menuClose').onclick=function(){ $('menu').hidden=true; };
$('menu').onclick=function(e){ if(e.target===this) this.hidden=true; };
$('talkTgl').onclick=function(){ talkOn=!talkOn; this.setAttribute('aria-pressed',String(talkOn)); this.textContent=talkOn?'道中トーク ON':'道中トーク OFF'; };
$('changeDay').onclick=function(){ clearInterval(demoTimer); clearInterval(talkTimer); clearInterval(clockTimer); if(watchId!=null)navigator.geolocation.clearWatch(watchId); watchId=null; running=false; stopVoice(); $('menu').hidden=true; $('console').hidden=true; $('start').hidden=false; };
$('resetDay').onclick=function(){ if(this.dataset.sure){ Object.keys(ST.done).forEach(function(k){ if(k.indexOf(day+'-')===0) delete ST.done[k]; }); Object.keys(ST.heard).forEach(function(k){ if(k.indexOf(String(day))>=0) delete ST.heard[k]; }); delete ST.talk[day]; ST.km[day]=0; ST.mute=null; spokenAp={}; save(); setTarget(0,true); delete this.dataset.sure; this.textContent='今日の進みぐあいをリセット'; } else { this.dataset.sure='1'; this.textContent='もう一度押すとリセット'; } };

if('serviceWorker' in navigator){ window.addEventListener('load',function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); }); }
