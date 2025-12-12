// ===== Matrix Sound Engine =====
const MatrixSound = (function() {
  let audioContext = null;
  let soundEnabled = localStorage.getItem('matrixSoundEnabled') !== 'false'; // Default: enabled
  let isUnlocked = false;

  // Initialize Audio Context (lazy load on first sound)
  function getAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  // Unlock audio context (required by browsers after user interaction)
  function unlockAudio() {
    if (isUnlocked) return;

    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Play silent sound to unlock
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.01);

      isUnlocked = true;
    } catch (e) {
      console.warn('Audio unlock failed:', e);
    }
  }

  // Toggle sound on/off
  function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('matrixSoundEnabled', soundEnabled);
    return soundEnabled;
  }

  // Check if sound is enabled
  function isEnabled() {
    return soundEnabled;
  }

  // Play a synthesized sound
  function play(type, options = {}) {
    if (!soundEnabled) return;

    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      switch(type) {
        case 'boot-power-up':
          playBootPowerUp(ctx, now, options);
          break;
        case 'boot-typing':
          playBootTyping(ctx, now, options);
          break;
        case 'boot-ready':
          playBootReady(ctx, now, options);
          break;
        case 'glitch':
          playGlitch(ctx, now, options);
          break;
        case 'pill-click':
          playPillClick(ctx, now, options);
          break;
        case 'halving-click':
          playHalvingClick(ctx, now, options);
          break;
        case 'refresh-beep':
          playRefreshBeep(ctx, now, options);
          break;
        default:
          console.warn('Unknown sound type:', type);
      }
    } catch (e) {
      console.warn('MatrixSound playback error:', e);
    }
  }

  // Boot Power-Up: Low to high frequency sweep
  function playBootPowerUp(ctx, startTime, options) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, startTime); // Start low
    osc.frequency.exponentialRampToValueAtTime(800, startTime + 1.2); // Sweep up

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.15, startTime + 0.1);
    gain.gain.linearRampToValueAtTime(0.08, startTime + 0.6);
    gain.gain.linearRampToValueAtTime(0, startTime + 1.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 1.2);
  }

  // Boot Typing: Quick blip sounds for terminal text (150Hz - bass)
  function playBootTyping(ctx, startTime, options) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.04, startTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.04);
  }

  // Boot Ready: Confirming beep (for sound toggle)
  function playBootReady(ctx, startTime, options) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, startTime);
    osc.frequency.setValueAtTime(660, startTime + 0.1);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.04, startTime + 0.02);
    gain.gain.linearRampToValueAtTime(0.03, startTime + 0.15);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.25);
  }

  // Glitch: Digital noise burst
  function playGlitch(ctx, startTime, options) {
    const bufferSize = ctx.sampleRate * 0.1; // 100ms
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.08, startTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.08);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(startTime);
  }

  // Price Pill Click: Neutral blip (400Hz) - länger
  function playPillClick(ctx, startTime, options) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.06, startTime + 0.02);
    gain.gain.linearRampToValueAtTime(0.04, startTime + 0.08);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.15);
  }

  // Halving Pill Click: Mechanical tick (300Hz) - länger
  function playHalvingClick(ctx, startTime, options) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.04, startTime + 0.02);
    gain.gain.linearRampToValueAtTime(0.03, startTime + 0.1);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.18);
  }

  // Auto-Refresh Beep: Subtle notification (220Hz)
  function playRefreshBeep(ctx, startTime, options) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.03, startTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.08);
  }

  return {
    play,
    toggleSound,
    isEnabled,
    unlockAudio
  };
})();

// Unlock audio on first user interaction
['click', 'touchstart', 'keydown'].forEach(event => {
  document.addEventListener(event, () => {
    MatrixSound.unlockAudio();
  }, { once: true });
});
