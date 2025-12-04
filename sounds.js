// Minimal WebAudio SoundManager (no external deps)
// Exposes `window.sound` with: init(), play(name), toggleMute(), isMuted(), setVolume(v)
(function(){
  const ctx = { audioCtx: null, masterGain: null, muted: false, volume: 0.18, _pending: [] };

  function ensureAudioContext() {
    if (!ctx.audioCtx) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        ctx.audioCtx = new AudioContext();
        ctx.masterGain = ctx.audioCtx.createGain();
        ctx.masterGain.gain.value = ctx.volume;
        ctx.masterGain.connect(ctx.audioCtx.destination);
        if (ctx.muted) ctx.masterGain.gain.value = 0;
      } catch(e) {
        console.warn('WebAudio unavailable', e);
      }
    }
  }

  function resumeIfNeeded() {
    if (ctx.audioCtx && ctx.audioCtx.state === 'suspended') {
      // attempt to resume; if successful, flush pending plays
      ctx.audioCtx.resume().then(() => {
        try { flushPending(); } catch(e){}
      }).catch(()=>{});
    } else if (ctx.audioCtx && ctx.audioCtx.state === 'running') {
      try { flushPending(); } catch(e){}
    }
  }

  function flushPending() {
    if (!ctx._pending || ctx._pending.length === 0) return;
    const toPlay = ctx._pending.slice();
    ctx._pending.length = 0;
    setTimeout(() => {
      toPlay.forEach(n => { try { playImmediate(n); } catch(e){} });
    }, 8);
  }

  // internal immediate play that bypasses pending queue checks
  function playImmediate(name) {
    switch(name) {
      case 'drip': playDrip(); break;
      case 'whoosh': playWhoosh(); break;
      case 'blockTick': playBlockTick(); break;
      case 'terminalTick': playTerminalTick(); break;
      case 'terminalChime': playTerminalChime(); break;
      default: break;
    }
  }

  function envelopeGain(duration, attack=0.002, release=0.06) {
    const g = ctx.audioCtx.createGain();
    const now = ctx.audioCtx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + attack);
    g.gain.linearRampToValueAtTime(0, now + duration - release);
    g.gain.linearRampToValueAtTime(0, now + duration + 0.02);
    return g;
  }

  // tiny drip: short high-ish sine
  function playDrip() {
    ensureAudioContext(); if (!ctx.audioCtx) return;
    const o = ctx.audioCtx.createOscillator();
    const g = envelopeGain(0.18, 0.001, 0.05);
    o.type = 'sine';
    o.frequency.value = 720 + Math.random()*200;
    o.connect(g);
    g.connect(ctx.masterGain);
    o.start(); o.stop(ctx.audioCtx.currentTime + 0.18);
  }

  // whoosh: short noise filtered sweep
  function playWhoosh() {
    ensureAudioContext(); if (!ctx.audioCtx) return;
    const bufferSize = 2 * ctx.audioCtx.sampleRate;
    const noiseBuf = ctx.audioCtx.createBuffer(1, bufferSize, ctx.audioCtx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
    const src = ctx.audioCtx.createBufferSource();
    src.buffer = noiseBuf;
    const band = ctx.audioCtx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = 1200; band.Q.value = 0.8;
    const g = envelopeGain(0.38, 0.004, 0.12);
    // sweep down
    band.frequency.setValueAtTime(1800, ctx.audioCtx.currentTime);
    band.frequency.exponentialRampToValueAtTime(800, ctx.audioCtx.currentTime + 0.36);
    src.connect(band); band.connect(g); g.connect(ctx.masterGain);
    src.start(); src.stop(ctx.audioCtx.currentTime + 0.42);
  }

  // improved blockTick: layered metallic/filtered hit with slight noise, more Matrix-like
  function playBlockTick() {
    ensureAudioContext(); if (!ctx.audioCtx) return;
    const now = ctx.audioCtx.currentTime;
    // carrier with quick frequency sweep
    const carrier = ctx.audioCtx.createOscillator(); carrier.type = 'sine';
    const carrierGain = ctx.audioCtx.createGain();
    carrierGain.gain.setValueAtTime(0.0001, now);
    carrier.frequency.setValueAtTime(220, now);
    carrier.frequency.exponentialRampToValueAtTime(880, now + 0.09);
    carrierGain.gain.linearRampToValueAtTime(0.9, now + 0.003);
    carrierGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

    // subtle metallic overtone using detuned saw
    const overtone = ctx.audioCtx.createOscillator(); overtone.type = 'sawtooth';
    overtone.frequency.value = 660;
    overtone.detune.value = (Math.random() - 0.5) * 10;
    const overtoneGain = ctx.audioCtx.createGain(); overtoneGain.gain.setValueAtTime(0.18, now);
    overtoneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    // small noise burst through bandpass for 'impact' tone
    const bufferSize = Math.floor(ctx.audioCtx.sampleRate * 0.06);
    const noiseBuf = ctx.audioCtx.createBuffer(1, bufferSize, ctx.audioCtx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
    const src = ctx.audioCtx.createBufferSource(); src.buffer = noiseBuf;
    const band = ctx.audioCtx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1200; band.Q.value = 1.2;
    const noiseGain = ctx.audioCtx.createGain(); noiseGain.gain.setValueAtTime(0.7, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    // mix nodes
    carrier.connect(carrierGain); carrierGain.connect(ctx.masterGain);
    overtone.connect(overtoneGain); overtoneGain.connect(ctx.masterGain);
    src.connect(band); band.connect(noiseGain); noiseGain.connect(ctx.masterGain);

    carrier.start(now); carrier.stop(now + 0.26);
    overtone.start(now); overtone.stop(now + 0.22);
    src.start(now); src.stop(now + 0.08);
  }

  // terminal tick: short per-line click (for terminal boot typing)
  function playTerminalTick() {
    ensureAudioContext(); if (!ctx.audioCtx) return;
    const now = ctx.audioCtx.currentTime;
    const o = ctx.audioCtx.createOscillator(); o.type = 'square';
    o.frequency.value = 1200 + Math.random() * 300;
    const g = ctx.audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.6, now + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    o.connect(g); g.connect(ctx.masterGain);
    o.start(now); o.stop(now + 0.06);
  }

  // terminal chime: small soft arpeggio to mark completion of boot
  function playTerminalChime() {
    ensureAudioContext(); if (!ctx.audioCtx) return;
    const now = ctx.audioCtx.currentTime;
    const freqs = [880, 1100, 1320];
    freqs.forEach((f, i) => {
      const o = ctx.audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const t = now + i * 0.06;
      const g = ctx.audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.6, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(ctx.masterGain);
      o.start(t); o.stop(t + 0.22);
    });
  }

  function init() {
    ensureAudioContext();
    // try to resume at start if user already interacted
    document.addEventListener('click', resumeIfNeeded, {once:true});
    document.addEventListener('keydown', resumeIfNeeded, {once:true});
    // also attempt to flush pending when page becomes visible (some browsers resume on visibility)
    document.addEventListener('visibilitychange', () => { try { resumeIfNeeded(); } catch(e){} });
    return ctx;
  }

  function play(name) {
    try { resumeIfNeeded(); } catch(e){}
    // if no audio context yet, create it (may be suspended until user gesture)
    ensureAudioContext();
    // if suspended, queue the play request to be flushed when resumed
    if (ctx.audioCtx && ctx.audioCtx.state !== 'running') {
      ctx._pending.push(name);
      return;
    }
    if (ctx.muted) return;
    playImmediate(name);
  }

  function toggleMute(setTo) {
    ensureAudioContext();
    if (typeof setTo === 'boolean') ctx.muted = !(!setTo);
    else ctx.muted = !ctx.muted;
    if (ctx.masterGain) ctx.masterGain.gain.value = ctx.muted ? 0 : ctx.volume;
    try { localStorage.setItem('soundMuted', ctx.muted ? '1' : '0'); } catch(e){}
    return ctx.muted;
  }

  function isMuted(){ return !!ctx.muted; }
  function setVolume(v){ ctx.volume = Math.max(0, Math.min(1, v)); if (ctx.masterGain && !ctx.muted) ctx.masterGain.gain.value = ctx.volume; }

  // initialize default muted from localStorage (default ON = unmuted)
  try { const m = localStorage.getItem('soundMuted'); if (m === '1') ctx.muted = true; else ctx.muted = false; } catch(e){}

  window.sound = { init, play, toggleMute, isMuted, setVolume };
})();
