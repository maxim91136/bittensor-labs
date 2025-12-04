// ===== Matrix Terminal Boot Sequence =====
(function() {
  const lines = [
    '> connecting to bittensor...',
    '> decrypting network data...',
    '> [pill me]'
  ];
  const delays = [800, 800, 600]; // ms per line
  const fadeDelay = 400;
  
  function runTerminalBoot() {
    const overlay = document.getElementById('terminalBoot');
    if (!overlay) return;
    
    const line1 = document.getElementById('termLine1');
    const line2 = document.getElementById('termLine2');
    const line3 = document.getElementById('termLine3');
    const lineEls = [line1, line2, line3];
    
    let i = 0;
    // safety: if the boot sequence doesn't finish (runtime error or missing elements),
    // force-hide the overlay after a short timeout so init can continue.
    const MAX_BOOT_MS = 5000;
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
    }
    showNext();
  }
  
  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runTerminalBoot);
  } else {
    runTerminalBoot();
  }
})();

// If the terminal boot hides or races with our dashboard init, ensure we re-run init
document.addEventListener('terminalBootDone', async () => {
  try {
    // If dashboard already initialized, do nothing
    if (window._dashboardInitialized) return;
    // If an init is in progress, wait a bit and return
    if (window._dashboardInitInProgress) return;
    // Try to initialize dashboard now that terminal overlay is gone
    await initDashboard();
    // Also ensure other key UI pieces are refreshed in case they failed earlier
    try { await updateAthAtlPills(); } catch (e) {}
    try { await updateBlockTime(); } catch (e) {}
    try { await updateStakingApr(); } catch (e) {}
  } catch (err) {
    if (window._debug) console.warn('terminalBootDone handler error', err);
  }
});

// Ensure auto-refresh runs even if init failed (so periodic retries happen)
function ensureAutoRefreshStarted() {
  try {
    if (typeof refreshTimer === 'undefined' || refreshTimer === null) {
      startAutoRefresh();
    }
  } catch (e) {
    if (window._debug) console.warn('ensureAutoRefreshStarted error', e);
  }
}

// After terminal boot, double-check key UI elements and trigger a refresh if still empty
document.addEventListener('terminalBootDone', () => {
  ensureAutoRefreshStarted();
  // short delay to let any pending UI updates settle
  setTimeout(() => {
    try {
      const priceEl = document.getElementById('taoPrice');
      const changeEl = document.getElementById('priceChange');
      const halvingEl = document.getElementById('halvingCountdown');
      const needRefresh = (
        !priceEl || priceEl.textContent.trim() === '' || priceEl.classList.contains('skeleton-text')
      );
      if (needRefresh) {
        if (window._debug) console.log('terminalBootDone fallback: triggering refreshDashboard()');
        refreshDashboard();
      }
    } catch (e) {
      if (window._debug) console.warn('terminalBootDone fallback check failed', e);
    }
  }, 1200);
});

// ===== API Configuration =====
const API_BASE = '/api';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const REFRESH_INTERVAL = 60000;
const PRICE_CACHE_TTL = 300000;
const PRICE_CACHE_TTL_MAX = 3600000;

// ===== State Management =====
let priceChart = null;
let lastPrice = null;
let currentPriceRange = '7';
let isLoadingPrice = false;
// Track whether main dashboard init has completed
window._dashboardInitialized = false;
// Guard to prevent concurrent init runs
window._dashboardInitInProgress = false;

// Halving State
window.halvingDate = null;
window.halvingInterval = null;
window.circulatingSupply = null;
window._prevHalvingTs = null;
// Persisted snapshots for halving calculation and rotation
window._prevSupplyForHalving = null; // last snapshot of the supply used for halving computations
window._halvingIndex = 0; // index into the halving thresholds array
window._lastHalving = null; // { threshold, at: timestamp }
window._showSinceMs = 1000 * 60 * 60 * 24; // show "since" text for 24h after a halving
// Toggle to enable debugging messages in console: set `window._debug = true` at runtime
window._debug = false;
// Tooltip auto-hide duration (ms). Increased to double the previous default (2.5s -> 5s)
const TOOLTIP_AUTO_HIDE_MS = 5000;

// ===== Volume Signal (Ampelsystem) State =====
let _volumeHistory = null;
let _volumeHistoryTs = 0;
const VOLUME_HISTORY_TTL = 60000; // Cache history for 1 minute
const VOLUME_SIGNAL_THRESHOLD = 3; // ±3% threshold for "significant" change
// Price spike detection thresholds (conservative defaults)
const PRICE_SPIKE_PCT = 10; // if price moves >= 10% in 24h consider spike
const LOW_VOL_PCT = 5;     // if volume change < 5% treat as low-volume move
const SUSTAIN_VOL_PCT = 6; // sustained volume increase threshold (24h)
const TRADED_SHARE_MIN = 0.02; // percent of circ supply traded to consider move meaningful (0.02%)
const HYSTERESIS_REQUIRED = 2; // require 2 consecutive checks to mark sustained

/**
 * Fetch taostats history for volume change calculation
 */
async function fetchVolumeHistory() {
  // Use cached history if fresh
  if (_volumeHistory && (Date.now() - _volumeHistoryTs) < VOLUME_HISTORY_TTL) {
    return _volumeHistory;
  }
  try {
    const res = await fetch(`${API_BASE}/taostats_history`);
    if (!res.ok) throw new Error(`History API error: ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      _volumeHistory = data;
      _volumeHistoryTs = Date.now();
      return data;
    }
    return null;
  } catch (err) {
    if (window._debug) console.warn('⚠️ Volume history fetch failed:', err);
    return null;
  }
}

/**
 * Calculate volume change percentage from history
 * Compares current volume with volume from ~24h ago (or oldest available)
 * Returns: { change: number, confidence: 'high'|'medium'|'low', samples: number }
 */
function calculateVolumeChange(history, currentVolume) {
  if (!Array.isArray(history) || history.length < 2 || !currentVolume) return null;
  
  // Find entry from ~24h ago (or use oldest available)
  const now = Date.now();
  const targetTime = now - 24 * 60 * 60 * 1000; // 24h ago
  
  // Sort by timestamp ascending
  const sorted = [...history].sort((a, b) => 
    new Date(a._timestamp).getTime() - new Date(b._timestamp).getTime()
  );
  
  // Find the entry closest to 24h ago
  let oldEntry = sorted[0]; // fallback to oldest
  for (const entry of sorted) {
    const entryTime = new Date(entry._timestamp).getTime();
    if (entryTime <= targetTime) {
      oldEntry = entry;
    } else {
      break;
    }
  }
  
  const oldVolume = oldEntry?.volume_24h;
  if (!oldVolume || oldVolume <= 0) return null;
  
  const change = ((currentVolume - oldVolume) / oldVolume) * 100;
  
  // Calculate confidence based on history coverage for 24h comparison
  // We need good data coverage over the 24h period for reliable signals
  const oldestTime = new Date(sorted[0]._timestamp).getTime();
  const hoursOfData = (now - oldestTime) / (60 * 60 * 1000);
  const samples = sorted.length;
  
  // Confidence levels for 24h volume change:
  // - High: ≥22h coverage with ≥50 samples (near-complete 24h data)
  // - Medium: ≥16h coverage with ≥30 samples (decent coverage)
  // - Low: less data, signal may be unreliable
  let confidence = 'low';
  if (hoursOfData >= 22 && samples >= 50) {
    confidence = 'high';
  } else if (hoursOfData >= 16 && samples >= 30) {
    confidence = 'medium';
  }
  
  return { change, confidence, samples, hoursOfData: Math.round(hoursOfData) };
}

/**
 * Volume Signal (Ampelsystem) Logic
 * Returns: { signal: 'green'|'red'|'yellow'|'orange'|'neutral', tooltip: string }
 * 
 * Signals:
 * 🟢 GREEN:  Volume ↑ + Price ↑ = Bullish (strong demand, healthy uptrend)
 * 🔴 RED:    Volume ↑ + Price ↓ = Bearish/Distribution (panic selling)
 * 🟡 YELLOW: Volume ↓ + Price ↑ = Weak uptrend (losing momentum)
 *            Volume ↓ + Price ↓ = Consolidation (low interest)
 * 🟠 ORANGE: Volume ↑ + Price stable = Potential breakout incoming
 * ⚪ NEUTRAL: No significant change
 */
function getVolumeSignal(volumeData, priceChange, currentVolume = null, aggregates = null) {
  // Handle missing data
  if (volumeData === null || priceChange === null) {
    return { signal: 'neutral', tooltip: 'Insufficient data for signal' };
  }
  
  // Support both old format (number) and new format (object with change, confidence)
  const volumeChange = typeof volumeData === 'object' ? volumeData.change : volumeData;
  const confidence = typeof volumeData === 'object' ? volumeData.confidence : null;
  const samples = typeof volumeData === 'object' ? volumeData.samples : null;
  const hoursOfData = typeof volumeData === 'object' ? volumeData.hoursOfData : null;
  
  const threshold = VOLUME_SIGNAL_THRESHOLD;
  const volUp = volumeChange > threshold;
  const volDown = volumeChange < -threshold;
  const priceUp = priceChange > threshold;
  const priceDown = priceChange < -threshold;
  const priceStable = !priceUp && !priceDown;
  
  const volStr = volumeChange >= 0 ? `+${volumeChange.toFixed(1)}%` : `${volumeChange.toFixed(1)}%`;
  const priceStr = priceChange >= 0 ? `+${priceChange.toFixed(1)}%` : `${priceChange.toFixed(1)}%`;
  
  // Build confidence line
  let confidenceLine = '';
  if (confidence) {
    confidenceLine = `\n\nConfidence: ${confidence} (${samples} samples, ${hoursOfData}h data)`;
  }
  
  // Composite detection: Sustained bullish vs short spikes
  // Check for sustained bullish: moving averages aligned AND volume up enough
  try {
    const maShortPct = aggregates?.pct_change_vs_ma_short ?? null;
    const ma3dPct = aggregates?.pct_change_vs_ma_3d ?? null;
    const maShortUp = (maShortPct !== null && maShortPct > 0);
    const ma3dUp = (ma3dPct !== null && ma3dPct > 0);
    // traded share (percent) if data available
    let tradedSharePct = null;
    if (currentVolume && window.circulatingSupply) tradedSharePct = (currentVolume / window.circulatingSupply) * 100;
    const sustainCondition = maShortUp && ma3dUp && (volumeChange >= SUSTAIN_VOL_PCT || (tradedSharePct !== null && tradedSharePct >= TRADED_SHARE_MIN));
    if (sustainCondition) {
      // hysteresis: require consecutive confirmations to avoid flapping
      window._sustainedBullishCount = (window._sustainedBullishCount || 0) + 1;
    } else {
      window._sustainedBullishCount = 0;
    }
    if ((window._sustainedBullishCount || 0) >= HYSTERESIS_REQUIRED) {
      return {
        signal: 'green',
        tooltip: `🟢 Sustained bullish\nVolume: ${volStr}\nPrice: ${priceStr}\nMoving averages aligned — sustained buying pressure` + (confidenceLine || '')
      };
    }
  } catch (e) {
    if (window._debug) console.debug('sustained detection failed', e);
  }

  // 🟢 GREEN: Volume up + Price up = Strong buying pressure
  if (volUp && priceUp) {
    return {
      signal: 'green',
      tooltip: `🟢 Bullish\nVolume: ${volStr}\nPrice: ${priceStr}\nStrong demand, healthy uptrend${confidenceLine}`
    };
  }
  
  // 🔴 RED: Volume up + Price down = Distribution/Panic selling
  if (volUp && priceDown) {
    return {
      signal: 'red',
      tooltip: `🔴 Bearish\nVolume: ${volStr}\nPrice: ${priceStr}\nDistribution phase, selling pressure${confidenceLine}`
    };
  }
  
  // 🟠 ORANGE: Volume up + Price stable = Potential breakout
  if (volUp && priceStable) {
    return {
      signal: 'orange',
      tooltip: `🟠 Watch\nVolume: ${volStr}\nPrice: ${priceStr}\nHigh activity, potential breakout${confidenceLine}`
    };
  }
  
  // Detect low-volume strong price moves (price spike on thin liquidity)
  // This should trigger even when volumeChange is slightly positive but below LOW_VOL_PCT.
  if (priceUp && Math.abs(volumeChange) < LOW_VOL_PCT && priceChange >= PRICE_SPIKE_PCT) {
    let pctTraded = null;
    if (currentVolume && window.circulatingSupply) {
      pctTraded = (currentVolume / window.circulatingSupply) * 100;
    }
    const spikeLines = [`🟡 Price spike (low volume)`, `Volume: ${volStr}`, `Price: ${priceStr}`];
    if (pctTraded !== null) spikeLines.push(`Traded: ${pctTraded.toFixed(4)}% of circ supply`);
    spikeLines.push('Likely thin liquidity or exchange-limited move', confidenceLine);
    return { signal: 'yellow', tooltip: spikeLines.join('\n') };
  }

  // 🟡 YELLOW: Volume down + Price up = Weak uptrend
  if (volDown && priceUp) {
    // Special-case: if price moved strongly but volume change is small, mark as low-volume price spike
    if (priceChange >= PRICE_SPIKE_PCT && Math.abs(volumeChange) < LOW_VOL_PCT) {
      // compute percent of circ supply traded if we have currentVolume and circulatingSupply
      let pctTraded = null;
      if (currentVolume && window.circulatingSupply) {
        pctTraded = (currentVolume / window.circulatingSupply) * 100;
      }
      const spikeLines = [`🟡 Price spike (low volume)`,`Volume: ${volStr}`,`Price: ${priceStr}`];
      if (pctTraded !== null) spikeLines.push(`Traded: ${pctTraded.toFixed(4)}% of circ supply`);
      spikeLines.push('Likely thin liquidity or exchange-limited move', confidenceLine);
      return { signal: 'yellow', tooltip: spikeLines.join('\n') };
    }

    return {
      signal: 'yellow',
      tooltip: `🟡 Caution\nVolume: ${volStr}\nPrice: ${priceStr}\nUptrend losing momentum${confidenceLine}`
    };
  }
  
  // 🟡 YELLOW: Volume down + Price down = Consolidation
  if (volDown && priceDown) {
    return {
      signal: 'yellow',
      tooltip: `🟡 Consolidation\nVolume: ${volStr}\nPrice: ${priceStr}\nLow interest, sideways market${confidenceLine}`
    };
  }
  
  // ⚪ STABLE: No significant movement (includes vol↓ + price stable)
  return {
    signal: 'neutral',
    tooltip: `⚪ Stable\nVolume: ${volStr}\nPrice: ${priceStr}\nQuiet market conditions${confidenceLine}`
  };
}

// Track last valid signal to preserve animation on API errors
let _lastVolumeSignal = null;

/**
 * Apply volume signal to the Volume card
 * All signals (including neutral/white) get their own glow animation.
 */
function applyVolumeSignal(signal, tooltip) {
  const volumeCard = document.getElementById('volume24h')?.closest('.stat-card');
  if (!volumeCard) return;
  
  const infoBadge = volumeCard.querySelector('.info-badge');
  const baseTooltip = 'TAO trading volume in the last 24 hours';
  
  // Always update tooltip
  if (infoBadge && tooltip) {
    infoBadge.setAttribute('data-tooltip', `${baseTooltip}\n\n${tooltip}`);
  }
  
  // If same signal as before, don't touch the classes (keeps animation smooth)
  if (signal === _lastVolumeSignal) {
    if (window._debug) console.log(`📊 Volume Signal: unchanged (${signal})`);
    return;
  }
  
  // Signal changed - update classes
  const allBlinkClasses = ['blink-green', 'blink-red', 'blink-yellow', 'blink-orange', 'blink-white'];
  
  // Map neutral to white for CSS class
  const cssSignal = signal === 'neutral' ? 'white' : signal;
  
  // Add new class first, then remove others (prevents flash to default)
  volumeCard.classList.add(`blink-${cssSignal}`);
  allBlinkClasses.filter(c => c !== `blink-${cssSignal}`).forEach(c => volumeCard.classList.remove(c));
  _lastVolumeSignal = signal;
  if (window._debug) console.log(`📊 Volume Signal: changed to ${signal}`, tooltip);

  // Update a small subtitle element under the value for quick visible hint
  try {
    let sub = volumeCard.querySelector('.stat-sub');
    if (!sub) {
      sub = document.createElement('div');
      sub.className = 'stat-sub';
      // place it after the stat-value element if present
      const val = volumeCard.querySelector('.stat-value');
      if (val && val.parentNode) val.parentNode.insertBefore(sub, val.nextSibling);
      else volumeCard.appendChild(sub);
    }
    // Keep subtitle short
    const short = (signal === 'green') ? 'Sustained buying' : (signal === 'yellow') ? 'Low-volume move' : (signal === 'red') ? 'Distribution' : (signal === 'orange') ? 'High activity' : 'Quiet';
    sub.textContent = short;
  } catch (e) {
    if (window._debug) console.debug('Failed to update volume subtitle', e);
  }
}

/**
 * Format compact dollar amount for MA display
 */
function formatMADollar(num) {
  if (num === null || num === undefined) return '—';
  if (Math.abs(num) >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
  if (Math.abs(num) >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
  if (Math.abs(num) >= 1e3) return '$' + (num / 1e3).toFixed(1) + 'k';
  return '$' + Number(num).toLocaleString();
}

/**
 * Format percentage for MA display
 */
function formatMAPct(num) {
  if (num === null || num === undefined) return '—';
  const pct = (num * 100).toFixed(1);
  return num >= 0 ? `+${pct}%` : `${pct}%`;
}

/**
 * Fetch taostats aggregates (for MA data)
 */
async function fetchTaostatsAggregates() {
  try {
    const res = await fetch('/api/taostats_aggregates', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('📊 Failed to fetch taostats aggregates:', e);
    return null;
  }
}

/**
 * Update volume signal - call this when refreshing data
 */
async function updateVolumeSignal(currentVolume, priceChange24h) {
  const history = await fetchVolumeHistory();
  const volumeData = calculateVolumeChange(history, currentVolume);
  // Fetch MA aggregates to help detect sustained moves
  const aggregates = await fetchTaostatsAggregates();
  let { signal, tooltip } = getVolumeSignal(volumeData, priceChange24h, currentVolume, aggregates);
  
  // Fetch MA data and append to tooltip (we already fetched `aggregates` above)
  if (aggregates && aggregates.ma_short) {
    const maLines = [];
    maLines.push('\n\n📈 Moving Averages:');
    if (aggregates.ma_short) {
      maLines.push(`MA-2h: ${formatMADollar(aggregates.ma_short)} (${formatMAPct(aggregates.pct_change_vs_ma_short)})`);
    }
    if (aggregates.ma_med) {
      maLines.push(`MA-4h: ${formatMADollar(aggregates.ma_med)} (${formatMAPct(aggregates.pct_change_vs_ma_med)})`);
    }
    if (aggregates.ma_3d) {
      maLines.push(`MA-3d: ${formatMADollar(aggregates.ma_3d)} (${formatMAPct(aggregates.pct_change_vs_ma_3d)})`);
    }
    if (aggregates.ma_7d) {
      maLines.push(`MA-7d: ${formatMADollar(aggregates.ma_7d)} (${formatMAPct(aggregates.pct_change_vs_ma_7d)})`);
    }
    tooltip += maLines.join('\n');
  }
  
  // Always log signal calculation for debugging
  const volPct = volumeData?.change?.toFixed(1) ?? 'null';
  const conf = volumeData?.confidence ?? 'n/a';
  console.log(`📊 Signal calc: vol=${volPct}%, price=${priceChange24h?.toFixed(1)}%, conf=${conf} → ${signal}`);
  
  applyVolumeSignal(signal, tooltip);
}

// ===== Utility Functions =====
function animateValue(element, start, end, duration = 1000) {
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

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return Number(num).toLocaleString('en-US');
}

function formatFull(num) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return Math.round(Number(num)).toLocaleString('en-US');
}

// Exact formatting with thousands separators and two decimals
function formatExact(num) {
  if (num === null || num === undefined || isNaN(Number(num))) return '—';
  return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Compact display for large numbers (e.g. 1.23M, 4.56B)
function formatCompact(num) {
  num = Number(num);
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  return num.toLocaleString('en-US');
}

// Utility: set compact formatted number with a non-translatable unit span
// setCompactWithUnit removed: revert to simple '$' + formatCompact(...) assignments

function formatPrice(price) {
  if (price === null || price === undefined || Number.isNaN(Number(price))) return 'N/A';
  return `$${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Round up to 2 decimal places (ceiling)
function roundUpTo2(num) {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return NaN;
  return Math.ceil(Number(num) * 100) / 100;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

function readPercentValue(ts, keys) {
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

function animatePriceChange(element, newPrice) {
  if (lastPrice === null) {
    lastPrice = newPrice;
    return;
  }
  if (newPrice > lastPrice) {
    element.classList.add('blink-green');
  } else if (newPrice < lastPrice) {
    element.classList.add('blink-red');
  }
  setTimeout(() => {
    element.classList.remove('blink-green', 'blink-red');
  }, 600);
  lastPrice = newPrice;
}

function normalizeRange(raw) {
  const r = String(raw ?? '').trim().toLowerCase();
  if (r === '1y' || r === '1yr' || r === 'year') return '365';
  return r;
}

// ===== LocalStorage Cache Helpers =====
function getCachedPrice(range) {
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

function setCachedPrice(range, data) {
  try {
    localStorage.setItem(`tao_price_${range}`, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.warn('⚠️  Could not cache price data:', error);
  }
}

// ===== API Fetchers =====
async function fetchNetworkData() {
  try {
    const res = await fetch(`${API_BASE}/network`);
    if (!res.ok) throw new Error(`Network API error: ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('❌ fetchNetworkData:', err);
    return null;
  }
}

async function fetchTaostats() {
  try {
    const res = await fetch(`${API_BASE}/taostats`);
    if (!res.ok) throw new Error(`Taostats API error: ${res.status}`);
    const data = await res.json();
    if (!data || !data.circulating_supply || !data.price) throw new Error('No valid Taostats data');
    return {
      ...data,
      last_updated: data.last_updated || data._timestamp || null,
      _source: 'taostats'
    };
  } catch (err) {
    console.warn('⚠️ Taostats fetch failed:', err);
    return null;
  }
}

// Fetch Block Time data from our API
async function fetchBlockTime() {
  try {
    const res = await fetch(`${API_BASE}/block_time`);
    if (!res.ok) throw new Error(`Block Time API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('⚠️ Block Time fetch failed:', err);
    return null;
  }
}

// Fetch Staking APR data from our API
async function fetchStakingApr() {
  try {
    const res = await fetch(`${API_BASE}/staking_apy`);
    if (!res.ok) throw new Error(`Staking APR API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('⚠️ Staking APR fetch failed:', err);
    return null;
  }
}

async function fetchTaoPrice() {
  const taostats = await fetchTaostats();
  
  // Try to get price_24h_pct from our aggregates as fallback
  let aggregatesPriceChange = null;
  try {
    const aggregates = await fetchTaostatsAggregates();
    if (aggregates?.price_24h_pct != null) {
      aggregatesPriceChange = aggregates.price_24h_pct;
    }
  } catch (e) {
    // ignore
  }
  
  if (taostats && taostats.price) {
    return {
      price: taostats.price,
      change24h: taostats.percent_change_24h ?? aggregatesPriceChange ?? null,
      last_updated: taostats.last_updated ?? null,
      volume_24h: taostats.volume_24h ?? null,
      _source: 'taostats'
    };
  }
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bittensor&vs_currencies=usd&include_24hr_change=true';
  try {
    const res = await fetch(url);
    const data = await res.json();
    return {
      price: data.bittensor?.usd ?? null,
      change24h: data.bittensor?.usd_24h_change ?? null,
      last_updated: null,
      _source: 'coingecko'
    };
  } catch (err) {
    return { price: null, change24h: null, last_updated: null, _source: 'error' };
  }
}

async function fetchPriceHistory(range = '7') {
  const key = normalizeRange(range);
  const cached = getCachedPrice?.(key);
  if (cached) return cached;
  
  // Try Taostats first (preferred source)
  try {
    const taostatsEndpoint = `${API_BASE}/price_history?range=${key}`;
    const res = await fetch(taostatsEndpoint, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data?.prices?.length) {
        if (window._debug) console.debug(`Price history from Taostats (${key}d):`, data.prices.length, 'points');
        setCachedPrice?.(key, data.prices);
        return data.prices;
      }
    }
  } catch (e) {
    if (window._debug) console.debug('Taostats price history failed, trying CoinGecko:', e);
  }
  
  // Fallback to CoinGecko for ranges it supports
  // CoinGecko supports: any days value, we use it for 1, 3, 7, 30, 60, 90, 365
  const cgDays = parseInt(key, 10);
  if (cgDays && cgDays > 0) {
    const interval = cgDays <= 7 ? '' : '&interval=daily';
    const endpoint = `${COINGECKO_API}/coins/bittensor/market_chart?vs_currency=usd&days=${cgDays}${interval}`;
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.prices?.length) return null;
      if (window._debug) console.debug(`Price history from CoinGecko (${key}d):`, data.prices.length, 'points');
      setCachedPrice?.(key, data.prices);
      return data.prices;
    } catch { return null; }
  }
  
  return null;
}

async function fetchCirculatingSupply() {
  const taostats = await fetchTaostats();
  if (taostats && taostats.circulating_supply) {
    window._circSupplySource = taostats._source || 'taostats';
    return taostats.circulating_supply;
  }
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/bittensor');
    const data = await res.json();
    window._circSupplySource = 'coingecko';
    return data.market_data?.circulating_supply ?? null;
  } catch (err) {
    window._circSupplySource = 'fallback';
    return null;
  }
}

// ===== UI Updates =====
function updateTaoPrice(priceData) {
  const priceEl = document.getElementById('taoPrice');
  const changeEl = document.getElementById('priceChange');
  const pricePill = document.getElementById('taoPricePill');
  
  if (!priceEl) return;
    if (priceData.price) {
      priceEl.textContent = formatPrice(priceData.price);
      priceEl.classList.remove('skeleton-text');
      if (changeEl && priceData.change24h !== undefined && priceData.change24h !== null) {
        const change = priceData.change24h;
        changeEl.textContent = `${change > 0 ? '↑' : '↓'}${formatPercent(change)} (24h)`;
        changeEl.style.display = 'inline';
        changeEl.className = `price-change ${change >= 0 ? 'positive' : 'negative'}`;
        
        // Apply subtle pulse animation to price pill based on 24h change
        // 3 states: price-up (>+0.5%), price-down (<-0.5%), price-neutral (±0.5%)
        if (pricePill) {
          pricePill.classList.remove('price-up', 'price-down', 'price-neutral');
          if (change > 0.5) {
            pricePill.classList.add('price-up');
          } else if (change < -0.5) {
            pricePill.classList.add('price-down');
          } else {
            pricePill.classList.add('price-neutral');
          }
        }
      }
    } else {
      priceEl.textContent = 'N/A';
      if (changeEl) changeEl.style.display = 'none';
      if (pricePill) pricePill.classList.remove('price-up', 'price-down', 'price-neutral');
    }
  lastPrice = priceData.price;
  tryUpdateMarketCapAndFDV();

  // Price tooltip: show percent changes for available ranges from Taostats (in tooltip only)
  try {
    const pill = document.getElementById('taoPricePill') || document.querySelector('.price-pill');
    if (pill) {
      const ts = window._taostats ?? null;
      const parts = [];
      // Always display lines in a consistent order (1h, 24h, 7d, 30d, 60d, 90d), using placeholders when missing
      const p1h = readPercentValue(ts, ['percent_change_1h','percent_change_1hr','pct_change_1h','percent_1h_change','percent_change_1Hour','percent_change_1hr']);
      const p24 = readPercentValue(ts, ['percent_change_24h','percent_change_24hr','pct_change_24h','percent_24h_change','percent_change_24hr']) ?? priceData.change24h ?? null;
      const p7d = readPercentValue(ts, ['percent_change_7d','percent_change_7day','pct_change_7d','percent_change_7day']);
      const p30d = readPercentValue(ts, ['percent_change_30d','percent_change_30day','pct_change_30d','percent_change_30day']);
      const p60d = readPercentValue(ts, ['percent_change_60d','percent_change_60day','pct_change_60d']);
      const p90d = readPercentValue(ts, ['percent_change_90d','percent_change_90day','pct_change_90d']);
      parts.push(`1h: ${formatPercent(p1h)}`);
      parts.push(`24h: ${formatPercent(p24)}`);
      parts.push(`7d: ${formatPercent(p7d)}`);
      parts.push(`30d: ${formatPercent(p30d)}`);
      parts.push(`60d: ${formatPercent(p60d)}`);
      parts.push(`90d: ${formatPercent(p90d)}`);
          if (parts.length) {
            const source = (window._taostats && window._taostats._source) ? window._taostats._source : 'Taostats';
            const lines = ['Price changes:'];
            parts.forEach(p => lines.push(p));
            lines.push(`Source: ${source}`);
            pill.setAttribute('data-tooltip', lines.join('\n'));
      } else {
        pill.removeAttribute('data-tooltip');
      }
    }
  } catch (err) {
    if (window._debug) console.debug('Price tooltip construction failed:', err);
  }

  

  

  
}

function updateMarketCapAndFDV(price, circulatingSupply) {
  const marketCapEl = document.getElementById('marketCap');
  const fdvEl = document.getElementById('fdv');
  const maxSupply = 21_000_000;
  if (marketCapEl && price && circulatingSupply) {
  const marketCap = price * circulatingSupply;
  const fdv = price * maxSupply;
  marketCapEl.textContent = `$${formatCompact(marketCap)}`;
  fdvEl.textContent = `$${formatCompact(fdv)}`;
  }
}

function tryUpdateMarketCapAndFDV() {
  if (window.circulatingSupply && lastPrice) {
    updateMarketCapAndFDV(lastPrice, window.circulatingSupply);
  }
}

async function updateNetworkStats(data) {
  // Keep previous supply snapshot for delta-based emission fallback and crossing detection
  const prevSupplyTs = window._prevSupplyTs ?? null;
  const prevHalvingSupply = (window._prevHalvingSupply !== undefined) ? window._prevHalvingSupply : null;
  const prevHalvingTs = window._prevHalvingTs ?? null;
  const nowTs = Date.now();
  const elements = {
    blockHeight: document.getElementById('blockHeight'),
    subnets: document.getElementById('subnets'),
    emission: document.getElementById('emission'),
    totalNeurons: document.getElementById('totalNeurons'),
    validators: document.getElementById('validators'),
    circulatingSupply: document.getElementById('circulatingSupply'),
    progress: document.querySelector('.stat-progress')
  };

    if (data.blockHeight !== undefined) {
      if (elements.blockHeight) {
        elements.blockHeight.textContent = formatFull(data.blockHeight);
        elements.blockHeight.classList.remove('skeleton-text');
      }
    }
    if (data.subnets !== undefined) {
      if (elements.subnets) {
  // Subtract 1 to exclude Subtensor (subnet 0) from the displayed subnet count
        const displaySubnets = data.subnets > 0 ? data.subnets - 1 : 0;
        elements.subnets.textContent = formatFull(displaySubnets);
        elements.subnets.classList.remove('skeleton-text');
      }
    }
    if (data.validators !== undefined) {
      if (elements.validators) {
        elements.validators.textContent = formatFull(data.validators);
        elements.validators.classList.remove('skeleton-text');
      }
    }
    // Show the projection average when available (more accurate for halving)
    if (elements.emission) {
      if (data && data.avg_emission_for_projection !== undefined && data.avg_emission_for_projection !== null) {
        // Show rounded-up value to 2 decimal places for display (user requested accuracy)
        const avgVal = Number(data.avg_emission_for_projection);
        const roundedUp = roundUpTo2(avgVal);
        elements.emission.textContent = roundedUp.toFixed(2);
        elements.emission.title = `Avg emission used for projection (${data.projection_method ?? 'unknown'}) — exact: ${formatExact(avgVal)} TAO/day`;
      } else if (data && (data.emission !== undefined && data.emission !== null)) {
        const emissionVal = Number(data.emission);
        const roundedUp2 = roundUpTo2(emissionVal);
        elements.emission.textContent = roundedUp2.toFixed(2);
        elements.emission.title = `Reported emission (static) from /api/network — exact: ${formatExact(emissionVal)} TAO/day`;
      } else {
        elements.emission.textContent = '—';
        elements.emission.title = '';
      }
      elements.emission.classList.remove('skeleton-text');

      // Update the emission card info-badge tooltip with projection metadata (if available)
      try {
        const emissionCard = elements.emission.closest ? elements.emission.closest('.stat-card') : null;
        if (emissionCard) {
          const badge = emissionCard.querySelector('.info-badge');
            if (badge) {
            // Short, user-friendly info tooltip explaining what the KPI represents.
            const tooltipText = data && (data.avg_emission_for_projection !== undefined && data.avg_emission_for_projection !== null)
              ? 'Avg emission rate used for halving projections (based on our own issuance history). Confidence shown in the Halving pill.'
              : (data && (data.emission !== undefined && data.emission !== null))
                ? 'Reported emission rate (static) from the network API.'
                : 'Emission: unavailable';
            badge.setAttribute('data-tooltip', tooltipText);
          }
        }
      } catch (e) {
        if (window._debug) console.debug('Failed to set emission info-badge tooltip', e);
      }
    }
    if (data.totalNeurons !== undefined) {
      if (elements.totalNeurons) {
        elements.totalNeurons.textContent = formatFull(data.totalNeurons);
        elements.totalNeurons.classList.remove('skeleton-text');
      }
    }

  const circSupply = await fetchCirculatingSupply();
  const supplyEl = document.getElementById('circulatingSupply');
  if (supplyEl && circSupply) {
    const current = (circSupply / 1_000_000).toFixed(2);
    supplyEl.textContent = `${current}M τ`;
    supplyEl.title = `Source: ${window._circSupplySource || 'unknown'} — ${formatExact(circSupply)} TAO`;
    window.circulatingSupply = circSupply;
    // Save the timestamp and previous supply for next update
    window._prevSupplyTs = nowTs;
    // debug: mark that we have circ supply from external source
    if (window._circSupplySource && window._debug) console.debug('circ supply source:', window._circSupplySource);
    try {
      const supplyCard = supplyEl.closest ? supplyEl.closest('.stat-card') : null;
      if (supplyCard) {
        const badge = supplyCard.querySelector('.info-badge');
        if (badge) badge.setAttribute('data-tooltip', `Current circulating supply of TAO tokens — exact: ${formatExact(circSupply)} TAO`);
      }
    } catch (e) {
      if (window._debug) console.debug('Failed to set circulatingsupply info-badge tooltip', e);
    }
  } else {
    const emissionPerBlock = 1;
    let fallbackSupply = typeof data.blockHeight === 'number' && data.blockHeight > 0
      ? data.blockHeight * emissionPerBlock
      : null;
    if (supplyEl && fallbackSupply) {
      const current = (fallbackSupply / 1_000_000).toFixed(2);
      supplyEl.textContent = `${current}M τ`;
      supplyEl.title = `Source: fallback — ${formatExact(fallbackSupply)} TAO`;
      window.circulatingSupply = fallbackSupply;
      window._prevSupplyTs = nowTs;
      if (window._debug) console.debug('circ supply fallback to block-derived supply');
      try {
        const supplyCard = supplyEl.closest ? supplyEl.closest('.stat-card') : null;
        if (supplyCard) {
          const badge = supplyCard.querySelector('.info-badge');
          if (badge) badge.setAttribute('data-tooltip', `Current circulating supply of TAO tokens — exact: ${formatExact(fallbackSupply)} TAO`);
        }
      } catch (e) {
        if (window._debug) console.debug('Failed to set circulatingsupply info-badge tooltip (fallback)', e);
      }
    }
  }
  tryUpdateMarketCapAndFDV();

  // Choose the supply value used for Halving calculations:
  // Prefer on-chain `totalIssuanceHuman` returned by /api/network, otherwise fallback to Taostats circulating supply.
  // Halving uses on-chain TotalIssuance when available, otherwise we fall back to circulatingSupply
  const supplyForHalving = (data && data.totalIssuanceHuman !== undefined && data.totalIssuanceHuman !== null)
    ? Number(data.totalIssuanceHuman)
    : (window.circulatingSupply ?? null);
  if (data && data.totalIssuanceHuman !== undefined && data.totalIssuanceHuman !== null) {
    window._halvingSupplySource = 'on-chain';
    if (window._debug) console.debug('Halving: using on-chain totalIssuanceHuman for halving calculation', Number(data.totalIssuanceHuman));
  } else {
    window._halvingSupplySource = (window._circSupplySource || 'taostats');
    if (window._debug) console.debug('Halving: falling back to circulatingSupply for halving calculation');
  }

  // Use generated thresholds to support future halving events (first threshold only)
  const thresholds = generateHalvingThresholds(21_000_000, 6);
  window.halvingThresholds = thresholds;
  // Determine the active threshold index for the current supply
  const currentSupplyForHalving = Number(supplyForHalving ?? 0);
  window._halvingIndex = findNextThresholdIndex(thresholds, currentSupplyForHalving);
  const HALVING_SUPPLY = thresholds.length ? thresholds[window._halvingIndex] : 10_500_000;
  // Prefer avg_emission_for_projection returned by /api/network for both
  // display and halving projection logic. Fall back to `emission` (static)
  // when projection average is not available.
  let emissionPerDay = null;
  let emissionSource = 'unknown';
  if (data && (data.avg_emission_for_projection !== undefined && data.avg_emission_for_projection !== null)) {
    emissionPerDay = Number(data.avg_emission_for_projection);
    emissionSource = 'projection_avg';
    if (window._debug) console.debug('Using avg_emission_for_projection from /api/network:', emissionPerDay, 'TAO/day');
  } else if (data && (data.emission !== undefined && data.emission !== null)) {
    emissionPerDay = typeof data.emission === 'string'
      ? parseFloat(data.emission.replace(/,/g, ''))
      : Number(data.emission);
    emissionSource = 'static_emission';
    if (Number.isFinite(emissionPerDay) && emissionPerDay > 0 && window._debug) {
      console.debug('Emission from /api/network used (static):', emissionPerDay, 'TAO/day');
    }
  }
  // fallback: estimate emission from previous supply snapshot
  // Use previous halving supply snapshot when available so we estimate emission for the same supply basis.
  // Use previous halving snapshot if present for a consistent emission estimate.
  // Use the previous snapshot for the same selected source for consistent delta estimates
  const basePrevSupply = (window._prevSupplyForHalving !== undefined && window._prevSupplyForHalving !== null)
    ? window._prevSupplyForHalving
    : (prevHalvingSupply ?? (window._prevCircSupply ?? null));
  const basePrevTs = prevHalvingSupply !== null ? prevHalvingTs : prevSupplyTs;
  if ((!emissionPerDay || !Number.isFinite(emissionPerDay) || emissionPerDay <= 0) && basePrevSupply !== null && basePrevTs) {
    const supplyDelta = Number((supplyForHalving ?? window.circulatingSupply)) - Number(basePrevSupply);
    const msDelta = nowTs - basePrevTs;
    if (msDelta > 0) {
      const daysDelta = msDelta / (24 * 60 * 60 * 1000);
      const estimate = supplyDelta / daysDelta;
      if (Number.isFinite(estimate) && estimate > 0) {
        emissionPerDay = estimate;
        if (window._debug) console.debug('Emission fallback estimate from supply delta:', emissionPerDay, 'TAO/day');
      }
    }
  }
  // If we couldn't infer emission and there was no previous snapshot to compare, log for debugging
  if ((!emissionPerDay || !Number.isFinite(emissionPerDay) || emissionPerDay <= 0) && (!basePrevSupply || !basePrevTs)) {
    if (window._debug) console.debug('Emission estimate unavailable: no /api/network emission and no previous halving snapshot to estimate from');
  }

  // Compute halving date simply by remaining supply / emission per day
  const remaining = (supplyForHalving !== null && supplyForHalving !== undefined) ? (HALVING_SUPPLY - supplyForHalving) : null;
  // halvingThresholds already generated above
  // detect crossing: previous < threshold <= current
  const prevHalvingSupplyForCrossing = (window._prevSupplyForHalving !== undefined && window._prevSupplyForHalving !== null)
    ? window._prevSupplyForHalving
    : ((window._prevHalvingSupply !== undefined) ? window._prevHalvingSupply : (window._prevCircSupply ?? null));
  const crossing = prevHalvingSupplyForCrossing !== null && prevHalvingSupplyForCrossing < HALVING_SUPPLY && supplyForHalving >= HALVING_SUPPLY;
  if (crossing) {
    // record last halving with timestamp (ms)
    window._lastHalving = { threshold: HALVING_SUPPLY, at: Date.now() };
    window.halvingJustHappened = { threshold: HALVING_SUPPLY, at: new Date() };
    window.halvingDate = new Date();
    // UI: quick animation on pill, if present
    const pill = document.querySelector('.halving-pill');
    if (pill) {
      pill.classList.add('just-halved');
      setTimeout(() => pill.classList.remove('just-halved'), 8000);
    }
  } else if (remaining !== null && emissionPerDay && emissionPerDay > 0 && remaining > 0) {
    // Calculate the halving date for the currently active threshold
    window.halvingDate = rotateToThreshold(thresholds, window._halvingIndex, currentSupplyForHalving, emissionPerDay);
  } else {
    window.halvingDate = null;
  }

  // update pill tooltip and include projection metadata (method, confidence, sample)
  // Precompute avg emission (if available) so tooltip logic can reference it safely
  const avg = (data && (data.avg_emission_for_projection !== undefined && data.avg_emission_for_projection !== null))
    ? Number(data.avg_emission_for_projection)
    : (data && (data.emission !== undefined && data.emission !== null) ? Number(data.emission) : null);
  const halvingPill = document.querySelector('.halving-pill');
  if (halvingPill) {
    const remainingSafe = Math.max(0, remaining || 0);
    const halvingSourceLabel = (window._halvingSupplySource === 'on-chain') ? 'On-chain (TotalIssuance)' : 'Taostats (circulating_supply)';
    const halvingLines = [
      `Next threshold: ${formatExact(HALVING_SUPPLY)} TAO`,
      `Remaining: ${formatExact(remainingSafe)} TAO`,
      `Source: ${halvingSourceLabel}`
    ];
    if (window._lastHalving) {
      const dt = new Date(window._lastHalving.at);
      // If avg emission is known, show Threshold -> Date -> Avg emission on one line
      if (avg !== null) {
        halvingLines.push(`Last reached: ${formatNumber(window._lastHalving.threshold)} → ${dt.toLocaleString()} → Avg emission used: ${formatExact(avg)} TAO/day`);
      } else {
        halvingLines.push(`Last reached: ${formatNumber(window._lastHalving.threshold)} @ ${dt.toLocaleString()}`);
      }
    }

    // Add projection metadata from /api/network if available
    if (data) {
      const method = data.projection_method ?? (data.avg_emission_for_projection ? 'projection' : 'unknown');
      const confidence = data.projection_confidence ?? 'unknown';
      halvingLines.push(`Halving projection method: ${method}`);
      halvingLines.push(`Halving projection confidence: ${confidence}`);
      if (avg !== null) halvingLines.push(`Avg emission used: ${formatExact(avg)} TAO/day`);

      // Include short list of upcoming halving estimates (step, threshold, eta, emission_used)
      if (Array.isArray(data.halving_estimates) && data.halving_estimates.length) {
        halvingLines.push('Halving projections:');
          data.halving_estimates.slice(0, 3).forEach(h => {
          const step = h.step !== undefined ? `#${h.step}` : '';
          const t = formatNumber(h.threshold);
          const eta = h.eta ? new Date(h.eta).toLocaleDateString() : 'N/A';
          const used = h.emission_used !== undefined ? `${formatExact(h.emission_used)} TAO/day` : 'N/A';
          halvingLines.push(`${step} ${t} → ${eta} → ${used}`);
        });
      }
    }

    halvingPill.setAttribute('data-tooltip', halvingLines.join('\n'));
    // Apply a confidence CSS class to the halving pill so UX can visually
    // indicate projection confidence. Keep classes additive and remove
    // previous ones to avoid class leakage between updates.
    try {
      const conf = (data && data.projection_confidence) ? String(data.projection_confidence).toLowerCase() : null;
      halvingPill.classList.remove('confidence-low', 'confidence-medium', 'confidence-high');
      if (conf === 'low') halvingPill.classList.add('confidence-low');
      else if (conf === 'medium') halvingPill.classList.add('confidence-medium');
      else if (conf === 'high') halvingPill.classList.add('confidence-high');
    } catch (e) {
      if (window._debug) console.debug('Failed to apply halving pill confidence class', e);
    }
  }
  // We intentionally don't add a new stat-card for the halving; keep the pill-only UI.
  // store previous circulating and halving-supply snapshots for next refresh
  window._prevCircSupply = window.circulatingSupply;
  if (supplyForHalving !== null && supplyForHalving !== undefined) {
    window._prevSupplyForHalving = supplyForHalving; // persist the chosen snapshot
    window._prevHalvingSupply = supplyForHalving; // keep legacy var used elsewhere
    window._prevHalvingTs = nowTs;
  }

  // Map preview only contains a thumbnail + button to open interactive map (no KPIs)

  startHalvingCountdown();
}

// ===== Dynamic Tooltip System =====
function setupDynamicTooltips() {
  let tooltip = document.createElement('div');
  tooltip.className = 'dynamic-tooltip';
  document.body.appendChild(tooltip);
  let tooltipClose = null;
  let tooltipPersistent = false;
  let tooltipOwner = null;

  function showTooltip(e, text, opts = {}) {
    // opts.persistent -> keep tooltip visible until explicitly closed/tapped again
    const persistent = !!opts.persistent;
    const wide = !!opts.wide;
    tooltipOwner = e.target;
    tooltipPersistent = persistent;
    tooltip.dataset.persistent = persistent ? 'true' : 'false';
    // Build content (preserve newlines)
    tooltip.innerHTML = '';
    const body = document.createElement('div');
    body.className = 'tooltip-body';
    body.textContent = text;
    tooltip.appendChild(body);
    if (persistent) {
      // add close control
      if (!tooltipClose) {
        tooltipClose = document.createElement('button');
        tooltipClose.className = 'tooltip-close';
        tooltipClose.setAttribute('aria-label', 'Close');
        tooltipClose.textContent = '×';
        tooltipClose.addEventListener('click', (ev) => {
          ev.stopPropagation();
          hideTooltip();
        });
      }
      tooltip.appendChild(tooltipClose);
      tooltip.classList.add('persistent');
    } else {
      if (tooltipClose && tooltip.contains(tooltipClose)) tooltip.removeChild(tooltipClose);
      tooltip.classList.remove('persistent');
    }
    // wide option: allow wider tooltip for desktop halving pill
    if (wide) tooltip.classList.add('wide'); else tooltip.classList.remove('wide');
    tooltip.classList.add('visible');
    const rect = e.target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    let top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8;
    }
    if (left < 8) left = 8;
    if (top + tooltipRect.height > window.innerHeight - 8) {
      top = rect.top - tooltipRect.height - 8;
    }
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
    tooltipPersistent = false;
    tooltipOwner = null;
    tooltip.dataset.persistent = 'false';
    if (tooltipClose && tooltip.contains(tooltipClose)) tooltip.removeChild(tooltipClose);
    tooltip.classList.remove('persistent');
  }

  document.querySelectorAll('.info-badge').forEach(badge => {
    // Skip any info-badge that lives in the TAO Tensor Law card (we removed it)
    if (badge.closest && badge.closest('.taotensor-card')) return;
    // Only initialize tooltips for badges that actually have tooltip text
    // Read the attribute at event time so updates to `data-tooltip` later are respected.
    badge.addEventListener('mouseenter', e => {
      const txt = badge.getAttribute('data-tooltip');
      if (txt) showTooltip(e, txt, { persistent: false });
    });
    badge.addEventListener('mouseleave', hideTooltip);
    badge.addEventListener('focus', e => {
      const txt = badge.getAttribute('data-tooltip');
      if (txt) showTooltip(e, txt, { persistent: false });
    });
    badge.addEventListener('blur', hideTooltip);
    badge.addEventListener('click', e => {
      e.stopPropagation();
      const txt = badge.getAttribute('data-tooltip');
      if (txt) {
        showTooltip(e, txt, { persistent: false });
        setTimeout(hideTooltip, TOOLTIP_AUTO_HIDE_MS);
      }
    });
    // No theme-dependent behavior here; map swap is handled centrally in setLightMode().
  });

  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  document.querySelectorAll('.halving-pill').forEach(pill => {
    // Use a wider tooltip on desktop so the halving projection content can breathe
    pill.addEventListener('mouseenter', e => { if (!isTouch) showTooltip(e, pill.getAttribute('data-tooltip') || '', { wide: true }); });
    pill.addEventListener('mouseleave', e => { if (!isTouch) hideTooltip(); });
    pill.addEventListener('focus', e => { if (!isTouch) showTooltip(e, pill.getAttribute('data-tooltip') || '', { wide: true }); });
    pill.addEventListener('blur', e => { if (!isTouch) hideTooltip(); });
    pill.addEventListener('click', e => {
      e.stopPropagation();
      const text = pill.getAttribute('data-tooltip') || '';
      if (isTouch) {
        // Toggle persistent tooltip on touch devices
        if (tooltipPersistent && tooltipOwner === pill) {
          hideTooltip();
        } else {
          showTooltip(e, text, { persistent: true });
        }
      } else {
        // On desktop clicking the pill should show the same wide variant as hover
        showTooltip(e, text, { persistent: false, wide: true });
        setTimeout(hideTooltip, TOOLTIP_AUTO_HIDE_MS);
      }
    });
  });

  document.querySelectorAll('.price-pill').forEach(pill => {
    pill.addEventListener('mouseenter', e => showTooltip(e, pill.getAttribute('data-tooltip') || ''));
    pill.addEventListener('mouseleave', hideTooltip);
    pill.addEventListener('focus', e => showTooltip(e, pill.getAttribute('data-tooltip') || ''));
    pill.addEventListener('blur', hideTooltip);
    pill.addEventListener('click', e => {
      e.stopPropagation();
      showTooltip(e, pill.getAttribute('data-tooltip') || '');
      setTimeout(hideTooltip, TOOLTIP_AUTO_HIDE_MS);
    });
  });

  // document click should hide tooltip only when not persistent
  document.addEventListener('click', (e) => {
    if (tooltipPersistent) return;
    hideTooltip();
  });
}

// ===== Version fetch and apply =====
async function fetchAndApplyVersion() {
  try {
    const res = await fetch('/VERSION', { cache: 'no-store' });
    if (!res.ok) return;
    let text = await res.text();
    if (!text) return;
    text = text.trim();
    if (!text) return;
    // Normalize: remove leading 'v' for processing, then re-add a single 'v' prefix.
    let raw = text.replace(/^v/i, '');
    // Normalize prerelease labels that use the `label.number` format to `labelnumber` (e.g. rc.1 -> rc1)
    raw = raw.replace(/-(rc|alpha|beta)\.(\d+)/i, (m, label, num) => `-${label}${num}`);
    // Keep other semver dots intact (e.g., 1.0.0). Ensure final display uses a single leading 'v'.
    text = `v${raw}`;
    const el = document.getElementById('siteVersion');
    if (el) el.textContent = text;
    // Optionally expose globally for other scripts
    window._siteVersion = text;
  } catch (err) {
    // Silent fallback — keep embedded version
    console.warn('⚠️ Could not fetch version:', err?.message || err);
  }
}

// Ensure the version is applied on page load
try {
  // Script is loaded with `defer`, but ensure DOM available
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchAndApplyVersion);
  } else {
    fetchAndApplyVersion();
  }
} catch (err) {
  console.warn('⚠️ Version loader failed to run:', err && err.message);
}
setupDynamicTooltips();

// ===== Data Refresh =====
async function refreshDashboard() {
  const [networkData, taoPrice, taostats] = await Promise.all([
    fetchNetworkData(),
    fetchTaoPrice(),
    fetchTaostats()
  ]);
  // Expose taostats globally for tooltips and other UI pieces
  window._taostats = taostats ?? null;
  updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);

  // LAST UPDATE from Taostats, otherwise fallback
  const lastUpdateEl = document.getElementById('lastUpdate');
  let lastUpdated = null;
  if (taoPrice && taoPrice._source === 'taostats' && taoPrice.last_updated) {
    lastUpdated = taoPrice.last_updated;
  } else if (taoPrice && taoPrice._source === 'taostats' && taoPrice._timestamp) {
    lastUpdated = taoPrice._timestamp;
  }
  let lastUpdateStr = '--:--';
  if (lastUpdated) {
    const d = new Date(lastUpdated);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    lastUpdateStr = `${hh}:${mm}`;
    if (lastUpdateEl) lastUpdateEl.textContent = `Updated: ${lastUpdateStr}`;
  } else {
    if (lastUpdateEl) lastUpdateEl.textContent = `Updated: --:--`;
  }

  // Get volume from taostats!
  const volumeEl = document.getElementById('volume24h');
  if (volumeEl && taostats && typeof taostats.volume_24h === 'number') {
  volumeEl.textContent = `$${formatCompact(taostats.volume_24h)}`;
  }

  // Update Volume Signal (Ampelsystem)
  const priceChange24h = taostats?.percent_change_24h ?? taoPrice?.change24h ?? null;
  if (taostats?.volume_24h) {
    updateVolumeSignal(taostats.volume_24h, priceChange24h);
  }

  // Set API status
  const apiStatusEl = document.getElementById('apiStatus');
  const apiStatusIcon = document.querySelector('#apiStatusCard .stat-icon svg');
  let statusText = 'All systems ok';
  let color = '#22c55e'; // green
  if (!networkData || !taostats) {
    statusText = 'API error';
    color = '#ef4444'; // red
  } else if (!taostats.price || !taostats.volume_24h) {
    statusText = 'Partial data';
    color = '#eab308'; // yellow
  }
  if (apiStatusEl) apiStatusEl.textContent = statusText;
  // Dynamically update SVG colors
  if (apiStatusIcon) {
    // Update circle color
    const circle = apiStatusIcon.querySelector('circle');
    if (circle) circle.setAttribute('stroke', color);
    // Update heartbeat line color
    const polyline = apiStatusIcon.querySelector('polyline');
    if (polyline) polyline.setAttribute('stroke', color);
  }

  // Update Block Time and Staking APR cards
  await updateBlockTime();
  await updateStakingApr();
}

// ===== Auto-refresh with countdown circle =====
const REFRESH_SECONDS = 60;
let refreshCountdown = REFRESH_SECONDS;
let refreshTimer = null;

function renderRefreshIndicator() {
  const el = document.getElementById('refresh-indicator');
  if (!el) return;
  const radius = 7;
  const stroke = 2.2;
  const circ = 2 * Math.PI * radius;
  const progress = (refreshCountdown / REFRESH_SECONDS);
  el.innerHTML = `
    <svg viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="8" stroke="#222" stroke-width="2.2" fill="none"/>
      <circle cx="10" cy="10" r="8" stroke="#22c55e" stroke-width="2.2" fill="none"
        stroke-dasharray="${2 * Math.PI * 8}" stroke-dashoffset="${2 * Math.PI * 8 * (1 - progress)}"
        style="transition: stroke-dashoffset 0.5s;"/>
    </svg>
    <span class="refresh-label">${refreshCountdown}</span>
  `;
  el.title = `Auto-refresh in ${refreshCountdown}s`;
  el.style.pointerEvents = "none";
}

function startAutoRefresh() {
  renderRefreshIndicator();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    refreshCountdown--;
    if (refreshCountdown <= 0) {
      refreshCountdown = REFRESH_SECONDS;
      refreshDashboard();
    }
    renderRefreshIndicator();
  }, 1000);
  const el = document.getElementById('refresh-indicator');
  if (el) {
    el.onclick = () => {
      refreshCountdown = REFRESH_SECONDS;
      refreshDashboard();
      renderRefreshIndicator();
    };
  }
}

// ===== Initialization of Price Chart =====
function createPriceChart(priceHistory, range) {
  const canvas = document.getElementById('priceChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Format labels based on timeframe
  const rangeNum = parseInt(range, 10) || 7;
  const labels = priceHistory.map(([timestamp]) => {
    const date = new Date(timestamp);
    if (rangeNum <= 1) {
      // 1D: Show hours only (e.g., "14:00")
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } else if (rangeNum <= 3) {
      // 3D: Show day + time (e.g., "Nov 29 14:00")
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + 
             date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } else {
      // 7D+: Show month/day (e.g., "11/29")
      return `${date.getMonth()+1}/${date.getDate()}`;
    }
  });
  const data = priceHistory.map(([_, price]) => price);

  // Only destroy if chart object and method exist
  if (window.priceChart && typeof window.priceChart.destroy === 'function') {
    window.priceChart.destroy();
  }

  window.priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'TAO Price',
        data,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.1)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: true, grid: { display: false } },
        y: { display: true, grid: { color: '#222' } }
      }
    }
  });
}

// ===== Initialization =====
async function initDashboard() {
  if (window._dashboardInitialized) return;
  if (window._dashboardInitInProgress) return;
  window._dashboardInitInProgress = true;
  let initSucceeded = false;
  try {
    const [networkData, taoPrice, taostats] = await Promise.all([
      fetchNetworkData(),
      fetchTaoPrice(),
      fetchTaostats()
    ]);
  // Expose taostats globally and update UI after available
  window._taostats = taostats ?? null;
  await updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);

    // TAO Tensor Law iframe fallback: hide iframe if blocked and show a friendly fallback message
    document.addEventListener('DOMContentLoaded', function() {
      const embed = document.getElementById('taotensorEmbed');
      const frame = document.getElementById('taotensorFrame');
      if (!embed || !frame) return;
      // If the iframe cannot load due to X-Frame-Options, we detect via a timeout and 'load' event
      let loaded = false;
      frame.addEventListener('load', function() { loaded = true; });
      // After a short delay, if the frame didn't load, show fallback
      setTimeout(function() {
        try {
          // Some browsers will block access; in that case, the 'load' event won't fire or will be blocked
          if (!loaded) {
            embed.classList.add('fallback-active');
          }
        } catch (e) {
          embed.classList.add('fallback-active');
        }
      }, 1500);
      // Modal / full-screen behavior for the embed
      const openBtn = document.getElementById('taotensorFullBtn');
      const modal = document.getElementById('taotensorModal');
      const modalContent = document.getElementById('taotensorModalContent');
      const closeBtn = document.getElementById('taotensorModalClose');
      let originalParent = null;
      const placeholder = document.createElement('div');
      placeholder.className = 'tao-embed-placeholder';

      function openModal() {
        if (!embed || !frame) return;
        // If we are in fallback mode, just open in a new tab instead
        if (embed.classList.contains('fallback-active')) {
          window.open(frame?.src || 'https://taotensorlaw.com', '_blank');
          return;
        }
        if (modal.classList.contains('active')) return;
        originalParent = frame.parentNode;
        // Reserve a placeholder where the frame was
        originalParent.replaceChild(placeholder, frame);
        // Move iframe into modal content so it keeps state
        modalContent.appendChild(frame);
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        try { frame.focus(); } catch (e) {}
      }

      function closeModal() {
        if (!originalParent) return;
        if (!modal.classList.contains('active')) return;
        // Move iframe back to its original location
        modalContent.removeChild(frame);
        originalParent.replaceChild(frame, placeholder);
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        try { frame.focus(); } catch (e) {}
      }

      // Hook up the buttons
      if (openBtn) openBtn.addEventListener('click', (e) => {
        // If the embed failed (fallback) then allow the anchor's default behaviour
        // so the user can open the model in a new tab. Otherwise, prevent
        // navigation and open the modal in-place.
        if (embed && embed.classList.contains('fallback-active')) {
          // Let the link open in a new tab (anchor has target="_blank")
          return;
        }
        e.preventDefault();
        openModal();
      });
      // On mobile screens, intercept a tap on the overlay to open the modal (avoid clipped iframe tooltips)
      const overlay = document.getElementById('taotensorOverlay');
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          // If embed fallback is active, open external link instead
          if (embed && embed.classList.contains('fallback-active')) return;
          openModal();
        });
      }
      // Hide overlay when fallback is active or when the iframe fails to load
      function updateOverlayVisibility() {
        if (!overlay) return;
        if (embed && embed.classList.contains('fallback-active')) {
          overlay.setAttribute('aria-hidden', 'true');
        } else {
          overlay.setAttribute('aria-hidden', 'false');
        }
      }
      // Initialize overlay visibility now and after fallback detection timeout
      updateOverlayVisibility();
      setTimeout(updateOverlayVisibility, 1600);
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      // Allow clicking outside the modal body to close it
      if (modal) {
        modal.addEventListener('click', function(e) {
          if (e.target === modal) closeModal();
        });
      }
      // Escape key to close
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
          closeModal();
        }
      });
    });

  // Fill initial volume and expose taostats globally
  window._taostats = taostats ?? null;
  window._taostats = taostats ?? null;
  const volumeEl = document.getElementById('volume24h');
  if (volumeEl && taostats && typeof taostats.volume_24h === 'number') {
    volumeEl.textContent = `$${formatCompact(taostats.volume_24h)}`;
  }

  // Initial Volume Signal (Ampelsystem) update
  // Use aggregates price_24h_pct as fallback if taostats doesn't provide it
  const initPriceChange24h = taostats?.percent_change_24h ?? taoPrice?.change24h ?? null;
  if (taostats?.volume_24h) {
    updateVolumeSignal(taostats.volume_24h, initPriceChange24h);
  }

  // Fill initial API status
  const apiStatusEl = document.getElementById('apiStatus');
  const apiStatusIcon = document.querySelector('#apiStatusCard .stat-icon svg');
  let statusText = 'All systems ok';
  let color = '#22c55e'; // green
  if (!networkData || !taostats) {
    statusText = 'API error';
    color = '#ef4444'; // red
  } else if (!taostats.price || !taostats.volume_24h) {
    statusText = 'Partial data';
    color = '#eab308'; // yellow
  }
  if (apiStatusEl) apiStatusEl.textContent = statusText;
  // Dynamically update SVG colors
  if (apiStatusIcon) {
    // Update circle color
    const circle = apiStatusIcon.querySelector('circle');
    if (circle) circle.setAttribute('stroke', color);
    // Update heartbeat line color
    const polyline = apiStatusIcon.querySelector('polyline');
    if (polyline) polyline.setAttribute('stroke', color);
  }

  const priceCard = document.querySelector('#priceChart')?.closest('.dashboard-card');
  const priceHistory = await fetchPriceHistory(currentPriceRange);
  if (priceHistory) {
    createPriceChart(priceHistory, currentPriceRange);
  }
    startHalvingCountdown();
    startAutoRefresh();
    // Mark initialization completed
    initSucceeded = true;
  } catch (err) {
    console.error('initDashboard failed:', err);
  } finally {
    // Always clear the in-progress flag
    window._dashboardInitInProgress = false;
    if (initSucceeded) window._dashboardInitialized = true;
  }
}

// ===== Halving Countdown =====
function startHalvingCountdown() {
  if (window.halvingInterval) clearInterval(window.halvingInterval);
  updateHalvingCountdown();
  window.halvingInterval = setInterval(updateHalvingCountdown, 1000);
}
// calculateHalvingDate removed: we compute halving date inline to maintain a single source of truth

/**
 * Generate fixed halving thresholds for the token supply.
 * Example: for maxSupply=21_000_000 and maxEvents=6 it returns [10.5M, 15.75M, ...]
 */
function generateHalvingThresholds(maxSupply = 21_000_000, maxEvents = 6) {
  const arr = [];
  for (let n = 1; n <= maxEvents; n++) {
    const threshold = Math.round(maxSupply * (1 - 1 / Math.pow(2, n)));
    arr.push(threshold);
  }
  return arr;
}

// Helper: find next threshold index where currentSupply < thresholds[index]
function findNextThresholdIndex(thresholds = [], currentSupply = 0) {
  if (!Array.isArray(thresholds) || thresholds.length === 0) return 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (currentSupply < thresholds[i]) return i;
  }
  return thresholds.length - 1; // if already past all thresholds, return last index
}

// Helper: set halvingDate to the given threshold index using emissionPerDay
function rotateToThreshold(thresholds, index, currentSupply, emissionPerDay) {
  if (!Array.isArray(thresholds) || thresholds.length === 0) return null;
  const idx = Math.max(0, Math.min(index, thresholds.length - 1));
  const threshold = thresholds[idx];
  if (!emissionPerDay || emissionPerDay <= 0) return null;
  const remaining = Math.max(0, threshold - (currentSupply || 0));
  const daysToHalving = remaining / emissionPerDay;
  if (!Number.isFinite(daysToHalving)) return null;
  return new Date(Date.now() + daysToHalving * 24 * 60 * 60 * 1000);
}
function updateHalvingCountdown() {
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
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  // Show days, hours, minutes, and seconds
  el.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
// Prevent link clicks on info-badge controls

// Fetch ATH/ATL data and update pills
async function updateAthAtlPills() {
  try {
    const res = await fetch('/api/ath-atl');
    if (!res.ok) throw new Error('ATH/ATL API error');
    const data = await res.json();
    const athValue = document.getElementById('athValue');
    const athDate = document.getElementById('athDate');
    const atlValue = document.getElementById('atlValue');
    const atlDate = document.getElementById('atlDate');
    if (athValue && data.ath) athValue.textContent = `$${Number(data.ath).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (athDate && data.ath_date) athDate.textContent = new Date(data.ath_date).toLocaleDateString('en-US');
    if (atlValue && data.atl) atlValue.textContent = `$${Number(data.atl).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (atlDate && data.atl_date) atlDate.textContent = new Date(data.atl_date).toLocaleDateString('en-US');
  } catch (err) {
    console.error('❌ updateAthAtlPills:', err);
  }
}

// Update Block Time card
async function updateBlockTime() {
  const data = await fetchBlockTime();
  const el = document.getElementById('blockTime');
  const badge = document.querySelector('#blockTimeCard .info-badge');
  
  if (!el) return;
  
  if (data && data.avg_block_time !== undefined) {
    const avgTime = Number(data.avg_block_time).toFixed(1);
    const status = data.status || 'unknown';
    el.textContent = `${avgTime}s`;
    el.classList.remove('skeleton-text');
    
    // Update tooltip with live data
    if (badge) {
      const deviation = data.deviation !== undefined ? data.deviation.toFixed(2) : '—';
      const blocksAnalyzed = data.blocks_analyzed || 200;
      const tooltipLines = [
        `Average time between blocks (last ${blocksAnalyzed} blocks).`,
        `Target: 12.0s`,
        `Current: ${avgTime}s`,
        `Deviation: ${deviation}s`,
        `Status: ${status}`,
        '',
        `Calculation: (newest_ts - oldest_ts) / (blocks - 1)`,
        `Source: Taostats Block API`
      ];
      badge.setAttribute('data-tooltip', tooltipLines.join('\n'));
    }
  } else {
    el.textContent = '—';
  }
}

// Update Staking APR card
async function updateStakingApr() {
  const data = await fetchStakingApr();
  const el = document.getElementById('stakingApr');
  const badge = document.querySelector('#stakingAprCard .info-badge');
  
  if (!el) return;
  
  if (data && data.avg_apr !== undefined) {
    const avgApr = Number(data.avg_apr).toFixed(2);
    el.textContent = `${avgApr}%`;
    el.classList.remove('skeleton-text');
    
    // Update tooltip with live data
    if (badge) {
      const simpleAvg = data.simple_avg_apr !== undefined ? `${Number(data.simple_avg_apr).toFixed(2)}%` : '—';
      const minApr = data.min_apr !== undefined ? `${Number(data.min_apr).toFixed(2)}%` : '—';
      const maxApr = data.max_apr !== undefined ? `${Number(data.max_apr).toFixed(2)}%` : '—';
      const validators = data.validators_analyzed || 50;
      const tooltipLines = [
        `Stake-weighted average APR across top ${validators} validators.`,
        '',
        `Calculation: Σ(APR × stake) / Σ(stake)`,
        `APR per validator: (daily_return × 365 / stake) × 100`,
        '',
        `Simple Avg: ${simpleAvg}`,
        `Range: ${minApr} to ${maxApr}`,
        `Source: Taostats dTao Validator API`
      ];
      badge.setAttribute('data-tooltip', tooltipLines.join('\n'));
    }
  } else {
    el.textContent = '—';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    await initDashboard();
    await updateAthAtlPills();
    await updateBlockTime();
    await updateStakingApr();

    // Debug overlay logic
    if (window._debug) {
      const overlay = document.getElementById('debugOverlay');
      if (overlay) overlay.style.display = 'block';
      updateDebugStatus();
      const btn = document.getElementById('debugRetryBtn');
      if (btn) btn.onclick = () => {
        if (window._debug) console.log('Debug: manual retry triggered');
        refreshDashboard();
        setTimeout(updateDebugStatus, 1200);
      };
    }

    // Prevent link clicks on info-badge controls
    document.querySelectorAll('.stat-card .info-badge').forEach(badge => {
      badge.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
      });
      badge.addEventListener('touchstart', function(e) {
        e.stopPropagation();
      });
    });

    // Time range buttons for the chart
    document.querySelectorAll('.time-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const range = btn.getAttribute('data-range'); // "7", "30", "365"
        if (range === currentPriceRange) return; // No reload if same
        currentPriceRange = range;

        // Update button UI
        document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Show chart skeleton (optional)
        const priceCard = btn.closest('.dashboard-card');
        if (priceCard) priceCard.classList.add('loading');

        // Load data and redraw chart
        const priceHistory = await fetchPriceHistory(currentPriceRange);
        if (priceHistory) {
          createPriceChart(priceHistory, currentPriceRange);
        }
        // Hide skeleton
        if (priceCard) priceCard.classList.remove('loading');
      });
    });

    // Info badge tooltip for API status card: static text
    const infoBadge = document.querySelector('#apiStatusCard .info-badge');
    if (infoBadge) {
      infoBadge.setAttribute('data-tooltip', 'API status: Network, Taostats, Coingecko');
    }
  })();

  // Background toggle button
  const btn = document.getElementById('bgToggleBtn');
  const moonIcon = document.getElementById('moonIcon');
  const sunIcon = document.getElementById('sunIcon');
  if (!btn || !moonIcon || !sunIcon) return;
  const body = document.body;
  // Initial state from localStorage
  const header = document.querySelector('header.site-header');
  // Add .pill-value directly and use Array.from() when querying NodeList
  // This is Safari-friendly (older versions may not support spread on NodeList)
  // Manually add the refresh indicator so it receives the `light-bg` class too
  const refreshIndicator = document.getElementById('refresh-indicator');
  const elementsToToggle = [
    body,
    header,
    refreshIndicator,
    ...Array.from(document.querySelectorAll('.dashboard-card, .stat-card, .price-pill, .halving-pill, .ath-atl-pill, .whitepaper-btn, #bgToggleBtn, .stat-value, .info-badge, .pill-value, .disclaimer-card, .site-footer'))
  ];
  function setLightMode(active) {
    elementsToToggle.forEach(el => {
      if (!el) return;
      if (active) {
        el.classList.add('light-bg');
      } else {
        el.classList.remove('light-bg');
      }
    });
    // JS fallback for browsers that do not fully respect CSS overrides (Safari, PWA quirks)
    // Apply inline styles to key elements to force proper Light Mode contrast
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
            // Keep font weight unchanged so we don't alter the original design
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
        // (Map thumbnail swap is handled once after this loop to avoid repeated DOM updates.)
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
    // Swap the miner map thumbnail once per theme change (only update once)
    const mapThumb = document.getElementById('mapThumb');
    if (mapThumb) {
      if (active) {
        const lightSrc = 'assets/miner-map-thumb-light.png';
        mapThumb.onerror = function() { /* fallback to dark */ mapThumb.onerror = null; mapThumb.src = 'assets/miner-map-thumb.png'; mapThumb.style.filter = ''; };
        mapThumb.src = lightSrc;
        // Ensure we don't apply additional CSS filter when using the light asset
        mapThumb.style.filter = 'none';
      } else {
        // Clear any error handler from previous attempts
        mapThumb.onerror = null;
        mapThumb.src = 'assets/miner-map-thumb.png';
        mapThumb.style.filter = '';
      }
    }

    if (active) {
      body.style.background = '#dadada';
      if (header) header.style.background = '#dadada';
      // JS fallback for footer in case CSS does not apply (Safari / PWA quirks)
      document.querySelectorAll('.site-footer').forEach(f => {
        f.style.background = '#dadada';
        f.style.color = '#222';
        // Ensure paragraphs inside the footer are readable
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
  // NOTE: Preloading is handled via <link rel="preload"> in index.html — avoid duplicate downloads
  // Initial state
  setLightMode(localStorage.getItem('bgMode') === 'light');
  btn.addEventListener('click', function() {
    const isLight = body.classList.contains('light-bg');
    setLightMode(!isLight);
    localStorage.setItem('bgMode', isLight ? 'dark' : 'light');
  });
});

// ===== Top Subnets Display Card (Main Grid) =====
document.addEventListener('DOMContentLoaded', function() {
  const displayTable = document.getElementById('topSubnetsDisplayTable');
  const displayList = document.getElementById('topSubnetsDisplayList');

  if (!displayTable || !displayList) return;

  // Load and display top 10 subnets on page load
  async function loadTopSubnetsDisplay() {
    try {
      const response = await fetch('/api/top_subnets');
      if (!response.ok) throw new Error('Failed to fetch top subnets');
      const data = await response.json();

      const topSubnets = data.top_subnets || [];
      if (topSubnets.length === 0) {
        displayList.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">No subnet data available</td></tr>';
        return;
      }

      // Display TOP 10 (all of them)
      const rows = topSubnets.slice(0, 10).map((subnet, idx) => {
        const netuid = subnet.netuid || idx;
        const name = subnet.subnet_name || `SN${subnet.netuid}`;
        const share = ((subnet.taostats_emission_share || 0) * 100).toFixed(4);
        const daily = (subnet.estimated_emission_daily || 0).toFixed(4);

        return `<tr>
          <td class="rank-col">${netuid}</td>
          <td class="subnet-col">${name}</td>
          <td class="share-col">${share}%</td>
          <td class="daily-col">${daily} τ</td>
        </tr>`;
      }).join('');

      displayList.innerHTML = rows;
    } catch (err) {
      console.error('Error loading top subnets for display:', err);
      displayList.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">Error loading subnet data</td></tr>';
    }
  }

  loadTopSubnetsDisplay();

  // Refresh on network data update
  const originalRefreshDashboard = window.refreshDashboard;
  window.refreshDashboard = async function() {
    await originalRefreshDashboard.call(this);
    loadTopSubnetsDisplay();
  };
});

// ===== Top Validators Display =====
document.addEventListener('DOMContentLoaded', function() {
  const displayTable = document.getElementById('topValidatorsDisplayTable');
  const displayList = document.getElementById('topValidatorsDisplayList');

  if (!displayTable || !displayList) return;

  async function loadTopValidatorsDisplay() {
    try {
      const response = await fetch('/api/top_validators');
      if (!response.ok) throw new Error('Failed to fetch top validators');
      const data = await response.json();

      const topValidators = data.top_validators || [];
      if (topValidators.length === 0) {
        displayList.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No validator data available</td></tr>';
        return;
      }

      // Display TOP 10
      const rows = topValidators.slice(0, 10).map((v, idx) => {
        const rank = idx + 1;
        const name = v.name || `Validator ${rank}`;
        const stake = v.stake_formatted || '—';
        const dominance = v.dominance != null ? `${v.dominance}%` : '—';
        const nominators = v.nominators != null ? v.nominators.toLocaleString() : '—';

        return `<tr>
          <td class="rank-col">${rank}</td>
          <td class="validator-col">${name}</td>
          <td class="stake-col">${stake}</td>
          <td class="dominance-col">${dominance}</td>
          <td class="nominators-col">${nominators}</td>
        </tr>`;
      }).join('');

      displayList.innerHTML = rows;
    } catch (err) {
      console.error('Error loading top validators:', err);
      displayList.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">Error loading validator data</td></tr>';
    }
  }

  loadTopValidatorsDisplay();

  // Refresh on network data update
  const origRefresh = window.refreshDashboard;
  window.refreshDashboard = async function() {
    await origRefresh.call(this);
    loadTopValidatorsDisplay();
  };
});

// ===== Top Wallets Display =====
document.addEventListener('DOMContentLoaded', function() {
  const displayTable = document.getElementById('topWalletsDisplayTable');
  const displayList = document.getElementById('topWalletsDisplayList');

  if (!displayTable || !displayList) return;

  async function loadTopWalletsDisplay() {
    try {
      const response = await fetch('/api/top_wallets');
      if (!response.ok) throw new Error('Failed to fetch top wallets');
      const data = await response.json();

      const wallets = data.wallets || [];
      if (wallets.length === 0) {
        displayList.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No wallet data available</td></tr>';
        return;
      }

      // Display TOP 10
      const rows = wallets.slice(0, 10).map((w) => {
        const rank = w.rank || '—';
        const identity = w.identity || null;
        const addressShort = w.address_short || 'Unknown';
        const balance = w.balance_total != null ? `${w.balance_total.toLocaleString(undefined, {maximumFractionDigits: 0})} τ` : '—';
        const dominance = w.dominance != null ? `${w.dominance.toFixed(2)}%` : '—';
        const stakedPercent = w.staked_percent != null ? `${w.staked_percent.toFixed(1)}%` : '—';

        // Show identity if available, otherwise just address
        const walletDisplay = identity 
          ? `<span class="wallet-identity">${identity}</span><span class="wallet-address">${addressShort}</span>`
          : `<span class="wallet-address wallet-address-only">${addressShort}</span>`;

        return `<tr>
          <td class="rank-col">${rank}</td>
          <td class="wallet-col">${walletDisplay}</td>
          <td class="balance-col">${balance}</td>
          <td class="dominance-col">${dominance}</td>
          <td class="staked-col">${stakedPercent}</td>
        </tr>`;
      }).join('');

      displayList.innerHTML = rows;
    } catch (err) {
      console.error('Error loading top wallets:', err);
      displayList.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">Error loading wallet data</td></tr>';
    }
  }

  loadTopWalletsDisplay();

  // Also refresh when refreshDashboard is called
  const currentRefresh = window.refreshDashboard;
  window.refreshDashboard = async function() {
    await currentRefresh.call(this);
    loadTopWalletsDisplay();
  };
});

// Old Top Subnets Tooltip handler removed - now uses standard data-tooltip