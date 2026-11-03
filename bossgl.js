/* 作戦名：神話の国 — 司令の絵（boss.png）を動かす。
   絵を細かい網目に分け、網目の点を少しずつずらして変形させる（WebGL）。部品に切らないので継ぎ目が出ない。
   首としっぽには背骨（関節の並び）を通してあり、関節ごとに少しずつ曲げてしならせる。
   ・息: 体全体がわずかにふくらむ　・首: ゆるく波打つ／話すとうなずく　・しっぽの先とマントが揺れる
   ・目: ときどきまばたき　・口: 声の大きさ（voice/env.json）に合わせて開く
   座標は boss.png（768×768）の画素。 */
var BossGL=(function(){
  var S=768, N=72, C0=[76,40], CS=640; // 絵のまわりの余白を切りつめて表示する範囲（左上と一辺）
  var EYE=[289,189];
  // 口: 絵の口の線（左＝鼻先側から右＝口角）と、あごの付け根。話すとあごを付け根のまわりに下へ回して開く
  var LIP=[[278,259],[292,263],[306,264],[322,262],[338,258],[352,254]], HINGE=[356,256], mouth=0;
  function lipY(x){ for(var k=0;k<LIP.length-1;k++) if(x<=LIP[k+1][0]) return LIP[k][1]+(LIP[k+1][1]-LIP[k][1])*Math.max(0,(x-LIP[k][0])/(LIP[k+1][0]-LIP[k][0])); return LIP[LIP.length-1][1]; }
  function jawW(x){ return sm(256,270,x)*(1-sm(346,360,x)); }
  function jawAt(x,y,a){ var dx=x-HINGE[0], dy=y-HINGE[1], c=Math.cos(a), s=Math.sin(a); return [HINGE[0]+dx*c-dy*s, HINGE[1]+dx*s+dy*c]; }
  // 背骨: 首（とぐろの手前から頭のてっぺんまで）としっぽの先。この線に関節を並べて曲げる
  var NECK=[[300,500],[302,432],[330,372],[358,318],[352,262],[330,190]];
  var TAILJ=[[592,500],[568,445],[572,400],[588,352]];
  var gl, prog, buf, uvBuf, idx, nIdx, cv, fx, g2, img, skin='#EAF4F0', ok=false, t0=performance.now(), last=0, blinkAt=0;
  function sm(a,b,x){ var t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); }
  function bell(u){ return Math.sin(Math.PI*Math.max(0,Math.min(1,u))); }
  function ease(u){ u=Math.max(0,Math.min(1,u)); return u*u*(3-2*u); }
  function seg(u,a,b){ return ease((u-a)/(b-a)); }
  function rot(v,a){ var c=Math.cos(a), s=Math.sin(a); return [v[0]*c-v[1]*s, v[0]*s+v[1]*c]; }

  /* 網目の点が、首・しっぽのどこにくっついているか（はじめに一度だけ計算する） */
  function nearest(J,x,y){
    var best={d:1e9}, tot=0, L=[];
    for(var k=0;k<J.length-1;k++){ L.push(Math.hypot(J[k+1][0]-J[k][0],J[k+1][1]-J[k][1])); tot+=L[k]; }
    var acc=0;
    for(k=0;k<J.length-1;k++){
      var ax=J[k][0], ay=J[k][1], bx=J[k+1][0]-ax, by=J[k+1][1]-ay, f=Math.max(0,Math.min(1,((x-ax)*bx+(y-ay)*by)/(bx*bx+by*by)));
      var d=Math.hypot(x-ax-bx*f,y-ay-by*f); if(d<best.d) best={d:d,k:k,f:f,s:(acc+L[k]*f)/tot};
      acc+=L[k];
    }
    return best;
  }
  function bind(x,y){
    if(x>530 && y<505){ var b=nearest(TAILJ,x,y); if(b.d<60){ b.c='t'; return b; } }
    if(y<488 && x<520){ var n=nearest(NECK,x,y); if(n.d<(n.k>=3?175:165)){ n.c='n'; return n; } }
    return null;
  }
  /* 関節を曲げたあとの、各区間の位置と向き。th=関節ごとの曲げ（ラジアン）、len=首の伸び */
  function chain(J,th,len){
    var P=[J[0]], ph=[], a=0;
    for(var k=0;k<J.length-1;k++){ a+=th[k]||0; ph.push(a); var v=rot([(J[k+1][0]-J[k][0])*len,(J[k+1][1]-J[k][1])*len],a); P.push([P[k][0]+v[0],P[k][1]+v[1]]); }
    return {P:P, ph:ph, len:len};
  }
  function onChain(J,C,b,x,y){
    function T(k){ var v=rot([(x-J[k][0])*C.len,(y-J[k][1])*C.len],C.ph[k]); return [C.P[k][0]+v[0],C.P[k][1]+v[1]]; }
    var p=T(b.k);
    // 関節のまわりは、となりの区間となめらかに混ぜる
    if(b.k<J.length-2 && b.f>0.6){ var q=T(b.k+1), w=sm(0.6,1.25,b.f); p=[p[0]+(q[0]-p[0])*w, p[1]+(q[1]-p[1])*w]; }
    var w0=sm(0,0.16,b.s); // 付け根は、とぐろから離れない
    return [x+(p[0]-x)*w0, y+(p[1]-y)*w0];
  }

  /* 動き。u は 0→1 の進み具合。返すもの:
     nk=首の関節ごとの曲げ（−で頭が前＝左へ） len=首の伸び tl=しっぽの振り jy=跳ね sq=着地のつぶれ
     wx,wy=絵全体の移動（絵の大きさに対する割合） ws=拡大 */
  var ACTS={
    look:{d:3.2,f:function(u){ var k=Math.sin(u*Math.PI*2)*bell(u); return {nk:[0,0,0.05*k,0.1*k,0.2*k]}; }},
    bow:{d:1.8,f:function(u){ var b=bell(u)*bell(u); return {nk:[0,0,-0.08*b,-0.14*b,-0.2*b]}; }},
    stretch:{d:2.4,f:function(u){ var b=bell(u); return {len:1+0.12*b, nk:[0,0.03*b,-0.02*b,0.04*b,0.06*b]}; }},
    hop:{d:1.1,f:function(u){ var air=bell(seg(u,0.15,0.75)), crouch=u<0.15?bell(u/0.15):0, land=u>0.75?bell((u-0.75)/0.25):0;
      return {jy:-46*air, len:1-0.06*crouch-0.05*land+0.05*air, sq:0.06*(crouch+land), nk:[0,0,0.05*air,0.06*air,0.05*air], tl:0.3*air}; }},
    wag:{d:2.2,f:function(u){ return {tl:0.6*Math.sin(u*Math.PI*5)*bell(u)}; }},
    startle:{d:0.9,f:function(u){ var b=bell(u); return {jy:-28*b, len:1+0.08*b, nk:[0,0.05*b,0.08*b,0.1*b,0.12*b], tl:0.5*b}; }},
    // 画面の外まで出る動き
    // 頭から左へ去り、右下の隅から頭をのぞかせて、入ってくる
    peek:{d:8,f:function(u){
      if(u<0.08){ var a=seg(u,0,0.08); return {nk:[0,0,-0.06*a,-0.1*a,-0.12*a]}; }
      if(u<0.3){ var b=seg(u,0.08,0.3); return {wx:-1.4*b, nk:[0,-0.05,-0.12,-0.14,-0.12], tl:0.35*Math.sin(u*40)}; }
      if(u<0.36) return {wx:-1.4};
      // 右下の隅から、首をのばして頭からせり上がる（とぐろは画面の下に隠れたまま）
      if(u<0.5){ var c=seg(u,0.36,0.5); return {wx:0.5, wy:1.1-0.72*c, len:1+0.1*c, nk:[0,-0.04,-0.1,-0.12,-0.14]}; }
      if(u<0.72){ var e=(u-0.5)/0.22; return {wx:0.5, wy:0.38, len:1.1, nk:[0,-0.04,-0.1,-0.08+0.12*Math.sin(e*Math.PI*3),-0.1+0.22*Math.sin(e*Math.PI*3)]}; }
      var g=seg(u,0.72,1); return {wx:0.5*(1-g), wy:0.38*(1-g), len:1+0.1*(1-g), nk:[0,-0.04*(1-g),-0.1*(1-g),-0.08*(1-g),-0.08*(1-g)], tl:0.3*Math.sin(u*30)*(1-g)};
    }},
    // とぐろから下へ沈む（頭は最後まで残る）。下から頭から飛び出す
    dive:{d:4.5,f:function(u){
      if(u<0.3){ var a=seg(u,0,0.3); return {wy:1.15*a, len:1+0.1*a, nk:[0,0.04*a,-0.04*a,0.06*a,0.08*a]}; }
      if(u<0.45) return {wy:1.15};
      var k=seg(u,0.45,0.75), up=Math.sin(Math.PI*seg(u,0.6,0.9));
      return {wy:1.15*(1-k)-0.25*up, len:1+0.12*up, nk:[0,0,0.06*up,0.08*up,0.1*up], tl:0.4*up};
    }},
    // 首をのばして、画面に顔を近づける
    close:{d:5,f:function(u){ var k=seg(u,0,0.25)*(1-seg(u,0.75,1)); return {ws:1+0.9*k, wy:0.32*k, len:1+0.08*k, nk:[0,0,-0.05*k,-0.08*k+0.06*Math.sin(u*12)*k,-0.1*k]}; }},
    // 大きく跳ぶ。上がるときは首が遅れ、下りるときは前へ
    leap:{d:2.2,f:function(u){ var air=Math.sin(Math.PI*seg(u,0.12,0.8)), up=u<0.46?1:-1, crouch=u<0.12?bell(u/0.12):0, land=u>0.8?bell((u-0.8)/0.2):0;
      return {wy:-0.75*air, len:1-0.08*(crouch+land)+0.06*air, sq:0.08*(crouch+land), nk:[0,0.04*air*up,0.07*air*up,0.08*air*up,0.08*air*up], tl:0.5*air*up}; }}
  };
  var act=null, actAt=0, nextIdle=8+Math.random()*10, nextBig=40+Math.random()*30, away=0, awayTo=0;
  // 物語で司令が無線に出られない間は、画面から姿を消す
  function leave(){ awayTo=1; } function enter(){ awayTo=0; }
  function doAct(name){ var a=ACTS[name]; if(a){ act=a; actAt=performance.now(); } }
  // このコマの首としっぽの形
  var NC, TC;
  function pose(t,talk,A){
    var nk=A.nk||[], th=[];
    for(var k=0;k<NECK.length-1;k++) th.push(0.022*Math.sin(t*0.8-k*0.7)+(k===4?0.03*Math.sin(t*0.5):0)+(nk[k]||0)+(k>=3?talk*0.03*Math.sin(t*7.5+k):0));
    NC=chain(NECK,th,A.len||1);
    var tt=[]; for(k=0;k<TAILJ.length-1;k++) tt.push(0.09*Math.sin(t*1.3-k*0.9)+(A.tl||0)*(0.4+0.3*k));
    TC=chain(TAILJ,tt,1);
  }
  // 1点をずらす（網目の点と、口・目の位置に同じだけ）
  function deform(x,y,t,A,b){
    if(b===undefined) b=bind(x,y);
    // あご: 口の線より下、あご先までを、付け根のまわりに回す
    if(mouth>0.02 && x>250 && x<366 && y>245 && y<322){
      var w=sm(lipY(x)-1,lipY(x)+5,y)*(1-sm(294,320,y))*jawW(x);
      if(w>0){ var q=jawAt(x,y,-0.32*mouth*w); x=q[0]; y=q[1]; }
    }
    var p=[x,y];
    if(b) p=b.c==='n'?onChain(NECK,NC,b,x,y):onChain(TAILJ,TC,b,x,y);
    x=p[0]; y=p[1];
    // マントの裾は少しなびく
    if(b&&b.c==='n'&&x>370&&y>330) x+=4*sm(330,480,y)*Math.sin(t*1.9+y*0.02);
    // 息と着地のつぶれ（とぐろの底を基準に）
    var br=Math.sin(t*1.35), sq=A.sq||0;
    x=384+(x-384)*(1+0.004*br+sq*0.6); y=700+(y-700)*(1+0.011*br-sq)+(A.jy||0);
    return [x,y];
  }
  var BIND=null;
  function shader(type,src){ var s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); return s; }
  function init(canvas,overlay){
    cv=canvas; fx=overlay; g2=fx.getContext('2d');
    gl=cv.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});
    if(!gl) return false;
    prog=gl.createProgram();
    gl.attachShader(prog,shader(gl.VERTEX_SHADER,'attribute vec2 p;attribute vec2 u;varying vec2 v;void main(){v=u;gl_Position=vec4((p.x-'+C0[0]+'.0)/'+(CS/2)+'.0-1.0,1.0-(p.y-'+C0[1]+'.0)/'+(CS/2)+'.0,0,1);}'));
    gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 v;uniform sampler2D tx;void main(){gl_FragColor=texture2D(tx,v);}'));
    gl.linkProgram(prog); gl.useProgram(prog);
    var uv=[], ix=[];
    for(var j=0;j<=N;j++) for(var i=0;i<=N;i++) uv.push(i/N,j/N);
    for(j=0;j<N;j++) for(i=0;i<N;i++){ var k=j*(N+1)+i; ix.push(k,k+1,k+N+1,k+1,k+N+2,k+N+1); }
    uvBuf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,uvBuf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(uv),gl.STATIC_DRAW);
    var lu=gl.getAttribLocation(prog,'u'); gl.enableVertexAttribArray(lu); gl.vertexAttribPointer(lu,2,gl.FLOAT,false,0,0);
    buf=gl.createBuffer();
    idx=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(ix),gl.STATIC_DRAW); nIdx=ix.length;
    img=new Image();
    img.onload=function(){
      var tx=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tx);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      // まぶたの色は、目の上の肌の色をそのまま使う
      try{ var c=document.createElement('canvas'); c.width=c.height=S; var x=c.getContext('2d'); x.drawImage(img,0,0); var d=x.getImageData(EYE[0],EYE[1]-20,1,1).data; skin='rgb('+d[0]+','+d[1]+','+d[2]+')'; }catch(e){}
      ok=true; requestAnimationFrame(frame);
    };
    img.src='boss.png';
    return true;
  }
  function size(){
    var r=cv.parentNode.getBoundingClientRect(), s=Math.max(10,Math.floor(Math.min(r.width,r.height))), dpr=Math.min(2,window.devicePixelRatio||1);
    if(cv.width!==Math.round(s*dpr)){ cv.width=fx.width=Math.round(s*dpr); cv.height=fx.height=Math.round(s*dpr); cv.style.width=fx.style.width=s+'px'; cv.style.height=fx.style.height=s+'px'; }
  }
  function frame(now){
    requestAnimationFrame(frame);
    if(!ok || document.hidden || !cv.offsetParent || now-last<33) return; // 30コマ／秒。見えていないときは描かない
    last=now; size();
    var t=(now-t0)/1000, talk=window.bossMouth?bossMouth():0, pos=[];
    mouth+=(talk-mouth)*(talk>mouth?0.7:0.45); if(mouth<0.02) mouth=0; // 開くのは速く、閉じるのは少しゆっくり
    // ときどき（20〜45秒おき）大きく動く。話している間は、見回しと会釈だけ
    // 画面の外まで出る大きな動きは、黙っているときに1〜2分に1回
    if(!act && !awayTo && talk<0.05 && t>nextBig){ var bp=['peek','dive','close','leap']; doAct(bp[Math.floor(Math.random()*bp.length)]); nextBig=t+60+Math.random()*60; nextIdle=Math.max(nextIdle,t+12); }
    if(!act && t>nextIdle){ var pick=talk>0.05?['look','bow']:['look','bow','stretch','hop','wag','look']; doAct(pick[Math.floor(Math.random()*pick.length)]); nextIdle=t+20+Math.random()*25; }
    var A={}; if(act){ var u=(now-actAt)/1000/act.d; if(u>=1) act=null; else A=act.f(u); }
    var dt=Math.min(0.2,(now-(frame.prev||now))/1000); frame.prev=now;
    away+=(awayTo-away)*Math.min(1,dt*2.2); if(Math.abs(awayTo-away)<0.002) away=awayTo; // 1.5秒ほどで去る／現れる
    var wx=(A.wx||0)+away*1.4, wy=A.wy||0, ws=A.ws||1;
    cv.parentNode.style.transform=(wx||wy||ws!==1)?'translate('+(wx*100).toFixed(1)+'%,'+(wy*100).toFixed(1)+'%) scale('+ws.toFixed(3)+')':'';
    cur=A; pose(t,talk>0.05?1:0,A);
    if(!BIND){ BIND=[]; for(var jj=0;jj<=N;jj++) for(var ii=0;ii<=N;ii++) BIND.push(bind(ii*S/N,jj*S/N)); }
    for(var j=0,q=0;j<=N;j++) for(var i=0;i<=N;i++,q++){ var p=deform(i*S/N,j*S/N,t,A,BIND[q]); pos.push(p[0],p[1]); }
    gl.viewport(0,0,cv.width,cv.height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(pos),gl.DYNAMIC_DRAW);
    var lp=gl.getAttribLocation(prog,'p'); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp,2,gl.FLOAT,false,0,0);
    gl.drawElements(gl.TRIANGLES,nIdx,gl.UNSIGNED_SHORT,0);
    overlay(t,talk);
  }
  // 口とまぶたは、絵の上に重ねて描く（首と同じだけ動かす）
  var cur={};
  function overlay(t,m){
    var k=fx.width/CS; g2.setTransform(k,0,0,k,-C0[0]*k,-C0[1]*k); g2.clearRect(0,0,S,S);
    // 口の中: 上くちびる（動かない線）と、下へ回った下くちびるのあいだを暗く塗る
    if(mouth>0.05){
      var save=mouth; mouth=0; // 線そのものはあごの回転を受けない
      var up=LIP.map(function(p){ return deform(p[0],p[1],t,cur); });
      var lo=LIP.map(function(p){ var q=jawAt(p[0],p[1],-0.32*save*jawW(p[0])); return deform(q[0],q[1],t,cur); });
      mouth=save;
      g2.beginPath(); up.forEach(function(p,i){ i?g2.lineTo(p[0],p[1]):g2.moveTo(p[0],p[1]); }); for(var i=lo.length-1;i>=0;i--) g2.lineTo(lo[i][0],lo[i][1]); g2.closePath();
      g2.fillStyle='#3A1215'; g2.fill();
      g2.save(); g2.clip(); var c=lo[2]; g2.beginPath(); g2.ellipse(c[0]+4,c[1]-1,16,7*save+2,-0.15,0,7); g2.fillStyle='#C9544E'; g2.fill(); g2.restore();
      g2.lineWidth=2.4; g2.lineJoin='round'; g2.strokeStyle='#1B1611';
      g2.beginPath(); lo.forEach(function(p,i){ i?g2.lineTo(p[0],p[1]):g2.moveTo(p[0],p[1]); }); g2.stroke();
      g2.beginPath(); up.forEach(function(p,i){ i?g2.lineTo(p[0],p[1]):g2.moveTo(p[0],p[1]); }); g2.stroke();
    }
    // まばたき: 2.5〜6秒おきに0.14秒
    var now=t*1000; if(now>blinkAt+140 && Math.random()<0.012) blinkAt=now;
    var bk=now-blinkAt; if(bk<140){
      var f=Math.sin(Math.PI*bk/140), E=deform(EYE[0],EYE[1],t,cur);
      g2.save(); g2.beginPath(); g2.ellipse(E[0],E[1],11,15,-0.2,0,7); g2.clip();
      g2.fillStyle=skin; g2.fillRect(E[0]-12,E[1]-16,24,32*f);
      g2.strokeStyle='#1B1611'; g2.lineWidth=2.2; g2.beginPath(); g2.moveTo(E[0]-10,E[1]-16+30*f); g2.quadraticCurveTo(E[0],E[1]-12+32*f,E[0]+10,E[1]-16+30*f); g2.stroke(); g2.restore();
    }
  }
  // 確認用: 指定した動きの、指定した瞬間を1コマ描く（{wx,wy,ws} を返す）
  function snap(name,u,t,m){
    var A=name?ACTS[name].f(u):{}; t=t||0; cur=A; mouth=m||0; size(); pose(t,mouth>0.05?1:0,A);
    if(!BIND){ BIND=[]; for(var jj=0;jj<=N;jj++) for(var ii=0;ii<=N;ii++) BIND.push(bind(ii*S/N,jj*S/N)); }
    var pos=[]; for(var j=0,q=0;j<=N;j++) for(var i=0;i<=N;i++,q++){ var p=deform(i*S/N,j*S/N,t,A,BIND[q]); pos.push(p[0],p[1]); }
    gl.viewport(0,0,cv.width,cv.height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(pos),gl.DYNAMIC_DRAW);
    var lp=gl.getAttribLocation(prog,'p'); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp,2,gl.FLOAT,false,0,0);
    gl.drawElements(gl.TRIANGLES,nIdx,gl.UNSIGNED_SHORT,0);
    overlay(t,mouth);
    return {wx:A.wx||0, wy:A.wy||0, ws:A.ws||1};
  }
  return {init:init, act:doAct, leave:leave, enter:enter, snap:snap, ready:function(){ return ok; }};
})();
