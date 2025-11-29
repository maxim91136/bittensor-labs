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
      parentCard.classList.remove('pulse-up','pulse-down','neutral');
      if (candidate === 'up') {
        parentCard.classList.add('pulse-up');
        // Green tint for positive change
        parentCard.style.animation = '';
        parentCard.style.boxShadow = '';
        parentCard.style.border = '2px solid rgba(16,185,129,0.40)';
        parentCard.style.backgroundColor = 'rgba(16,185,129,0.08)';
      } else if (candidate === 'down') {
        parentCard.classList.add('pulse-down');
        // Red tint for negative change
        parentCard.style.animation = '';
        parentCard.style.boxShadow = '';
        parentCard.style.border = '2px solid rgba(239,68,68,0.40)';
        parentCard.style.backgroundColor = 'rgba(239,68,68,0.08)';
      } else {
        parentCard.classList.add('neutral');
        parentCard.style.animation = '';
        parentCard.style.boxShadow = '';
        parentCard.style.border = '';
        parentCard.style.backgroundColor = '';
      }
      
      // Also set inline styles on stat-icon for glow effect
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

    // Build tooltip with all available MA values and confidence
    const pctShort = typeof data.pct_change_vs_ma_short === 'number' ? data.pct_change_vs_ma_short : null;
    const pctMed = typeof data.pct_change_vs_ma_med === 'number' ? data.pct_change_vs_ma_med : null;
    const pct3d = typeof data.pct_change_vs_ma_3d === 'number' ? data.pct_change_vs_ma_3d : null;
    const pct7d = typeof data.pct_change_vs_ma_7d === 'number' ? data.pct_change_vs_ma_7d : null;
    const shortText = (pctShort !== null) ? ((pctShort>0?'+':'') + (pctShort*100).toFixed(2) + '%') : '—';
    const medText = (pctMed !== null) ? ((pctMed>0?'+':'') + (pctMed*100).toFixed(2) + '%') : '—';
    const text3d = (pct3d !== null) ? ((pct3d>0?'+':'') + (pct3d*100).toFixed(2) + '%') : '—';
    const text7d = (pct7d !== null) ? ((pct7d>0?'+':'') + (pct7d*100).toFixed(2) + '%') : '—';
    const confidence = data.confidence || 'low';
    let tt = `Δ vs MA (100min): ${shortText}\nΔ vs MA (1day): ${medText}`;
    if (text3d !== '—') tt += `\nΔ vs MA (3day): ${text3d}`;
    if (text7d !== '—') tt += `\nΔ vs MA (7day): ${text7d}`;
    tt += `\nconfidence: ${confidence}`;
    try {
      const info = parentCard && parentCard.querySelector && parentCard.querySelector('.info-badge');
      if (info) {
        info.setAttribute('data-tooltip', tt);
      }
    } catch (e) {}

    lastState.direction = candidate;
    lastState.last = data.last_volume;
  }

  function applyToCard(cardEl, data, lastState) {
    const valueEl = cardEl.querySelector('[data-tao-volume-last]');
    const badgeEl = cardEl.querySelector('[data-tao-volume-delta]');

    // Use trend_direction from backend (dual-MA confirmation)
    const candidate = data.trend_direction || 'neutral';

    cardEl.classList.remove('pulse-up','pulse-down','neutral');
    if (candidate === 'up') {
      cardEl.classList.add('pulse-up');
      // Green tint for positive change
      cardEl.style.animation = '';
      cardEl.style.boxShadow = '';
      cardEl.style.border = '2px solid rgba(16,185,129,0.40)';
      cardEl.style.backgroundColor = 'rgba(16,185,129,0.08)';
    } else if (candidate === 'down') {
      cardEl.classList.add('pulse-down');
      // Red tint for negative change
      cardEl.style.animation = '';
      cardEl.style.boxShadow = '';
      cardEl.style.border = '2px solid rgba(239,68,68,0.40)';
      cardEl.style.backgroundColor = 'rgba(239,68,68,0.08)';
    } else {
      cardEl.classList.add('neutral');
      cardEl.style.animation = '';
      cardEl.style.boxShadow = '';
      cardEl.style.border = '';
      cardEl.style.backgroundColor = '';
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

    // Build tooltip with all available MA values and confidence
    try {
      const pctShort = typeof data.pct_change_vs_ma_short === 'number' ? data.pct_change_vs_ma_short : null;
      const pctMed = typeof data.pct_change_vs_ma_med === 'number' ? data.pct_change_vs_ma_med : null;
      const pct3d = typeof data.pct_change_vs_ma_3d === 'number' ? data.pct_change_vs_ma_3d : null;
      const pct7d = typeof data.pct_change_vs_ma_7d === 'number' ? data.pct_change_vs_ma_7d : null;
      const shortText = (pctShort !== null) ? ((pctShort>0?'+':'') + (pctShort*100).toFixed(2) + '%') : '—';
      const medText = (pctMed !== null) ? ((pctMed>0?'+':'') + (pctMed*100).toFixed(2) + '%') : '—';
      const text3d = (pct3d !== null) ? ((pct3d>0?'+':'') + (pct3d*100).toFixed(2) + '%') : '—';
      const text7d = (pct7d !== null) ? ((pct7d>0?'+':'') + (pct7d*100).toFixed(2) + '%') : '—';
      const confidence = data.confidence || 'low';
      let tt = `Δ vs MA (100min): ${shortText}\nΔ vs MA (1day): ${medText}`;
      if (text3d !== '—') tt += `\nΔ vs MA (3day): ${text3d}`;
      if (text7d !== '—') tt += `\nΔ vs MA (7day): ${text7d}`;
      tt += `\nconfidence: ${confidence}`;
      try {
        const info = cardEl.querySelector && cardEl.querySelector('.info-badge');
        if (info) { info.setAttribute('data-tooltip', tt); }
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
