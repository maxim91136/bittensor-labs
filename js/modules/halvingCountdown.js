// ===== Halving Countdown Module (ES6) =====
// Countdown timer and threshold calculations for TAO halving events

const HALVING_STORAGE_KEY = 'bittensor_last_halving';
const HALVING_API_URL = '/api/halving';

/**
 * Fetch halving data from backend API
 * @returns {Promise<Object|null>} Last halving data or null
 */
export async function fetchHalvingFromAPI() {
  try {
    const resp = await fetch(HALVING_API_URL);
    if (!resp.ok) return null;

    const data = await resp.json();
    if (data && data.last_halving && data.last_halving.at) {
      window._lastHalving = data.last_halving;
      // Also cache in localStorage for offline/fast access
      try {
        localStorage.setItem(HALVING_STORAGE_KEY, JSON.stringify(data.last_halving));
      } catch (e) { /* ignore */ }
      updateLastHalvingDisplay();
      return data.last_halving;
    }
  } catch (e) {
    console.warn('Failed to fetch halving from API:', e);
  }
  return null;
}

/**
 * Load last halving data from localStorage (fallback)
 * @returns {Object|null} { threshold, at } or null
 */
export function loadLastHalvingFromStorage() {
  try {
    const stored = localStorage.getItem(HALVING_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (data && data.at) {
        window._lastHalving = data;
        return data;
      }
    }
  } catch (e) {
    console.warn('Failed to load last halving from localStorage:', e);
  }
  return null;
}

/**
 * Load last halving data - tries API first, falls back to localStorage
 * @returns {Object|null} { threshold, at } or null
 */
export function loadLastHalving() {
  // First try localStorage for instant display
  loadLastHalvingFromStorage();
  updateLastHalvingDisplay();

  // Then fetch from API to get authoritative data
  fetchHalvingFromAPI().catch(() => {});

  return window._lastHalving || null;
}

/**
 * Save halving event to localStorage
 * @param {number} threshold - The threshold that was crossed
 * @param {number} timestamp - Unix timestamp (ms) when it happened
 */
export function saveLastHalving(threshold, timestamp) {
  try {
    const data = { threshold, at: timestamp };
    localStorage.setItem(HALVING_STORAGE_KEY, JSON.stringify(data));
    window._lastHalving = data;
    updateLastHalvingDisplay();
  } catch (e) {
    console.warn('Failed to save last halving to localStorage:', e);
  }
}

/**
 * Format timestamp as ISO UTC date string
 * @param {number} timestamp - Unix timestamp (ms)
 * @returns {string} Formatted date e.g. "2025-12-27 14:35"
 */
function formatHalvingDateUTC(timestamp) {
  const d = new Date(timestamp);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const mins = String(d.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${mins}`;
}

/**
 * Update the last halving date display element
 */
export function updateLastHalvingDisplay() {
  const el = document.getElementById('lastHalvingDate');
  if (!el) return;

  if (window._lastHalving && window._lastHalving.at) {
    el.textContent = formatHalvingDateUTC(window._lastHalving.at);
  } else {
    el.textContent = '-';
  }
}

/**
 * Start the halving countdown timer
 * Updates every second
 */
export function startHalvingCountdown() {
  if (window.halvingInterval) clearInterval(window.halvingInterval);
  // Load persisted halving data and update display
  loadLastHalving();
  updateLastHalvingDisplay();
  updateHalvingCountdown();
  window.halvingInterval = setInterval(updateHalvingCountdown, 1000);
}

/**
 * Generate fixed halving thresholds for the token supply.
 * Example: for maxSupply=21_000_000 and maxEvents=6 it returns [10.5M, 15.75M, ...]
 * @param {number} maxSupply - Maximum token supply (default 21M)
 * @param {number} maxEvents - Number of halving events to generate (default 6)
 * @returns {number[]} Array of threshold values
 */
export function generateHalvingThresholds(maxSupply = 21_000_000, maxEvents = 6) {
  const arr = [];
  for (let n = 1; n <= maxEvents; n++) {
    const threshold = Math.round(maxSupply * (1 - 1 / Math.pow(2, n)));
    arr.push(threshold);
  }
  return arr;
}

/**
 * Find next threshold index where currentSupply < thresholds[index]
 * @param {number[]} thresholds - Array of halving thresholds
 * @param {number} currentSupply - Current circulating supply
 * @returns {number} Index of next threshold
 */
export function findNextThresholdIndex(thresholds = [], currentSupply = 0) {
  if (!Array.isArray(thresholds) || thresholds.length === 0) return 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (currentSupply < thresholds[i]) return i;
  }
  return thresholds.length - 1; // if already past all thresholds, return last index
}

/**
 * Calculate halving date for the given threshold index using emissionPerDay
 * @param {number[]} thresholds - Array of halving thresholds
 * @param {number} index - Threshold index to calculate for
 * @param {number} currentSupply - Current circulating supply
 * @param {number} emissionPerDay - Daily emission rate
 * @returns {Date|null} Projected halving date or null if cannot calculate
 */
export function rotateToThreshold(thresholds, index, currentSupply, emissionPerDay) {
  if (!Array.isArray(thresholds) || thresholds.length === 0) return null;
  const idx = Math.max(0, Math.min(index, thresholds.length - 1));
  const threshold = thresholds[idx];
  if (!emissionPerDay || emissionPerDay <= 0) return null;
  const remaining = Math.max(0, threshold - (currentSupply || 0));
  const daysToHalving = remaining / emissionPerDay;
  if (!Number.isFinite(daysToHalving)) return null;
  return new Date(Date.now() + daysToHalving * 24 * 60 * 60 * 1000);
}

/**
 * Update the halving countdown display
 * Reads from window.halvingDate, window._lastHalving, window._showSinceMs
 */
export function updateHalvingCountdown() {
  const el = document.getElementById('halvingCountdown');
  if (!el) return;

  // If we just had a halving, show 'Halved!' for the brief animation window
  if (window._lastHalving && (Date.now() - window._lastHalving.at) < 8000) {
    el.textContent = 'Halved!';
    return;
  }

  // If we recently had a halving and are within the "since" window, show a human-friendly 'since' text
  if (window._lastHalving && (Date.now() - window._lastHalving.at) < window._showSinceMs) {
    const diffMs = Date.now() - window._lastHalving.at;
    const hrs = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs / (1000 * 60)) % 60);
    if (hrs > 0) el.textContent = `Halved ${hrs}h ${mins}m ago`;
    else el.textContent = `Halved ${mins}m ago`;
    return;
  }

  if (!window.halvingDate) {
    el.textContent = 'Calculating...';
    return;
  }

  const now = new Date();
  const diff = window.halvingDate - now;
  if (diff <= 0) {
    el.textContent = 'Halved!';
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, '0');
  const minutes = String(Math.floor((diff / (1000 * 60)) % 60)).padStart(2, '0');
  const seconds = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');

  // Show days, hours, minutes, and seconds (h/m/s always 2 digits for stable width)
  el.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
