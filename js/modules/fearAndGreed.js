// ===== Fear & Greed UI Module (ES6) =====
// Spoon gauge animation, F&G display updates

import { fetchFearAndGreed } from './api.js';

/**
 * Map F&G classification to CSS class
 */
export function mapFngToClass(classification) {
  if (!classification) return 'fng-neutral';
  const c = String(classification).toLowerCase();
  if (c.includes('fear')) return 'fng-red';
  if (c.includes('greed')) return 'fng-green';
  if (c.includes('neutral')) return 'fng-yellow';
  return 'fng-yellow';
}

/**
 * Animate the needle along the curved spoon path
 */
export function animateSpoonNeedle(value) {
  const needleGroup = document.getElementById('fngNeedleGroup');
  const needleCircle = document.getElementById('fngNeedleCircle');
  const spoonPath = document.getElementById('spoonPath');

  if (!needleGroup || !spoonPath) return;

  // Get the total length of the path
  const pathLength = spoonPath.getTotalLength();

  // Calculate position along path (0-100 maps to 0%-100% of path)
  const pct = Math.max(0, Math.min(100, Number(value)));
  const distance = (pct / 100) * pathLength;

  // Get the point on the path
  const point = spoonPath.getPointAtLength(distance);

  // Move the needle to this point
  needleGroup.setAttribute('transform', `translate(${point.x}, ${point.y})`);

  // Color the needle based on value
  let needleColor = '#fff';
  if (pct < 25) {
    needleColor = '#ef4444'; // red (extreme fear)
  } else if (pct < 45) {
    needleColor = '#f59e0b'; // orange (fear)
  } else if (pct < 55) {
    needleColor = '#eab308'; // yellow (neutral)
  } else if (pct < 75) {
    needleColor = '#84cc16'; // lime (greed)
  } else {
    needleColor = '#22c55e'; // green (extreme greed)
  }

  if (needleCircle) {
    needleCircle.setAttribute('fill', needleColor);
  }
}

/**
 * Test function for the spoon gauge animation
 * Usage in browser console: testSpoonGauge(75) to test Greed value
 */
export function testSpoonGauge(value = 50) {
  const pct = Math.max(0, Math.min(100, Number(value)));

  // Animate the needle
  animateSpoonNeedle(pct);

  // Update display values
  const elValueCenter = document.getElementById('fngValueCenter');
  const elClass = document.getElementById('fngClass');

  if (elValueCenter) elValueCenter.textContent = `${Math.round(pct)}`;

  // Set classification based on value
  let classification = '';
  if (pct < 25) {
    classification = 'Extreme Fear';
  } else if (pct < 45) {
    classification = 'Fear';
  } else if (pct < 55) {
    classification = 'Neutral';
  } else if (pct < 75) {
    classification = 'Greed';
  } else {
    classification = 'Extreme Greed';
  }

  if (elClass) elClass.textContent = classification;

  // Update card color class
  const card = document.getElementById('fngCard');
  if (card) {
    card.classList.remove('fng-red', 'fng-yellow', 'fng-green');
    if (pct < 45) {
      card.classList.add('fng-red');
    } else if (pct < 55) {
      card.classList.add('fng-yellow');
    } else {
      card.classList.add('fng-green');
    }
  }

  // Also update left-side badge when using test helper
  try {
    const side = document.querySelector('#fngCard .fng-side-status .status-text');
    if (side) {
      const lc = String(classification || '').toLowerCase();
      if (lc.includes('fear')) side.textContent = 'FEAR';
      else if (lc.includes('greed')) side.textContent = 'GREED';
      else if (lc.includes('neutral')) side.textContent = 'NEUTRAL';
      else side.textContent = Math.round(pct).toString();
    }
  } catch(e) { if (window._debug) console.debug('test side status update failed', e); }

  console.log(`🥄 Spoon Gauge set to: ${pct} (${classification})`);
  return true;
}

/**
 * Update Fear & Greed display with latest data
 */
export async function updateFearAndGreed() {
  const infoBadge = document.getElementById('fngInfo');
  const timelineTextEl = document.getElementById('fngTimelineText');
  const data = await fetchFearAndGreed();

  // Store globally for API status tooltip
  window._fearAndGreed = data;

  if (!data || !data.current) {
    return;
  }

  const cur = data.current;
  const value = cur.value ? Number(cur.value) : null;

  // Color class
  const card = document.getElementById('fngCard');
  if (card) {
    card.classList.remove('fng-red','fng-yellow','fng-green');
    card.classList.add(mapFngToClass(cur.value_classification));
  }

  // Update left-side status badge text (FEAR / NEUTRAL / GREED)
  try {
    const side = document.querySelector('#fngCard .fng-side-status .status-text');
    if (side) {
      const c = String(cur.value_classification || '').toLowerCase();
      if (c.includes('fear')) side.textContent = 'FEAR';
      else if (c.includes('greed')) side.textContent = 'GREED';
      else if (c.includes('neutral')) side.textContent = 'NEUTRAL';
      else side.textContent = (typeof cur.value === 'number') ? Math.round(cur.value).toString() : '—';
    }
  } catch (e) { if (window._debug) console.debug('update side status failed', e); }

  // Tooltip: show source + last-updated
  let lastTs = cur.timestamp || cur._time || null;
  if (lastTs && typeof lastTs === 'string' && lastTs.length === 10 && !isNaN(Number(lastTs))) {
    // If timestamp is unix seconds, convert to ms
    lastTs = Number(lastTs) * 1000;
  }
  // Show actual source (CMC or alternative.me)
  const sourceStr = data._source === 'coinmarketcap' ? 'CoinMarketCap' : 'alternative.me';
  const updatedText = lastTs ? new Date(lastTs).toLocaleString() : '—';
  const tooltipText = `Source: ${sourceStr}\n\nLast updated: ${updatedText}`;
  try { if (infoBadge) infoBadge.setAttribute('data-tooltip', tooltipText); } catch (e) {}

  // Animate spoon needle along the curved path
  try {
    const elValueCenter = document.getElementById('fngValueCenter');
    const elClass = document.getElementById('fngClass');

    if (typeof value === 'number' && !isNaN(value)) {
      const pct = Math.max(0, Math.min(100, Number(value)));
      animateSpoonNeedle(pct);
      if (elValueCenter) elValueCenter.textContent = `${Math.round(pct)}`;
      if (elClass) elClass.textContent = cur.value_classification || '';
    } else {
      animateSpoonNeedle(0);
      if (elValueCenter) elValueCenter.textContent = '—';
      if (elClass) elClass.textContent = '—';
    }
  } catch (e) { if (window._debug) console.debug('spoon needle animate failed', e); }

  // Render F&G timeline in a clear, human-readable order: Now → Yesterday → Week → Month
  const entries = {};
  if (data.last_month) entries['Month'] = data.last_month;
  if (data.last_week) entries['Week'] = data.last_week;
  if (data.yesterday) entries['Yesterday'] = data.yesterday;
  entries['Now'] = cur;

  if (timelineTextEl) {
    const order = ['Now', 'Yesterday', 'Week', 'Month'];
    const labels = { Now: 'Now', Yesterday: 'Yesterday', Week: 'Week', Month: 'Month' };

    const parts = order.filter(k => entries[k]).map(k => `${labels[k]}: ${entries[k].value}`);
    const tooltipParts = order.filter(k => entries[k]).map(k => `${labels[k]}: ${entries[k].value_classification}`);

    timelineTextEl.textContent = parts.join(' | ');
    timelineTextEl.setAttribute('title', tooltipParts.join(' | '));
  }
}

// Expose test function on window for console debugging
if (typeof window !== 'undefined') {
  window.testSpoonGauge = testSpoonGauge;
}
