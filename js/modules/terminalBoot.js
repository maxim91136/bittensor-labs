// ===== Matrix Terminal Boot Sequence (ES6 Module) =====

const lines = [
  '> connecting to bittensor...',
  '> decrypting network data...',
  '> [pill me]'
];
const delays = [800, 800, 600]; // ms per line
const fadeDelay = 400;

function runTerminalBoot() {
  const overlay = document.getElementById('terminalBoot');
  if (!overlay) {
    if (window._debug) console.warn('terminalBoot: overlay not found');
    return;
  }

  const line1 = document.getElementById('termLine1');
  const line2 = document.getElementById('termLine2');
  const line3 = document.getElementById('termLine3');

  // Safety: If any line element is missing, skip boot animation
  if (!line1 || !line2 || !line3) {
    if (window._debug) console.warn('terminalBoot: missing line elements, skipping animation');
    overlay.classList.add('hidden');
    const ev = new CustomEvent('terminalBootDone');
    document.dispatchEvent(ev);
    return;
  }

  const lineEls = [line1, line2, line3];

  let i = 0;
  // safety: if the boot sequence doesn't finish (runtime error),
  // force-hide the overlay after a short timeout so init can continue.
  const MAX_BOOT_MS = 3000; // Reduced from 5s to 3s for better UX
  const forcedTimeout = setTimeout(() => {
    try {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.classList.add('hidden');
        const ev = new CustomEvent('terminalBootDone');
        document.dispatchEvent(ev);
      }, fadeDelay);
    } catch (e) {
      if (window._debug) console.warn('terminalBoot forced hide failed', e);
    }
  }, MAX_BOOT_MS);

  function showNext() {
    try {
      if (i < lines.length) {
        lineEls[i].textContent = lines[i];
        lineEls[i].classList.add('visible');

        i++;
        setTimeout(showNext, delays[i - 1]);
      } else {
        // All lines shown, wait then fade out
        clearTimeout(forcedTimeout);
        setTimeout(() => {
          overlay.classList.add('fade-out');
          setTimeout(() => {
            overlay.classList.add('hidden');
            // Notify that terminal boot finished so UI/data can re-verify
            try {
              const ev = new CustomEvent('terminalBootDone');
              document.dispatchEvent(ev);
            } catch (e) { /* ignore */ }
          }, fadeDelay);
        }, 800);
      }
    } catch (e) {
      if (window._debug) console.error('terminalBoot showNext error:', e);
      // On error, force cleanup
      clearTimeout(forcedTimeout);
      overlay.classList.add('hidden');
      const ev = new CustomEvent('terminalBootDone');
      document.dispatchEvent(ev);
    }
  }
  showNext();
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runTerminalBoot);
} else {
  runTerminalBoot();
}
