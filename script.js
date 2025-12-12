// ===== ES6 Module Imports =====
import * as MatrixSound from './js/modules/matrixSound.js';
import './js/modules/terminalBoot.js'; // Side-effect: runs boot animation
import {
  API_BASE,
  BINANCE_API,
  COINGECKO_API,
  REFRESH_INTERVAL,
  PRICE_CACHE_TTL,
  PRICE_CACHE_TTL_MAX
} from './js/modules/config.js';
import {
  animateValue,
  formatNumber,
  formatFull,
  formatExact,
  formatCompact,
  formatPrice,
  roundUpTo2,
  formatPercent,
  readPercentValue,
  normalizeRange,
  getCachedPrice,
  setCachedPrice
} from './js/modules/utils.js';
import {
  fetchNetworkData,
  fetchTaostats,
  fetchBlockTime,
  fetchStakingApr,
  fetchAthAtl,
  fetchTaostatsAggregates,
  fetchFearAndGreed
} from './js/modules/api.js';
import {
  updateAthAtlPills,
  updateBlockTime,
  updateStakingApr
} from './js/modules/uiUpdates.js';
import {
  updateMarketConditionsCard,
  updateTokenEconomicsCard
} from './market-conditions.js';
import {
  initAllSeasonalEffects
} from './js/modules/seasonalEffects.js';
import {
  showSystemFailureEasterEgg,
  triggerNeoEasterEgg
} from './js/modules/easterEggs.js';
import {
  updateFearAndGreed
} from './js/modules/fearAndGreed.js';

// ===== State Management =====
let priceChart = null;
let lastPrice = null;
let currentPriceRange = localStorage.getItem('priceRange') || '3';
let isLoadingPrice = false;
let showBtcComparison = localStorage.getItem('showBtcComparison') === 'true';
let showEthComparison = localStorage.getItem('showEthComparison') === 'true';
let showSolComparison = localStorage.getItem('showSolComparison') === 'true';
let showEurPrices = localStorage.getItem('showEurPrices') === 'true';
let showCandleChart = localStorage.getItem('showCandleChart') === 'true';
let showVolume = localStorage.getItem('showVolume') === 'true';
let eurUsdRate = null; // Cached EUR/USD exchange rate
let isChartRefreshing = false; // Lock to prevent concurrent chart refreshes

// Shared function to refresh the price chart with proper locking
async function refreshPriceChart() {
  // Prevent concurrent refreshes
  if (isChartRefreshing) {
    if (window._debug) console.debug('Chart refresh already in progress, skipping');
    return;
  }
  isChartRefreshing = true;

  const priceCard = document.querySelector('#priceChart')?.closest('.dashboard-card');
  if (priceCard) priceCard.classList.add('loading');

  try {
    const priceHistory = await fetchPriceHistory(currentPriceRange);
    const [btcHistory, ethHistory, solHistory] = await Promise.all([
      showBtcComparison ? fetchBtcPriceHistory(currentPriceRange) : null,
      showEthComparison ? fetchEthPriceHistory(currentPriceRange) : null,
      showSolComparison ? fetchSolPriceHistory(currentPriceRange) : null
    ]);
    if (priceHistory) {
      createPriceChart(priceHistory, currentPriceRange, { btcHistory, ethHistory, solHistory });
    }
  } catch (e) {
    console.error('Error refreshing price chart:', e);
  } finally {
    if (priceCard) priceCard.classList.remove('loading');
    isChartRefreshing = false;
  }
}

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
        let phaseText = `📈 Market: Bullish (+${ma7dTrend.toFixed(1)}% Vol. MA 3d/7d)`;

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
        let phaseText = `📉 Market: Bearish (-${Math.abs(ma7dTrend).toFixed(1)}% Vol. MA 3d/7d)`;

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
        let phaseText = `➡️ Market: Neutral (${sign}${absValue}% Vol. MA 3d/7d)`;

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
        let phaseText = `📈 Market: Bullish (+${ma7dTrend.toFixed(1)}% Vol. MA 3d/7d)`;
        if (fngSentiment === 'extreme_greed') {
          phaseText += `\n⚠️ Sentiment: Extreme Greed (${fngValue})\n🌡️ overheating?\n📊 max optimism`;
        } else if (fngSentiment === 'greed') {
          phaseText += `\n🔥 Sentiment: Greed (${fngValue})\n✨ euphoria?\n📊 high optimism`;
        } else if (fngSentiment === 'extreme_fear' || fngSentiment === 'fear') {
          phaseText += `\n✅ Sentiment: ${fngClass} (${fngValue})\n🤔 divergence?\n📊 fear in uptrend`;
        }
        marketPhaseNote = `\n${phaseText}`;
      } else if (ma7dTrend < -5) {
        let phaseText = `📉 Market: Bearish (-${Math.abs(ma7dTrend).toFixed(1)}% Vol. MA 3d/7d)`;
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
        let phaseText = `➡️ Market: Neutral (${sign}${absValue}% Vol. MA 3d/7d)`;
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

// (fetchAthAtl, fetchTaostatsAggregates moved to api.js)

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

// animatePriceChange stays in script.js (uses lastPrice state)
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

// ===== API Fetchers =====
// (fetchNetworkData, fetchTaostats, fetchBlockTime, fetchStakingApr moved to api.js)

async function fetchTaoPrice() {
  // Try Binance first (real-time, <1s delay)
  try {
    const binanceRes = await fetch(`${BINANCE_API}/ticker/24hr?symbol=TAOUSDT`, { cache: 'no-store' });
    if (binanceRes.ok) {
      const ticker = await binanceRes.json();
      if (ticker?.lastPrice) {
        if (window._debug) console.debug('TAO price from Binance:', ticker.lastPrice);
        return {
          price: parseFloat(ticker.lastPrice),
          change24h: parseFloat(ticker.priceChangePercent),
          volume_24h: parseFloat(ticker.quoteVolume), // USDT volume
          last_updated: new Date().toISOString(),
          _source: 'binance'
        };
      }
    }
  } catch (e) {
    if (window._debug) console.debug('Binance ticker failed, trying Taostats:', e);
  }

  // Fallback to Taostats
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

  // Last fallback: CoinGecko
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

  // If candle/volume mode is active, we need Binance data (OHLCV)
  // Use different cache key to avoid conflicts
  const needsOHLCV = showCandleChart || showVolume;
  const cacheKey = needsOHLCV ? `${key}_ohlcv` : key;

  const cached = getCachedPrice?.(cacheKey);
  if (cached) return cached;

  const isMax = key === 'max';
  const days = isMax ? 1000 : parseInt(key, 10);

  // Try Taostats first (preferred source, skip for max)
  // Skip Taostats if we need OHLCV data (candle/volume mode)
  if (!isMax && !needsOHLCV) {
    try {
      const taostatsEndpoint = `${API_BASE}/price_history?range=${key}`;
      const res = await fetch(taostatsEndpoint, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data?.prices?.length) {
          if (window._debug) console.debug(`Price history from Taostats (${key}d):`, data.prices.length, 'points');
          const result = { prices: data.prices, ohlcv: null, volume: null, source: 'taostats' };
          setCachedPrice?.(cacheKey, result);
          return result;
        }
      }
    } catch (e) {
      if (window._debug) console.debug('Taostats price history failed, trying Binance:', e);
    }
  }

  // Try Binance (free, 600+ days history since TAO listing April 2024)
  if (days && days > 0) {
    try {
      // Binance intervals: 1h for short ranges, 1d for longer (max 1000 candles)
      const interval = (!isMax && days <= 7) ? '1h' : '1d';
      const limit = (!isMax && days <= 7) ? days * 24 : Math.min(days, 1000);
      const endpoint = `${BINANCE_API}/klines?symbol=TAOUSDT&interval=${interval}&limit=${limit}`;
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (res.ok) {
        const klines = await res.json();
        if (klines?.length) {
          // Kline format: [open_time, open, high, low, close, volume, ...]
          // Return both formats: prices array for line chart, ohlcv for candle chart
          const prices = klines.map(k => [k[0], parseFloat(k[4])]); // [timestamp_ms, close_price]
          const ohlcv = klines.map(k => ({
            x: k[0],
            o: parseFloat(k[1]),
            h: parseFloat(k[2]),
            l: parseFloat(k[3]),
            c: parseFloat(k[4])
          }));
          const volume = klines.map(k => ({
            x: k[0],
            y: parseFloat(k[5])
          }));
          if (window._debug) console.debug(`Price history from Binance (${key}):`, prices.length, 'points');
          const result = { prices, ohlcv, volume, source: 'binance' };
          setCachedPrice?.(cacheKey, result);
          return result;
        }
      }
    } catch (e) {
      if (window._debug) console.debug('Binance price history failed, trying CoinGecko:', e);
    }
  }

  // Fallback to CoinGecko (limited to 365 days on free tier)
  if (days && days > 0) {
    const cgDays = Math.min(days, 365); // CoinGecko free tier limit
    const interval = cgDays <= 7 ? '' : '&interval=daily';
    const endpoint = `${COINGECKO_API}/coins/bittensor/market_chart?vs_currency=usd&days=${cgDays}${interval}`;
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.prices?.length) return null;
      if (window._debug) console.debug(`Price history from CoinGecko (${key}):`, data.prices.length, 'points');
      const result = { prices: data.prices, ohlcv: null, volume: null, source: 'coingecko' };
      setCachedPrice?.(cacheKey, result);
      return result;
    } catch { return null; }
  }

  return null;
}

// BTC price history for TAO vs BTC comparison
async function fetchBtcPriceHistory(range = '7') {
  const key = normalizeRange(range);
  const isMax = key === 'max';
  const days = isMax ? 1000 : (parseInt(key, 10) || 7);
  const cacheKey = `btc_${key}`;
  const cached = getCachedPrice?.(cacheKey);
  if (cached) return cached;

  // Try Binance first (free, extensive history)
  try {
    const interval = (!isMax && days <= 7) ? '1h' : '1d';
    const limit = (!isMax && days <= 7) ? days * 24 : Math.min(days, 1000);
    const endpoint = `${BINANCE_API}/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`;
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (res.ok) {
      const klines = await res.json();
      if (klines?.length) {
        const prices = klines.map(k => [k[0], parseFloat(k[4])]);
        if (window._debug) console.debug(`BTC price history from Binance (${key}):`, prices.length, 'points');
        setCachedPrice?.(cacheKey, prices);
        return prices;
      }
    }
  } catch (e) {
    if (window._debug) console.debug('Binance BTC failed, trying CoinGecko:', e);
  }

  // Fallback to CoinGecko
  const cgDays = Math.min(days, 365);
  const cgInterval = cgDays <= 7 ? '' : '&interval=daily';
  const endpoint = `${COINGECKO_API}/coins/bitcoin/market_chart?vs_currency=usd&days=${cgDays}${cgInterval}`;
  try {
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.prices?.length) return null;
    if (window._debug) console.debug(`BTC price history from CoinGecko (${key}):`, data.prices.length, 'points');
    setCachedPrice?.(cacheKey, data.prices);
    return data.prices;
  } catch (e) {
    if (window._debug) console.debug('BTC price history fetch failed:', e);
    return null;
  }
}

// ETH price history for TAO vs ETH comparison
async function fetchEthPriceHistory(range = '7') {
  const key = normalizeRange(range);
  const isMax = key === 'max';
  const days = isMax ? 1000 : (parseInt(key, 10) || 7);
  const cacheKey = `eth_${key}`;
  const cached = getCachedPrice?.(cacheKey);
  if (cached) return cached;

  // Binance (free, extensive history)
  try {
    const interval = (!isMax && days <= 7) ? '1h' : '1d';
    const limit = (!isMax && days <= 7) ? days * 24 : Math.min(days, 1000);
    const endpoint = `${BINANCE_API}/klines?symbol=ETHUSDT&interval=${interval}&limit=${limit}`;
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (res.ok) {
      const klines = await res.json();
      if (klines?.length) {
        const prices = klines.map(k => [k[0], parseFloat(k[4])]);
        if (window._debug) console.debug(`ETH price history from Binance (${key}):`, prices.length, 'points');
        setCachedPrice?.(cacheKey, prices);
        return prices;
      }
    }
  } catch (e) {
    if (window._debug) console.debug('ETH price history fetch failed:', e);
  }
  return null;
}

// SOL price history for TAO vs SOL comparison
async function fetchSolPriceHistory(range = '7') {
  const key = normalizeRange(range);
  const isMax = key === 'max';
  const days = isMax ? 1000 : (parseInt(key, 10) || 7);
  const cacheKey = `sol_${key}`;
  const cached = getCachedPrice?.(cacheKey);
  if (cached) return cached;

  // Binance (free, extensive history)
  try {
    const interval = (!isMax && days <= 7) ? '1h' : '1d';
    const limit = (!isMax && days <= 7) ? days * 24 : Math.min(days, 1000);
    const endpoint = `${BINANCE_API}/klines?symbol=SOLUSDT&interval=${interval}&limit=${limit}`;
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (res.ok) {
      const klines = await res.json();
      if (klines?.length) {
        const prices = klines.map(k => [k[0], parseFloat(k[4])]);
        if (window._debug) console.debug(`SOL price history from Binance (${key}):`, prices.length, 'points');
        setCachedPrice?.(cacheKey, prices);
        return prices;
      }
    }
  } catch (e) {
    if (window._debug) console.debug('SOL price history fetch failed:', e);
  }
  return null;
}

// Fetch EUR/USD exchange rate from Binance
async function fetchEurUsdRate() {
  if (eurUsdRate) return eurUsdRate;
  try {
    const res = await fetch(`${BINANCE_API}/ticker/price?symbol=EURUSDT`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      eurUsdRate = parseFloat(data.price);
      if (window._debug) console.debug('EUR/USD rate from Binance:', eurUsdRate);
      return eurUsdRate;
    }
  } catch (e) {
    if (window._debug) console.debug('EUR/USD rate fetch failed:', e);
  }
  // Fallback rate if API fails
  eurUsdRate = 0.92;
  return eurUsdRate;
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

  // Store for re-rendering when EUR toggle changes
  window._lastPriceData = priceData;

  if (!priceEl) return;
    if (priceData.price) {
      // Show EUR or USD based on toggle
      const displayPrice = showEurPrices && eurUsdRate
        ? priceData.price / eurUsdRate
        : priceData.price;
      const symbol = showEurPrices ? '€' : '$';
      priceEl.textContent = `${symbol}${displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
            const priceSource = window._priceSource || 'taostats';
            const lines = ['Price changes:'];
            parts.forEach(p => lines.push(p));
            lines.push(`Source: ${priceSource}`);
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

  // LAST UPDATE - set BEFORE updateNetworkStats/updateTaoPrice so tooltips have access
  const priceUpdateEl = document.getElementById('priceLastUpdate');
  let lastUpdated = null;
  if (taoPrice && taoPrice.last_updated) {
    lastUpdated = taoPrice.last_updated;
  } else if (taoPrice && taoPrice._timestamp) {
    lastUpdated = taoPrice._timestamp;
  }
  // Expose lastUpdated and price source globally for tooltips BEFORE other updates
  window._lastUpdated = lastUpdated;
  window._priceSource = taoPrice?._source || null;
  if (window._debug) console.log('DEBUG lastUpdated:', lastUpdated, 'taoPrice.last_updated:', taoPrice?.last_updated, 'source:', taoPrice?._source);

  // Fetch EUR rate if needed for pill display
  if (showEurPrices && !eurUsdRate) {
    await fetchEurUsdRate();
  }

  updateNetworkStats(networkData);
  updateTaoPrice(taoPrice);

  // Update UI display for last update time in Price Chart card (date + time)
  if (lastUpdated) {
    const d = new Date(lastUpdated);
    const dd = d.getDate().toString().padStart(2, '0');
    const mo = (d.getMonth() + 1).toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    if (priceUpdateEl) priceUpdateEl.textContent = `Updated: ${dd}.${mo}. ${hh}:${mm}`;
  } else {
    if (priceUpdateEl) priceUpdateEl.textContent = `Updated: —`;
  }

  // Get volume from taostats!
  const volumeEl = document.getElementById('volume24h');
  if (volumeEl && taostats && typeof taostats.volume_24h === 'number') {
  volumeEl.textContent = `$${formatCompact(taostats.volume_24h)}`;
  }

  // Update Volume Signal (Ampelsystem)
  // Prefer Binance (taoPrice) for real-time 24h change, fallback to Taostats
  const priceChange24h = taoPrice?.change24h ?? taostats?.percent_change_24h ?? null;
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
let refreshPaused = false;
let refreshClickTimestamps = [];
let autoRefreshCount = 0; // Track number of auto-refreshes for Easter egg timing

function renderRefreshIndicator() {
  const el = document.getElementById('refresh-indicator');
  if (!el) return;

  // If paused, show "System failure" state
  if (refreshPaused) {
    el.innerHTML = `
      <span class="failure-text">SYS_FAIL</span>
    `;
    el.title = 'System failure - Triple-click to resume';
    el.classList.add('system-failure');
    el.style.cursor = 'pointer';
    return;
  }

  el.classList.remove('system-failure');
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
  el.title = `Auto-refresh in ${refreshCountdown}s - Triple-click to pause`;
  el.style.cursor = 'pointer';
}

function handleRefreshClick() {
  const now = Date.now();
  refreshClickTimestamps.push(now);

  // Keep only clicks within last 600ms
  refreshClickTimestamps = refreshClickTimestamps.filter(t => now - t < 600);

  // Triple-click detection
  if (refreshClickTimestamps.length >= 3) {
    refreshClickTimestamps = [];
    toggleRefreshPause();
    return;
  }

  // Single click - reset countdown and refresh (if not paused)
  if (!refreshPaused) {
    refreshCountdown = REFRESH_SECONDS;
    refreshDashboard();
    renderRefreshIndicator();
  }
}

function toggleRefreshPause() {
  refreshPaused = !refreshPaused;

  if (refreshPaused) {
    // Stop the timer
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    // Play glitch effect for dramatic "crash"
    if (typeof window.showMatrixGlitch === 'function') {
      window.showMatrixGlitch({ duration: 800, intensity: 3 });
    }
    MatrixSound.play('glitch');
    renderRefreshIndicator();
    // Show Matrix-style "SYSTEM FAILURE" Easter Egg
    showSystemFailureEasterEgg({
      setRefreshPaused: (val) => { refreshPaused = val; },
      setRefreshCountdown: (val) => { refreshCountdown = val; },
      REFRESH_SECONDS,
      renderRefreshIndicator,
      startAutoRefresh,
      MatrixSound
    });
  } else {
    // Resume - restart the auto-refresh
    refreshCountdown = REFRESH_SECONDS;
    renderRefreshIndicator();
    startAutoRefresh();
    MatrixSound.play('refresh-beep');
  }
}


function startAutoRefresh() {
  if (refreshPaused) return;
  renderRefreshIndicator();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (refreshPaused) return;
    refreshCountdown--;
    if (refreshCountdown <= 0) {
      refreshCountdown = REFRESH_SECONDS;
      autoRefreshCount++;
      // Trigger Matrix glitch only every 3rd auto-refresh
      if (autoRefreshCount % 3 === 0) {
        try {
          if (typeof window.showMatrixGlitch === 'function') {
            window.showMatrixGlitch({ duration: 360, intensity: 1 });
          }
        } catch (e) {
          if (window._debug) console.warn('showMatrixGlitch failed', e);
        }
      }
      // Trigger "Wake up, Neo" Easter egg after 5th refresh (once)
      if (autoRefreshCount === 5) {
        triggerNeoEasterEgg(MatrixSound);
      }
      MatrixSound.play('refresh-beep');
      refreshDashboard();
    }
    renderRefreshIndicator();
  }, 1000);
  const el = document.getElementById('refresh-indicator');
  if (el) {
    el.onclick = handleRefreshClick;
  }
}

// Initialize refresh indicator click handler on DOM ready
(function initRefreshControls() {
  function setup() {
    const refreshIndicator = document.getElementById('refresh-indicator');
    if (refreshIndicator) {
      refreshIndicator.onclick = handleRefreshClick;
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

// ===== Initialization of Price Chart =====
function createPriceChart(priceHistoryData, range, comparisonData = {}) {
  const canvas = document.getElementById('priceChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Handle new object format { prices, ohlcv, volume } or legacy array format
  const priceHistory = Array.isArray(priceHistoryData) ? priceHistoryData : priceHistoryData?.prices;
  const ohlcvData = priceHistoryData?.ohlcv || null;
  const volumeData = priceHistoryData?.volume || null;
  const dataSource = priceHistoryData?.source || 'unknown';

  if (!priceHistory?.length) return;

  // Extract comparison histories
  const { btcHistory, ethHistory, solHistory } = comparisonData;
  const hasAnyComparison = (showBtcComparison && btcHistory?.length) ||
                           (showEthComparison && ethHistory?.length) ||
                           (showSolComparison && solHistory?.length);

  // Format labels based on timeframe
  const isMax = range === 'max';
  const rangeNum = isMax ? priceHistory.length : (parseInt(range, 10) || 7);
  const labels = priceHistory.map(([timestamp]) => {
    const date = new Date(timestamp);
    if (rangeNum <= 1) {
      // 1 day: show time only
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } else if (rangeNum <= 3) {
      // 2-3 days: show date + time
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
             date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } else if (rangeNum <= 30) {
      // Up to 30 days: M/D format
      return `${date.getMonth()+1}/${date.getDate()}`;
    } else if (rangeNum <= 180) {
      // 31-180 days: "Jan 15" format
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      // 180+ days (Max): "Apr '24" format
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const year = String(date.getFullYear()).slice(-2);
      return `${month} '${year}`;
    }
  });

  // Only destroy if chart object and method exist
  if (window.priceChart && typeof window.priceChart.destroy === 'function') {
    window.priceChart.destroy();
  }

  // Build datasets
  const datasets = [];

  // Helper: align comparison data to TAO timestamps
  function alignToTao(history) {
    if (!history?.length) return null;
    const map = new Map(history.map(([ts, price]) => [Math.floor(ts / 60000), price]));
    return priceHistory.map(([ts]) => {
      const key = Math.floor(ts / 60000);
      for (let i = 0; i <= 30; i++) {
        if (map.has(key - i)) return map.get(key - i);
        if (map.has(key + i)) return map.get(key + i);
      }
      return null;
    });
  }

  // Helper: normalize to % change from first valid value
  function normalizeToPercent(aligned) {
    if (!aligned) return null;
    const startIdx = aligned.findIndex(v => v !== null);
    const start = aligned[startIdx] || 1;
    return aligned.map(price => price !== null ? ((price - start) / start) * 100 : null);
  }

  // If any comparison enabled, normalize all to % change
  if (hasAnyComparison) {
    // Normalize TAO: % change from first value
    const taoStart = priceHistory[0]?.[1] || 1;
    const taoNormalized = priceHistory.map(([_, price]) => ((price - taoStart) / taoStart) * 100);

    datasets.push({
      label: 'TAO %',
      data: taoNormalized,
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34,197,94,0.1)',
      tension: 0.2,
      pointRadius: 0,
      fill: true,
      yAxisID: 'y'
    });

    // Add BTC comparison
    if (showBtcComparison && btcHistory?.length) {
      const btcNormalized = normalizeToPercent(alignToTao(btcHistory));
      datasets.push({
        label: 'BTC %',
        data: btcNormalized,
        borderColor: '#f7931a',
        backgroundColor: 'rgba(247,147,26,0.05)',
        tension: 0.2,
        pointRadius: 0,
        fill: false,
        borderDash: [5, 5],
        yAxisID: 'y'
      });
    }

    // Add ETH comparison (gray/silver, darker in light mode)
    if (showEthComparison && ethHistory?.length) {
      const ethNormalized = normalizeToPercent(alignToTao(ethHistory));
      const isLightMode = document.body.classList.contains('light-bg');
      const ethColor = isLightMode ? '#555' : '#b0b0b0';
      datasets.push({
        label: 'ETH %',
        data: ethNormalized,
        borderColor: ethColor,
        backgroundColor: isLightMode ? 'rgba(85,85,85,0.05)' : 'rgba(160,160,160,0.05)',
        tension: 0.2,
        pointRadius: 0,
        fill: false,
        borderDash: [5, 5],
        yAxisID: 'y'
      });
    }

    // Add SOL comparison (purple)
    if (showSolComparison && solHistory?.length) {
      const solNormalized = normalizeToPercent(alignToTao(solHistory));
      datasets.push({
        label: 'SOL %',
        data: solNormalized,
        borderColor: '#9945ff',
        backgroundColor: 'rgba(153,69,255,0.05)',
        tension: 0.2,
        pointRadius: 0,
        fill: false,
        borderDash: [5, 5],
        yAxisID: 'y'
      });
    }
  } else {
    // Standard TAO price chart (USD or EUR)
    const conversionRate = showEurPrices && eurUsdRate ? (1 / eurUsdRate) : 1;
    const currencyLabel = showEurPrices ? 'TAO Price (EUR)' : 'TAO Price (USD)';

    // Check if candlestick mode and OHLCV data available
    if (showCandleChart && ohlcvData?.length) {
      // Candlestick chart data format
      const candleData = ohlcvData.map(d => ({
        x: d.x,
        o: d.o * conversionRate,
        h: d.h * conversionRate,
        l: d.l * conversionRate,
        c: d.c * conversionRate
      }));
      datasets.push({
        label: currencyLabel,
        data: candleData,
        color: {
          up: '#22c55e',
          down: '#ef4444',
          unchanged: '#888'
        },
        borderColor: {
          up: '#22c55e',
          down: '#ef4444',
          unchanged: '#888'
        }
      });
    } else {
      // Line chart (default)
      const data = priceHistory.map(([_, price]) => price * conversionRate);
      datasets.push({
        label: currencyLabel,
        data,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.1)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      });
    }
  }

  const showLegend = hasAnyComparison;
  const currencySymbol = (!showLegend && showEurPrices) ? '€' : '$';

  // Determine chart type
  const useCandlestick = showCandleChart && ohlcvData?.length && !hasAnyComparison;
  const chartType = useCandlestick ? 'candlestick' : 'line';

  // Add volume bars if enabled and data available
  if (showVolume && volumeData?.length && !hasAnyComparison) {
    // Find max volume for scaling
    const maxVol = Math.max(...volumeData.map(v => v.y));
    const volumeScaled = useCandlestick
      ? volumeData.map(v => ({ x: v.x, y: v.y }))
      : volumeData.map((v, i) => v.y);

    datasets.push({
      label: 'Volume',
      data: volumeScaled,
      type: 'bar',
      backgroundColor: 'rgba(100, 116, 139, 0.3)',
      borderColor: 'rgba(100, 116, 139, 0.5)',
      borderWidth: 1,
      yAxisID: 'yVolume',
      order: 2 // Draw behind price
    });
  }

  // Configure scales based on chart type
  const scales = useCandlestick ? {
    x: {
      type: 'time',
      time: {
        unit: rangeNum <= 1 ? 'hour' : (rangeNum <= 7 ? 'day' : (rangeNum <= 90 ? 'week' : 'month')),
        displayFormats: {
          hour: 'HH:mm',
          day: 'MMM d',
          week: 'MMM d',
          month: "MMM ''yy"
        }
      },
      grid: { display: false },
      ticks: { color: '#888', maxRotation: 0 }
    },
    y: {
      display: true,
      position: 'left',
      grid: { color: '#222' },
      ticks: {
        color: '#888',
        callback: function(value) {
          return `${currencySymbol}${value.toLocaleString()}`;
        }
      }
    }
  } : {
    x: {
      display: true,
      grid: { display: false },
      ticks: {
        color: '#888',
        maxTicksLimit: isMax ? 12 : (rangeNum <= 7 ? 7 : 15),
        autoSkip: true,
        maxRotation: 0
      }
    },
    y: {
      display: true,
      grid: { color: '#222' },
      ticks: {
        color: '#888',
        callback: function(value) {
          if (showLegend) return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
          return `${currencySymbol}${value.toLocaleString()}`;
        }
      }
    }
  };

  // Add volume scale if needed
  if (showVolume && volumeData?.length && !hasAnyComparison) {
    scales.yVolume = {
      display: false,
      position: 'right',
      grid: { display: false },
      min: 0,
      max: Math.max(...volumeData.map(v => v.y)) * 4 // Scale down volume to 25% of chart height
    };
  }

  window.priceChart = new Chart(ctx, {
    type: chartType,
    data: useCandlestick ? { datasets } : { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: showLegend || (showVolume && volumeData?.length),
          position: 'top',
          labels: { color: '#aaa', font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              // Volume tooltip
              if (context.dataset.label === 'Volume') {
                return `Vol: ${context.parsed.y?.toLocaleString() || 'N/A'}`;
              }
              // Candlestick tooltip
              if (useCandlestick && context.raw?.o !== undefined) {
                const d = context.raw;
                return [
                  `O: ${currencySymbol}${d.o.toFixed(2)}`,
                  `H: ${currencySymbol}${d.h.toFixed(2)}`,
                  `L: ${currencySymbol}${d.l.toFixed(2)}`,
                  `C: ${currencySymbol}${d.c.toFixed(2)}`
                ];
              }
              // Line chart tooltip
              const val = context.parsed.y;
              if (showLegend) {
                return `${context.dataset.label}: ${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
              }
              return `${currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales
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
  if (taoPrice && taoPrice.last_updated) {
    lastUpdated = taoPrice.last_updated;
  } else if (taoPrice && taoPrice._timestamp) {
    lastUpdated = taoPrice._timestamp;
  }
  window._lastUpdated = lastUpdated;
  window._priceSource = taoPrice?._source || null;

  // Update price chart footer with last update time (date + time)
  const priceUpdateEl = document.getElementById('priceLastUpdate');
  if (lastUpdated) {
    const d = new Date(lastUpdated);
    const dd = d.getDate().toString().padStart(2, '0');
    const mo = (d.getMonth() + 1).toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    if (priceUpdateEl) priceUpdateEl.textContent = `Updated: ${dd}.${mo}. ${hh}:${mm}`;
  } else {
    if (priceUpdateEl) priceUpdateEl.textContent = `Updated: —`;
  }

  // Fetch EUR rate if needed for pill display
  if (showEurPrices && !eurUsdRate) {
    await fetchEurUsdRate();
  }

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
  // Prefer Binance (taoPrice) for real-time 24h change, fallback to Taostats
  const initPriceChange24h = taoPrice?.change24h ?? taostats?.percent_change_24h ?? null;
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
  // Pre-fetch EUR rate if EUR display is enabled
  if (showEurPrices) await fetchEurUsdRate();
  const priceHistory = await fetchPriceHistory(currentPriceRange);
  // Fetch comparison data in parallel
  const [btcHistory, ethHistory, solHistory] = await Promise.all([
    showBtcComparison ? fetchBtcPriceHistory(currentPriceRange) : null,
    showEthComparison ? fetchEthPriceHistory(currentPriceRange) : null,
    showSolComparison ? fetchSolPriceHistory(currentPriceRange) : null
  ]);
  if (priceHistory) {
    createPriceChart(priceHistory, currentPriceRange, { btcHistory, ethHistory, solHistory });
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
    document.querySelectorAll('.time-btn[data-range]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const range = btn.getAttribute('data-range'); // "7", "30", "365"
        if (range === currentPriceRange) return; // No reload if same
        currentPriceRange = range;
        // Persist user's selection so it survives reloads (client-side only)
        try { localStorage.setItem('priceRange', currentPriceRange); } catch (e) { /* ignore */ }

        // Update button UI (only time range buttons, not toggles)
        document.querySelectorAll('.time-btn[data-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Show chart skeleton (optional)
        const priceCard = btn.closest('.dashboard-card');
        if (priceCard) priceCard.classList.add('loading');

        // Fetch EUR rate if needed
        if (showEurPrices && !eurUsdRate) await fetchEurUsdRate();

        // Load data and redraw chart
        const priceHistory = await fetchPriceHistory(currentPriceRange);
        const [btcHistory, ethHistory, solHistory] = await Promise.all([
          showBtcComparison ? fetchBtcPriceHistory(currentPriceRange) : null,
          showEthComparison ? fetchEthPriceHistory(currentPriceRange) : null,
          showSolComparison ? fetchSolPriceHistory(currentPriceRange) : null
        ]);
        if (priceHistory) {
          createPriceChart(priceHistory, currentPriceRange, { btcHistory, ethHistory, solHistory });
        }
        // Hide skeleton
        if (priceCard) priceCard.classList.remove('loading');
      });
    });

    // Ensure the correct active button is set from persisted preference (if any)
    try {
      document.querySelectorAll('.time-btn[data-range]').forEach(b => b.classList.remove('active'));
      const activeBtn = document.querySelector(`.time-btn[data-range="${currentPriceRange}"]`);
      if (activeBtn) activeBtn.classList.add('active');
    } catch (e) { /* ignore */ }

    // Helper: Disable candle/volume when entering compare mode
    function disableCandleVolumeIfNeeded() {
      const hasComparison = showBtcComparison || showEthComparison || showSolComparison;
      if (hasComparison && (showCandleChart || showVolume)) {
        showCandleChart = false;
        showVolume = false;
        localStorage.setItem('showCandleChart', 'false');
        localStorage.setItem('showVolume', 'false');
        const candleToggle = document.getElementById('candleToggle');
        const volumeToggle = document.getElementById('volumeToggle');
        if (candleToggle) candleToggle.classList.remove('active');
        if (volumeToggle) volumeToggle.classList.remove('active');
      }
    }

    // Helper: Disable compare toggles when entering candle or volume mode
    function disableCompareIfNeeded() {
      if (!showCandleChart && !showVolume) return; // Only when candle or volume is being enabled
      const hasComparison = showBtcComparison || showEthComparison || showSolComparison;
      if (hasComparison) {
        showBtcComparison = false;
        showEthComparison = false;
        showSolComparison = false;
        localStorage.setItem('showBtcComparison', 'false');
        localStorage.setItem('showEthComparison', 'false');
        localStorage.setItem('showSolComparison', 'false');
        const btcToggle = document.getElementById('btcToggle');
        const ethToggle = document.getElementById('ethToggle');
        const solToggle = document.getElementById('solToggle');
        if (btcToggle) btcToggle.classList.remove('active');
        if (ethToggle) ethToggle.classList.remove('active');
        if (solToggle) solToggle.classList.remove('active');
      }
    }

    // BTC comparison toggle button
    const btcToggle = document.getElementById('btcToggle');
    if (btcToggle) {
      if (showBtcComparison) btcToggle.classList.add('active');
      btcToggle.addEventListener('click', () => {
        showBtcComparison = !showBtcComparison;
        localStorage.setItem('showBtcComparison', showBtcComparison);
        btcToggle.classList.toggle('active', showBtcComparison);
        disableCandleVolumeIfNeeded();
        refreshPriceChart();
      });
    }

    // Shared EUR toggle handler (used by both chart and pill toggles)
    async function handleEurToggle() {
      showEurPrices = !showEurPrices;
      localStorage.setItem('showEurPrices', showEurPrices);

      // Sync both toggle buttons
      const eurToggle = document.getElementById('eurToggle');
      const pillToggle = document.getElementById('pillCurrencyToggle');
      if (eurToggle) eurToggle.classList.toggle('active', showEurPrices);
      if (pillToggle) {
        pillToggle.textContent = showEurPrices ? '€' : '$';
        pillToggle.classList.toggle('active', showEurPrices);
      }

      // Fetch EUR rate if enabling
      if (showEurPrices && !eurUsdRate) {
        await fetchEurUsdRate();
      }

      // Update the price pill
      if (window._lastPriceData) {
        updateTaoPrice(window._lastPriceData);
      }

      // Reload chart with EUR conversion
      refreshPriceChart();
    }

    // EUR currency toggle button (chart)
    const eurToggle = document.getElementById('eurToggle');
    if (eurToggle) {
      if (showEurPrices) eurToggle.classList.add('active');
      eurToggle.addEventListener('click', handleEurToggle);
    }

    // EUR currency toggle button (pill)
    const pillCurrencyToggle = document.getElementById('pillCurrencyToggle');
    if (pillCurrencyToggle) {
      // Set initial state
      pillCurrencyToggle.textContent = showEurPrices ? '€' : '$';
      if (showEurPrices) pillCurrencyToggle.classList.add('active');
      pillCurrencyToggle.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger pill tooltip
        handleEurToggle();
      });
    }

    // ETH comparison toggle button
    const ethToggle = document.getElementById('ethToggle');
    if (ethToggle) {
      if (showEthComparison) ethToggle.classList.add('active');
      ethToggle.addEventListener('click', () => {
        showEthComparison = !showEthComparison;
        localStorage.setItem('showEthComparison', showEthComparison);
        ethToggle.classList.toggle('active', showEthComparison);
        disableCandleVolumeIfNeeded();
        refreshPriceChart();
      });
    }

    // SOL comparison toggle button
    const solToggle = document.getElementById('solToggle');
    if (solToggle) {
      if (showSolComparison) solToggle.classList.add('active');
      solToggle.addEventListener('click', () => {
        showSolComparison = !showSolComparison;
        localStorage.setItem('showSolComparison', showSolComparison);
        solToggle.classList.toggle('active', showSolComparison);
        disableCandleVolumeIfNeeded();
        refreshPriceChart();
      });
    }

    // Candle chart toggle
    const candleToggle = document.getElementById('candleToggle');
    if (candleToggle) {
      if (showCandleChart) candleToggle.classList.add('active');
      candleToggle.addEventListener('click', () => {
        showCandleChart = !showCandleChart;
        localStorage.setItem('showCandleChart', showCandleChart);
        candleToggle.classList.toggle('active', showCandleChart);
        disableCompareIfNeeded(); // Disable BTC/ETH/SOL compare when entering candle mode
        refreshPriceChart();
      });
    }

    // Volume bars toggle
    const volumeToggle = document.getElementById('volumeToggle');
    if (volumeToggle) {
      if (showVolume) volumeToggle.classList.add('active');
      volumeToggle.addEventListener('click', () => {
        showVolume = !showVolume;
        localStorage.setItem('showVolume', showVolume);
        volumeToggle.classList.toggle('active', showVolume);
        disableCompareIfNeeded(); // Disable BTC/ETH/SOL compare when entering volume mode
        refreshPriceChart();
      });
    }

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
            '<div><span class="tooltip-chip ok">OK</span> Bittensor SDK</div>',
            '<div><span class="tooltip-chip ok">OK</span> Taostats</div>',
            '<div><span class="tooltip-chip ok">OK</span> Binance</div>',
            '<div><span class="tooltip-chip ok">OK</span> CoinGecko</div>',
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
    ...Array.from(document.querySelectorAll('.dashboard-card, .stat-card, .market-conditions-card, .price-pill, .halving-pill, .ath-atl-pill, .whitepaper-btn, #bgToggleBtn, #soundToggleBtn, .stat-value, .info-badge, .pill-value, .disclaimer-card, .site-footer, .pill-currency-toggle'))
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
        fetch('/api/top_subnets_history?limit=96')  // ~24h of history at 15min intervals
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
          // Get the oldest snapshot in history (for 24h comparison)
          if (history.length >= 1) {
            const prevSnapshot = history[0];  // First = oldest
            // History stores in 'entries' array with 'id' for netuid
            const prevSubnets = prevSnapshot.entries || prevSnapshot.top_subnets || [];
            prevSubnets.forEach((s, idx) => {
              // Use 'id' from history (netuid as string) or 'netuid'
              const netuid = s.id || s.netuid;
              if (netuid) prevRankMap[parseInt(netuid)] = idx + 1;
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
        fetch('/api/top_validators_history?limit=96')  // ~24h of history
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
          // Get the oldest snapshot in history (for 24h comparison)
          if (history.length >= 1) {
            const prevSnapshot = history[0];  // First = oldest
            // History stores in 'entries' array with 'id' for hotkey
            const prevValidators = prevSnapshot.entries || prevSnapshot.top_validators || [];
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
        fetch('/api/top_wallets_history?limit=96')  // ~24h of history
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
          // Get the oldest snapshot in history (for 24h comparison)
          if (history.length >= 1) {
            const prevSnapshot = history[0];  // First = oldest
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

  // Load TAO Distribution data
  async function loadDistribution() {
    try {
      const res = await fetch('/api/distribution', { cache: 'no-store' });
      if (!res.ok) {
        console.warn('Distribution API returned', res.status);
        return;
      }
      const data = await res.json();
      if (!data || !data.percentiles) return;

      // Update percentile values
      const percentiles = data.percentiles;
      if (percentiles['1']) {
        const el = document.getElementById('percentile1');
        if (el) el.textContent = `≥ ${percentiles['1'].threshold.toLocaleString(undefined, { maximumFractionDigits: 0 })} τ`;
      }
      if (percentiles['3']) {
        const el = document.getElementById('percentile3');
        if (el) el.textContent = `≥ ${percentiles['3'].threshold.toLocaleString(undefined, { maximumFractionDigits: 0 })} τ`;
      }
      if (percentiles['5']) {
        const el = document.getElementById('percentile5');
        if (el) el.textContent = `≥ ${percentiles['5'].threshold.toLocaleString(undefined, { maximumFractionDigits: 0 })} τ`;
      }
      if (percentiles['10']) {
        const el = document.getElementById('percentile10');
        if (el) el.textContent = `≥ ${percentiles['10'].threshold.toLocaleString(undefined, { maximumFractionDigits: 0 })} τ`;
      }

      // Update bracket counts
      const brackets = data.brackets;
      if (brackets) {
        const bracket10000 = document.getElementById('bracket10000');
        if (bracket10000 && brackets['10000']) {
          bracket10000.textContent = `${brackets['10000'].count.toLocaleString()} (${brackets['10000'].percentage}%)`;
        }
        const bracket1000 = document.getElementById('bracket1000');
        if (bracket1000 && brackets['1000']) {
          bracket1000.textContent = `${brackets['1000'].count.toLocaleString()} (${brackets['1000'].percentage}%)`;
        }
        const bracket100 = document.getElementById('bracket100');
        if (bracket100 && brackets['100']) {
          bracket100.textContent = `${brackets['100'].count.toLocaleString()} (${brackets['100'].percentage}%)`;
        }
        const bracket10 = document.getElementById('bracket10');
        if (bracket10 && brackets['10']) {
          bracket10.textContent = `${brackets['10'].count.toLocaleString()} (${brackets['10'].percentage}%)`;
        }
      }

      // Update meta info
      const metaEl = document.getElementById('distributionMeta');
      if (metaEl && data.sample_size) {
        metaEl.textContent = `Sample: ${data.sample_size.toLocaleString()} wallets`;
      }
      const updateEl = document.getElementById('distributionUpdate');
      if (updateEl && data.last_updated) {
        const date = new Date(data.last_updated);
        updateEl.textContent = `Updated: ${date.toLocaleDateString()}`;
      }
    } catch (err) {
      console.warn('Failed to load distribution:', err);
    }
  }

  // Load Decentralization Score
  async function loadDecentralization() {
    try {
      const res = await fetch('/api/decentralization');
      if (!res.ok) return;
      const data = await res.json();
      if (!data || data.error) return;

      // Helper to format numbers with K suffix
      const formatK = (n) => {
        if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
        return n.toLocaleString();
      };

      // Helper to set element text
      const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      // Main score
      const scoreEl = document.getElementById('decentralizationScore');
      const ratingEl = document.getElementById('decentralizationRating');
      const barEl = document.getElementById('decentralizationBar');

      if (scoreEl) scoreEl.textContent = data.score ?? '—';
      if (ratingEl) {
        const rating = (data.rating || '').toLowerCase();
        ratingEl.textContent = data.rating || '—';
        ratingEl.className = 'score-rating ' + rating;
      }
      if (barEl) barEl.style.width = (data.score || 0) + '%';

      // Score description - plain language explanation
      const descEl = document.getElementById('decentralizationDescription');
      if (descEl) {
        const score = data.score || 0;
        let desc = '';
        if (score >= 80) desc = 'Network is well distributed with healthy decentralization';
        else if (score >= 65) desc = 'Good distribution with room for improvement';
        else if (score >= 50) desc = 'Moderate concentration - validator stake is highly centralized';
        else if (score >= 35) desc = 'Concerning concentration - few entities control majority';
        else desc = 'High centralization risk - immediate attention needed';
        descEl.textContent = desc;
      }

      // Component scores
      setEl('walletScore', data.components?.wallet_score ?? '—');
      setEl('validatorScore', data.components?.validator_score ?? '—');
      setEl('subnetScore', data.components?.subnet_score ?? '—');

      // Helper to get Nakamoto context
      const getNakamotoContext = (n) => {
        if (n == null) return { text: '', cls: '' };
        if (n <= 3) return { text: 'Critical', cls: 'critical' };
        if (n <= 7) return { text: 'Low', cls: 'low' };
        if (n <= 15) return { text: 'Moderate', cls: 'moderate' };
        return { text: 'Good', cls: 'good' };
      };

      // Validator metrics
      const va = data.validator_analysis || {};
      setEl('validatorNakamoto', va.nakamoto_coefficient ?? '—');
      const vCtx = getNakamotoContext(va.nakamoto_coefficient);
      const vCtxEl = document.getElementById('validatorNakamotoContext');
      if (vCtxEl && vCtx.text) {
        vCtxEl.textContent = vCtx.text;
        vCtxEl.className = 'metric-context ' + vCtx.cls;
      }
      setEl('validatorGini', va.gini != null ? va.gini.toFixed(3) : '—');
      setEl('validatorTop10', va.top_10_concentration != null ? (va.top_10_concentration * 100).toFixed(0) + '%' : '—');
      setEl('totalValidators', va.total_validators ?? '—');

      // Subnet metrics
      const sa = data.subnet_analysis || {};
      setEl('subnetNakamoto', sa.nakamoto_coefficient ?? '—');
      const sCtx = getNakamotoContext(sa.nakamoto_coefficient);
      const sCtxEl = document.getElementById('subnetNakamotoContext');
      if (sCtxEl && sCtx.text) {
        sCtxEl.textContent = sCtx.text;
        sCtxEl.className = 'metric-context ' + sCtx.cls;
      }
      setEl('subnetHHI', sa.emission_hhi != null ? sa.emission_hhi.toFixed(4) : '—');
      setEl('subnetTop5', sa.top_5_emission_concentration != null ? (sa.top_5_emission_concentration * 100).toFixed(1) + '%' : '—');
      setEl('totalSubnets', sa.total_subnets ?? '—');

      // Wallet metrics
      const wa = data.wallet_analysis || {};
      const whales = wa.whales_10k_plus || {};
      setEl('whaleCount', whales.count ?? '—');
      setEl('whalePercent', whales.percentage != null ? whales.percentage.toFixed(2) + '%' : '—');
      setEl('top1Threshold', wa.top_1_percent?.threshold_tao != null ? wa.top_1_percent.threshold_tao.toFixed(0) + ' τ' : '—');
      setEl('totalWallets', wa.total_wallets != null ? formatK(wa.total_wallets) : '—');

      // Update timestamp
      const updateEl = document.getElementById('decentralizationUpdate');
      if (updateEl && data.last_updated) {
        const date = new Date(data.last_updated);
        updateEl.textContent = `Updated: ${date.toLocaleDateString()}`;
      }
    } catch (err) {
      console.warn('Failed to load decentralization:', err);
    }
  }

  loadDistribution();
  loadDecentralization();

  // Also refresh when refreshDashboard is called
  const currentRefresh = window.refreshDashboard;
  window.refreshDashboard = async function() {
    await currentRefresh.call(this);
    loadTopWalletsDisplay();
    loadDistribution();
    loadDecentralization();
  };
});

// Old Top Subnets Tooltip handler removed - now uses standard data-tooltip

// Initialize seasonal effects (imported from module)
document.addEventListener('DOMContentLoaded', initAllSeasonalEffects);

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

// ===== Terminal Boot Event Handlers =====
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

// ===== ES6 Module Exports =====
export {
  fetchVolumeHistory,
  calculateVolumeChange,
  getVolumeSignal
};