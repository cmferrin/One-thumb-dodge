(() => {
  const canvas = document.getElementById('game');
  const scoreEl = document.getElementById('score');
  const overlay = document.getElementById('overlay');
  const bestEl = document.getElementById('bestScore');
  const gamesEl = document.getElementById('gamesPlayed');
  const playBtn = document.getElementById('playBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsSheet = document.getElementById('settings');
  const closeSettings = document.getElementById('closeSettings');
  const sfxToggle = document.getElementById('sfxToggle');
  const leftHandToggle = document.getElementById('leftHandToggle');
  const toast = document.getElementById('toast');

  // NEW: diamonds + shop
  let diamonds = Number(localStorage.getItem('otd_diamonds') || '0');
  let skins = JSON.parse(localStorage.getItem('otd_skins') || '{"default":true}');
  let selectedSkin = localStorage.getItem('otd_selectedSkin') || 'default';

  // Shop items
  const shopItems = [
    { id: 'default', name: 'Default Blue', cost: 0, color: '#7cc8ff' },
    { id: 'red', name: 'Red Ball', cost: 10, color: '#ff4c4c' },
    { id: 'green', name: 'Green Ball', cost: 10, color: '#4cff62' },
    { id: 'gold', name: 'Gold Ball', cost: 20, color: '#ffd94c' }
  ];

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }

  function showToast(msg, ms = 1800) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), ms);
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0, ctx = null;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.floor(rect.width * dpr);
    H = Math.floor(rect.height * dpr);
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  let running = false;
  let paused = false;
  let score = 0;
  let best = Number(localStorage.getItem('otd_best') || '0');
  let games = Number(localStorage.getItem('otd_games') || '0');
  bestEl.textContent = best;
  gamesEl.textContent = games;

  const state = {
    t: 0,
    player: { x: 0, y: 0, r: 18 },
    blocks: [],
    diamondsArr: [],
    spawnTimer: 0,
    diamondTimer: 0,
    speed: 140,
    difficulty: 0,
    rainbowBlocks: false,
    tiltControls: false,
  };

  // Input: thumb drag
  let dragging = false;
  let dragOffsetX = 0;
  function clientToCanvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left);
  }
  canvas.addEventListener('touchstart', (e) => {
    if (!state.tiltControls) {
      const t = e.changedTouches[0];
      dragging = true;
      dragOffsetX = clientToCanvasX(t.clientX) - state.player.x;
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (!dragging || state.tiltControls) return;
    const t = e.changedTouches[0];
    let targetX = clientToCanvasX(t.clientX) - dragOffsetX;
    targetX = Math.max(state.player.r + 4, Math.min(targetX, canvas.clientWidth - state.player.r - 4));
    state.player.x = targetX;
  }, { passive: true });
  canvas.addEventListener('touchend', () => { dragging = false; }, { passive: true });

  // Tilt controls
  window.addEventListener('deviceorientation', (e) => {
    if (!state.tiltControls || !running) return;
    const gamma = e.gamma; // left/right tilt
    if (gamma != null) {
      state.player.x += gamma * 0.5;
      state.player.x = Math.max(state.player.r, Math.min(canvas.clientWidth - state.player.r, state.player.x));
    }
  });

  // SFX
  let audioCtx = null;
  function beep(freq=500,len=0.07,type='sine',vol=0.04) {
    if (!sfxToggle.checked) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); setTimeout(()=>o.stop(), len*1000);
    } catch {}
  }
  function playDiamond() { beep(880,0.1,'square',0.05); }
  function playHit() { beep(220,0.12,'sawtooth',0.06); }

  function resetGame() {
    score = 0;
    state.t = 0;
    state.blocks.length = 0;
    state.diamondsArr.length = 0;
    state.spawnTimer = 0;
    state.diamondTimer = 0;
    state.speed = 140;
    state.difficulty = 0;

    const px = canvas.clientWidth / 2;
    const py = canvas.clientHeight - 150; // raised 150px
    state.player.x = px;
    state.player.y = py;
  }

  function startGame() {
    resetGame();
    running = true; paused = false;
    overlay.classList.remove('show');
    pauseBtn.textContent = '⏸︎';
  }
  function endGame() {
    running = false;
    games += 1; localStorage.setItem('otd_games', games); gamesEl.textContent = games;
    if (score > best) {
      best = score;
      localStorage.setItem('otd_best', best);
      bestEl.textContent = best;
      showToast('New Best!');
    } else showToast('Game Over');
    overlay.classList.add('show');
  }

  function spawnBlock() {
    const width = 24 + Math.random()*70;
    const x = 8 + Math.random()*(canvas.clientWidth - width - 16);
    const y = -40;
    const speed = state.speed*(0.9+Math.random()*0.3);
    let color = '#20324a';
    if (state.rainbowBlocks) {
      const hue = Math.floor(Math.random()*360);
      color = `hsl(${hue},70%,50%)`;
    }
    state.blocks.push({ x,y,w:width,h:16+Math.random()*40,vy:speed,color });
  }
  function spawnDiamond() {
    const r=10;
    const x=r+Math.random()*(canvas.clientWidth-r*2);
    const y=-20;
    const speed=state.speed*(0.6+Math.random()*0.2);
    state.diamondsArr.push({ x,y,r,vy:speed });
  }

  function circleRectCollide(cx,cy,cr,rx,ry,rw,rh){
    const testX=Math.max(rx,Math.min(cx,rx+rw));
    const testY=Math.max(ry,Math.min(cy,ry+rh));
    const dx=cx-testX,dy=cy-testY;
    return dx*dx+dy*dy<=cr*cr;
  }

  function draw() {
    const w=canvas.clientWidth,h=canvas.clientHeight;
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); // white bg

    // player
    const p=state.player;
    let skin=shopItems.find(s=>s.id===selectedSkin);
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fillStyle=skin?skin.color:'#7cc8ff';
    ctx.fill();

    // blocks
    for(const b of state.blocks){
      ctx.fillStyle=b.color;
      ctx.fillRect(b.x,b.y,b.w,b.h);
    }

    // diamonds
    for(const d of state.diamondsArr){
      ctx.fillStyle='#0cf';
      ctx.beginPath();
      ctx.moveTo(d.x,d.y-d.r);
      ctx.lineTo(d.x+d.r,d.y);
      ctx.lineTo(d.x,d.y+d.r);
      ctx.lineTo(d.x-d.r,d.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  let lastTS=0;
  function loop(ts){
    if(!running)return; requestAnimationFrame(loop);
    if(paused)return;
    if(!lastTS)lastTS=ts;
    const dt=Math.min(0.033,(ts-lastTS)/1000); lastTS=ts;

    state.t+=dt; score+=Math.floor(dt*100); scoreEl.textContent=score;
    state.difficulty+=dt*0.02; state.speed=140+state.difficulty*180;

    state.spawnTimer-=dt; state.diamondTimer-=dt;
    if(state.spawnTimer<=0){ state.spawnTimer=Math.max(0.22,0.8-state.difficulty*0.35); spawnBlock(); }
    if(state.diamondTimer<=0){ state.diamondTimer=3+Math.random()*2; spawnDiamond(); }

    for(const b of state.blocks)b.y+=b.vy*dt;
    for(const d of state.diamondsArr)d.y+=d.vy*dt;

    const px=state.player.x,py=state.player.y,pr=state.player.r;
    for(let i=state.diamondsArr.length-1;i>=0;i--){
      const d=state.diamondsArr[i];
      if(Math.hypot(d.x-px,d.y-py)<pr+d.r){
        state.diamondsArr.splice(i,1);
        diamonds+=1; localStorage.setItem('otd_diamonds',diamonds);
        playDiamond(); showToast('+1 diamond');
      } else if(d.y-d.r>canvas.clientHeight+40){ state.diamondsArr.splice(i,1); }
    }

    for(let i=state.blocks.length-1;i>=0;i--){
      const b=state.blocks[i];
      if(circleRectCollide(px,py,pr,b.x,b.y,b.w,b.h)){ playHit(); endGame(); return; }
      else if(b.y>canvas.clientHeight+60) state.blocks.splice(i,1);
    }
    draw();
  }

  playBtn.addEventListener('click',()=>{ startGame(); lastTS=0; requestAnimationFrame(loop); });
  pauseBtn.addEventListener('click',()=>{ if(!running)return; paused=!paused; pauseBtn.textContent=paused?'▶︎':'⏸︎'; if(!paused){ lastTS=0; requestAnimationFrame(loop);} });

  settingsBtn.addEventListener('click',()=>settingsSheet.classList.add('show'));
  closeSettings.addEventListener('click',()=>settingsSheet.classList.remove('show'));

  // New toggles for rainbow + tilt
  const rainbowToggle=document.createElement('label');
  rainbowToggle.className='toggle';
  rainbowToggle.innerHTML=`<input type="checkbox" id="rainbowToggle"><span>Rainbow Blocks</span>`;
  settingsSheet.querySelector('.sheet-inner').insertBefore(rainbowToggle, closeSettings);
  const tiltToggle=document.createElement('label');
  tiltToggle.className='toggle';
  tiltToggle.innerHTML=`<input type="checkbox" id="tiltToggle"><span>Tilt Controls</span>`;
  settingsSheet.querySelector('.sheet-inner').insertBefore(tiltToggle, closeSettings);

  const rainbowInput=rainbowToggle.querySelector('input');
  const tiltInput=tiltToggle.querySelector('input');
  rainbowInput.checked=localStorage.getItem('otd_rainbow')==='1';
  tiltInput.checked=localStorage.getItem('otd_tilt')==='1';
  state.rainbowBlocks=rainbowInput.checked;
  state.tiltControls=tiltInput.checked;
  rainbowInput.addEventListener('change',()=>{ state.rainbowBlocks=rainbowInput.checked; localStorage.setItem('otd_rainbow', rainbowInput.checked?'1':'0'); });
  tiltInput.addEventListener('change',()=>{ state.tiltControls=tiltInput.checked; localStorage.setItem('otd_tilt', tiltInput.checked?'1':'0'); });

  draw();
})();
