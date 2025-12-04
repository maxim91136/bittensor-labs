// Minimal Matrix-style glitch overlay
// Exposes: window.showMatrixGlitch({ duration, intensity })
(function () {
  const ID = 'matrixGlitchOverlay';
  const STYLE_ID = 'matrixGlitchStyles';

  function ensureDom() {
    if (document.getElementById(ID)) return document.getElementById(ID);
    // Insert styles
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        #${ID} { position: fixed; inset: 0; pointer-events: none; z-index: 9999; overflow: hidden; opacity: 0; transition: opacity 180ms ease; mix-blend-mode: screen; }
        #${ID}.matrix-glitch-active { opacity: 1; }
        #${ID} canvas { width: 100%; height: 100%; display: block; }
        `;
      document.head.appendChild(style);
    }
    const overlay = document.createElement('div');
    overlay.id = ID;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    overlay.appendChild(canvas);
    document.body.appendChild(overlay);
    return overlay;
  }

  function randomChar() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*+-/<>?';
    return chars.charAt(Math.floor(Math.random() * chars.length));
  }

  window.showMatrixGlitch = function showMatrixGlitch(opts = {}) {
    try {
      if (document.body.classList.contains('no-glitch')) return; // explicit opt-out
      const duration = typeof opts.duration === 'number' ? opts.duration : 900; // ms
      const intensity = Math.max(1, Math.min(4, Number(opts.intensity) || 1));
      const overlay = ensureDom();
      const canvas = overlay.querySelector('canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      function resize() {
        canvas.width = Math.floor(window.innerWidth * dpr);
        canvas.height = Math.floor(window.innerHeight * dpr);
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
      }
      resize();
      let rafId = null;
      let start = null;
      const cols = Math.floor(canvas.width / (16 * dpr));
      const fontSize = Math.max(12 * dpr, Math.round(18 * dpr * (intensity / 2)));
      const yPos = new Array(cols).fill(0).map(() => Math.random() * canvas.height);
      function frame(ts) {
        if (!start) start = ts;
        const t = ts - start;
        // semi-clear with small alpha to create trailing effect
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = fontSize + 'px monospace';
        ctx.textBaseline = 'top';
        const colWidth = Math.max(10 * dpr, fontSize * 0.6);
        for (let i = 0; i < cols; i++) {
          const x = i * colWidth;
          const ch = randomChar();
          const y = yPos[i];
          // bright green head
          ctx.fillStyle = 'rgba(180,255,180,0.95)';
          ctx.fillText(ch, x, y);
          // dim tail
          ctx.fillStyle = 'rgba(34,197,94,0.18)';
          for (let k = 1; k < 4 * intensity; k++) {
            if (y - k * (fontSize * 0.6) > 0) {
              ctx.fillText(randomChar(), x, y - k * (fontSize * 0.6));
            }
          }
          yPos[i] += (1 + intensity * Math.random() * 2) * fontSize * 0.06 * (dpr);
          if (yPos[i] > canvas.height + 50) yPos[i] = -Math.random() * canvas.height * 0.2;
        }
        // small horizontal bars for glitch effect
        ctx.fillStyle = 'rgba(36,180,80,0.12)';
        for (let b = 0; b < intensity; b++) {
          const h = Math.random() * 10 * dpr * intensity;
          const y = Math.random() * canvas.height;
          ctx.fillRect(Math.random() * canvas.width, y, Math.random() * (canvas.width / 2), h);
        }
        // stop condition
        if (t < duration) {
          rafId = requestAnimationFrame(frame);
        } else {
          cancelAnimationFrame(rafId);
          overlay.classList.remove('matrix-glitch-active');
          // cleanup after a short timeout to let CSS opacity fade
          setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            const style = document.getElementById(STYLE_ID);
            if (style) { /* keep style in case of repeated calls */ }
          }, 260);
        }
      }
      // attach
      overlay.classList.add('matrix-glitch-active');
      window.addEventListener('resize', resize);
      rafId = requestAnimationFrame(frame);
    } catch (err) {
      if (window._debug) console.error('showMatrixGlitch error', err);
    }
  };

})();
