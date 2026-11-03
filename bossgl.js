/* 作戦名：神話の国 — 司令の絵（boss.png）を動かす。
   絵を細かい網目に分け、網目の点を少しずつずらして変形させる（WebGL）。部品に切らないので継ぎ目が出ない。
   ・息: 体全体がわずかにふくらむ　・首: ゆっくり傾く／話すとうなずく　・しっぽの先とマントが揺れる
   ・目: ときどきまばたき　・口: 声の大きさ（voice/env.json）に合わせて開く
   座標は boss.png（768×768）の画素。 */
var BossGL=(function(){
  var S=768, N=40, C0=[76,40], CS=640; // 絵のまわりの余白を切りつめて表示する範囲（左上と一辺）
  var PIVOT=[349,318], EYE=[289,189], MOUTH_L=[300,262], MOUTH_R=[352,255], TAIL=[578,490];
  var gl, prog, buf, uvBuf, idx, nIdx, cv, fx, g2, img, skin='#EAF4F0', ok=false, t0=performance.now(), last=0, blinkAt=0;
  function sm(a,b,x){ var t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); }
  // 1点をずらす（毎コマ同じ関数で、網目の点と、口・目の位置を動かす）
  /* 大きな動き。u は 0→1 の進み具合。返すもの: ha=首の角度 jy=跳ね sx,sy=体の伸び縮み ta=しっぽの振り */
  function bell(u){ return Math.sin(Math.PI*Math.max(0,Math.min(1,u))); }
  var ACTS={
    look:{d:3.2,f:function(u){ return {ha:0.17*Math.sin(u*Math.PI*2)*bell(u)}; }},
    bow:{d:1.8,f:function(u){ return {ha:0.2*bell(u)*bell(u), sy:-0.02*bell(u)}; }},
    stretch:{d:2.4,f:function(u){ var b=bell(u); return {sy:0.07*b, sx:-0.03*b, ha:-0.06*b}; }},
    hop:{d:1.1,f:function(u){ var air=u>0.15&&u<0.75?bell((u-0.15)/0.6):0, land=u<0.15?bell(u/0.15):u>0.75?bell((u-0.75)/0.25):0; return {jy:-46*air, sy:0.05*air-0.07*land, sx:0.05*land-0.02*air}; }},
    wag:{d:2.2,f:function(u){ return {ta:0.45*Math.sin(u*Math.PI*5)*bell(u)}; }},
    startle:{d:0.9,f:function(u){ var b=bell(u); return {jy:-30*b, sy:0.06*b, ha:-0.12*b, ta:0.4*b}; }}
  };
  /* 画面の外まで出る大きな動き。返すもの: wx,wy=絵全体のずれ（絵の大きさに対する割合） ws=拡大 fl=向き（-1で左右反転） */
  function ease(u){ u=Math.max(0,Math.min(1,u)); return u*u*(3-2*u); }
  function seg(u,a,b){ return ease((u-a)/(b-a)); }
  var BIG={
    // 右へ去って、左から顔をのぞかせ、戻ってくる
    peek:{d:8,f:function(u){
      if(u<0.22) return {wx:1.3*seg(u,0,0.22)};
      if(u<0.32) return {wx:1.3};
      if(u<0.55) return {wx:-1.3+0.75*seg(u,0.32,0.45), ha:-0.15*seg(u,0.4,0.5)};
      if(u<0.72) return {wx:-0.55, ha:-0.15+0.25*Math.sin((u-0.55)*30)*0.3};
      return {wx:-0.55*(1-seg(u,0.72,1))};
    }},
    // 下へ潜って、飛び出す
    dive:{d:4.5,f:function(u){
      if(u<0.3) return {wy:1.15*seg(u,0,0.3), sy:-0.05};
      if(u<0.45) return {wy:1.15};
      var k=seg(u,0.45,0.75); return {wy:1.15*(1-k)-0.25*Math.sin(Math.PI*seg(u,0.6,0.9)), sy:0.08*Math.sin(Math.PI*seg(u,0.45,0.8))};
    }},
    // 画面に顔を近づける
    close:{d:5,f:function(u){ var k=seg(u,0,0.25)*(1-seg(u,0.75,1)); return {ws:1+0.9*k, wy:0.32*k, ha:0.08*Math.sin(u*12)*k}; }},
    // 大きく跳ぶ
    leap:{d:2.2,f:function(u){ var air=Math.sin(Math.PI*seg(u,0.12,0.8)); return {wy:-0.75*air, sy:0.1*air-0.08*(u<0.12?Math.sin(Math.PI*u/0.12):u>0.8?Math.sin(Math.PI*(u-0.8)/0.2):0), ta:0.5*air}; }}
  };
  var act=null, actAt=0, nextIdle=8+Math.random()*10, nextBig=40+Math.random()*30, away=0, awayTo=0;
  // 物語で司令が無線に出られない間は、画面から姿を消す
  function leave(){ awayTo=1; } function enter(){ awayTo=0; }
  function doAct(name){ var a=ACTS[name]||BIG[name]; if(a){ act=a; actAt=performance.now(); } }
  function deform(x,y,t,talk,A){
    A=A||{};
    var br=Math.sin(t*1.35), sx=1+0.004*br+(A.sx||0), sy=1+0.011*br+(A.sy||0);
    x=384+(x-384)*sx; y=700+(y-700)*sy+(A.jy||0);
    // 首: 付け根から上ほど大きく傾く
    var a=0.045*Math.sin(t*0.55)+0.018*Math.sin(t*1.7+1)+talk*0.03*Math.sin(t*7.5)+(A.ha||0), wh=sm(370,270,y+(A.jy||0));
    if(wh>0){ var dx=x-PIVOT[0], dy=y-PIVOT[1], c=Math.cos(a*wh), s=Math.sin(a*wh); x=PIVOT[0]+dx*c-dy*s; y=PIVOT[1]+dx*s+dy*c-talk*2*wh; }
    // しっぽの先
    var wt=sm(495,360,y-(A.jy||0))*sm(540,560,x);
    if(wt>0){ var b=(0.13*Math.sin(t*1.25)+(A.ta||0))*wt, ex=x-TAIL[0], ey=y-TAIL[1]; x=TAIL[0]+ex*Math.cos(b)-ey*Math.sin(b); y=TAIL[1]+ex*Math.sin(b)+ey*Math.cos(b); }
    // マント: 留め金から下ほど揺れる
    var wc=sm(300,480,y)*sm(270,300,x)*(1-sm(480,510,x));
    if(wc>0) x+=4*wc*Math.sin(t*1.9+y*0.02);
    return [x,y];
  }
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
    // ときどき（20〜45秒おき）大きく動く。話している間は、見回しと会釈だけ
    // 画面の外まで出る大きな動きは、黙っているときに1〜2分に1回
    if(!act && !awayTo && talk<0.05 && t>nextBig){ var bp=['peek','dive','close','leap']; doAct(bp[Math.floor(Math.random()*bp.length)]); nextBig=t+60+Math.random()*60; nextIdle=Math.max(nextIdle,t+12); }
    if(!act && t>nextIdle){ var pick=talk>0.05?['look','bow']:['look','bow','stretch','hop','wag','look']; doAct(pick[Math.floor(Math.random()*pick.length)]); nextIdle=t+20+Math.random()*25; }
    var A={}; if(act){ var u=(now-actAt)/1000/act.d; if(u>=1) act=null; else A=act.f(u); }
    var dt=Math.min(0.2,(now-(frame.prev||now))/1000); frame.prev=now;
    away+=(awayTo-away)*Math.min(1,dt*2.2); if(Math.abs(awayTo-away)<0.002) away=awayTo; // 1.5秒ほどで去る／現れる
    var wx=(A.wx||0)+away*1.4, wy=A.wy||0, ws=A.ws||1;
    cv.parentNode.style.transform=(wx||wy||ws!==1)?'translate('+(wx*100).toFixed(1)+'%,'+(wy*100).toFixed(1)+'%) scale('+ws.toFixed(3)+')':'';
    cur=A;
    for(var j=0;j<=N;j++) for(var i=0;i<=N;i++){ var p=deform(i*S/N,j*S/N,t,talk>0.05?1:0,A); pos.push(p[0],p[1]); }
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
    var tk=m>0.05?1:0;
    if(m>0.05){
      var L=deform(MOUTH_L[0],MOUTH_L[1],t,tk,cur), R=deform(MOUTH_R[0],MOUTH_R[1],t,tk,cur), mx=(L[0]+R[0])/2, my=(L[1]+R[1])/2, h=3+m*11;
      g2.beginPath(); g2.moveTo(L[0],L[1]); g2.quadraticCurveTo(mx,my+3,R[0],R[1]); g2.quadraticCurveTo(mx+2,my+h*1.6,L[0],L[1]); g2.closePath();
      g2.fillStyle='#4A1A1E'; g2.fill(); g2.lineWidth=2; g2.strokeStyle='#1B1611'; g2.stroke();
      g2.save(); g2.clip(); g2.beginPath(); g2.ellipse(mx+3,my+h*1.3,h*1.1,h*0.6,0,0,7); g2.fillStyle='#C9544E'; g2.fill(); g2.restore();
    }
    // まばたき: 2.5〜6秒おきに0.14秒
    var now=t*1000; if(now>blinkAt+140 && Math.random()<0.012) blinkAt=now;
    var bk=now-blinkAt; if(bk<140){
      var f=Math.sin(Math.PI*bk/140), E=deform(EYE[0],EYE[1],t,tk,cur);
      g2.save(); g2.beginPath(); g2.ellipse(E[0],E[1],11,15,-0.2,0,7); g2.clip();
      g2.fillStyle=skin; g2.fillRect(E[0]-12,E[1]-16,24,32*f);
      g2.strokeStyle='#1B1611'; g2.lineWidth=2.2; g2.beginPath(); g2.moveTo(E[0]-10,E[1]-16+30*f); g2.quadraticCurveTo(E[0],E[1]-12+32*f,E[0]+10,E[1]-16+30*f); g2.stroke(); g2.restore();
    }
  }
  return {init:init, act:doAct, leave:leave, enter:enter};
})();
