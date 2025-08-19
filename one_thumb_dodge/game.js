(() => {
  // One‑Thumb Dodge — mobile web game (PWA)
  // Author: ChatGPT for Chase
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

  // PWA install prompt hint
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }

  function showToast(msg, ms = 1800) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), ms);
  }

  // Device pixel ratio handling for sharp canvas
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

  // State
  let running = false;
  let paused = false;
  let score = 0;
  let best = Number(localStorage.getItem('otd_best') || '0');
  let games = Number(localStorage.getItem('otd_games') || '0');
  bestEl.textContent = best;
  gamesEl.textContent = games;

  const state = {
    t: 0,
    player: { x: 0, y: 0, r: 18, vx: 0 },
    blocks: [],
    coins: [],
    spawnTimer: 0,
    coinTimer: 0,
    speed: 140, // px/s base
    difficulty: 0, // increases over time
  };

  // Input (thumb drag horizontally, anywhere on canvas)
  let dragging = false;
  let dragOffsetX = 0;

  function clientToCanvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left);
  }

  canvas.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    dragging = true;
    dragOffsetX = clientToCanvasX(t.clientX) - state.player.x;
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const t = e.changedTouches[0];
    let targetX = clientToCanvasX(t.clientX) - dragOffsetX;
    targetX = Math.max(state.player.r + 4, Math.min(targetX, canvas.clientWidth - state.player.r - 4));
    state.player.x = targetX;
  }, { passive: true });

  canvas.addEventListener('touchend', () => { dragging = false; }, { passive: true });
  canvas.addEventListener('touchcancel', () => { dragging = false; }, { passive: true });

  // Simple WebAudio beeps for SFX
  let audioCtx = null;
  function beep(freq = 500, length = 0.07, type = 'sine', vol = 0.04) {
    if (!sfxToggle.checked) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      setTimeout(() => { o.stop(); }, length * 1000);
    } catch {}
  }

  function playCoin() { beep(840, 0.06, 'square', 0.04); }
  function playHit()  { beep(220, 0.10, 'sawtooth', 0.05); }

  // Game helpers
  function resetGame() {
    score = 0;
    state.t = 0;
    state.blocks.length = 0;
    state.coins.length = 0;
    state.spawnTimer = 0;
    state.coinTimer = 0;
    state.speed = 140;
    state.difficulty = 0;

    const px = canvas.clientWidth / 2;
    const py = canvas.clientHeight - 80;
    state.player.x = px;
    state.player.y = py;
  }

  function startGame() {
    resetGame();
    running = true;
    paused = false;
    overlay.classList.remove('show');
    pauseBtn.textContent = '⏸︎';
  }

  function endGame() {
    running = false;
    games += 1;
    localStorage.setItem('otd_games', String(games));
    gamesEl.textContent = games;

    if (score > best) {
      best = score;
      localStorage.setItem('otd_best', String(best));
      bestEl.textContent = best;
      showToast('New Best!');
    } else {
      showToast('Game Over');
    }
    overlay.classList.add('show');
  }

  // Spawning
  function spawnBlock() {
    const width = 24 + Math.random() * 70;
    const x = 8 + Math.random() * (canvas.clientWidth - width - 16);
    const y = -40;
    const speed = state.speed * (0.9 + Math.random() * 0.3);
    state.blocks.push({ x, y, w: width, h: 16 + Math.random()*40, vy: speed });
  }

  function spawnCoin() {
    const r = 10;
    const x = r + Math.random() * (canvas.clientWidth - r*2);
    const y = -20;
    const speed = state.speed * (0.85 + Math.random() * 0.25);
    state.coins.push({ x, y, r, vy: speed });
  }

  // Collision detection
  function circleRectCollide(cx, cy, cr, rx, ry, rw, rh) {
    // clamp circle center to rect
    const testX = Math.max(rx, Math.min(cx, rx + rw));
    const testY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - testX;
    const dy = cy - testY;
    return dx*dx + dy*dy <= cr*cr;
  }

  // Render
  function draw() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // clear
    ctx.clearRect(0, 0, w, h);

    // background grid
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#0e1520';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    // player
    const p = state.player;
    // subtle shadow
    ctx.beginPath();
    ctx.arc(p.x, p.y+2, p.r+2, 0, Math.PI*2);
    ctx.fillStyle = '#06111e';
    ctx.fill();

    // gradient ball
    const g = ctx.createRadialGradient(p.x - p.r*0.3, p.y - p.r*0.3, p.r*0.2, p.x, p.y, p.r);
    g.addColorStop(0, '#7cc8ff');
    g.addColorStop(1, '#1b3a5a');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fillStyle = g;
    ctx.fill();

    // blocks
    for (const b of state.blocks) {
      const grd = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      grd.addColorStop(0, '#20324a');
      grd.addColorStop(1, '#0f1a29');
      ctx.fillStyle = grd;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // top highlight
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(b.x, b.y, b.w, 2);
    }

    // coins
    for (const c of state.coins) {
      const cg = ctx.createRadialGradient(c.x - c.r*0.3, c.y - c.r*0.3, c.r*0.2, c.x, c.y, c.r);
      cg.addColorStop(0, '#ffd56a');
      cg.addColorStop(1, '#c59a2a');
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
      ctx.fillStyle = cg;
      ctx.fill();
      // coin shine
      ctx.beginPath();
      ctx.arc(c.x - c.r*0.3, c.y - c.r*0.35, c.r*0.3, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
    }
  }

  // Update
  let lastTS = 0;
  function loop(ts) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (paused) return;

    if (!lastTS) lastTS = ts;
    const dt = Math.min(0.033, (ts - lastTS) / 1000);
    lastTS = ts;

    state.t += dt;
    score += Math.floor(dt * 100);
    scoreEl.textContent = score;

    // difficulty ramp
    state.difficulty += dt * 0.02; // slow ramp
    state.speed = 140 + state.difficulty * 180;

    // spawn timers
    state.spawnTimer -= dt;
    state.coinTimer -= dt;
    const spawnEvery = Math.max(0.22, 0.8 - state.difficulty * 0.35);
    if (state.spawnTimer <= 0) {
      state.spawnTimer = spawnEvery;
      spawnBlock();
      // sometimes two blocks
      if (Math.random() < Math.min(0.35, state.difficulty * 0.5)) spawnBlock();
    }
    const coinEvery = Math.max(0.9, 2.2 - state.difficulty * 0.6);
    if (state.coinTimer <= 0) {
      state.coinTimer = coinEvery;
      if (Math.random() < 0.8) spawnCoin();
    }

    // integrate
    const px = state.player.x, py = state.player.y, pr = state.player.r;
    // Move blocks
    for (const b of state.blocks) {
      b.y += b.vy * dt;
    }
    // Move coins
    for (const c of state.coins) {
      c.y += c.vy * dt;
    }

    // collect coins
    for (let i = state.coins.length - 1; i >= 0; i--) {
      const c = state.coins[i];
      if (Math.hypot(c.x - px, c.y - py) < pr + c.r) {
        state.coins.splice(i, 1);
        score += 250;
        playCoin();
        showToast('+250');
      } else if (c.y - c.r > canvas.clientHeight + 40) {
        state.coins.splice(i, 1);
      }
    }

    // collisions with blocks
    for (let i = state.blocks.length - 1; i >= 0; i--) {
      const b = state.blocks[i];
      if (circleRectCollide(px, py, pr, b.x, b.y, b.w, b.h)) {
        playHit();
        endGame();
        return;
      } else if (b.y > canvas.clientHeight + 60) {
        state.blocks.splice(i, 1);
      }
    }

    draw();
  }

  // UI handlers
  playBtn.addEventListener('click', () => {
    startGame();
    lastTS = 0;
    requestAnimationFrame(loop);
  });

  pauseBtn.addEventListener('click', () => {
    if (!running) return;
    paused = !paused;
    pauseBtn.textContent = paused ? '▶︎' : '⏸︎';
    if (!paused) {
      lastTS = 0;
      requestAnimationFrame(loop);
    }
  });

  settingsBtn.addEventListener('click', () => settingsSheet.classList.add('show'));
  closeSettings.addEventListener('click', () => settingsSheet.classList.remove('show'));

  // Left-hand HUD just flips score/pause
  function applyHUDSide() {
    const topBar = document.getElementById('top-bar');
    topBar.style.flexDirection = leftHandToggle.checked ? 'row-reverse' : 'row';
  }
  leftHandToggle.addEventListener('change', () => {
    localStorage.setItem('otd_left', leftHandToggle.checked ? '1' : '0');
    applyHUDSide();
  });
  // restore prefs
  leftHandToggle.checked = localStorage.getItem('otd_left') === '1';
  sfxToggle.checked = localStorage.getItem('otd_sfx') !== '0';
  applyHUDSide();
  sfxToggle.addEventListener('change', () => {
    localStorage.setItem('otd_sfx', sfxToggle.checked ? '1' : '0');
  });

  // Resume audio context on first user interaction (iOS requirement)
  ['touchstart','mousedown'].forEach(evt => {
    window.addEventListener(evt, () => {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }, { once: true, passive: true });
  });

  // Initial draw (title screen background)
  draw();
})();