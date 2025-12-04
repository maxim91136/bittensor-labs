// DOM-based Matrix Glitch overlay (RC20.2 style)
// Exposes window.showMatrixGlitch({ duration, intensity })
(function() {
  function _safe(el) { try { return el; } catch (e) { return null; } }
  // Ensure the DOM overlay exists and return it
  function ensureMatrixDom() {
    let overlay = document.getElementById('matrixGlitch');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'matrixGlitch';
    overlay.className = 'matrix-glitch-overlay';
    overlay.style.display = 'none';
    overlay.style.position = 'fixed';
    overlay.style.zIndex = '9999';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(10,14,18,0.92)';
    overlay.style.pointerEvents = 'none';
    const code = document.createElement('div');
    code.className = 'matrix-glitch-code';
    // default style can be overridden by CSS in style.css
    code.style.fontFamily = "'Fira Mono', monospace";
    code.style.fontSize = '2.2vw';
    code.style.lineHeight = '1.1';
    code.style.letterSpacing = '0.08em';
    code.style.textShadow = '0 0 8px #22c55e, 0 0 2px #fff';
    code.style.userSelect = 'none';
    overlay.appendChild(code);
    document.body.appendChild(overlay);
    return overlay;
  }

  window.showMatrixGlitch = function showMatrixGlitch(opts = {}) {
    try {
      if (document.body.classList.contains('no-glitch')) return;
      const duration = typeof opts.duration === 'number' ? opts.duration : 360;
      const fadeDuration = typeof opts.fade === 'number' ? opts.fade : 180;
      const overlay = ensureMatrixDom();
      const codeEl = overlay.querySelector('.matrix-glitch-code');
      const palette = opts.palette || ['#22c55e', '#16a34a', '#14532d', '#a3a3a3', '#525252', '#eaff00', '#b3b300', '#d1fae5', '#d4d4d4'];
      const glyphs = opts.glyphs || '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz░▒▓█▲◆◀▶◼︎◻︎※☰☲☷☯☢☣☠♠♣♥♦♤♧♡♢';
      // Build 1-2 horizontal rows based on viewport width to span the dashboard
      const fontSizeCss = window.getComputedStyle(document.documentElement).getPropertyValue('--glitch-font-size') || null;
      // Estimate font size (fallback) and chars per row
      const vpWidth = window.innerWidth || document.documentElement.clientWidth;
      const fontSize = Math.max(14, Math.min(26, Math.round(vpWidth * 0.022)));
      const charWidth = Math.max(8, Math.round(fontSize * 0.55));
      const charsPerRow = Math.max(16, Math.floor(vpWidth / charWidth));
      const rows = Math.min(2, Math.max(1, Math.round(opts.rows || 2)));
      let html = '';
      for (let r = 0; r < rows; r++) {
        let row = '';
        for (let j = 0; j < charsPerRow; j++) {
          const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
          const color = palette[Math.floor(Math.random() * palette.length)];
          row += `<span style="color:${color};">${String(ch).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
        }
        html += `<span>${row}</span>`;
      }
      if (codeEl) {
        codeEl.innerHTML = html;
      }
      overlay.style.display = 'flex';
      // small visible animation using CSS class
      overlay.classList.add('active');
      setTimeout(() => {
        overlay.classList.remove('active');
        setTimeout(() => {
          overlay.style.display = 'none';
        }, fadeDuration);
      }, duration);
    } catch (err) {
      if (window._debug) console.error('showMatrixGlitch error', err);
    }
  };
})();

