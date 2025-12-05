/* Lightweight adapter to populate a Volume Card from /api/taostats_aggregates
   Usage: include this script as a module or normal script. It looks for elements
   with the `data-tao-volume-card` attribute and updates them.
*/
(function () {
  const URL = '/api/taostats_aggregates';
  const POLL_MS = 60_000;
  const ENTER = 0.05;
  const EXIT = 0.03;

  // Diagnostic flag — set to true to emit verbose logs to console
  const DEBUG = true;

  if (DEBUG) console.info('taostats-card: init', { URL, POLL_MS, ENTER, EXIT });

  function formatCompact(num) {
    if (num === null || num === undefined) return '—';
    // Millions with 2 decimals
    if (Math.abs(num) >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (Math.abs(num) >= 1e3) return '$' + (num / 1e3).toFixed(1) + 'k';
    return '$' + Number(num).toLocaleString();
  }

  function findCards() { return Array.from(document.querySelectorAll('[data-tao-volume-card]')); }

  function findLegacyVolumeEl() {
    // Older markup uses a simple `#volume24h` value inside a `.stat-card`.
    return document.getElementById('volume24h');
  }

  function applyToLegacy(legacyEl, data, lastState) {
    if (!legacyEl) return;
    const parentCard = legacyEl.closest('.stat-card') || legacyEl.parentElement;

    // Use trend_direction from backend (dual-MA confirmation)
    const candidate = data.trend_direction || 'neutral';

    if (parentCard) {
      // Avoid mutating legacy `.stat-card` containers' classes here because
      // the Ampelsystem (script.js) is responsible for the card-level
      // blink/pulse styling. Only update pulse classes on the newer
      // `.tao-volume-card` variant (if present) to prevent visual conflicts.
      if (parentCard.classList.contains('tao-volume-card')) {
        parentCard.classList.remove('pulse-up','pulse-down','neutral');
        if (candidate === 'up') {
          parentCard.classList.add('pulse-up');
        } else if (candidate === 'down') {
          parentCard.classList.add('pulse-down');
        } else {
          parentCard.classList.add('neutral');
        }
      }

      // Always manage the icon glow only (safe for legacy `.stat-card`).
      const icon = parentCard.querySelector('.stat-icon');
      if (icon) {
        icon.classList.remove('pulse-up', 'pulse-down');
        if (candidate === 'up') {
          icon.classList.add('pulse-up');
          icon.style.animation = '';
          icon.style.filter = '';
        } else if (candidate === 'down') {
          icon.classList.add('pulse-down');
          icon.style.animation = '';
          icon.style.filter = '';
        } else {
          icon.style.animation = '';
          icon.style.filter = '';
        }
      }
    }

    legacyEl.textContent = formatCompact(data.last_volume);

    // Tooltip is handled by Ampelsystem in script.js - don't set here

    lastState.direction = candidate;
    lastState.last = data.last_volume;
  }

  function applyToCard(cardEl, data, lastState) {
    const valueEl = cardEl.querySelector('[data-tao-volume-last]');
    const badgeEl = cardEl.querySelector('[data-tao-volume-delta]');

    // Use trend_direction from backend (dual-MA confirmation)
    const candidate = data.trend_direction || 'neutral';

    // Border/background styling is handled exclusively by Ampelsystem in script.js
    // Only manage pulse classes for icon glow effects
    cardEl.classList.remove('pulse-up','pulse-down','neutral');
    if (candidate === 'up') {
      cardEl.classList.add('pulse-up');
    } else if (candidate === 'down') {
      cardEl.classList.add('pulse-down');
    } else {
      cardEl.classList.add('neutral');
    }

    if (valueEl) valueEl.textContent = formatCompact(data.last_volume);
    if (badgeEl) {
      const disp = pctMed ?? pctShort;
      badgeEl.textContent = (disp === null || disp === undefined) ? '—' : ((disp>0?'+':'') + (disp*100).toFixed(2) + '%');
      badgeEl.setAttribute('data-confidence', data.confidence || 'low');
    }

    // Remove stray titles to avoid duplicate small browser tooltips
    try { cardEl.removeAttribute && cardEl.removeAttribute('title'); } catch (e) {}
    try { badgeEl && badgeEl.removeAttribute && badgeEl.removeAttribute('title'); } catch (e) {}
    try { valueEl && valueEl.removeAttribute && valueEl.removeAttribute('title'); } catch (e) {}

    // Tooltip is handled by Ampelsystem in script.js - don't set here

    // Also add glow to stat-icon for visibility
    try {
      const icon = cardEl && cardEl.querySelector && cardEl.querySelector('.stat-icon');
      if (icon) {
        icon.classList.remove('pulse-up','pulse-down');
        if (candidate === 'up') icon.classList.add('pulse-up');
        else if (candidate === 'down') icon.classList.add('pulse-down');
      }
    } catch (e) {}

    lastState.direction = candidate;
    lastState.last = data.last_volume;
  }

  async function fetchAggregates() {
    try {
      if (DEBUG) console.debug('taostats-card: fetching aggregates', URL);
      const r = await fetch(URL, { cache: 'no-store' });
      if (!r.ok) {
        console.warn('taostats-card: fetch non-ok', r.status, r.statusText);
        return null;
      }
      const json = await r.json();
      if (DEBUG) console.debug('taostats-card: fetched aggregates', json);
      return json;
    } catch (e) {
      console.error('taostats-card: fetch exception', e);
      return null;
    }
  }

  async function pollAndUpdate() {
    const data = await fetchAggregates();
    if (!data) return;
    const cards = findCards();
    if (cards.length > 0) {
      cards.forEach((c) => {
        if (!c.__tao_state) c.__tao_state = { direction: 'neutral' };
        applyToCard(c, data, c.__tao_state);
      });
    } else {
      const legacy = findLegacyVolumeEl();
      if (legacy) {
        const parent = legacy.closest('.stat-card') || legacy.parentElement;
        if (!parent.__tao_state) parent.__tao_state = { direction: 'neutral' };
        applyToLegacy(legacy, data, parent.__tao_state);
      }
    }
  }

  // bootstrap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      pollAndUpdate(); setInterval(pollAndUpdate, POLL_MS);
    });
  } else { pollAndUpdate(); setInterval(pollAndUpdate, POLL_MS); }

  // expose for testing
  window.taostatsCard = { pollAndUpdate, formatCompact };
})();
