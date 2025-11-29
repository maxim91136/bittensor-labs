/* Lightweight adapter to populate a Volume Card from /api/taostats_aggregates
   Usage: include this script as a module or normal script. It looks for elements
   with the `data-tao-volume-card` attribute and updates them.
*/
(function () {
  const URL = '/api/taostats_aggregates';
  const POLL_MS = 60_000;
  const ENTER = 0.05;
  const EXIT = 0.03;

  function formatCompact(num) {
    if (num === null || num === undefined) return '—';
    // Millions with 2 decimals
    if (Math.abs(num) >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (Math.abs(num) >= 1e3) return '$' + (num / 1e3).toFixed(1) + 'k';
    return '$' + Number(num).toLocaleString();
  }

  function findCards() { return Array.from(document.querySelectorAll('[data-tao-volume-card]')); }

  function applyToCard(cardEl, data, lastState) {
      const valueEl = cardEl.querySelector('[data-tao-volume-last]');
      const inlinePctEl = cardEl.querySelector('[data-tao-volume-delta-inline]') || cardEl.querySelector('#volume24h_pct');

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
    // Populate MA10 dollar value into the MA element
    const maEl = cardEl.querySelector('[data-tao-volume-ma]') || cardEl.querySelector('#volume24h_ma');
    if (maEl) {
      const maVal = (typeof data.ma_med === 'number') ? data.ma_med : null;
      maEl.textContent = maVal ? formatCompact(maVal) : '—';

      // color the MA pill depending on whether last > MA (higher -> green, lower -> red)
      maEl.classList.remove('higher','lower','neutral');
      try {
        if (typeof maVal === 'number' && typeof data.last_volume === 'number') {
          if (data.last_volume > maVal) maEl.classList.add('higher');
          else if (data.last_volume < maVal) maEl.classList.add('lower');
          else maEl.classList.add('neutral');
        } else {
          maEl.classList.add('neutral');
        }
      } catch (e) {
        maEl.classList.add('neutral');
      }

      // Set tooltip showing MA10 value, percent delta and confidence (short English)
      const disp = pctMed ?? pctShort;
      const pctText = (typeof disp === 'number') ? ((disp>0?'+':'') + (disp*100).toFixed(2) + '%') : '—';
      const confidence = data.confidence || 'low';
      try {
        maEl.title = `MA10: ${maEl.textContent} — Δ ${pctText} — confidence: ${confidence}`;
        maEl.setAttribute('data-tooltip', `MA10: ${maEl.textContent} — Δ ${pctText} — confidence: ${confidence}`);
      } catch (e) {
        // ignore
      }
      // Percent display removed — we keep MA tooltip only
    }
    

    lastState.direction = candidate;
    lastState.last = data.last_volume;
  }

  async function fetchAggregates() {
    try {
      const r = await fetch(URL, { cache: 'no-store' });
      if (!r.ok) throw new Error('Fetch failed: ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('taostats fetch error', e);
      return null;
    }
  }

  async function pollAndUpdate() {
    const data = await fetchAggregates();
    if (!data) return;
    const cards = findCards();
    cards.forEach((c) => {
      if (!c.__tao_state) c.__tao_state = { direction: 'neutral' };
      applyToCard(c, data, c.__tao_state);
    });
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
