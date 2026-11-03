/* 作戦名：神話の国 — アプリの動き。
   データ（セリフ・地点）は story.js / route.js / plot.js にある。 */

/* ===================== HELPERS ===================== */
function $(id){return document.getElementById(id);}
function hav(a,b){var R=6371000,t=Math.PI/180,dLa=(b[0]-a[0])*t,dLo=(b[1]-a[1])*t,x=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(a[0]*t)*Math.cos(b[0]*t)*Math.sin(dLo/2)*Math.sin(dLo/2);return 2*R*Math.asin(Math.sqrt(x));}
// TIME line for today (TIME_BY_DAY in plot.js may override one for a day)
function timeLine(k){ var o=(window.TIME_BY_DAY||[])[day]||{}; return o[k]||TIME[k]; }
// a short reply; while the commander is gone, the enemy answers instead
function reply(boss,enemy,k){
  if(muted() && enemy && enemy.length) say(pick(enemy,k+'e'),{queue:true,who:'enemy',sfx:'enemy'});
  else say(pick(boss,k),{queue:true});
}
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
// keep every recording on the phone for places with no signal (stored by the page itself, counted only once stored)
function saveVoices(){
  if(!('caches' in window)) return;
  var files=[]; Object.keys(VOICE).forEach(function(g){ Object.keys(VOICE[g]).forEach(function(k){ var f=VOICE[g][k]; if(files.indexOf(f)<0) files.push(f); }); });
  caches.open('mythops-voice').then(function(c){ return c.keys().then(function(ks){ ks.forEach(function(r){ if(files.indexOf(r.url.split('/voice/')[1])<0) c.delete(r); }); return ks; }); }).then(function(ks){
    var have={}; ks.forEach(function(r){ have[r.url.split('/voice/')[1]]=1; });
    var todo=files.filter(function(f){return !have[f];}), done=files.length-todo.length;
    function show(){ $('offlineStart').textContent=$('offline').textContent=done>=files.length?'オフライン用の声：保存ずみ（'+files.length+'）':'オフライン用の声：保存中 '+done+' / '+files.length; }
    show();
    function worker(){ var f=todo.shift(); if(!f) return Promise.resolve();
      return fetch('voice/'+f).then(function(r){ if(!r.ok) return; return caches.open('mythops-voice').then(function(c){ return c.put('voice/'+f,r); }).then(function(){ done++; show(); }); }).catch(function(){}).then(worker); }
    return Promise.all([worker(),worker(),worker(),worker()]).then(show);
  }).catch(function(){});
}
function pickVoice(){var v=(window.speechSynthesis&&speechSynthesis.getVoices())||[];jaVoice=v.filter(function(x){return /^ja/i.test(x.lang);}).sort(function(a,b){return (b.localService?1:0)-(a.localService?1:0);})[0]||null;}
if(window.speechSynthesis){pickVoice();speechSynthesis.onvoiceschanged=pickVoice;}
// mix with Spotify instead of stopping it (the silent switch then mutes the voice)
try{ if(navigator.audioSession) navigator.audioSession.type='ambient'; }catch(e){}
var player=new Audio(); player.preload='auto';
var queue=[], speaking=false, gen=0, gapTimer=null;
// Recordings are loaded as blobs: iOS Safari will not play audio from the offline cache otherwise.
var clips={}, clipOrder=[];
function clip(f){
  if(clips[f]) return clips[f];
  clipOrder.push(f);
  while(clipOrder.length>8){ var old=clipOrder.shift(); var pr=clips[old]; delete clips[old]; if(pr) pr.then(function(u){ setTimeout(function(){ URL.revokeObjectURL(u); },60000); }).catch(function(){}); }
  return clips[f]=fetch('voice/'+f).then(function(r){ if(!r.ok)throw 0; return r.blob(); }).then(function(b){ return URL.createObjectURL(b); }).catch(function(e){ delete clips[f]; throw e; });
}
function sentences(t){ return (String(t||'').match(/[^。！？]+[。！？]*」?/g)||[]).map(function(s){return s.trim();}).filter(Boolean); }
function reading(s){ READ.forEach(function(r){ s=s.replace(r[0],r[1]); }); return s; }
function fileOf(it){ return it.pause||it.music?null:it.sfx?VOICE.sfx[it.sfx]:(VOICE[it.who]||{})[it.t]; }
function talking(on){ $('bossBox').classList.toggle('talking',on); }
function fitSub(){
  var box=$('say').parentNode, fs=Math.min(28,Math.max(19,window.innerWidth*0.058));
  box.style.setProperty('--subFs',fs+'px');
  while(fs>15 && $('say').scrollHeight>box.clientHeight-30){ fs-=1; box.style.setProperty('--subFs',fs+'px'); }
}
function stopVoice(){ gen++; clearTimeout(gapTimer); clearTimeout(guard); queue=[]; pending={}; speaking=false; current=null; player.pause(); if(window.speechSynthesis)speechSynthesis.cancel(); talking(false); }
/* A story beat is marked as said only when its last line starts playing, so a beat cut off
   (app closed, day changed) comes back the next time its moment comes. */
var pending={};
function isHeard(k){ return !!ST.heard[k]; }
function once(k,items){
  if(ST.heard[k]||pending[k]) return [];
  if(!items.length){ heard(k); return []; }
  pending[k]=1;
  var last=items.length-1; while(last>0 && !items[last].t) last--;
  items[last]=Object.assign({},items[last],{done:(items[last].done||[]).concat([k])});
  return items;
}
// items: [{t,who}|{sfx}] ; opts.queue: wait for the current talk instead of cutting in
// drop sound effects that would stack up: radio right before an interrupt, or an interrupt while the enemy is already on air
function tidy(items){
  var out=[], who=null;
  items.forEach(function(it,k){
    if(it.sfx){
      var next=items.slice(k+1).filter(function(x){return x.t;})[0];
      if(!it.done && it.sfx==='radio' && items[k+1] && items[k+1].sfx==='enemy') return;
      if(!it.done && it.sfx==='enemy' && who==='enemy' && next && next.who==='enemy') return;
      if(!it.done && it.sfx==='radio' && who==='enemy' && next && next.who==='enemy') return;
      if(out.length && out[out.length-1].sfx===it.sfx && !it.done) return;
    } else if(it.t) who=it.who;
    out.push(it);
  });
  return out;
}
function play(items,opts){
  items=tidy(items);
  if(!items.length) return;
  if(!(opts&&opts.queue)){
    // cutting in: what was waiting is dropped, but the beats being queued now stay marked as on their way
    stopVoice(); items.forEach(function(it){ (it.done||[]).forEach(function(k){ pending[k]=1; }); });
  }
  if(!speaking) musicNote();
  if(!(opts&&opts.noRepeat)) lastLine=(opts&&opts.queue&&speaking&&lastLine)?lastLine.concat(items):items.slice();
  queue=queue.concat(items);
  if(!speaking) nextItem();
}
function lines(text,who){ return sentences(text).map(function(s){return {t:s,who:who||'boss'};}); }
// a line about a place: skipped if the car is already far past it when its turn comes
function at(items,ll,lim){ return items.map(function(it){ return Object.assign({},it,{near:[ll,lim]}); }); }
// the commander's chatter: silent while the commander is gone
function quiet(items){ return items.map(function(it){ return (it.who==='enemy')?it:Object.assign({},it,{quiet:true}); }); }
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
var guard=null, current=null;
function nextItem(){
  clearTimeout(guard);
  var my=++gen, it=queue.shift();
  if(it==null){ speaking=false; current=null; talking(false); setWho('boss'); musicCheck(); return; }
  speaking=true;
  if(it.done) it.done.forEach(function(k){ delete pending[k]; heard(k); });
  if(it.fx==='mute'){ ST.mute=day; save(); return nextItem(); }
  if(it.fx==='unmute'){ ST.mute=null; save(); return nextItem(); }
  if(!it.t && !it.sfx && !it.pause && !it.music) return nextItem();
  if(it.quiet && muted()) return nextItem(); // chatter while the commander is gone is skipped (decided now, not when queued)
  if(it.near && pos && hav(pos,it.near[0])>it.near[1]) return nextItem(); // the place is long passed
  function after(){ if(my!==gen)return; clearTimeout(guard); current=null; talking(false); gapTimer=setTimeout(function(){ if(my===gen) nextItem(); },it.sfx?60:280); }
  function silent(){ talking(false); gapTimer=setTimeout(function(){ if(my===gen) nextItem(); },it.sfx?0:Math.max(1800,it.t.length*170)); }
  // never wait forever: iOS may stop a sound without telling us (calls, other apps, the screen)
  function f0(){ return !it.pause && !it.music && voiceOn && !!fileOf(it); }
  function watch(ms){ clearTimeout(guard); guard=setTimeout(function(){ if(my===gen) after(); },ms); }
  current={my:my, after:after, kind:(f0()?'audio':'other')};
  if(it.pause){ talking(false); gapTimer=setTimeout(function(){ if(my===gen) nextItem(); },voiceOn?it.pause*1000:600); return; }
  if(it.music){ cue(it.music); gapTimer=setTimeout(function(){ if(my===gen) nextItem(); },(it.hold||0)*1000); return; }
  if(!it.sfx){ setWho(it.who); $('say').textContent=it.t; fitSub(); }
  if(!voiceOn) return silent();
  var f=fileOf(it);
  if(f){
    watch(12000); // a slow connection must not hold the talk while the recording loads
    clip(f).then(function(url){
      if(my!==gen) return;
      player.onended=after; player.onerror=after;
      player.onloadedmetadata=function(){ if(my===gen && isFinite(player.duration)) watch(player.duration*1000+2500); };
      watch(it.sfx?5000:6000+it.t.length*300);
      player.src=url; if(!it.sfx) talking(it.who==='boss');
      player.play().catch(function(){ if(my===gen){ clearTimeout(guard); silent(); } });
      if(queue[0]&&fileOf(queue[0])) clip(fileOf(queue[0]));
    }).catch(function(){ if(my===gen) silent(); });
  } else if(!it.sfx && window.speechSynthesis){
    var u=new SpeechSynthesisUtterance(reading(it.t));
    u.lang='ja-JP'; if(jaVoice) u.voice=jaVoice; u.rate=1.02;
    u.onend=u.onerror=after; watch(5000+it.t.length*300); talking(true); speechSynthesis.speak(u);
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
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState!=='visible') return;
  if(running) keepAwake();
  // back from another app: a sound iOS stopped meanwhile is skipped, so the talk goes on
  if(speaking && current && current.kind==='audio' && player.paused) current.after();
});

/* ===================== STATE MACHINE ===================== */
var day=0, idx=0, running=false, demo=false;
var pos=null, speed=0, slowSince=null, phase='drive', leftSince=null, talkOn=true;
function D(){return DAYS[day];}
function M(){return D().m[idx];}
function key(i){return day+'-'+i;}
function heard(k){ if(ST.heard[k]) return true; ST.heard[k]=1; save(); return false; }

function setTarget(i,announce){
  idx=Math.max(0,Math.min(D().m.length-1,i)); ST.idx[day]=idx; ST.onsite=null; save();
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
  var apR=Math.max(2500,m.r*5);
  // approach briefing (+ the story planned for this approach)
  if(phase==='drive' && d<apR) play(approachItems(),{queue:true});
  // arrival: inside radius and slow for 12s
  if(phase==='drive' && d<=m.r){
    if(speed<2.5){ if(!slowSince) slowSince=now; if(now-slowSince>12000) arrive(); }
    else slowSince=null;
  } else if(phase==='drive') slowSince=null;
  if(phase==='onsite' && !m.final){
    var nx=D().m[idx+1];
    // already at the next mission (they are close together, e.g. the castle and dinner): this one is done
    if(nx && hav(pos,nx.ll)<=nx.r && hav(pos,m.ll)>m.r){ complete(true); return; }
    // drove away -> done (not where people leave the car for a bus, noAuto)
    // drove away -> done; where people take a bus (noAuto) only once far away at highway speed
    var gone=m.noAuto ? (d>10000 && speed>11) : (d>Math.max(700,m.r*2.2) && speed>4);
    if(gone){ if(!leftSince) leftSince=now; if(now-leftSince>(m.noAuto?180000:45000)){ leftSince=null; complete(true); return; } }
    else leftSince=null;
  }
  // just left the previous mission (about 700 m away): the story may continue on the road
  if(phase==='drive' && idx>0 && hav(pos,D().m[idx-1].ll)>700) play(departItems(idx-1),{queue:true});
  if(phase==='drive'){ checkPoints(d<apR); legTick(d/1000); }
  updateDist();
}
function approachItems(mustOnly){
  var m=M();
  return once('ap'+day+'-'+idx, legRest(mustOnly).concat([{sfx:'approach'}], replaced('approach',idx)?[]:lines(m.ap), storyItems('approach',idx), [{music:'approach'}]));
}
function departItems(i){ return i<0?[]:once('dep'+day+'-'+i, storyItems('depart',i)); }
// roadside guide, cautions, hidden missions and detours along the way
function near(p,r0){ return (p.to==null||p.to===idx) && hav(pos,p.ll)<(p.r||r0); }
function checkPoints(nearTarget){
  var r=R(day);
  (r.caution||[]).forEach(function(p,i){ if(near(p,1500)) play(once('c'+day+'-'+i,at([{sfx:'alert'}].concat(lines(p.t)),p.ll,Math.max((p.r||1500)*3,5000))),{queue:true}); });
  if(muted()) return;
  // near the target these wait in line behind the approach talk
  (r.road||[]).forEach(function(p,i){ if(near(p,1000)) play(once('r'+day+'-'+i,at(quiet([{sfx:'radio'}].concat(lines(p.t))),p.ll,Math.max((p.r||1000)*3,3000))),{queue:true}); });
  (r.hidden||[]).forEach(function(p,i){ if(near(p,800)) play(once('h'+day+'-'+i,at(quiet([{sfx:'alert'}].concat(lines(LINES.hidden+p.t))),p.ll,Math.max((p.r||800)*2,1500))),{queue:true}); });
  if(nearTarget) return;
  (r.detour||[]).forEach(function(p,i){ var k='d'+day+'-'+i; if(near(p,3000) && !isHeard(k) && !pending[k] && hasSlack()) play(once(k,at(quiet([{sfx:'radio'}].concat(lines(LINES.detour+p.t))),p.ll,(p.r||3000)*1.2)),{queue:true}); });
}
// ahead of schedule: the rest of today still fits before sunset with time to spare
function hasSlack(){
  var ms=D().m, p=pos, mins=0;
  for(var i=idx;i<ms.length;i++){ if(ST.done[key(i)]) continue; mins+=hav(p,ms[i].ll)*1.4/1000/40*60+(ms[i].final?0:40); p=ms[i].ll; }
  var n=new Date(), sun=new Date(n); sun.setHours(16,50,0,0);
  return n.getTime()+(mins+45)*60000<sun.getTime();
}
function arrive(){
  if(phase!=='drive') return;
  phase='onsite'; slowSince=null; driveSince=null; ST.onsite={day:day,idx:idx}; save();
  var m=M(), pose=(POSE[day]||[])[idx];
  $('onsite').hidden=false; $('doneBtn').hidden=false; $('photoBtn').hidden=false;
  $('oName').textContent=m.n;
  $('oViv').hidden=!m.viv; $('oViv').textContent=m.viv||'';
  $('oMission').innerHTML='<b>任務</b>　'+escapeHtml(m.ms)+(pose?'<br><b>撮影</b>　'+escapeHtml(pose):'');
  $('doneBtn').textContent=m.final?'本日の作戦 終了':'任務完了';
  // whatever the road should have told first (no GPS, or "arrived" pressed early) comes before the arrival
  var own=replaced('arrive',idx)?[]:lines(m.os+(m.final?LINES.lastMission:LINES.mission)+m.ms);
  play(departItems(idx-1).concat(approachItems(true), once('ar'+day+'-'+idx,[{sfx:'radio'}].concat(own, storyItems('arrive',idx), pose&&!muted()?lines(LINES.pose+pose):[]))),{queue:true});
}
function complete(auto){
  if(phase!=='onsite') return; // once per mission (a double tap or a second GPS fix does nothing)
  phase='leaving'; leftSince=null; ST.onsite=null;
  $('doneBtn').hidden=true; $('photoBtn').hidden=true;
  ST.done[key(idx)]=1; save();
  var st=$('stamp'); st.hidden=false; setTimeout(function(){st.hidden=true;},1500);
  var done=idx, extra=storyItems('after',done).concat(pos?[]:departItems(done));
  if(M().final){ phase='end'; renderProgress(); recap(extra); return; }
  var next=idx+1;
  setTimeout(function(){
    if(!running||phase!=='leaving') return;
    play([{sfx:'fanfare'}].concat(lines(auto?LINES.autoDone:LINES.done), once('af'+day+'-'+done,extra), lines(LINES.next(D().m[next].n)), [{music:'drive'}]),{queue:true});
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
  // the enemy's theme plays once, before the first time the enemy actually speaks in this moment
  function theme(x){ if(themed||x.noTheme) return [{sfx:'enemy'}]; themed=true; return [{music:'enemy',hold:7},{sfx:'enemy'}]; }
  [['s',SCENE],['k',SECRET]].forEach(function(g){
    (g[1][day]||[]).forEach(function(x,j){
      if(x[kind]!==i) return;
      var body=once(g[0]+day+'-'+j,[].concat(x.mute?[{fx:'mute'}]:[], x.unmute?[{fx:'unmute'}]:[], part(x,x.who), x.who==='enemy'?[{sfx:'radio'}]:[], x.music?[{music:x.music}]:[]));
      if(body.length) out=out.concat(x.who==='enemy'?theme(x):[], body);
    });
  });
  (ENEMY[day]||[]).forEach(function(e,j){
    if(e[kind]!==i) return;
    var g=[].concat(e.mute?[{fx:'mute'}]:[], e.unmute?[{fx:'unmute'}]:[], lines(e.t,'enemy'),[{sfx:'radio'}],lines(e.reply));
    var prev='boss';
    (e.more||[]).forEach(function(m){
      if(m.who!==prev) g.push({sfx:m.who==='enemy'?'enemy':'radio'});
      g=g.concat(part(m,m.who)); prev=m.who;
    });
    if(e.music) g.push({music:e.music});
    var body=once('e'+day+'-'+j,g);
    if(body.length) out=out.concat(theme(e),body);
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
function recapText(d){
  return photoCount(d).then(function(np){
    var ms=DAYS[d].m, sk=ST.skipped||{}, n=ms.filter(function(x,i){return ST.done[d+'-'+i]&&!sk[d+'-'+i];}).length;
    var km=Math.max(10,Math.min(600,Math.round((ST.km[d]||0)/10000)*10)), r=RECAP[d]||{};
    return LINES.recapHead+LINES.recapKm(km)+LINES.recapDone(Math.min(n,12))+LINES.recapPhoto(np)+(n>=ms.length?LINES.praiseAll:LINES.praise)+[].concat(r.secret||[]).join('')+(r.next||'');
  });
}
// the night's report: right away, or (a day that ends at a restaurant) with a button at the inn
function showRecapBtn(){ if(isHeard('recap'+day)) return; $('doneBtn').hidden=false; $('doneBtn').textContent='今夜の報告を聞く'; }
function recap(extra,atInn){
  recapText(day).then(function(t){
    if(!atInn && D().m[D().m.length-1].dinner){
      play([{sfx:'fanfare'}].concat(once('af'+day+'-'+idx,extra), isHeard('recap'+day)?[]:lines(LINES.recapLater)),{queue:true});
      showRecapBtn(); return;
    }
    play([{sfx:'fanfare'}].concat(once('af'+day+'-'+idx,extra), once('recap'+day,lines(t))),{queue:true});
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
  chip('cGps','GPS ±'+Math.round(acc)+'m',acc<=200);
  $('geoInfo').textContent='位置情報：精度 約'+Math.round(acc)+'m・速度 '+Math.round((sp||0)*3.6)+'km/h';
  if(acc>200) return; // a rough fix (just started, tunnel) would set off stories in the wrong place
  speed=sp||0; pos=c; lastFix={c:c,t:t};
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
  if(speed>5){ stopSince=null; if(!driveSince) driveSince=t;
    // at most twice a day, never while the commander is gone or on the last leg home (the story has its own rest call)
    if(t-driveSince>90*60000){ driveSince=t; var n=ST.talk['long'+day]||0;
      if(n<2 && !muted() && !(day===DAYS.length-1 && M().final)){ ST.talk['long'+day]=n+1; save(); play(once('long'+day+'-'+n,[{sfx:'radio'}].concat(lines(timeLine('longDrive')))),{queue:true}); } } }
  else { if(!stopSince) stopSince=t; if(t-stopSince>10*60000) driveSince=null; }
}

/* ===================== DEMO ===================== */
// demo pace (the full-trip simulation in tools/sim.js slows it to real driving)
var demoTimer=null, demoPause=0, demoStep=700, demoStay=4;
function startDemo(){
  pos=(day===0?START_POS[0]:DAYS[day-1].m[DAYS[day-1].m.length-1].ll).slice();
  $('cMode').hidden=false; chip('cGps','デモ走行',true);
  demoTimer=setInterval(function(){
    if(phase==='onsite'){ speed=0.8; if(!speaking) demoPause+=1; if(demoPause>demoStay){demoPause=0; complete(false);} tick(); return; }
    if(phase==='end'){ speed=0; return; }
    var tgt=M().ll, d=hav(pos,tgt);
    var step=Math.min(d, demoStep); // fast-forward
    if(d<M().r*0.5){ speed=0.5; tick(); return; }
    if(demoStep>100 && speaking && d<Math.max(2500,M().r*5)+800){ tick(); return; } // let the story play before arriving
    var f=step/d; pos=[pos[0]+(tgt[0]-pos[0])*f,pos[1]+(tgt[1]-pos[1])*f]; speed=Math.max(15,demoStep);
    ST.km[day]=(ST.km[day]||0)+step;
    $('geoInfo').textContent='デモ走行中（実際の位置は使っていません）';
    tick();
  },1000);
}

/* ===================== TALK: myths, trivia, time & weather ===================== */
var clockTimer=null, weatherTimer=null, leg=null;
/* Talk on the road is placed by distance: each leg (to the next mission) gets its talk
   (LEGTALK, plot.js) spread over "km left" points; spare points get myths and trivia. */
function legPlan(dKm){
  // the leg's length is fixed when it starts, so reopening the app keeps the same talk points
  var lk='leg'+day+'-'+idx; ST.talk[lk]=ST.talk[lk]||Math.round(dKm*10)/10; save(); dKm=ST.talk[lk];
  var items=((window.LEGTALK||[])[day]||[])[idx]||[], apKm=Math.max(2500,M().r*5)/1000;
  var top=dKm-1.5, bottom=apKm+1, want=Math.max(items.length,Math.floor((dKm*1.35-6)/8));
  // a leg whose talk is placed by km (the story's own timing) gets no filler after it
  var list=items.slice(); if(!items.some(function(x){return x.km!=null;})) while(list.length<want) list.push({filler:true});
  var n=list.length, step=n?Math.max(0,top-bottom)/n:0;
  return {key:day+'-'+idx, list:list, at:list.map(function(x,k){ return x.km!=null?x.km:top-step*k; })};
}
function legKey(k){ return 'L'+day+'-'+idx+'-'+k; }
function legNext(list){ for(var k=0;k<list.length;k++){ if(!isHeard(legKey(k))) return pending[legKey(k)]?-1:k; } return list.length; }
// what is left of this leg's own talk when the approach begins or on arrival (fillers are dropped)
function legRest(mustOnly){
  var list=(leg&&leg.key===day+'-'+idx)?leg.list:(((window.LEGTALK||[])[day]||[])[idx]||[]), out=[];
  list.forEach(function(x,k){
    if(isHeard(legKey(k))||pending[legKey(k)]) return;
    // the enemy's lines carry the plot; the rest is road talk
    if(x.filler||((mustOnly||!talkOn) && x.who!=='enemy' && !x.must)){ heard(legKey(k)); return; }
    out=out.concat(once(legKey(k),quiet([{sfx:x.who==='enemy'?'enemy':'radio'}].concat(part(x,x.who)))));
  });
  return out;
}
function legTick(dKm){
  if(!leg||leg.key!==day+'-'+idx){ leg=legPlan(dKm); }
  if(!talkOn||speaking) return;
  var k=legNext(leg.list);
  if(k<0 || k>=leg.list.length || dKm>leg.at[k]) return;
  var x=leg.list[k];
  if(muted() && x.who!=='enemy') return; // while the commander is gone, only the enemy talks
  var pre=[], hh=new Date().getHours()+new Date().getMinutes()/60;
  if(day===DAYS.length-1 && M().final && x===(((window.LEGTALK||[])[day]||[])[idx]||[]).slice(-1)[0] && hh>=16.9) pre=once('sunset'+day+'-',[{sfx:'radio'}].concat(lines(timeLine('sunset'))));
  if(!x.filler) return play(pre.concat(once(legKey(k),quiet([{sfx:x.who==='enemy'?'enemy':'radio'}].concat(part(x,x.who))))),{queue:true});
  var f=ST.talk['f'+day]||(ST.talk['f'+day]={myth:0,triv:0,used:[]}), myth=MYTH[day]||[], triv=R(day).trivia||D().talk||[], items=[];
  f.used=f.used||[];
  // a trivia line tied to a place (to) is said only on the way to it, never miles past it
  var ti=-1; triv.forEach(function(x,j){ if(ti<0 && f.used.indexOf(j)<0 && (typeof x==='string'||x.to==null||x.to>=idx)) ti=j; });
  if(f.myth<myth.length && (f.myth<=f.used.length || ti<0)) items=[{sfx:'radio'}].concat(part(myth[f.myth++]));
  else if(ti>=0){ f.used.push(ti); items=[{sfx:'radio'}].concat(lines(triv[ti].t||triv[ti])); }
  save();
  play(once(legKey(k),quiet(items)),{queue:true});
}
function startClock(){
  clearInterval(clockTimer);
  function check(){
    if(phase==='end') return;
    var n=new Date(), h=n.getHours()+n.getMinutes()/60;
    if(muted()) return;
    var lunched=D().m.some(function(m,i){ return m.lunch && ST.done[key(i)]; });
    if(h>=12 && h<12.5 && phase==='drive' && !lunched && !M().lunch) play(once('noon'+day+'-',quiet([{sfx:'radio'}].concat(lines(timeLine('noon'))))),{queue:true});
    var home=(window.LEGTALK&&LEGTALK[DAYS.length-1]&&LEGTALK[DAYS.length-1][DAYS[DAYS.length-1].m.length-1])||[];
    var rollCalled=day===DAYS.length-1 && home.length && isHeard('L'+day+'-'+(DAYS[day].m.length-1)+'-'+(home.length-1));
    if(h>=16.9 && h<18 && !rollCalled) play(once('sunset'+day+'-',[{sfx:'radio'}].concat(lines(timeLine('sunset')))),{queue:true});
  }
  check(); clockTimer=setInterval(check,60000);
  clearInterval(weatherTimer); weather(); weatherTimer=setInterval(weather,30*60000);
}
function weather(){
  if(!pos||demo) return;
  fetch('https://api.open-meteo.com/v1/forecast?latitude='+pos[0].toFixed(3)+'&longitude='+pos[1].toFixed(3)+'&current=temperature_2m,weather_code')
    .then(function(r){return r.json();}).then(function(j){
      var c=j.current||{}, w=c.weather_code, t=c.temperature_2m;
      var k=(w>=71&&w<=77)||w===85||w===86?'snow':(w>=51&&w<=67)||(w>=80&&w<=82)?'rain':(t!=null&&t<=0)?'freeze':(w<=1&&new Date().getHours()<11)?'clear':null;
      if(k) play(once('w'+day+'-'+k,[{sfx:'radio'}].concat(lines(timeLine(k)))),{queue:true});
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
$('photoIn').onchange=function(){ var f=this.files&&this.files[0]; this.value=''; if(!f) return; (demoMode?Promise.resolve():addPhoto(f)).then(function(){ reply(PHOTO_REPLY,window.PHOTO_REPLY_ENEMY,'photo'); }); };

var reportUrls=[];
function freeUrls(a){ a.forEach(function(u){ URL.revokeObjectURL(u); }); a.length=0; }
function photoUrl(a,b){ var u=URL.createObjectURL(b); a.push(u); return u; }
function openReport(){
  allPhotos().then(function(ps){
    freeUrls(reportUrls);
    var html=DAYS.map(function(d,di){
      var items=d.m.map(function(m,i){
        var mine=ps.filter(function(p){return p.day===di&&p.i===i;});
        var done=ST.done[di+'-'+i], sk=(ST.skipped||{})[di+'-'+i];
        return '<li class="'+(done&&!sk?'done':'')+'"><span class="mk">'+(sk?'とばし':done?'完了':'—')+'</span><span class="nm">'+escapeHtml(m.n)+'</span>'+
          (mine.length?'<span class="ph">'+mine.map(function(p){return '<img alt="" src="'+photoUrl(reportUrls,p.blob)+'">';}).join('')+'</span>':'')+'</li>';
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
    return Promise.all(rows.map(function(r){ return r.p?new Promise(function(ok){ var im=new Image(); var u=URL.createObjectURL(r.p.blob); im.onload=function(){r.img=im;ok();setTimeout(function(){URL.revokeObjectURL(u);},5000);}; im.onerror=ok; im.src=u; }):null; })).then(function(){
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
$('reportClose').onclick=function(){ $('report').hidden=true; freeUrls(reportUrls); };

var endTimer=null;
function openEnding(){
  allPhotos().then(function(ps){
    $('ending').hidden=false; $('menu').hidden=true;
    var i=0, show=function(){
      if(!ps.length){ $('endCap').textContent='作戦名：神話の国　完'; return; }
      var p=ps[i%ps.length]; $('endImg').style.opacity=0;
      setTimeout(function(){ var old=$('endImg').src; $('endImg').src=URL.createObjectURL(p.blob); if(old&&old.indexOf('blob:')===0) URL.revokeObjectURL(old); $('endImg').style.opacity=1; $('endCap').textContent=p.name; },600);
      i++;
    };
    show(); clearInterval(endTimer); endTimer=setInterval(show,4500);
    stopVoice(); play([{sfx:'fanfare'}].concat(lines(ENDING),[{pause:3},{sfx:'enemy'}],lines(ENDING_EXTRA.t,'enemy'),[{sfx:'radio'}],lines(ENDING_EXTRA.reply),[{music:'ending'}]));
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
  if(e.target.checked) reply(GOURMET_REPLY,window.GOURMET_REPLY_ENEMY,'gourmet');
};

/* ===================== SPOTIFY =====================
   Authorization Code with PKCE (no secret). Needs SPOTIFY_ID (story.js) and Premium.
   Plays the mission's playlist on the phone's Spotify app when the BGM changes. */
var SP_KEY='mythops-sp', SP_REDIRECT=location.origin+location.pathname.replace(/index\.html$/,'');
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
var spRefreshing=null;
function spAccess(){
  var t=spTok(); if(!t) return Promise.reject('none');
  if(Date.now()<t.x) return Promise.resolve(t.a);
  // one refresh at a time; a refused refresh token means signing in again
  return spRefreshing||(spRefreshing=spToken({grant_type:'refresh_token',refresh_token:t.r,client_id:SPOTIFY_ID}).then(function(n){ spRefreshing=null; return n.a; },function(e){
    spRefreshing=null;
    if(e===400||e===401){ localStorage.removeItem(SP_KEY); spNote('Spotify の連携が切れました。メニューから、もう一度連携してください。'); renderSpotify(); }
    throw e;
  }));
}
function spApi(path,opt){ return spAccess().then(function(a){ opt=opt||{}; opt.headers={'Authorization':'Bearer '+a,'Content-Type':'application/json'}; return fetch('https://api.spotify.com/v1'+path,opt); }); }
// scene music: a mood track for a moment of the story, then back to the drive playlist
var musicOn=false, cueN=0, backTimer=null, curCue=null, cueAt=0;
function cue(name){
  if(!spReady()) return;
  if(phase==='onsite' && (name==='drive'||name==='enemy'||name==='approach')) return; // out of the car
  var home=name==='drive' && day===2 && M().final && MUSIC.home.length;
  if(name==='drive' && curCue==='drive' && !home) return; // already on the drive playlist: don't restart it
  // let a scene's own theme (start, enemy, climax) play for a while before the approach cue takes over
  if(name==='approach' && /start|enemy|climax/.test(curCue||'') && Date.now()-cueAt<150000) return;
  if(name==='approach' && curCue==='home') return; // the way home keeps its songs
  var my=++cueN; curCue=home?'home':name; cueAt=Date.now();
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
          // back to the drive playlist when the track ends, but never in the middle of a story scene
          var back=function(){ if(my!==cueN||phase==='onsite') return; if(speaking){ backTimer=setTimeout(back,5000); return; } cue('drive'); };
          backTimer=setTimeout(back,Math.max(1000,j.item.duration_ms-(j.progress_ms||0)-1500));
        }).catch(function(){});
      },2500);
    });
  });
}
// iOS may stop Spotify when the voice plays: if it was playing when the talk began, start it again after
var wasPlaying=false;
function musicNote(){
  wasPlaying=false;
  if(!spReady()||!musicOn||phase!=='drive') return;
  spApi('/me/player').then(function(r){ return r.status===200?r.json():null; }).then(function(j){ wasPlaying=!!(j&&j.is_playing); }).catch(function(){});
}
function musicCheck(){
  if(!spReady()||!musicOn||!wasPlaying||phase!=='drive') return;
  setTimeout(function(){
    if(speaking) return;
    spApi('/me/player').then(function(r){ return r.status===200?r.json():null; }).then(function(j){
      if(j && !j.is_playing && !speaking) spApi('/me/player/play',{method:'PUT'}).catch(function(){});
    }).catch(function(){});
  },1500);
}
function musicStop(){ if(!spReady()||!musicOn) return; musicOn=false; ++cueN; curCue=null; clearTimeout(backTimer); spApi('/me/player/pause',{method:'PUT'}).catch(function(){}); }
// the phone's Spotify app, made the active player (a command to an idle device fails)
function spDevice(){
  return spApi('/me/player/devices').then(function(r){return r.json();}).then(function(j){
    var ds=j.devices||[], dv=ds.filter(function(x){return x.is_active;})[0]||ds.filter(function(x){return x.type==='Smartphone';})[0]||ds[0];
    if(!dv){
      spNote('Spotify のアプリが見つかりません。一度 Spotify を開いてください。'); flashBgm();
      // said aloud at most every 30 minutes, and not while the commander is gone
      if(!muted() && Date.now()-(spDevice.told||0)>30*60000){ spDevice.told=Date.now(); say(LINES.spNoDevice,{queue:true}); }
      return null;
    }
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
if(spReady()) $('startNote').textContent='Spotify：先に Spotify のアプリを開いて何か1曲再生し、このアプリにもどってから「任務開始」を押してください。';

/* ===================== WIRING ===================== */
var mode='real';
function unlockAudio(){
  if(window.speechSynthesis){var u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u);}
  player.src='voice/silence.m4a'; player.play().catch(function(){});
}
$('mReal').onclick=function(){mode='real';$('mReal').setAttribute('aria-pressed','true');$('mDemo').setAttribute('aria-pressed','false');$('modeNote').textContent='位置情報で自動的に進みます。旅行の当日に使ってください（家で試すときは「デモ走行」で）。';};
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
  stopVoice(); clearInterval(demoTimer); if(watchId!=null) navigator.geolocation.clearWatch(watchId); watchId=null;
  phase='drive'; pos=null; lastFix=null; leg=null; curCue=null;
  $('cMode').hidden=!demo;
  showConsole(false);
  keepAwake(); unlockAudio();
  running=true;
  var i=ST.idx[day]||0; while(ST.done[key(i)]&&i<D().m.length-1)i++;
  var wasOnsite=ST.onsite&&ST.onsite.day===day&&ST.onsite.idx===i;
  setTarget(i,false);
  var first=!isHeard('open'+day), finished=ST.done[key(D().m.length-1)];
  // last night's report, if it was never heard (the button at the inn was missed)
  if(first && day>0 && ST.done[(day-1)+'-'+(DAYS[day-1].m.length-1)] && !isHeard('recap'+(day-1))){
    var pd=day-1; recapText(pd).then(function(t){ play([{sfx:'radio'}].concat(once('recap'+pd,lines(t))),{queue:true}); });
  }
  // the day's opening is said once; reopening later just carries on
  play(once('open'+day,[{sfx:'radio'}].concat(lines(D().open), new Date().getHours()<10?lines(timeLine('morning')):[])),{queue:true});
  // story beats that a closed app cut off (after a mission, or of a skipped one) come back now
  for(var j=0;j<D().m.length;j++){ if(ST.done[key(j)]) play(storyItems('approach',j).concat(storyItems('arrive',j),storyItems('after',j)),{queue:true}); }
  if(finished){ phase='end'; showRecapBtn(); }
  else if(wasOnsite) arrive(); // reopened at a mission: still there (nothing said twice)
  if(first) cue('start'); // reopening keeps whatever music is on
  if(demo){ startDemo(); } else startGps();
  startClock();
};
$('again').onclick=function(){ if(lastLine&&running) play(lastLine.filter(function(x){ return !x.fx && !x.music; }).map(function(x){ return x.done?Object.assign({},x,{done:null}):x; }),{queue:true,noRepeat:true}); $('menu').hidden=true; };
$('voice').onclick=function(){ voiceOn=!voiceOn; this.setAttribute('aria-pressed',String(voiceOn)); this.querySelector('span').textContent=voiceOn?'声 ON':'声 OFF'; if(!voiceOn&&current){ player.pause(); if(window.speechSynthesis)speechSynthesis.cancel(); current.after(); } };
$('here').onclick=function(){ if(running&&phase==='drive') arrive(); $('menu').hidden=true; };
$('skip').onclick=function(){
  if(!running||phase==='end'||phase==='leaving') return;
  $('menu').hidden=true;
  if(M().final){ arrive(); return; }
  // the story beats of the skipped mission still play, so the plot never loses a step
  var n=idx+1, beats=departItems(idx-1).concat(legRest(true), storyItems('approach',idx), storyItems('arrive',idx), storyItems('after',idx), departItems(idx));
  ST.done[key(idx)]=1; ST.skipped=ST.skipped||{}; ST.skipped[key(idx)]=1; save();
  play(lines(LINES.skipTo(D().m[n].n)).concat(beats,[{music:'drive'}]),{queue:true}); setTarget(n,false);
};
$('doneBtn').onclick=function(){
  if(phase==='brief'){ stopVoice(); $('console').hidden=true; $('console').classList.remove('brief'); $('start').hidden=false; $('doneBtn').hidden=true; return; }
  if(phase==='end'){ // the night's report, at the inn
    $('doneBtn').hidden=true;
    recap([],true);
    return;
  }
  complete(false);
};
$('menuBtn').onclick=function(){ this.classList.remove('flash'); renderSpotify(); $('menu').hidden=false; };
$('menuClose').onclick=function(){ $('menu').hidden=true; };
$('menu').onclick=function(e){ if(e.target===this) this.hidden=true; };
$('talkTgl').onclick=function(){ talkOn=!talkOn; this.setAttribute('aria-pressed',String(talkOn)); this.textContent=talkOn?'道中トーク ON':'道中トーク OFF'; };
$('changeDay').onclick=function(){ clearInterval(demoTimer); clearInterval(clockTimer); clearInterval(weatherTimer); if(watchId!=null)navigator.geolocation.clearWatch(watchId); watchId=null; running=false; stopVoice(); $('menu').hidden=true; $('console').hidden=true; $('start').hidden=false; };
$('resetDay').onclick=function(){
  if(!running) return;
  if(!this.dataset.sure){ this.dataset.sure='1'; this.textContent='もう一度押すとリセット'; return; }
  // only today's marks: every mark is <letters><day>-...
  var mine=new RegExp('^[a-zA-Z]+'+day+'(-|$)');
  Object.keys(ST.done).forEach(function(k){ if(k.indexOf(day+'-')===0) delete ST.done[k]; });
  Object.keys(ST.heard).forEach(function(k){ if(mine.test(k)) delete ST.heard[k]; });
  delete ST.talk['f'+day]; delete ST.talk['long'+day]; Object.keys(ST.talk).forEach(function(k){ if(k.indexOf('leg'+day+'-')===0) delete ST.talk[k]; }); if(ST.skipped) Object.keys(ST.skipped).forEach(function(k){ if(k.indexOf(day+'-')===0) delete ST.skipped[k]; }); leg=null; ST.km[day]=0; if(ST.mute===day) ST.mute=null; ST.onsite=null;
  stopVoice(); save(); setTarget(0,true); delete this.dataset.sure; this.textContent='今日の進みぐあいをリセット';
};

if('serviceWorker' in navigator){ window.addEventListener('load',function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); }); }
