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

    const pctShort = typeof data.pct_change_vs_ma_short === 'number' ? data.pct_change_vs_ma_short : null;
    const pctMed = typeof data.pct_change_vs_ma_med === 'number' ? data.pct_change_vs_ma_med : null;

    let candidate = 'neutral';
    if (pctShort !== null) {
      if (pctShort >= ENTER) candidate = 'up';
      else if (pctShort <= -ENTER) candidate = 'down';
    } else if (pctMed !== null) {
      if (pctMed >= ENTER) candidate = 'up';
      else if (pctMed <= -ENTER) candidate = 'down';
    }

    const cur = lastState.direction || 'neutral';
    if (cur === 'up') { if (pctShort !== null && pctShort < EXIT) candidate = 'neutral'; }
    if (cur === 'down') { if (pctShort !== null && pctShort > -EXIT) candidate = 'neutral'; }

    if (parentCard) {
      parentCard.classList.remove('pulse-up','pulse-down','neutral');
      if (candidate === 'up') parentCard.classList.add('pulse-up');
      else if (candidate === 'down') parentCard.classList.add('pulse-down');
      else parentCard.classList.add('neutral');
    }

    legacyEl.textContent = formatCompact(data.last_volume);

    const disp = pctMed ?? pctShort;
    const pctText = (typeof disp === 'number') ? ((disp>0?'+':'') + (disp*100).toFixed(2) + '%') : '—';
    const confidence = data.confidence || 'low';
    const tt = `Δ vs MA10: ${pctText} — confidence: ${confidence}`;
    try {
      const info = parentCard && parentCard.querySelector && parentCard.querySelector('.info-badge');
      if (info) {
        info.title = tt; info.setAttribute('data-tooltip', tt);
      } else if (parentCard) {
        parentCard.title = tt; parentCard.setAttribute('data-tooltip', tt);
      } else {
        legacyEl.title = tt; legacyEl.setAttribute('data-tooltip', tt);
      }
    } catch (e) {}

    lastState.direction = candidate;
    lastState.last = data.last_volume;
  }

  function applyToCard(cardEl, data, lastState) {
    const valueEl = cardEl.querySelector('[data-tao-volume-last]');
    const badgeEl = cardEl.querySelector('[data-tao-volume-delta]');

    const pctShort = typeof data.pct_change_vs_ma_short === 'number' ? data.pct_change_vs_ma_short : null;
    const pctMed = typeof data.pct_change_vs_ma_med === 'number' ? data.pct_change_vs_ma_med : null;

    let candidate = 'neutral';
    if (pctShort !== null) {
      if (pctShort >= ENTER) candidate = 'up';
      else if (pctShort <= -ENTER) candidate = 'down';
    } else if (pctMed !== null) {
      if (pctMed >= ENTER) candidate = 'up';
      else if (pctMed <= -ENTER) candidate = 'down';
    }

    // hysteresis
    const cur = lastState.direction || 'neutral';
    if (cur === 'up') { if (pctShort !== null && pctShort < EXIT) candidate = 'neutral'; }
    if (cur === 'down') { if (pctShort !== null && pctShort > -EXIT) candidate = 'neutral'; }

    cardEl.classList.remove('pulse-up','pulse-down','neutral');
    if (candidate === 'up') cardEl.classList.add('pulse-up');
    else if (candidate === 'down') cardEl.classList.add('pulse-down');
    else cardEl.classList.add('neutral');

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

    // Put percent change and confidence into the card tooltip (no visible percent badge)
    try {
      const disp = pctMed ?? pctShort;
      const pctText = (typeof disp === 'number') ? ((disp>0?'+':'') + (disp*100).toFixed(2) + '%') : '—';
      const confidence = data.confidence || 'low';
      const tt = `Δ vs MA10: ${pctText} — confidence: ${confidence}`;
      try {
        const info = cardEl.querySelector && cardEl.querySelector('.info-badge');
        if (info) { info.title = tt; info.setAttribute('data-tooltip', tt); }
        else { cardEl.title = tt; cardEl.setAttribute('data-tooltip', tt); }
      } catch (e) { /* ignore */ }
    } catch (e) {
      // ignore
    }

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
