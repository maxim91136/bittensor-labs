// ===== Dashboard Initialization (restored, global) =====
window.initDashboard = async function initDashboard() {
  window._dashboardInitInProgress = true;
  try {
    // Example: fetch and update all main dashboard data
    await Promise.all([
      typeof updatePrice === 'function' ? updatePrice() : null,
      typeof updateHalvingInfo === 'function' ? updateHalvingInfo() : null,
      typeof updateVolumeSignal === 'function' ? updateVolumeSignal() : null,
      typeof updateTopSubnets === 'function' ? updateTopSubnets() : null,
      typeof updateTopValidators === 'function' ? updateTopValidators() : null,
      typeof updateTopWallets === 'function' ? updateTopWallets() : null,
      typeof updateBlockTime === 'function' ? updateBlockTime() : null,
      typeof updateStakingApr === 'function' ? updateStakingApr() : null,
      typeof updateApiStatus === 'function' ? updateApiStatus() : null
    ]);
    window._dashboardInitialized = true;
  } catch (e) {
    if (window._debug) console.error('initDashboard error', e);
    window._dashboardInitialized = false;
  } finally {
    window._dashboardInitInProgress = false;
  }
};

// Make all key state variables global for debugging and modular access
window._lastVolumeSignal = _lastVolumeSignal;
window.priceChart = priceChart;
window.lastPrice = lastPrice;
window.currentPriceRange = currentPriceRange;
window.isLoadingPrice = isLoadingPrice;
window._volumeHistory = _volumeHistory;
window._volumeHistoryTs = _volumeHistoryTs;
window._sustainedBullishCount = window._sustainedBullishCount || 0;
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
const TRADED_SHARE_MIN = 0.1; // percent of circ supply traded to consider move meaningful (0.1%)
const SUSTAIN_PRICE_PCT = 8; // lower price pct that can indicate sustained move when combined with other signals
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
    // traded share (percent) if data available — convert USD volume to TAO using lastPrice when possible
    let tradedSharePct = null;
    if (currentVolume && window.circulatingSupply) {
      try {
        if (typeof lastPrice === 'number' && lastPrice > 0) {
          const volumeInTao = Number(currentVolume) / Number(lastPrice);
          tradedSharePct = (volumeInTao / window.circulatingSupply) * 100;
        } else {
          // fallback: approximate by USD / circSupply (not ideal); keep null to avoid false triggers
          tradedSharePct = null;
        }
      } catch (e) {
        tradedSharePct = null;
      }
    }
    // sustain if MAs aligned AND (volume up OR traded share large OR strong price move)
    const sustainCondition = maShortUp && ma3dUp && (
      volumeChange >= SUSTAIN_VOL_PCT ||
      (tradedSharePct !== null && tradedSharePct >= TRADED_SHARE_MIN) ||
      (priceChange >= SUSTAIN_PRICE_PCT)
    );
    // If traded-share or strong price move is present, consider sustained immediately
    if (maShortUp && ma3dUp && ((tradedSharePct !== null && tradedSharePct >= TRADED_SHARE_MIN) || priceChange >= SUSTAIN_PRICE_PCT)) {
      return {
        signal: 'green',
        tooltip: `🟢 Sustained bullish\nVolume: ${volStr}\nPrice: ${priceStr}\nMoving averages aligned — sustained buying pressure` + (confidenceLine || '')
      };
    }
    // Otherwise use hysteresis to avoid flapping for marginal signals
    if (sustainCondition) {
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

  // Ensure we don't inject a subtitle that shifts layout; remove any existing `.stat-sub`
  try {
    const existingSub = volumeCard.querySelector('.stat-sub');
    if (existingSub) existingSub.remove();
  } catch (e) {
    if (window._debug) console.debug('Failed to cleanup volume subtitle', e);
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
// Build HTML for API status tooltip showing per-source chips
function buildApiStatusHtml({ networkData, taostats, taoPrice }) {
  function chip(status) {
    const cls = status === 'ok' ? 'ok' : (status === 'partial' ? 'partial' : 'error');
    const label = status === 'ok' ? 'OK' : (status === 'partial' ? 'Partial' : 'Error');
    return `<span class="tooltip-chip ${cls}">${label}</span>`;
  }

  // Taostats
  let taostatsStatus = 'error';
  if (taostats) {
    const hasPrice = taostats.price !== undefined && taostats.price !== null;
    const hasVol = taostats.volume_24h !== undefined && taostats.volume_24h !== null;
    taostatsStatus = (hasPrice && hasVol) ? 'ok' : 'partial';
  }

  // CoinGecko (derive from taoPrice._source if available)
  let coingeckoStatus = 'error';
  if (taoPrice && taoPrice._source) {
    if (taoPrice._source === 'coingecko') coingeckoStatus = 'ok';
    else if (taoPrice._source === 'taostats') coingeckoStatus = 'partial';
    else coingeckoStatus = (taoPrice.price ? 'ok' : 'error');
  }

  // Bittensor SDK / network API
  const networkStatus = networkData ? 'ok' : 'error';

  const lines = [];
  lines.push('<div>Status of all data sources powering the dashboard</div>');
  // Order: Bittensor SDK (network), Taostats, CoinGecko
  lines.push('<div style="margin-top:8px">' + chip(networkStatus) + ' Bittensor SDK</div>');
  lines.push('<div>' + chip(taostatsStatus) + ' Taostats</div>');
  lines.push('<div>' + chip(coingeckoStatus) + ' CoinGecko</div>');
  return lines.join('');
}

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
  // Use previous halving snapshot if present for a consistent delta estimate
  let emissionFallback = null;
  if (prevHalvingSupply && prevHalvingTs) {
    const ageHours = (nowTs - prevHalvingTs) / (1000 * 60 * 60);
    // Estimate emission based on time elapsed since last halving (linear decay)
    emissionFallback = (prevHalvingSupply - currentSupplyForHalving) / (ageHours + 1);
    if (window._debug) console.debug('Emission fallback estimate:', emissionFallback, 'TAO/day');
  }
  // Use fallback emission if no other source is available
  if (emissionFallback !== null) {
    emissionPerDay = emissionPerDay ?? emissionFallback;
    emissionSource = emissionSource === 'unknown' ? 'fallback_emission' : emissionSource;
  }
  // Clamp to reasonable range (prevent extreme outliers from breaking UI)
  const EMISSION_CLAMP_MIN = 0.01;
  const EMISSION_CLAMP_MAX = 1000;
  emissionPerDay = Math.max(EMISSION_CLAMP_MIN, Math.min(EMISSION_CLAMP_MAX, emissionPerDay));
  window.emissionPerDay = emissionPerDay;

  // Halving projection: estimate next halving date based on current supply and emission rate
  // We project the next halving date by estimating when the total supply will reach the next halving threshold.
  // This is a rough estimate and will be refined as more data becomes available.
  try {
    const nextThreshold = thresholds[window._halvingIndex + 1] ?? null;
    if (nextThreshold && emissionPerDay > 0) {
      const blocksToNextHalving = (nextThreshold - currentSupplyForHalving) / emissionPerDay;
      const secondsToNextHalving = blocksToNextHalving * 12; // ~12 seconds per block (average)
      const nextHalvingDate = new Date(Date.now() + secondsToNextHalving * 1000);
      window.nextHalvingDate = nextHalvingDate;
      if (window._debug) console.debug('Projected next halving date:', nextHalvingDate);
    } else {
      window.nextHalvingDate = null;
    }
  } catch (e) {
    window.nextHalvingDate = null;
    if (window._debug) console.debug('Halving projection error', e);
  }

  // Update halving info display (pill and countdown)
  updateHalvingInfo();
}

// ===== Matrix Glitch Overlay: global trigger =====
window.showMatrixGlitch = function() {
  const glitch = document.getElementById('matrixGlitch');
  if (glitch) {
    const codeEl = glitch.querySelector('.matrix-glitch-code');
    if (codeEl) {
      const palette = [
        '#22c55e', '#16a34a', '#14532d', '#a3a3a3', '#525252', '#eaff00', '#b3b300', '#d1fae5', '#d4d4d4'
      ];
      const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz░▒▓█▲◆◀▶◼︎◻︎※☰☲☷☯☢☣☠♠♣♥♦♤♧♡♢';
      let code = '';
      for (let i = 0; i < 10; i++) {
        let str = '';
        for (let j = 0; j < 8; j++) {
          const ch = glyphs[Math.floor(Math.random()*glyphs.length)];
          const color = palette[Math.floor(Math.random()*palette.length)];
          str += `<span style=\"color:${color};\">${ch.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
        }
        code += `<span>${str}</span>`;
      }
      codeEl.innerHTML = code;
    }
    glitch.style.display = 'flex';
    glitch.classList.add('active');
    setTimeout(() => {
      glitch.classList.remove('active');
      setTimeout(() => {
        glitch.style.display = 'none';
      }, 180);
    }, 360);
  }
};