// ===== Theme Toggle Module (ES6) =====
// Light/Dark mode switching with Safari/PWA fallbacks

/**
 * Apply light or dark mode styles to all elements
 * @param {boolean} active - True for light mode, false for dark mode
 * @param {Object} elements - DOM element references
 */
function applyThemeStyles(active, elements) {
  const { body, header, moonIcon, sunIcon, elementsToToggle } = elements;

  // Toggle light-bg class on all elements
  elementsToToggle.forEach(el => {
    if (!el) return;
    if (active) {
      el.classList.add('light-bg');
    } else {
      el.classList.remove('light-bg');
    }
  });

  // Switch spoon background image for Fear & Greed card
  const spoonBg = document.getElementById('fngSpoonImage');
  if (spoonBg) {
    spoonBg.src = active ? 'assets/fng-spoon-white.png' : 'assets/fng-spoon-black.png';
  }

  // JS fallback for browsers that do not fully respect CSS overrides (Safari, PWA quirks)
  const rootStyle = getComputedStyle(document.documentElement);
  const accent = (rootStyle.getPropertyValue('--accent') || '#22c55e').trim();
  const brand = (rootStyle.getPropertyValue('--brand') || '#ff6b35').trim();

  document.querySelectorAll('.disclaimer-card, .price-pill, .halving-pill').forEach(el => {
    if (!el) return;
    if (active) {
      if (el.classList.contains('disclaimer-card')) {
        el.style.background = '#fff';
        el.style.backgroundImage = 'none';
        el.style.border = '1px solid #c0c0c0';
        el.style.boxShadow = '0 12px 32px rgba(0,0,0,0.08)';
        el.style.color = '#000';
        el.style.backdropFilter = 'none';
        el.style.filter = 'none';
        // also set child elements explicitly to avoid CSS overrides
        const txt = el.querySelectorAll('.disclaimer-text, .disclaimer-header h3, .coingecko-attribution, .source-label');
        txt.forEach(ch => {
          ch.style.color = '#000';
          ch.style.opacity = '1';
          ch.style.fontWeight = '';
          ch.style.webkitTextFillColor = '#000';
        });
      }
      // Ensure anchor links inside disclaimer remain green in Light Mode (Safari fallback)
      const anchors = el.querySelectorAll('a');
      anchors.forEach(a => {
        a.style.setProperty('color', '#22c55e', 'important');
        a.style.setProperty('-webkit-text-fill-color', '#22c55e', 'important');
      });
      if (el.classList.contains('price-pill')) {
        el.style.background = '#fff';
        el.style.borderColor = '#dcdcdc';
        el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
        el.style.color = '#000';
        el.style.borderLeft = `4px solid ${accent}`;
      }
      if (el.classList.contains('halving-pill')) {
        el.style.background = '#fff';
        el.style.borderColor = '#dcdcdc';
        el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
        el.style.color = '#000';
        el.style.borderLeft = `4px solid ${brand}`;
      }
    } else {
      // Remove inline styles to fall back to CSS rules for Dark Mode
      el.style.background = '';
      el.style.backgroundImage = '';
      el.style.border = '';
      el.style.borderColor = '';
      el.style.boxShadow = '';
      el.style.color = '';
      el.style.borderLeft = '';
      el.style.backdropFilter = '';
      el.style.filter = '';
      if (el.classList.contains('disclaimer-card')) {
        // clear inline styles from children
        const txt = el.querySelectorAll('.disclaimer-text, .disclaimer-header h3, .coingecko-attribution, .source-label');
        txt.forEach(ch => {
          ch.style.color = '';
          ch.style.opacity = '';
          ch.style.fontWeight = '';
          ch.style.webkitTextFillColor = '';
        });
        // clear anchor overrides as well
        el.querySelectorAll('a').forEach(a => {
          a.style.removeProperty('color');
          a.style.removeProperty('-webkit-text-fill-color');
        });
      }
    }
  });

  // Swap the miner map thumbnail once per theme change
  const mapThumb = document.getElementById('mapThumb');
  if (mapThumb) {
    if (active) {
      const lightSrc = 'assets/miner-map-thumb-light.png';
      mapThumb.onerror = function() { mapThumb.onerror = null; mapThumb.src = 'assets/miner-map-thumb.png'; mapThumb.style.filter = ''; };
      mapThumb.src = lightSrc;
      mapThumb.style.filter = 'none';
    } else {
      mapThumb.onerror = null;
      mapThumb.src = 'assets/miner-map-thumb.png';
      mapThumb.style.filter = '';
    }
  }

  // Body and header background
  if (active) {
    body.style.background = '#dadada';
    if (header) header.style.background = '#dadada';
    // JS fallback for footer in case CSS does not apply (Safari / PWA quirks)
    document.querySelectorAll('.site-footer').forEach(f => {
      f.style.background = '#dadada';
      f.style.color = '#222';
      const p = f.querySelectorAll('p');
      p.forEach(el => {
        el.style.color = '#222';
        el.style.opacity = '1';
        el.style.webkitTextFillColor = '#222';
      });
    });
    moonIcon.style.display = 'none';
    sunIcon.style.display = 'inline';
  } else {
    body.style.background = '';
    if (header) header.style.background = '';
    document.querySelectorAll('.site-footer').forEach(f => {
      f.style.background = '';
      f.style.color = '';
      const p = f.querySelectorAll('p');
      p.forEach(el => {
        el.style.color = '';
        el.style.opacity = '';
        el.style.webkitTextFillColor = '';
      });
    });
    moonIcon.style.display = 'inline';
    sunIcon.style.display = 'none';
  }
}

/**
 * Initialize theme toggle functionality
 * @returns {Object|null} Theme controller with setLightMode function, or null if elements not found
 */
export function initThemeToggle() {
  const btn = document.getElementById('bgToggleBtn');
  const moonIcon = document.getElementById('moonIcon');
  const sunIcon = document.getElementById('sunIcon');

  if (!btn || !moonIcon || !sunIcon) return null;

  const body = document.body;
  const header = document.querySelector('header.site-header');
  const refreshIndicator = document.getElementById('refresh-indicator');

  // Safari-friendly element collection
  const elementsToToggle = [
    body,
    header,
    refreshIndicator,
    ...Array.from(document.querySelectorAll('.dashboard-card, .stat-card, .market-conditions-card, .price-pill, .halving-pill, .ath-atl-pill, .whitepaper-btn, #bgToggleBtn, #soundToggleBtn, .stat-value, .info-badge, .pill-value, .disclaimer-card, .site-footer, .pill-currency-toggle'))
  ];

  const elements = { body, header, moonIcon, sunIcon, elementsToToggle };

  // Create setLightMode function bound to elements
  function setLightMode(active) {
    applyThemeStyles(active, elements);
  }

  // Initial state from localStorage
  setLightMode(localStorage.getItem('bgMode') === 'light');

  // Toggle on click
  btn.addEventListener('click', function() {
    const isLight = body.classList.contains('light-bg');
    setLightMode(!isLight);
    localStorage.setItem('bgMode', isLight ? 'dark' : 'light');
  });

  // Return controller for external use
  return {
    setLightMode,
    isLightMode: () => body.classList.contains('light-bg')
  };
}
