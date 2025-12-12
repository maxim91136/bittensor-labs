// ===== Utility Functions (ES6 Module) =====
import { PRICE_CACHE_TTL, PRICE_CACHE_TTL_MAX } from './config.js';

export function animateValue(element, start, end, duration = 1000) {
  const startTime = performance.now();
  const isFloat = end % 1 !== 0;
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * easeProgress;
    if (isFloat) {
      element.textContent = formatNumber(current);
    } else {
      element.textContent = formatFull(Math.round(current));
    }
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = isFloat ? formatNumber(end) : formatFull(end);
    }
  }
  requestAnimationFrame(update);
}

export function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return Number(num).toLocaleString('en-US');
}

export function formatFull(num) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return Math.round(Number(num)).toLocaleString('en-US');
}

// Exact formatting with thousands separators and two decimals
export function formatExact(num) {
  if (num === null || num === undefined || isNaN(Number(num))) return '—';
  return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Compact display for large numbers (e.g. 1.23M, 4.56B)
export function formatCompact(num) {
  num = Number(num);
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  return num.toLocaleString('en-US');
}

export function formatPrice(price) {
  if (price === null || price === undefined || Number.isNaN(Number(price))) return 'N/A';
  return `$${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Round up to 2 decimal places (ceiling)
export function roundUpTo2(num) {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return NaN;
  return Math.ceil(Number(num) * 100) / 100;
}

export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

export function readPercentValue(ts, keys) {
  if (!ts) return null;
  for (const k of keys) {
    if (ts[k] !== undefined && ts[k] !== null) return ts[k];
    // allow nested objects (some APIs nest percent_change inside 'market_data' etc.)
    const parts = k.split('.');
    if (parts.length > 1) {
      let v = ts;
      for (const p of parts) { if (v && v[p] !== undefined) { v = v[p]; } else { v = undefined; break; } }
      if (v !== undefined && v !== null) return v;
    }
  }
  return null;
}

export function normalizeRange(raw) {
  const r = String(raw ?? '').trim().toLowerCase();
  if (r === '1y' || r === '1yr' || r === 'year') return '365';
  if (r === 'max' || r === 'all') return 'max';
  return r;
}

// ===== LocalStorage Cache Helpers =====
export function getCachedPrice(range) {
  try {
    const cached = localStorage.getItem(`tao_price_${range}`);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;
    const ttl = (range === '365') ? PRICE_CACHE_TTL_MAX : PRICE_CACHE_TTL;
    if (age < ttl) return data;
    localStorage.removeItem(`tao_price_${range}`);
    return null;
  } catch { return null; }
}

export function setCachedPrice(range, data) {
  try {
    localStorage.setItem(`tao_price_${range}`, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.warn('⚠️  Could not cache price data:', error);
  }
}
