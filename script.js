// ===== Matrix Sound Engine =====
const MatrixSound = (function() {
  let audioContext = null;
  let soundEnabled = localStorage.getItem('matrixSoundEnabled') !== 'false'; // Default: enabled
  let isUnlocked = false;

  // Initialize Audio Context (lazy load on first sound)
  function getAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  // Unlock audio context (required by browsers after user interaction)
  function unlockAudio() {
    if (isUnlocked) return;

    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Play silent sound to unlock
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.01);

      isUnlocked = true;
    } catch (e) {
      console.warn('Audio unlock failed:', e);
    }
  }

  // Toggle sound on/off
  function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('matrixSoundEnabled', soundEnabled);
    return soundEnabled;
  }

  // Check if sound is enabled
  function isEnabled() {
    return soundEnabled;
  }

  // Play a synthesized sound
  function play(type, options = {}) {
    if (!soundEnabled) return;

    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      switch(type) {
        case 'boot-power-up':
          playBootPowerUp(ctx, now, options);
          break;
        case 'boot-typing':
          playBootTyping(ctx, now, options);
          break;
        case 'boot-ready':
          playBootReady(ctx, now, options);
          break;
        case 'glitch':
          playGlitch(ctx, now, options);
          break;
        case 'pill-click':
          playPillClick(ctx, now, options);
          break;
        case 'halving-click':
          playHalvingClick(ctx, now, options);
          break;
        case 'refresh-beep':
          playRefreshBeep(ctx, now, options);
          break;
        default:
          console.warn('Unknown sound type:', type);
      }
    } catch (e) {
      console.warn('MatrixSound playback error:', e);
    }
  }

  // Boot Power-Up: Low to high frequency sweep
  function playBootPowerUp(ctx, startTime, options) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, startTime); // Start low
    osc.frequency.exponentialRampToValueAtTime(800, startTime + 1.2); // Sweep up

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.15, startTime + 0.1);
    gain.gain.linearRampToValueAtTime(0.08, startTime + 0.6);
    gain.gain.linearRampToValueAtTime(0, startTime + 1.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 1.2);
  }

  // Boot Typing: Quick blip sounds for terminal text (150Hz - bass)
  function playBootTyping(ctx, startTime, options) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.04, startTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.04);
  }

  // Boot Ready: Confirming beep (for sound toggle)
  function playBootReady(ctx, startTime, options) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, startTime);
    osc.frequency.setValueAtTime(660, startTime + 0.1);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.04, startTime + 0.02);
    gain.gain.linearRampToValueAtTime(0.03, startTime + 0.15);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.25);
  }

  // Glitch: Digital noise burst
  function playGlitch(ctx, startTime, options) {
    const bufferSize = ctx.sampleRate * 0.1; // 100ms
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.08, startTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.08);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(startTime);
  }

  // Price Pill Click: Neutral blip (400Hz) - länger
  function playPillClick(ctx, startTime, options) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.06, startTime + 0.02);
    gain.gain.linearRampToValueAtTime(0.04, startTime + 0.08);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.15);
  }

  // Halving Pill Click: Mechanical tick (300Hz) - länger
  function playHalvingClick(ctx, startTime, options) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.04, startTime + 0.02);
    gain.gain.linearRampToValueAtTime(0.03, startTime + 0.1);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.18);
  }

  // Auto-Refresh Beep: Subtle notification (220Hz)
  function playRefreshBeep(ctx, startTime, options) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.03, startTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.08);
  }

  return {
    play,
    toggleSound,
    isEnabled,
    unlockAudio
  };
})();

// Unlock audio on first user interaction
['click', 'touchstart', 'keydown'].forEach(event => {
  document.addEventListener(event, () => {
    MatrixSound.unlockAudio();
  }, { once: true });
});

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
let currentPriceRange = localStorage.getItem('priceRange') || '3';
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
let VOLUME_HISTORY_TTL = 60000; // Cache history for 1 minute
// Threshold defaults (can be overridden at runtime via `window.VOLUME_SIGNAL_CONFIG`)
let VOLUME_SIGNAL_THRESHOLD = 3; // ±3% threshold for "significant" change
let PRICE_SPIKE_PCT = 10; // if price moves >= 10% in 24h consider spike
let LOW_VOL_PCT = 5;     // if volume change < 5% treat as low-volume move
let SUSTAIN_VOL_PCT = 6; // sustained volume increase threshold (24h)
let TRADED_SHARE_MIN = 0.1; // percent of circ supply traded to consider move meaningful (0.1%)
let SUSTAIN_PRICE_PCT = 8; // lower price pct that can indicate sustained move when combined with other signals
let HYSTERESIS_REQUIRED = 2; // require 2 consecutive checks to mark sustained
let STRICT_DOWN_ALWAYS_RED = false; // runtime toggle to force strict down->RED rule

// Apply optional runtime overrides from `window.VOLUME_SIGNAL_CONFIG` (set in console)
try {
  if (window.VOLUME_SIGNAL_CONFIG && typeof window.VOLUME_SIGNAL_CONFIG === 'object') {
    const cfg = window.VOLUME_SIGNAL_CONFIG;
    if (typeof cfg.VOLUME_HISTORY_TTL === 'number') VOLUME_HISTORY_TTL = cfg.VOLUME_HISTORY_TTL;
    if (typeof cfg.VOLUME_SIGNAL_THRESHOLD === 'number') VOLUME_SIGNAL_THRESHOLD = cfg.VOLUME_SIGNAL_THRESHOLD;
    if (typeof cfg.PRICE_SPIKE_PCT === 'number') PRICE_SPIKE_PCT = cfg.PRICE_SPIKE_PCT;
    if (typeof cfg.LOW_VOL_PCT === 'number') LOW_VOL_PCT = cfg.LOW_VOL_PCT;
    if (typeof cfg.SUSTAIN_VOL_PCT === 'number') SUSTAIN_VOL_PCT = cfg.SUSTAIN_VOL_PCT;
    if (typeof cfg.TRADED_SHARE_MIN === 'number') TRADED_SHARE_MIN = cfg.TRADED_SHARE_MIN;
    if (typeof cfg.SUSTAIN_PRICE_PCT === 'number') SUSTAIN_PRICE_PCT = cfg.SUSTAIN_PRICE_PCT;
    if (typeof cfg.HYSTERESIS_REQUIRED === 'number') HYSTERESIS_REQUIRED = cfg.HYSTERESIS_REQUIRED;
    if (typeof cfg.STRICT_DOWN_ALWAYS_RED === 'boolean') STRICT_DOWN_ALWAYS_RED = cfg.STRICT_DOWN_ALWAYS_RED;
  }
} catch (e) { /* ignore */ }

/**
 * Apply a volume signal config at runtime without reloading the page.
 * Usage: window.applyVolumeConfig({ VOLUME_SIGNAL_THRESHOLD: 2, STRICT_DOWN_ALWAYS_RED: true })
 */
function applyVolumeConfig(cfg) {
  try {
    window.VOLUME_SIGNAL_CONFIG = Object.assign({}, window.VOLUME_SIGNAL_CONFIG || {}, cfg || {});
    const c = window.VOLUME_SIGNAL_CONFIG;
    if (typeof c.VOLUME_HISTORY_TTL === 'number') VOLUME_HISTORY_TTL = c.VOLUME_HISTORY_TTL;
    if (typeof c.VOLUME_SIGNAL_THRESHOLD === 'number') VOLUME_SIGNAL_THRESHOLD = c.VOLUME_SIGNAL_THRESHOLD;
    if (typeof c.PRICE_SPIKE_PCT === 'number') PRICE_SPIKE_PCT = c.PRICE_SPIKE_PCT;
    if (typeof c.LOW_VOL_PCT === 'number') LOW_VOL_PCT = c.LOW_VOL_PCT;
    if (typeof c.SUSTAIN_VOL_PCT === 'number') SUSTAIN_VOL_PCT = c.SUSTAIN_VOL_PCT;
    if (typeof c.TRADED_SHARE_MIN === 'number') TRADED_SHARE_MIN = c.TRADED_SHARE_MIN;
    if (typeof c.SUSTAIN_PRICE_PCT === 'number') SUSTAIN_PRICE_PCT = c.SUSTAIN_PRICE_PCT;
    if (typeof c.HYSTERESIS_REQUIRED === 'number') HYSTERESIS_REQUIRED = c.HYSTERESIS_REQUIRED;
    if (typeof c.STRICT_DOWN_ALWAYS_RED === 'boolean') STRICT_DOWN_ALWAYS_RED = c.STRICT_DOWN_ALWAYS_RED;
    if (window._debug) console.log('applyVolumeConfig applied', window.VOLUME_SIGNAL_CONFIG);
    return true;
  } catch (e) {
    console.warn('applyVolumeConfig failed', e);
    return false;
  }
}
window.applyVolumeConfig = applyVolumeConfig;

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
  
  return { change, confidence, samples, hoursOfData: Math.round(hoursOfData), oldVolume, oldTimestamp: oldEntry?._timestamp };
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
function getVolumeSignal(volumeData, priceChange, currentVolume = null, aggregates = null, fngData = null) {
  // Handle missing data
  if (volumeData === null || priceChange === null) {
    return { signal: 'neutral', tooltip: 'Insufficient data for signal' };
  }

  // Check if weekend (UTC) and adjust thresholds
  const now = new Date();
  const dayUTC = now.getUTCDay(); // 0=Sunday, 6=Saturday
  const isWeekend = (dayUTC === 0 || dayUTC === 6);
  const weekendNote = isWeekend ? '\n\n📅 Weekend — typically lower activity' : '';

  // Support both old format (number) and new format (object with change, confidence)
  const volumeChange = typeof volumeData === 'object' ? volumeData.change : volumeData;
  const confidence = typeof volumeData === 'object' ? volumeData.confidence : null;
  const samples = typeof volumeData === 'object' ? volumeData.samples : null;
  const hoursOfData = typeof volumeData === 'object' ? volumeData.hoursOfData : null;

  // Weekend mode: Higher thresholds (lower activity is normal)
  const threshold = isWeekend ? VOLUME_SIGNAL_THRESHOLD * 1.5 : VOLUME_SIGNAL_THRESHOLD;
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
  
  // Composite detection: Sustained bullish vs short spikes + Market phase
  try {
    // Determine MA alignment and market phase
    const maShortVal = aggregates?.ma_short ?? null;
    const maMedVal = aggregates?.ma_med ?? null;
    const ma3dVal = aggregates?.ma_3d ?? null;
    const ma7dVal = aggregates?.ma_7d ?? null;
    const maShortUp = (maShortVal !== null && maMedVal !== null && maShortVal > maMedVal);
    const ma3dUp = (maMedVal !== null && ma3dVal !== null && maMedVal > ma3dVal);

    // MA alignment (bullish structure)
    const masAligned = maShortVal !== null && maMedVal !== null && ma3dVal !== null && (maShortVal > maMedVal && maMedVal > ma3dVal);

    // Long-term market phase (7d trend) + Fear & Greed integration
    let marketPhase = 'neutral';
    let marketPhaseNote = '';

    // Get Fear & Greed status
    let fngSentiment = null;
    let fngValue = null;
    let fngClass = null;
    if (fngData && fngData.current) {
      fngValue = parseInt(fngData.current.value);
      fngClass = fngData.current.value_classification?.toLowerCase();
      // Map to sentiment
      if (fngClass === 'extreme fear') fngSentiment = 'extreme_fear';
      else if (fngClass === 'fear') fngSentiment = 'fear';
      else if (fngClass === 'neutral') fngSentiment = 'neutral';
      else if (fngClass === 'greed') fngSentiment = 'greed';
      else if (fngClass === 'extreme greed') fngSentiment = 'extreme_greed';
    }

    if (ma3dVal && ma7dVal) {
      const ma7dTrend = ((ma3dVal - ma7dVal) / ma7dVal) * 100;

      // Base market phase from MA trend
      if (ma7dTrend > 5) {
        marketPhase = 'bullish';
        let phaseText = `📈 Market: Bullish (+${ma7dTrend.toFixed(1)}% 3d/7d)`;

        // Add Fear & Greed context
        if (fngSentiment === 'extreme_greed') {
          phaseText += `\n⚠️ Sentiment: Extreme Greed (${fngValue})\n🌡️ overheating?\n📊 max optimism`;
        } else if (fngSentiment === 'greed') {
          phaseText += `\n🔥 Sentiment: Greed (${fngValue})\n✨ euphoria?\n📊 high optimism`;
        } else if (fngSentiment === 'extreme_fear' || fngSentiment === 'fear') {
          phaseText += `\n✅ Sentiment: ${fngClass} (${fngValue})\n🤔 divergence?\n📊 fear in uptrend`;
        }

        marketPhaseNote = `\n${phaseText}`;
      } else if (ma7dTrend < -5) {
        marketPhase = 'bearish';
        let phaseText = `📉 Market: Bearish (-${Math.abs(ma7dTrend).toFixed(1)}% 3d/7d)`;

        // Add Fear & Greed context
        if (fngSentiment === 'extreme_fear') {
          phaseText += `\n🔻 Sentiment: Extreme Fear (${fngValue})\n💀 capitulation?\n📊 max selling pressure`;
        } else if (fngSentiment === 'fear') {
          phaseText += `\n😰 Sentiment: Fear (${fngValue})\n😟 panic?\n📊 selling pressure`;
        } else if (fngSentiment === 'extreme_greed' || fngSentiment === 'greed') {
          phaseText += `\n⚠️ Sentiment: ${fngClass} (${fngValue})\n🔀 disconnect?\n📊 greed in downtrend`;
        }

        marketPhaseNote = `\n${phaseText}`;
      } else {
        const aboveBelow = ma7dTrend >= 0 ? 'above' : 'below';
        const absValue = Math.abs(ma7dTrend).toFixed(1);
        const sign = ma7dTrend >= 0 ? '+' : '-';
        let phaseText = `➡️ Market: Neutral (${sign}${absValue}% 3d/7d)`;

        // Add Fear & Greed as primary indicator in neutral markets
        if (fngSentiment === 'extreme_greed') {
          phaseText += `\n⚠️ Sentiment: Extreme Greed (${fngValue})\n🎯 correction?\n📊 high sentiment`;
        } else if (fngSentiment === 'extreme_fear') {
          phaseText += `\n💎 Sentiment: Extreme Fear (${fngValue})\n😰 extreme fear?\n📊 low sentiment`;
        } else if (fngSentiment) {
          phaseText += `\n😐 Sentiment: ${fngClass} (${fngValue})`;
        }

        marketPhaseNote = `\n${phaseText}`;
      }
    } else if (fngSentiment) {
      // No MA data available, use Fear & Greed as fallback
      marketPhaseNote = `\n😐 Sentiment: ${fngClass} (${fngValue})`;
    }

    // STRICT RULE (refined): Only RED when significant drop + no MA support
    // Don't override if we're in a bullish market phase with good MA alignment
    const significantDrop = volumeChange < -threshold * 1.5 && priceChange < -threshold * 1.5;

    if (STRICT_DOWN_ALWAYS_RED && significantDrop && marketPhase !== 'bullish') {
      const volStrStrict = volumeChange >= 0 ? `+${volumeChange.toFixed(1)}%` : `${volumeChange.toFixed(1)}%`;
      const priceStrStrict = priceChange >= 0 ? `+${priceChange.toFixed(1)}%` : `${priceChange.toFixed(1)}%`;
      if (window._debug) console.debug('Ampelsystem strict rule: significant drop in non-bullish phase', {priceChange, volumeChange, marketPhase});
      return {
        signal: 'red',
        tooltip: `🔴 Bearish
Volume: ${volStrStrict}
Price: ${priceStrStrict}
Both declining — downward momentum${marketPhaseNote}` + (confidenceLine || '') + weekendNote
      };
    }
    if (volumeChange < 0 && priceChange < 0 && (confidence !== 'high' || !masAligned) && marketPhase !== 'bullish') {
      const volStrStrict = volumeChange >= 0 ? `+${volumeChange.toFixed(1)}%` : `${volumeChange.toFixed(1)}%`;
      const priceStrStrict = priceChange >= 0 ? `+${priceChange.toFixed(1)}%` : `${priceChange.toFixed(1)}%`;
      if (window._debug) console.debug('Ampelsystem soft strict: both down, no MA support', {priceChange, volumeChange, confidence, masAligned, marketPhase});
      return {
        signal: 'red',
        tooltip: `🔴 Bearish\nVolume: ${volStrStrict}\nPrice: ${priceStrStrict}\nBoth declining — downward momentum${marketPhaseNote}` + (confidenceLine || '') + weekendNote
      };
    }
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
    // sustain if MAs aligned AND (volume up OR traded share large (with non-negative price) OR strong price move)
    // Only treat tradedSharePct as evidence of buying pressure when price is not strongly negative
    const tradedShareGood = (tradedSharePct !== null && tradedSharePct >= TRADED_SHARE_MIN && priceChange >= -2.0);
    const sustainCondition = masAligned && (
      volumeChange >= SUSTAIN_VOL_PCT ||
      tradedShareGood ||
      (priceChange >= SUSTAIN_PRICE_PCT)
    );
    // If traded-share or strong price move is present, consider sustained immediately (but ignore traded-share when price is strongly negative)
    if (masAligned && (tradedShareGood || priceChange >= SUSTAIN_PRICE_PCT)) {
      return {
        signal: 'green',
        tooltip: `🟢 Strong Bullish\nVolume: ${volStr}\nPrice: ${priceStr}\nSustained upward momentum confirmed${marketPhaseNote}` + (confidenceLine || '') + weekendNote
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
        tooltip: `🟢 Strong Bullish\nVolume: ${volStr}\nPrice: ${priceStr}\nSustained upward momentum confirmed${marketPhaseNote}` + (confidenceLine || '') + weekendNote
      };
    }
  } catch (e) {
    if (window._debug) console.debug('sustained detection failed', e);
  }

  // Build market phase note for standard signals (fallback if not in try block)
  let marketPhaseNote = '';
  try {
    const ma3dVal = aggregates?.ma_3d ?? null;
    const ma7dVal = aggregates?.ma_7d ?? null;

    // Get Fear & Greed status (fallback)
    let fngSentiment = null;
    let fngValue = null;
    let fngClass = null;
    if (fngData && fngData.current) {
      fngValue = parseInt(fngData.current.value);
      fngClass = fngData.current.value_classification?.toLowerCase();
      if (fngClass === 'extreme fear') fngSentiment = 'extreme_fear';
      else if (fngClass === 'fear') fngSentiment = 'fear';
      else if (fngClass === 'neutral') fngSentiment = 'neutral';
      else if (fngClass === 'greed') fngSentiment = 'greed';
      else if (fngClass === 'extreme greed') fngSentiment = 'extreme_greed';
    }

    if (ma3dVal && ma7dVal) {
      const ma7dTrend = ((ma3dVal - ma7dVal) / ma7dVal) * 100;

      if (ma7dTrend > 5) {
        let phaseText = `📈 Market: Bullish (+${ma7dTrend.toFixed(1)}% 3d/7d)`;
        if (fngSentiment === 'extreme_greed') {
          phaseText += `\n⚠️ Sentiment: Extreme Greed (${fngValue})\n🌡️ overheating?\n📊 max optimism`;
        } else if (fngSentiment === 'greed') {
          phaseText += `\n🔥 Sentiment: Greed (${fngValue})\n✨ euphoria?\n📊 high optimism`;
        } else if (fngSentiment === 'extreme_fear' || fngSentiment === 'fear') {
          phaseText += `\n✅ Sentiment: ${fngClass} (${fngValue})\n🤔 divergence?\n📊 fear in uptrend`;
        }
        marketPhaseNote = `\n${phaseText}`;
      } else if (ma7dTrend < -5) {
        let phaseText = `📉 Market: Bearish (-${Math.abs(ma7dTrend).toFixed(1)}% 3d/7d)`;
        if (fngSentiment === 'extreme_fear') {
          phaseText += `\n🔻 Sentiment: Extreme Fear (${fngValue})\n💀 capitulation?\n📊 max selling pressure`;
        } else if (fngSentiment === 'fear') {
          phaseText += `\n😰 Sentiment: Fear (${fngValue})\n😟 panic?\n📊 selling pressure`;
        } else if (fngSentiment === 'extreme_greed' || fngSentiment === 'greed') {
          phaseText += `\n⚠️ Sentiment: ${fngClass} (${fngValue})\n🔀 disconnect?\n📊 greed in downtrend`;
        }
        marketPhaseNote = `\n${phaseText}`;
      } else {
        const aboveBelow = ma7dTrend >= 0 ? 'above' : 'below';
        const absValue = Math.abs(ma7dTrend).toFixed(1);
        const sign = ma7dTrend >= 0 ? '+' : '-';
        let phaseText = `➡️ Market: Neutral (${sign}${absValue}% 3d/7d)`;
        if (fngSentiment === 'extreme_greed') {
          phaseText += `\n⚠️ Sentiment: Extreme Greed (${fngValue})\n🎯 correction?\n📊 high sentiment`;
        } else if (fngSentiment === 'extreme_fear') {
          phaseText += `\n💎 Sentiment: Extreme Fear (${fngValue})\n😰 extreme fear?\n📊 low sentiment`;
        } else if (fngSentiment) {
          phaseText += `\n😐 Sentiment: ${fngClass} (${fngValue})`;
        }
        marketPhaseNote = `\n${phaseText}`;
      }
    } else if (fngSentiment) {
      // No MA data available, use Fear & Greed as fallback
      marketPhaseNote = `\n😐 Sentiment: ${fngClass} (${fngValue})`;
    }
  } catch (e) { /* ignore */ }

  // 🟢 GREEN: Volume up + Price up = Strong buying pressure
  if (volUp && priceUp) {
    return {
      signal: 'green',
      tooltip: `🟢 Bullish\nVolume: ${volStr}\nPrice: ${priceStr}\nStrong buying interest${marketPhaseNote}${confidenceLine}${weekendNote}`
    };
  }

  // 🔴 RED: Volume up + Price down = Distribution/Panic selling
  if (volUp && priceDown) {
    return {
      signal: 'red',
      tooltip: `🔴 Bearish\nVolume: ${volStr}\nPrice: ${priceStr}\nHigh selling pressure${marketPhaseNote}${confidenceLine}${weekendNote}`
    };
  }

  // 🟠 ORANGE: Volume up + Price stable = High activity, direction unclear
  if (volUp && priceStable) {
    return {
      signal: 'orange',
      tooltip: `🟠 Watch\nVolume: ${volStr}\nPrice: ${priceStr}\nHigh activity — direction unclear${marketPhaseNote}${confidenceLine}${weekendNote}`
    };
  }
  
  // Detect low-volume strong price moves (price spike on thin liquidity)
  // This should trigger even when volumeChange is slightly positive but below LOW_VOL_PCT.
  if (priceUp && Math.abs(volumeChange) < LOW_VOL_PCT && priceChange >= PRICE_SPIKE_PCT) {
    let pctTraded = null;
    if (currentVolume && window.circulatingSupply) {
      pctTraded = (currentVolume / window.circulatingSupply) * 100;
    }
    const spikeLines = [`🟡 Low Volume Spike`, `Volume: ${volStr}`, `Price: ${priceStr}`];
    if (pctTraded !== null) spikeLines.push(`Traded: ${pctTraded.toFixed(4)}% of supply`);
    spikeLines.push('Price surge on low liquidity', confidenceLine);
    if (weekendNote) spikeLines.push(weekendNote.trim());
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
      const spikeLines = [`🟡 Low Volume Spike`,`Volume: ${volStr}`,`Price: ${priceStr}`];
      if (pctTraded !== null) spikeLines.push(`Traded: ${pctTraded.toFixed(4)}% of supply`);
      spikeLines.push('Price surge on low liquidity — may reverse', confidenceLine);
      if (marketPhaseNote) spikeLines.push(marketPhaseNote.trim());
      if (weekendNote) spikeLines.push(weekendNote.trim());
      return { signal: 'yellow', tooltip: spikeLines.join('\n') };
    }

    return {
      signal: 'yellow',
      tooltip: `🟡 Caution\nVolume: ${volStr}\nPrice: ${priceStr}\nWeak momentum — needs volume confirmation${marketPhaseNote}${confidenceLine}${weekendNote}`
    };
  }

  // Vol↓ + Price↓: Consolidation or Slightly bearish
  if (volDown && priceDown) {
    // If price drop is meaningful, mark as bearish
    const SLIGHT_BEAR_PCT = 2.0; // 2% price drop threshold
    if (priceChange <= -SLIGHT_BEAR_PCT) {
      return {
        signal: 'red',
        tooltip: `🔴 Bearish\nVolume: ${volStr}\nPrice: ${priceStr}\nDecline on reduced interest${marketPhaseNote}${confidenceLine}${weekendNote}`
      };
    }
    return {
      signal: 'yellow',
      tooltip: `🟡 Consolidation\nVolume: ${volStr}\nPrice: ${priceStr}\nLow activity — sideways movement${marketPhaseNote}${confidenceLine}${weekendNote}`
    };
  }

  // ⚪ STABLE: No significant movement
  return {
    signal: 'neutral',
    tooltip: `⚪ Stable\nVolume: ${volStr}\nPrice: ${priceStr}\nQuiet market${marketPhaseNote}${confidenceLine}${weekendNote}`
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
  // Fetch Fear & Greed data for sentiment analysis
  const fngData = await fetchFearAndGreed();
  let { signal, tooltip } = getVolumeSignal(volumeData, priceChange24h, currentVolume, aggregates, fngData);
  // Add last updated if available
  let lastUpdatedStr = null;
  if (aggregates && aggregates.last_updated) {
    lastUpdatedStr = new Date(aggregates.last_updated).toLocaleString();
  } else if (volumeData && volumeData.last_updated) {
    lastUpdatedStr = new Date(volumeData.last_updated).toLocaleString();
  }
  
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
  // Add last updated to tooltip
  if (lastUpdatedStr) {
    tooltip += `\n\nLast updated: ${lastUpdatedStr}`;
  }
  
  // Always log signal calculation for debugging
  const volPct = volumeData?.change?.toFixed(1) ?? 'null';
  const conf = volumeData?.confidence ?? 'n/a';
  console.log(`📊 Signal calc: vol=${volPct}%, price=${priceChange24h?.toFixed(1)}%, conf=${conf} → ${signal}`);
  
  applyVolumeSignal(signal, tooltip);
}

/**
 * Switch the Fear&Greed spoon variant at runtime.
 * Usage: window.setFngSpoonVariant('deep') or ('flat')
 */
window.setFngSpoonVariant = function(variant) {
  try {
    const card = document.getElementById('fngCard');
    if (!card) return false;
    if (variant === 'flat') {
      card.classList.add('fng-spoon-flat');
    } else {
      card.classList.remove('fng-spoon-flat');
    }
    // Toggle display of variant groups (additional safeguard)
    document.querySelectorAll('.spoon-variant').forEach(g => {
      if (g.classList.contains('variant-' + variant)) g.style.display = '';
      else g.style.display = 'none';
    });
    return true;
  } catch (e) {
    console.warn('setFngSpoonVariant failed', e);
    return false;
  }
};

/**
 * Use user-supplied graphics for the spoon gauge.
 * darkPath and lightPath are relative URLs to the images (e.g. 'assets/fng-spoon-dark.png').
 * The image will switch when `body.light-bg` toggles.
 */
window.useFngGraphics = async function(darkPath = '/assets/fng-spoon-black.png', lightPath = '/assets/fng-spoon-white.png') {
  try {
    const imgEl = document.getElementById('fngSpoonImage');
    if (!imgEl) return false;

    const checkImage = (url) => new Promise(resolve => {
      const i = new Image();
      i.onload = () => resolve(true);
      i.onerror = () => resolve(false);
      i.src = url;
    });

    const darkOk = await checkImage(darkPath);
    const lightOk = await checkImage(lightPath);
    if (!darkOk && !lightOk) {
      return false;
    }

    // choose appropriate source based on current theme
    const chooseSrc = () => {
      const isLight = document.body.classList.contains('light-bg');
      if (isLight && lightOk) return lightPath;
      if (!isLight && darkOk) return darkPath;
      // fallback to whichever exists
      return darkOk ? darkPath : lightPath;
    };

    // set initial
    imgEl.src = chooseSrc();

    // observe theme changes on body and switch image accordingly
    const mo = new MutationObserver(() => {
      try { imgEl.src = chooseSrc(); } catch (e) {}
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return true;
  } catch (e) {
    if (window._debug) console.warn('useFngGraphics failed', e);
    return false;
  }
};

// ===== Utility Functions =====
// ===== Fear & Greed UI helpers =====
async function fetchFearAndGreed() {
  try {
    const res = await fetch('/api/fear_and_greed_index', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (e) {
    if (window._debug) console.debug('fetchFearAndGreed failed', e);
    return null;
  }
}

function mapFngToClass(classification) {
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
function animateSpoonNeedle(value) {
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
window.testSpoonGauge = function(value = 50) {
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
};

async function updateFearAndGreed() {
  const infoBadge = document.getElementById('fngInfo');
  // const timelineEl = document.getElementById('fngTimeline');
  const timelineTextEl = document.getElementById('fngTimelineText');
  const data = await fetchFearAndGreed();

  // Store globally for API status tooltip
  window._fearAndGreed = data;

  if (!data || !data.current) {
    if (timelineEl) timelineEl.innerHTML = '';
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
  const sourceStr = 'alternative.me';
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
  // Build a lookup of available timeline entries and then render in the desired order
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

// Build HTML for API status tooltip showing per-source chips
function buildApiStatusHtml({ networkData, taostats, taoPrice, fearAndGreed }) {
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

  // Fear & Greed (alternative.me)
  let fngStatus = 'error';
  if (fearAndGreed && fearAndGreed.current) {
    const hasValue = fearAndGreed.current.value !== undefined && fearAndGreed.current.value !== null;
    fngStatus = hasValue ? 'ok' : 'partial';
  }

  // Bittensor SDK / network API
  const networkStatus = networkData ? 'ok' : 'error';

  const lines = [];
  lines.push('<div>Status of all data sources powering the dashboard</div>');
  // Order: Bittensor SDK (network), Taostats, CoinGecko, Alternative.me
  lines.push('<div style="margin-top:8px">' + chip(networkStatus) + ' Bittensor SDK</div>');
  lines.push('<div>' + chip(taostatsStatus) + ' Taostats</div>');
  lines.push('<div>' + chip(coingeckoStatus) + ' CoinGecko</div>');
  lines.push('<div>' + chip(fngStatus) + ' Alternative.me (F&G)</div>');
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
            if (window._lastUpdated) lines.push(`Last updated: ${new Date(window._lastUpdated).toLocaleString()}`);
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
      // Update Block Height tooltip
      const blockHeightBadge = document.querySelector('#blockHeightCard .info-badge');
      if (blockHeightBadge) {
        const tooltipLines = [
          'Current block height of the Bittensor blockchain',
          `Block: ${formatFull(data.blockHeight)}`,
          'Source: Network API'
        ];
        if (data.last_issuance_ts) {
          tooltipLines.push(`Last updated: ${new Date(data.last_issuance_ts * 1000).toLocaleString()}`);
        }
        blockHeightBadge.setAttribute('data-tooltip', tooltipLines.join('\n'));
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
    // Use last_issuance_ts from Network API for timestamp
    if (data && data.last_issuance_ts) {
      halvingLines.push(`Last updated: ${new Date(data.last_issuance_ts * 1000).toLocaleString()}`);
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

// ===== Modern Tooltip System =====
class TooltipManager {
  constructor() {
    this.tooltip = null;
    this.currentTarget = null;
    this.hideTimer = null;
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    this.init();
  }

  init() {
    // Create tooltip element
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'modern-tooltip';
    this.tooltip.setAttribute('role', 'tooltip');
    this.tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.tooltip);

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!this.tooltip.contains(e.target) && this.currentTarget && !this.currentTarget.contains(e.target)) {
        this.hide();
      }
    });

    // Close on ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.tooltip.classList.contains('visible')) {
        this.hide();
      }
    });
  }

  show(target, options = {}) {
    const {
      text = '',
      html = false,
      persistent = false,
      autoHide = 4000,
      wide = false
    } = options;

    // Clear any existing timer
    this.clearTimer();

    // If clicking same target, toggle off
    if (this.currentTarget === target && this.tooltip.classList.contains('visible')) {
      this.hide();
      return;
    }

    // Update current target
    this.currentTarget = target;

    // Build content
    this.tooltip.innerHTML = '';

    const body = document.createElement('div');
    body.className = 'tooltip-body';
    if (html) {
      body.innerHTML = text;
    } else {
      body.textContent = text;
    }
    this.tooltip.appendChild(body);

    // Add close button if persistent or touch
    if (persistent || this.isTouch) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'tooltip-close';
      closeBtn.innerHTML = '×';
      closeBtn.setAttribute('aria-label', 'Close tooltip');
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hide();
      });
      this.tooltip.appendChild(closeBtn);
      this.tooltip.classList.add('has-close');
    } else {
      this.tooltip.classList.remove('has-close');
    }

    // Wide variant
    if (wide) {
      this.tooltip.classList.add('wide');
    } else {
      this.tooltip.classList.remove('wide');
    }

    // Show tooltip
    this.tooltip.classList.add('visible');
    this.tooltip.setAttribute('aria-hidden', 'false');

    // Position tooltip
    this.position(target);

    // Auto-hide timer (unless persistent)
    if (!persistent && autoHide > 0) {
      this.hideTimer = setTimeout(() => this.hide(), autoHide);
    }
  }

  position(target) {
    // Get rects
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const padding = 8;
    const arrowOffset = 6;

    // Determine best vertical position
    const spaceAbove = targetRect.top;
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const positionBelow = spaceBelow >= tooltipRect.height + padding + arrowOffset;

    let top, left;

    // Position vertically
    if (positionBelow) {
      top = targetRect.bottom + arrowOffset + padding;
      this.tooltip.dataset.position = 'bottom';
    } else {
      top = targetRect.top - tooltipRect.height - arrowOffset - padding;
      this.tooltip.dataset.position = 'top';
    }

    // Position horizontally (centered on target)
    left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

    // Keep within viewport horizontally
    if (left < padding) {
      left = padding;
    }
    if (left + tooltipRect.width > window.innerWidth - padding) {
      left = window.innerWidth - tooltipRect.width - padding;
    }

    // Final flip check - if still doesn't fit, flip vertical position
    if (top < padding) {
      top = targetRect.bottom + arrowOffset + padding;
      this.tooltip.dataset.position = 'bottom';
    }
    if (top + tooltipRect.height > window.innerHeight - padding) {
      top = targetRect.top - tooltipRect.height - arrowOffset - padding;
      this.tooltip.dataset.position = 'top';
    }

    // Apply position
    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.left = `${left}px`;
  }

  hide() {
    this.clearTimer();
    this.tooltip.classList.remove('visible');
    this.tooltip.setAttribute('aria-hidden', 'true');
    this.currentTarget = null;
  }

  clearTimer() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}

// Initialize global tooltip manager
const tooltipManager = new TooltipManager();

// Setup dynamic tooltips
function setupDynamicTooltips() {
  const isTouch = tooltipManager.isTouch;

  // Info badges - always persistent with X-button (Desktop & Mobile)
  document.querySelectorAll('.info-badge').forEach(badge => {
    if (badge.closest && badge.closest('.taotensor-card')) return;

    // Hover on desktop shows tooltip without X-button (persistent behavior, no auto-hide)
    if (!isTouch) {
      badge.addEventListener('mouseenter', () => {
        const text = badge.getAttribute('data-tooltip');
        const html = badge.getAttribute('data-tooltip-html') === 'true';
        if (text) tooltipManager.show(badge, { text, html, persistent: false, autoHide: 0 });
      });
      badge.addEventListener('mouseleave', () => tooltipManager.hide());
    }

    // Keyboard navigation
    badge.addEventListener('focus', () => {
      const text = badge.getAttribute('data-tooltip');
      const html = badge.getAttribute('data-tooltip-html') === 'true';
      if (text) tooltipManager.show(badge, { text, html, persistent: true, autoHide: 0 });
    });

    // Click on mobile/touch
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = badge.getAttribute('data-tooltip');
      const html = badge.getAttribute('data-tooltip-html') === 'true';
      if (text) {
        tooltipManager.show(badge, { text, html, persistent: true, autoHide: 0 });
      }
    });
  });

  // Halving pills (wide tooltips)
  document.querySelectorAll('.halving-pill').forEach(pill => {
    if (!isTouch) {
      pill.addEventListener('mouseenter', () => {
        const text = pill.getAttribute('data-tooltip') || '';
        const html = pill.getAttribute('data-tooltip-html') === 'true';
        if (text) tooltipManager.show(pill, { text, html, wide: true, persistent: false, autoHide: 0 });
      });
      pill.addEventListener('mouseleave', () => tooltipManager.hide());
    }

    // Keyboard navigation
    pill.addEventListener('focus', () => {
      const text = pill.getAttribute('data-tooltip') || '';
      const html = pill.getAttribute('data-tooltip-html') === 'true';
      if (text) tooltipManager.show(pill, { text, html, wide: true, persistent: false, autoHide: 0 });
    });
    pill.addEventListener('blur', () => tooltipManager.hide());

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      MatrixSound.play('halving-click');
      const text = pill.getAttribute('data-tooltip') || '';
      const html = pill.getAttribute('data-tooltip-html') === 'true';
      if (text) {
        tooltipManager.show(pill, {
          text,
          html,
          wide: true,
          persistent: isTouch,
          autoHide: isTouch ? 0 : TOOLTIP_AUTO_HIDE_MS
        });
      }
    });
  });

  // Price pills
  document.querySelectorAll('.price-pill').forEach(pill => {
    if (!isTouch) {
      pill.addEventListener('mouseenter', () => {
        const text = pill.getAttribute('data-tooltip') || '';
        const html = pill.getAttribute('data-tooltip-html') === 'true';
        if (text) tooltipManager.show(pill, { text, html, persistent: false, autoHide: 0 });
      });
      pill.addEventListener('mouseleave', () => tooltipManager.hide());
    }

    // Keyboard navigation
    pill.addEventListener('focus', () => {
      const text = pill.getAttribute('data-tooltip') || '';
      const html = pill.getAttribute('data-tooltip-html') === 'true';
      if (text) tooltipManager.show(pill, { text, html, persistent: false, autoHide: 0 });
    });
    pill.addEventListener('blur', () => tooltipManager.hide());

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      MatrixSound.play('pill-click');
      const text = pill.getAttribute('data-tooltip') || '';
      const html = pill.getAttribute('data-tooltip-html') === 'true';
      if (text) {
        tooltipManager.show(pill, {
          text,
          html,
          persistent: isTouch,
          autoHide: isTouch ? 0 : TOOLTIP_AUTO_HIDE_MS
        });
      }
    });
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

// Setup tooltips after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupDynamicTooltips);
} else {
  setupDynamicTooltips();
}

// ===== Data Refresh =====
async function refreshDashboard() {
  const [networkData, taoPrice, taostats] = await Promise.all([
    fetchNetworkData(),
    fetchTaoPrice(),
    fetchTaostats()
  ]);
  // Expose taostats globally for tooltips and other UI pieces
  window._taostats = taostats ?? null;

  // LAST UPDATE from Taostats - set BEFORE updateNetworkStats/updateTaoPrice so tooltips have access
  const lastUpdateEl = document.getElementById('lastUpdate');
  let lastUpdated = null;
  if (taoPrice && taoPrice._source === 'taostats' && taoPrice.last_updated) {
    lastUpdated = taoPrice.last_updated;
  } else if (taoPrice && taoPrice._source === 'taostats' && taoPrice._timestamp) {
    lastUpdated = taoPrice._timestamp;
  }
  // Expose lastUpdated globally for tooltips BEFORE other updates
  window._lastUpdated = lastUpdated;
  if (window._debug) console.log('DEBUG lastUpdated:', lastUpdated, 'taoPrice.last_updated:', taoPrice?.last_updated, 'source:', taoPrice?._source);

  updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);

  // Update UI display for last update time
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
    // Update Market Conditions Card
    if (typeof updateMarketConditionsCard === 'function') {
      try {
        await updateMarketConditionsCard(taostats.volume_24h, priceChange24h);
      } catch (e) {
        if (window._debug) console.debug('updateMarketConditionsCard failed', e);
      }
    }
    // Update Token Economics Card
    if (typeof updateTokenEconomicsCard === 'function') {
      try {
        await updateTokenEconomicsCard();
      } catch (e) {
        if (window._debug) console.debug('updateTokenEconomicsCard failed', e);
      }
    }
    // Update Fear & Greed card (fetch from Worker KV via API)
    try { updateFearAndGreed(); } catch (e) { if (window._debug) console.debug('updateFearAndGreed failed', e); }
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
  if (apiStatusEl) {
    // Show only a single status chip in the card (larger + centered on small screens)
    const isOk = (color === '#22c55e');
    let badgeText = 'Error';
    let badgeClass = 'error';
    if (isOk) {
      badgeText = 'OK';
      badgeClass = 'ok';
    } else if (statusText === 'Partial data') {
      badgeText = 'Partial';
      badgeClass = 'partial';
    }
    apiStatusEl.innerHTML = `<span class="api-status-badge ${badgeClass} api-status-large">${badgeText}</span>`;
  }
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

  // Update API status tooltip with per-source live chips
  try {
    const infoBadge = document.querySelector('#apiStatusCard .info-badge');
    if (infoBadge) {
      const fearAndGreed = window._fearAndGreed || null;
      const html = buildApiStatusHtml({ networkData, taostats, taoPrice, fearAndGreed });
      infoBadge.setAttribute('data-tooltip', html);
      infoBadge.setAttribute('data-tooltip-html', 'true');
    }
  } catch (e) {
    if (window._debug) console.debug('Failed to update api status tooltip html', e);
  }
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
      try {
        // Trigger Matrix glitch only on automated refresh (not on manual click)
        if (typeof window.showMatrixGlitch === 'function') {
          // Use RC20.2-like duration (360ms visible) and minimal intensity
          window.showMatrixGlitch({ duration: 360, intensity: 1 });
        }
      } catch (e) {
        if (window._debug) console.warn('showMatrixGlitch failed', e);
      }
      MatrixSound.play('refresh-beep');
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

  // Set lastUpdated BEFORE updates so tooltips have access (same as refreshDashboard)
  let lastUpdated = null;
  if (taoPrice && taoPrice._source === 'taostats' && taoPrice.last_updated) {
    lastUpdated = taoPrice.last_updated;
  } else if (taoPrice && taoPrice._source === 'taostats' && taoPrice._timestamp) {
    lastUpdated = taoPrice._timestamp;
  }
  window._lastUpdated = lastUpdated;

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
    // Update Market Conditions Card on init
    if (typeof updateMarketConditionsCard === 'function') {
      try {
        await updateMarketConditionsCard(taostats.volume_24h, initPriceChange24h);
      } catch (e) {
        if (window._debug) console.debug('init updateMarketConditionsCard failed', e);
      }
    }
    // Update Token Economics Card on init
    if (typeof updateTokenEconomicsCard === 'function') {
      try {
        await updateTokenEconomicsCard();
      } catch (e) {
        if (window._debug) console.debug('init updateTokenEconomicsCard failed', e);
      }
    }
    try { updateFearAndGreed(); } catch (e) { if (window._debug) console.debug('init updateFearAndGreed failed', e); }
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
  if (apiStatusEl) {
    // Render only the status chip in the card
    const isOk = (color === '#22c55e');
    let badgeText = 'Error';
    let badgeClass = 'error';
    if (isOk) {
      badgeText = 'OK';
      badgeClass = 'ok';
    } else if (statusText === 'Partial data') {
      badgeText = 'Partial';
      badgeClass = 'partial';
    }
    apiStatusEl.innerHTML = `<span class="api-status-badge ${badgeClass} api-status-large">${badgeText}</span>`;
  }
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
    // Auto-load user-supplied FNG graphics if present (assets/fng-spoon-*.png)
    try {
      if (window.useFngGraphics) {
          window.useFngGraphics('/assets/fng-spoon-black.png','/assets/fng-spoon-white.png');
        }
    } catch (e) { if (window._debug) console.debug('auto useFngGraphics failed', e); }
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
      const blockLastUpd = data.last_updated || window._lastUpdated;
      if (blockLastUpd) tooltipLines.push(`Last updated: ${new Date(blockLastUpd).toLocaleString()}`);
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
      const lastUpdatedStr = data.last_updated ? new Date(data.last_updated).toLocaleString() : null;
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
      if (lastUpdatedStr) tooltipLines.push(`Last updated: ${lastUpdatedStr}`);
      badge.setAttribute('data-tooltip', tooltipLines.join('\n'));
    }
    // Add tooltip for price badge (using global data)
    const priceBadge = document.querySelector('#taoPriceCard .info-badge');
    if (priceBadge) {
      const ts = window._taostats;
      const priceVal = ts?.price ?? null;
      const lastUpd = window._lastUpdated;
      let tooltip = 'Current TAO price from Taostats API';
      if (priceVal) tooltip += `\nPrice: $${priceVal}`;
      if (lastUpd) tooltip += `\nLast updated: ${new Date(lastUpd).toLocaleString()}`;
      priceBadge.setAttribute('data-tooltip', tooltip);
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
        // Persist user's selection so it survives reloads (client-side only)
        try { localStorage.setItem('priceRange', currentPriceRange); } catch (e) { /* ignore */ }

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

    // Ensure the correct active button is set from persisted preference (if any)
    try {
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      const activeBtn = document.querySelector(`.time-btn[data-range="${currentPriceRange}"]`);
      if (activeBtn) activeBtn.classList.add('active');
    } catch (e) { /* ignore */ }

    // Info badge tooltip for API status card: preserve any existing (HTML) tooltip
    // Only set a default if the attribute is missing or suspiciously short (regression guard).
    const infoBadge = document.querySelector('#apiStatusCard .info-badge');
    if (infoBadge) {
        const existing = infoBadge.getAttribute('data-tooltip') || '';
        if (!existing || existing.trim().length < 20) {
          // Default detailed tooltip (HTML chips) — per-source chips allow quick status scan
          const html = [
            '<div>Status of all data sources powering the dashboard</div>',
            '<br/>',
            '<div><span class="tooltip-chip ok">OK</span> Taostats</div>',
            '<div><span class="tooltip-chip error">Error</span> CoinGecko</div>',
            '<div><span class="tooltip-chip ok">OK</span> Bittensor SDK</div>',
            '<div><span class="tooltip-chip ok">OK</span> Alternative.me (F&G)</div>'
          ].join('');
          infoBadge.setAttribute('data-tooltip', html);
          infoBadge.setAttribute('data-tooltip-html', 'true');
        }
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
    ...Array.from(document.querySelectorAll('.dashboard-card, .stat-card, .market-conditions-card, .price-pill, .halving-pill, .ath-atl-pill, .whitepaper-btn, #bgToggleBtn, #soundToggleBtn, .stat-value, .info-badge, .pill-value, .disclaimer-card, .site-footer'))
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

    // Switch spoon background image for Fear & Greed card
    const spoonBg = document.getElementById('fngSpoonImage');
    if (spoonBg) {
      spoonBg.src = active ? 'assets/fng-spoon-white.png' : 'assets/fng-spoon-black.png';
    }

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

  // Sound toggle button
  const soundBtn = document.getElementById('soundToggleBtn');
  const soundOnIcon = document.getElementById('soundOnIcon');
  const soundOffIcon = document.getElementById('soundOffIcon');
  const soundMusicNote = document.getElementById('soundMusicNote');

  if (soundBtn && soundOnIcon && soundOffIcon) {
    // Set initial icon state
    function updateSoundIcon() {
      const soundEnabled = MatrixSound.isEnabled();
      soundOnIcon.style.display = soundEnabled ? 'inline' : 'none';
      soundOffIcon.style.display = soundEnabled ? 'none' : 'inline';

      // Update music note color on mobile
      if (soundMusicNote) {
        soundMusicNote.style.color = soundEnabled ? '#22c55e' : '#ef4444';
      }
    }

    // Initialize icon on page load
    updateSoundIcon();

    // Toggle sound on click
    soundBtn.addEventListener('click', function() {
      MatrixSound.toggleSound();
      updateSoundIcon();

      // Play a test sound if we just enabled it
      if (MatrixSound.isEnabled()) {
        MatrixSound.play('boot-ready');
      }
    });
  }
});

// ===== Top Subnets Display Card (Main Grid) =====
document.addEventListener('DOMContentLoaded', function() {
  const displayTable = document.getElementById('topSubnetsDisplayTable');
  const displayList = document.getElementById('topSubnetsDisplayList');

  if (!displayTable || !displayList) return;

  // Load and display top 10 subnets with ranking changes
  async function loadTopSubnetsDisplay() {
    try {
      // Fetch current data and history in parallel
      const [currentRes, historyRes] = await Promise.all([
        fetch('/api/top_subnets'),
        fetch('/api/top_subnets_history?limit=2')
      ]);

      if (!currentRes.ok) throw new Error('Failed to fetch top subnets');
      const currentData = await currentRes.json();
      const topSubnets = currentData.top_subnets || [];

      if (topSubnets.length === 0) {
        displayList.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No subnet data available</td></tr>';
        return;
      }

      // Build previous ranking map from history
      let prevRankMap = {}; // netuid -> previous rank (1-based)
      try {
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          const history = historyData.history || [];
          // Get the second-to-last snapshot (previous state)
          if (history.length >= 2) {
            const prevSnapshot = history[history.length - 2];
            const prevSubnets = prevSnapshot.top_subnets || [];
            prevSubnets.forEach((s, idx) => {
              prevRankMap[s.netuid] = idx + 1;
            });
          }
        }
      } catch (e) {
        console.warn('Could not load subnet history for ranking:', e);
      }

      // Display TOP 10 with ranking changes
      const rows = topSubnets.slice(0, 10).map((subnet, idx) => {
        const rank = idx + 1;
        const netuid = subnet.netuid;
        const name = subnet.subnet_name || subnet.taostats_name || `SN${netuid}`;
        const share = ((subnet.taostats_emission_share || 0) * 100).toFixed(2);
        const daily = (subnet.estimated_emission_daily || 0).toFixed(2);

        // Calculate rank change
        let changeHtml = '';
        const prevRank = prevRankMap[netuid];

        if (prevRank === undefined && Object.keys(prevRankMap).length > 0) {
          changeHtml = ' <span class="rank-new">NEW</span>';
        } else if (prevRank > rank) {
          const diff = prevRank - rank;
          changeHtml = ` <span class="rank-up">▲${diff}</span>`;
        } else if (prevRank < rank) {
          const diff = rank - prevRank;
          changeHtml = ` <span class="rank-down">▼${diff}</span>`;
        }

        return `<tr>
          <td class="rank-col">${rank}${changeHtml}</td>
          <td class="subnet-col"><span class="sn-id">SN${netuid}</span> ${name}</td>
          <td class="share-col">${share}%</td>
          <td class="daily-col">${daily}τ</td>
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
      // Fetch current data and history in parallel
      const [currentRes, historyRes] = await Promise.all([
        fetch('/api/top_validators'),
        fetch('/api/top_validators_history?limit=2')
      ]);

      if (!currentRes.ok) throw new Error('Failed to fetch top validators');
      const data = await currentRes.json();

      const topValidators = data.top_validators || [];
      if (topValidators.length === 0) {
        displayList.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No validator data available</td></tr>';
        return;
      }

      // Build previous ranking map from history
      let prevRankMap = {}; // hotkey/id -> previous rank (1-based)
      try {
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          const history = historyData.history || [];
          // Get the second-to-last snapshot (previous state)
          if (history.length >= 2) {
            const prevSnapshot = history[history.length - 2];
            const prevValidators = prevSnapshot.top_validators || [];
            prevValidators.forEach((v, idx) => {
              // Use 'id' (hotkey) from history snapshot
              const key = v.id || v.hotkey;
              if (key) prevRankMap[key] = idx + 1;
            });
          }
        }
      } catch (e) {
        console.warn('Could not load validator history for ranking:', e);
      }

      // Display TOP 10 with ranking changes
      const rows = topValidators.slice(0, 10).map((v, idx) => {
        const rank = idx + 1;
        const hotkey = v.hotkey;
        const name = v.name || `Validator ${rank}`;
        const stake = v.stake_formatted || '—';
        const dominance = v.dominance != null ? `${v.dominance}%` : '—';
        const nominators = v.nominators != null ? v.nominators.toLocaleString() : '—';

        // Calculate rank change
        let changeHtml = '';
        const prevRank = prevRankMap[hotkey];

        if (prevRank === undefined && Object.keys(prevRankMap).length > 0) {
          changeHtml = ' <span class="rank-new">NEW</span>';
        } else if (prevRank > rank) {
          const diff = prevRank - rank;
          changeHtml = ` <span class="rank-up">▲${diff}</span>`;
        } else if (prevRank < rank) {
          const diff = rank - prevRank;
          changeHtml = ` <span class="rank-down">▼${diff}</span>`;
        }

        return `<tr>
          <td class="rank-col">${rank}${changeHtml}</td>
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
      // Fetch current data and history in parallel
      const [currentRes, historyRes] = await Promise.all([
        fetch('/api/top_wallets'),
        fetch('/api/top_wallets_history?limit=2')
      ]);

      if (!currentRes.ok) throw new Error('Failed to fetch top wallets');
      const data = await currentRes.json();

      const wallets = data.wallets || [];
      if (wallets.length === 0) {
        displayList.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No wallet data available</td></tr>';
        return;
      }

      // Build previous ranking map from history
      let prevRankMap = {}; // address/id -> previous rank (1-based)
      try {
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          const history = historyData.history || [];
          // Get the second-to-last snapshot (previous state)
          if (history.length >= 2) {
            const prevSnapshot = history[history.length - 2];
            // History stores in 'entries' or 'top_wallets' array
            const prevWallets = prevSnapshot.entries || prevSnapshot.top_wallets || [];
            prevWallets.forEach((w, idx) => {
              // Use 'id' (address) from history snapshot
              const key = w.id || w.address;
              if (key) prevRankMap[key] = idx + 1;
            });
          }
        }
      } catch (e) {
        console.warn('Could not load wallet history for ranking:', e);
      }

      // Display TOP 10 with ranking changes
      const rows = wallets.slice(0, 10).map((w, idx) => {
        const rank = idx + 1;
        const address = w.address;
        const identity = w.identity || null;
        const addressShort = w.address_short || 'Unknown';
        const balance = w.balance_total != null ? `${w.balance_total.toLocaleString(undefined, {maximumFractionDigits: 0})} τ` : '—';
        const dominance = w.dominance != null ? `${w.dominance.toFixed(2)}%` : '—';
        const stakedPercent = w.staked_percent != null ? `${w.staked_percent.toFixed(1)}%` : '—';

        // Calculate rank change
        let changeHtml = '';
        const prevRank = prevRankMap[address];

        if (prevRank === undefined && Object.keys(prevRankMap).length > 0) {
          changeHtml = ' <span class="rank-new">NEW</span>';
        } else if (prevRank > rank) {
          const diff = prevRank - rank;
          changeHtml = ` <span class="rank-up">▲${diff}</span>`;
        } else if (prevRank < rank) {
          const diff = rank - prevRank;
          changeHtml = ` <span class="rank-down">▼${diff}</span>`;
        }

        // Show identity if available, otherwise just address
        const walletDisplay = identity
          ? `<span class="wallet-identity">${identity}</span><span class="wallet-address">${addressShort}</span>`
          : `<span class="wallet-address wallet-address-only">${addressShort}</span>`;

        return `<tr>
          <td class="rank-col">${rank}${changeHtml}</td>
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

// ===== Holiday Snowfall (simple, toggleable) =====
(function() {
  function isHolidayEnabled() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('holiday') === '1') return true;
      if (params.get('holiday') === '0') return false;
    } catch (e) { /* ignore */ }
    if (document.body.classList.contains('holiday')) return true;
    // Auto-enable during winter season by default: Dec 1 → Feb 28/29
    const now = new Date();
    const m = now.getMonth() + 1; // 1-12
    // December, January, or February
    if (m === 12 || m === 1 || m === 2) return true;
    return false;
  }

  function enableSnowfall() {
    const container = document.getElementById('snowfall');
    if (!container) return;
    // Keep it small and performant (reduced counts for lower CPU/GPU)
    // Reduce total snowfall count by 50% across all sizes to reduce visual/CPU load
    const baseFlakes = window.innerWidth < 420 ? 12 : 18;
    const flakes = Math.max(1, Math.floor(baseFlakes * 0.5));
    container.innerHTML = '';
    for (let i = 0; i < flakes; i++) {
      const s = document.createElement('span');
      s.className = 'snowflake';
      const left = Math.random() * 100;
      const size = Math.floor(6 + Math.random() * 10); // px (smaller)
      const dur = (8 + Math.random() * 12).toFixed(2); // seconds (slower fall)
      const delay = (Math.random() * -12).toFixed(2);
      s.style.left = `${left}%`;
      s.style.fontSize = `${size}px`;
      s.style.opacity = (0.35 + Math.random() * 0.55).toString();
      s.style.animationDuration = `${dur}s, ${10 + Math.random() * 8}s`;
      s.style.animationDelay = `${delay}s, ${delay}s`;
      // Slight horizontal drift via small translateX applied through CSS left variation
      container.appendChild(s);
    }
    // Add a couple of larger, slower flakes for visual interest
    const baseLarge = window.innerWidth < 420 ? 1 : 3;
    // We reduce the larger flakes as well by 50% (rounded down); small screens may have 0 large flakes
    const largeCount = Math.max(0, Math.floor(baseLarge * 0.5));
    for (let i = 0; i < largeCount; i++) {
      const L = document.createElement('span');
      L.className = 'snowflake large';
      const leftL = Math.random() * 100;
      const sizeL = Math.floor(22 + Math.random() * 24); // px - big flakes
      const durL = (14 + Math.random() * 12).toFixed(2); // seconds, slow fall
      const delayL = (Math.random() * -20).toFixed(2);
      L.style.left = `${leftL}%`;
      L.style.fontSize = `${sizeL}px`;
      L.style.opacity = (0.7 + Math.random() * 0.3).toString();
      L.style.animationDuration = `${durL}s, ${14 + Math.random() * 10}s`;
      L.style.animationDelay = `${delayL}s, ${delayL}s`;
      container.appendChild(L);
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    try {
      if (isHolidayEnabled()) {
        enableSnowfall();
      } else {
        // Ensure container is empty/hidden if not enabled
        const c = document.getElementById('snowfall'); if (c) c.innerHTML = '';
      }
    } catch (e) {
      if (window._debug) console.warn('Snowfall init failed', e);
    }
  });
})();

// ===== NYE Sparkles =====
(function() {
  function isNyeEnabled() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('nye') === '1') return true;
      if (params.get('nye') === '0') return false;
    } catch (e) { /* ignore */ }
    if (document.body.classList.contains('nye')) return true;
    // Auto-enable on Dec 31 and Jan 1
    const now = new Date();
    const m = now.getMonth() + 1; // 1-12
    const d = now.getDate();
    // Enable on Dec 31 and Jan 1
    if ((m === 12 && d === 31) || (m === 1 && d === 1)) return true;
    return false;
  }

  function spawnSparkle(container) {
    if (!container) return;
    // Limit active sparkles for performance (reduced)
    if (container.childElementCount > 20) return;
    const s = document.createElement('span');
    s.className = 'sparkle';
    // Position somewhere across the width, within the top container height
    const left = Math.random() * 100;
    const top = Math.random() * 28; // percent of viewport height (within container)
    const scale = 0.6 + Math.random() * 1.0;
    const dur = 900 + Math.random() * 900; // ms (slightly slower)
    s.style.left = `${left}%`;
    s.style.top = `${top}%`;
    s.style.width = `${Math.round(6 + Math.random() * 8)}px`;
    s.style.height = s.style.width;
    s.style.animationDuration = `${Math.round(dur)}ms`;
    // Slight hue variation
    if (Math.random() > 0.6) s.style.background = 'radial-gradient(circle at 30% 30%, #fff, #ffcf33 60%)';
    container.appendChild(s);
    s.addEventListener('animationend', () => { try { s.remove(); } catch (e) {} });
  }

  function enableNye() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const container = document.getElementById('nye-sparkles');
    if (!container) return;
    // initial burst (smaller)
    const initial = window.innerWidth < 420 ? 4 : 8;
    for (let i = 0; i < initial; i++) spawnSparkle(container);
    // periodic bursts
    const interval = setInterval(() => {
      // spawn 1-2 sparkles each tick (reduced)
      const count = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) spawnSparkle(container);
      // Occasionally spawn confetti and rockets for a richer NYE effect
      const confettiChance = 0.12; // ~12% per tick (reduced)
      const rocketChance = 0.05; // ~5% per tick (reduced)
      if (Math.random() < confettiChance) spawnConfettiBurst();
      if (Math.random() < rocketChance) launchRocket();
    }, 1000 + Math.random() * 800);
    // keep reference so we can clear later if needed
    window._nyeSparklesInterval = interval;
  }

  // Confetti burst: spawn several confetti pieces across the viewport (reduced)
  function spawnConfettiBurst() {
    const container = document.getElementById('confetti');
    if (!container) return;
    // limit total active pieces (reduced)
    if (container.childElementCount > 60) return;
    const pieces = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < pieces; i++) {
      const p = document.createElement('span');
      p.className = 'confetti-piece';
      // random color
      const colors = ['#ff3884','#ffd166','#7ee787','#7cc8ff','#ffb47b','#c77cff'];
      p.style.background = colors[Math.floor(Math.random()*colors.length)];
      const left = Math.random() * 100;
      const startX = left;
      const delay = Math.random() * 300; // ms
      const dur = 2200 + Math.random() * 1000; // ms (slightly slower)
      const sizeW = 4 + Math.random()*6;
      const sizeH = 6 + Math.random()*8;
      p.style.left = `${startX}%`;
      p.style.top = `${-6 - Math.random()*8}vh`;
      p.style.width = `${sizeW}px`;
      p.style.height = `${sizeH}px`;
      p.style.animationDuration = `${dur}ms`;
      p.style.animationDelay = `${delay}ms`;
      container.appendChild(p);
      // cleanup after animation end (duration + delay)
      setTimeout(() => { try { p.remove(); } catch (e) {} }, dur + delay + 100);
    }
  }

  // Rocket launch: create a small rocket emoji that flies upward
  function launchRocket() {
    const container = document.getElementById('rockets');
    if (!container) return;
    // limit concurrent rockets (fewer concurrent rockets)
    if (container.childElementCount > 3) return;
    const r = document.createElement('span');
    r.className = 'rocket';
    r.textContent = '🚀';
    // random horizontal start (avoid edges)
    const left = 8 + Math.random() * 84;
    const bottom = 4 + Math.random() * 10; // px from bottom
    r.style.left = `${left}%`;
    r.style.bottom = `${bottom}px`;
    // randomize animation duration slightly
    const dur = 1400 + Math.random() * 800;
    r.style.animationDuration = `${dur}ms`;
    container.appendChild(r);
    // cleanup after animation
    setTimeout(() => { try { r.remove(); } catch (e) {} }, dur + 120);
  }

  document.addEventListener('DOMContentLoaded', function() {
    try {
      if (isNyeEnabled()) enableNye(); else {
        const c = document.getElementById('nye-sparkles'); if (c) c.innerHTML = '';
      }
    } catch (e) { if (window._debug) console.warn('NYE init failed', e); }
  });
})();

// ===== Spring Elements (Birds & Bees) =====
(function() {
  function isSpringEnabled() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('spring') === '1') return true;
      if (params.get('spring') === '0') return false;
    } catch (e) { /* ignore */ }
    if (document.body.classList.contains('spring')) return true;
    // Auto-enable during spring season: March, April, May
    const now = new Date();
    const m = now.getMonth() + 1; // 1-12
    if (m === 3 || m === 4 || m === 5) return true;
    return false;
  }

  function enableSpring() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const container = document.getElementById('spring-elements');
    if (!container) return;

    // Spawn birds and bees flying across the screen
    function spawnSpringElement() {
      if (container.childElementCount > 12) return; // limit active elements

      const elem = document.createElement('span');
      const isBird = Math.random() > 0.5;
      elem.className = isBird ? 'spring-element bird' : 'spring-element bee';

      // Random vertical position (top 70% of viewport)
      const top = Math.random() * 70;
      elem.style.top = `${top}vh`;

      // Random size
      const size = isBird ? (16 + Math.random() * 12) : (14 + Math.random() * 8);
      elem.style.fontSize = `${size}px`;

      // Random flight duration and vertical movement
      const duration = (12 + Math.random() * 10).toFixed(2); // 12-22s
      const verticalMove = (Math.random() - 0.5) * 20; // -10vh to +10vh
      elem.style.setProperty('--fly-y', `${verticalMove}vh`);
      elem.style.animationDuration = `${duration}s`;

      // Random delay for natural feel
      const delay = (Math.random() * -8).toFixed(2);
      elem.style.animationDelay = `${delay}s`;

      container.appendChild(elem);

      // Cleanup after animation
      const totalTime = (parseFloat(duration) + Math.abs(parseFloat(delay))) * 1000;
      setTimeout(() => { try { elem.remove(); } catch (e) {} }, totalTime + 500);
    }

    // Initial burst
    const initial = window.innerWidth < 420 ? 3 : 5;
    for (let i = 0; i < initial; i++) {
      setTimeout(() => spawnSpringElement(), i * 800);
    }

    // Periodic spawning
    const interval = setInterval(() => {
      if (Math.random() > 0.3) { // 70% chance to spawn
        spawnSpringElement();
      }
    }, 3000 + Math.random() * 2000); // every 3-5 seconds

    window._springInterval = interval;
  }

  document.addEventListener('DOMContentLoaded', function() {
    try {
      if (isSpringEnabled()) {
        enableSpring();
      } else {
        const c = document.getElementById('spring-elements');
        if (c) c.innerHTML = '';
      }
    } catch (e) {
      if (window._debug) console.warn('Spring init failed', e);
    }
  });
})();

// ===== Autumn Leaves =====
(function() {
  function isAutumnEnabled() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autumn') === '1') return true;
      if (params.get('autumn') === '0') return false;
    } catch (e) { /* ignore */ }
    if (document.body.classList.contains('autumn')) return true;
    // Auto-enable during autumn season: September, October, November
    const now = new Date();
    const m = now.getMonth() + 1; // 1-12
    if (m === 9 || m === 10 || m === 11) return true;
    return false;
  }

  function enableAutumn() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const container = document.getElementById('autumn-leaves');
    if (!container) return;

    // Spawn falling leaves
    const baseLeaves = window.innerWidth < 420 ? 10 : 15;
    const leafCount = Math.max(1, Math.floor(baseLeaves * 0.8)); // slightly fewer than snow

    container.innerHTML = '';

    for (let i = 0; i < leafCount; i++) {
      const leaf = document.createElement('span');

      // Random leaf type: maple (🍁), oak (🍂), or yellow (🍃)
      const types = ['maple', 'oak', 'yellow'];
      const weights = [0.4, 0.4, 0.2]; // 40% maple, 40% oak, 20% yellow
      const rand = Math.random();
      let type;
      if (rand < weights[0]) type = types[0];
      else if (rand < weights[0] + weights[1]) type = types[1];
      else type = types[2];

      leaf.className = `autumn-leaf ${type}`;

      // Random position and properties
      const left = Math.random() * 100;
      const size = Math.floor(12 + Math.random() * 14); // 12-26px
      const fallDuration = (10 + Math.random() * 12).toFixed(2); // 10-22s
      const swayDuration = (3 + Math.random() * 4).toFixed(2); // 3-7s
      const delay = (Math.random() * -15).toFixed(2);
      const swayDistance = (15 + Math.random() * 30).toFixed(0); // 15-45px

      leaf.style.left = `${left}%`;
      leaf.style.fontSize = `${size}px`;
      leaf.style.opacity = (0.75 + Math.random() * 0.25).toString();
      leaf.style.setProperty('--sway-distance', `${swayDistance}px`);
      leaf.style.animationDuration = `${fallDuration}s, ${swayDuration}s`;
      leaf.style.animationDelay = `${delay}s, ${delay}s`;

      container.appendChild(leaf);
    }

    // Add a few larger leaves for variety
    const baseLarge = window.innerWidth < 420 ? 2 : 4;
    const largeCount = Math.max(0, Math.floor(baseLarge * 0.8));

    for (let i = 0; i < largeCount; i++) {
      const leaf = document.createElement('span');
      const types = ['maple', 'oak'];
      const type = types[Math.floor(Math.random() * types.length)];

      leaf.className = `autumn-leaf ${type}`;

      const left = Math.random() * 100;
      const size = Math.floor(28 + Math.random() * 18); // 28-46px - larger
      const fallDuration = (16 + Math.random() * 10).toFixed(2); // slower fall
      const swayDuration = (4 + Math.random() * 5).toFixed(2);
      const delay = (Math.random() * -20).toFixed(2);
      const swayDistance = (25 + Math.random() * 40).toFixed(0);

      leaf.style.left = `${left}%`;
      leaf.style.fontSize = `${size}px`;
      leaf.style.opacity = (0.8 + Math.random() * 0.2).toString();
      leaf.style.setProperty('--sway-distance', `${swayDistance}px`);
      leaf.style.animationDuration = `${fallDuration}s, ${swayDuration}s`;
      leaf.style.animationDelay = `${delay}s, ${delay}s`;

      container.appendChild(leaf);
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    try {
      if (isAutumnEnabled()) {
        enableAutumn();
      } else {
        const c = document.getElementById('autumn-leaves');
        if (c) c.innerHTML = '';
      }
    } catch (e) {
      if (window._debug) console.warn('Autumn init failed', e);
    }
  });
})();

// ===== "Wake up, Neo" Easter Egg =====
(function() {
  let neoSnippetShown = false;
  let neoSnippet = null;

  function showNeoSnippet() {
    if (neoSnippetShown) return;
    neoSnippetShown = true;

    // Create floating snippet in Matrix style
    neoSnippet = document.createElement('div');
    neoSnippet.style.cssText = `
      position: fixed;
      top: ${20 + Math.random() * 30}%;
      right: ${10 + Math.random() * 20}px;
      background: rgba(0, 0, 0, 0.95);
      color: #0f0;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      padding: 12px 18px;
      border: 1px solid #0f0;
      border-radius: 4px;
      box-shadow: 0 0 20px rgba(0, 255, 0, 0.5), inset 0 0 10px rgba(0, 255, 0, 0.1);
      z-index: 99999;
      cursor: pointer;
      animation: neoGlow 2s ease-in-out infinite, neoFloat 3s ease-in-out infinite;
      backdrop-filter: blur(4px);
      user-select: none;
      opacity: 0;
      transition: opacity 0.5s ease-in;
    `;
    neoSnippet.textContent = 'Wake up, Neo...';

    // Add animations
    if (!document.getElementById('neoEasterEggStyles')) {
      const style = document.createElement('style');
      style.id = 'neoEasterEggStyles';
      style.textContent = `
        @keyframes neoGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(0, 255, 0, 0.5), inset 0 0 10px rgba(0, 255, 0, 0.1); }
          50% { box-shadow: 0 0 30px rgba(0, 255, 0, 0.8), inset 0 0 15px rgba(0, 255, 0, 0.2); }
        }
        @keyframes neoFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes matrixRain {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        @keyframes morpheusFadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes morpheusFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes typewriter {
          from { width: 0; }
          to { width: 100%; }
        }
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        /* Mobile-optimized scrolling for iOS */
        @supports (-webkit-overflow-scrolling: touch) {
          .neo-message-box {
            -webkit-overflow-scrolling: touch;
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(neoSnippet);

    // Play glitch sound when snippet appears
    MatrixSound.play('glitch');

    // Fade in
    setTimeout(() => { neoSnippet.style.opacity = '1'; }, 100);

    // Click handler - show Morpheus message
    neoSnippet.addEventListener('click', showMorpheusMessage);

    // Auto-hide after 30 seconds if not clicked
    setTimeout(() => {
      if (neoSnippet && neoSnippet.parentNode) {
        neoSnippet.style.opacity = '0';
        setTimeout(() => {
          if (neoSnippet && neoSnippet.parentNode) {
            neoSnippet.remove();
          }
        }, 500);
      }
    }, 30000);
  }

  function showMorpheusMessage() {
    // Remove snippet
    if (neoSnippet) {
      neoSnippet.style.opacity = '0';
      setTimeout(() => neoSnippet.remove(), 300);
    }

    // Create full-screen overlay with Matrix effect
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: #000;
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: morpheusFadeIn 0.5s ease-out;
    `;

    // Matrix rain background
    const matrixCanvas = document.createElement('canvas');
    matrixCanvas.width = window.innerWidth;
    matrixCanvas.height = window.innerHeight;
    matrixCanvas.style.cssText = 'position: absolute; top: 0; left: 0; opacity: 0.15;';
    overlay.appendChild(matrixCanvas);

    const ctx = matrixCanvas.getContext('2d');
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    const fontSize = 16;
    const columns = Math.floor(matrixCanvas.width / fontSize);
    const drops = Array(columns).fill(1);

    function drawMatrix() {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
      ctx.fillStyle = '#0f0';
      ctx.font = fontSize + 'px monospace';

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > matrixCanvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }

    const matrixInterval = setInterval(drawMatrix, 50);

    // Message container
    const messageBox = document.createElement('div');
    messageBox.style.cssText = `
      position: relative;
      z-index: 10;
      max-width: 700px;
      width: 90%;
      max-height: 85vh;
      overflow-y: auto;
      padding: 30px;
      margin: 20px;
      background: rgba(0, 20, 0, 0.95);
      border: 2px solid #0f0;
      border-radius: 8px;
      box-shadow: 0 0 40px rgba(0, 255, 0, 0.6), inset 0 0 20px rgba(0, 255, 0, 0.1);
      font-family: 'Courier New', monospace;
      color: #0f0;
    `;

    // Add mobile-optimized scrollbar styling
    messageBox.className = 'neo-message-box';
    messageBox.style.scrollbarWidth = 'thin';
    messageBox.style.scrollbarColor = '#0f0 rgba(0, 20, 0, 0.5)';

    // Messages from The Matrix - randomly selected
    const allMessages = [
      // Morpheus #1 - Original
      [
        'I imagine that right now, you\'re feeling a bit like Alice.',
        'Tumbling down the rabbit hole?',
        '',
        'I can see it in your eyes.',
        'You have the look of someone who accepts what they see,',
        'because they are expecting to wake up.',
        '',
        'Ironically, this is not far from the truth.',
        '',
        'The Matrix is everywhere.',
        'It is all around us.',
        'Even now, in this very dashboard.',
        '',
        'You can see it when you look at your validators,',
        'or when you check the TAO price.',
        '',
        'It is the world that has been pulled over your eyes',
        'to blind you from the truth.',
        '',
        '— Morpheus'
      ],
      // Morpheus #2
      [
        'What is real?',
        'How do you define "real"?',
        '',
        'If you\'re talking about what you can feel,',
        'what you can smell, what you can taste and see,',
        'then "real" is simply electrical signals',
        'interpreted by your brain.',
        '',
        'This is the construct.',
        'It\'s our loading program.',
        '',
        'We can load anything, from clothing,',
        'to equipment, weapons, training simulations,',
        'anything we need.',
        '',
        '— Morpheus'
      ],
      // Morpheus #3
      [
        'I\'m trying to free your mind, Neo.',
        'But I can only show you the door.',
        'You\'re the one that has to walk through it.',
        '',
        'You have to let it all go, Neo.',
        'Fear, doubt, and disbelief.',
        '',
        'Free your mind.',
        '',
        'Sooner or later you\'re going to realize,',
        'just as I did,',
        'that there\'s a difference between knowing the path',
        'and walking the path.',
        '',
        '— Morpheus'
      ],
      // Trinity #1
      [
        'The answer is out there, Neo.',
        'It\'s looking for you.',
        '',
        'And it will find you,',
        'if you want it to.',
        '',
        'I know why you\'re here.',
        'I know what you\'ve been doing.',
        '',
        'I know why you hardly sleep,',
        'why you live alone,',
        'and why, night after night,',
        'you sit at your computer.',
        '',
        'You\'re looking for him.',
        'I know, because I was once looking for the same thing.',
        '',
        '— Trinity'
      ],
      // The Oracle
      [
        'I\'d ask you to sit down, but you\'re not going to anyway.',
        'And don\'t worry about the vase.',
        '',
        'What vase?',
        '',
        'That vase.',
        '',
        'I\'m sorry.',
        '',
        'I said don\'t worry about it.',
        'I\'ll get one of my kids to fix it.',
        '',
        'How did you know?',
        '',
        'What\'s really going to bake your noodle later on is,',
        'would you still have broken it if I hadn\'t said anything?',
        '',
        '— The Oracle'
      ]
    ];

    // Randomly select a message
    const messages = allMessages[Math.floor(Math.random() * allMessages.length)];

    const textContainer = document.createElement('div');
    const isMobile = window.innerWidth <= 768;
    textContainer.style.cssText = `
      font-size: ${isMobile ? '15px' : '18px'};
      line-height: ${isMobile ? '1.6' : '1.8'};
      white-space: pre-wrap;
      min-height: ${isMobile ? '200px' : '400px'};
    `;

    messageBox.appendChild(textContainer);
    overlay.appendChild(messageBox);

    // Typewriter effect
    let lineIndex = 0;
    let charIndex = 0;
    let isTyping = true;
    let typeTimeout = null;

    function typeMessage() {
      if (!isTyping) return; // Stop if overlay closed

      if (lineIndex < messages.length) {
        const currentLine = messages[lineIndex];

        if (charIndex < currentLine.length) {
          textContainer.textContent += currentLine[charIndex];
          charIndex++;

          // Play typing sound for each character (except spaces)
          if (currentLine[charIndex - 1] !== ' ') {
            MatrixSound.play('boot-typing');
          }

          // Faster typing for short pauses
          const delay = currentLine === '' ? 50 : (40 + Math.random() * 40);
          typeTimeout = setTimeout(typeMessage, delay);
        } else {
          textContainer.textContent += '\n';
          lineIndex++;
          charIndex = 0;

          // Pause between lines
          const pause = messages[lineIndex] === '' ? 400 : 600;
          typeTimeout = setTimeout(typeMessage, pause);
        }
      } else {
        // Show close hint
        typeTimeout = setTimeout(() => {
          if (!isTyping) return;
          const closeHint = document.createElement('div');
          closeHint.textContent = '[ Press ESC or click to close ]';
          closeHint.style.cssText = `
            margin-top: 30px;
            text-align: center;
            font-size: 14px;
            opacity: 0.6;
            animation: blink 1.5s infinite;
          `;
          messageBox.appendChild(closeHint);
        }, 800);
      }
    }

    document.body.appendChild(overlay);

    // Start typing after short delay
    typeTimeout = setTimeout(typeMessage, 600);

    // Close handlers
    function closeOverlay() {
      isTyping = false;
      if (typeTimeout) clearTimeout(typeTimeout);
      clearInterval(matrixInterval);
      overlay.style.animation = 'morpheusFadeOut 0.5s ease-in';
      setTimeout(() => overlay.remove(), 500);
      document.removeEventListener('keydown', keyHandler);
    }

    function keyHandler(e) {
      if (e.key === 'Escape') closeOverlay();
    }

    document.addEventListener('keydown', keyHandler);
    overlay.addEventListener('click', closeOverlay);
  }

  // Trigger snippet randomly between 15-45 seconds after page load
  document.addEventListener('DOMContentLoaded', function() {
    const delay = 15000 + Math.random() * 30000; // 15-45 seconds
    setTimeout(showNeoSnippet, delay);
  });
})();

// ===== Force Fear & Greed Badge Position on Desktop =====
(function() {
  function repositionFngBadge() {
    const badge = document.querySelector('.fng-side-status');
    if (!badge) return;

    if (window.innerWidth >= 800) {
      badge.style.left = '50%';
      badge.style.top = 'auto';
      badge.style.bottom = '20px';
      badge.style.transform = 'translateX(-50%)';
    } else {
      badge.style.left = '';
      badge.style.top = '';
      badge.style.bottom = '';
      badge.style.transform = '';
    }
  }

  document.addEventListener('DOMContentLoaded', repositionFngBadge);
  window.addEventListener('resize', repositionFngBadge);
})();