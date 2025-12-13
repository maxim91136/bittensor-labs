// ===== ES6 Module Imports =====
import * as MatrixSound from './js/modules/matrixSound.js';
import './js/modules/terminalBoot.js'; // Side-effect: runs boot animation
import {
  API_BASE,
  REFRESH_INTERVAL
} from './js/modules/config.js';
import {
  formatNumber,
  formatFull,
  formatExact,
  formatCompact,
  roundUpTo2
} from './js/modules/utils.js';
import {
  fetchNetworkData,
  fetchTaostats
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
  updateFearAndGreed
} from './js/modules/fearAndGreed.js';
import {
  updateVolumeSignal
} from './js/modules/volumeSignal.js';
import {
  setChartConfig,
  createPriceChart,
  refreshPriceChart as _refreshPriceChart
} from './js/modules/priceChart.js';
import {
  fetchTaoPrice,
  fetchPriceHistory as _fetchPriceHistory,
  fetchBtcPriceHistory,
  fetchEthPriceHistory,
  fetchSolPriceHistory,
  fetchEurUsdRate as _fetchEurUsdRate,
  fetchCirculatingSupply
} from './js/modules/priceFetchers.js';
import {
  setupDynamicTooltips
} from './js/modules/tooltipManager.js';
import {
  initRefreshControls,
  startAutoRefresh,
  ensureAutoRefreshStarted
} from './js/modules/refreshControls.js';
import {
  startHalvingCountdown,
  generateHalvingThresholds,
  findNextThresholdIndex,
  rotateToThreshold,
  saveLastHalving
} from './js/modules/halvingCountdown.js';
import {
  buildApiStatusHtml,
  animatePriceChange as _animatePriceChange,
  updateTaoPrice as _updateTaoPrice,
  updateMarketCapAndFDV
} from './js/modules/priceDisplay.js';
import {
  initTopSubnetsDisplay
} from './js/modules/topSubnetsDisplay.js';
import {
  initTopValidatorsDisplay
} from './js/modules/topValidatorsDisplay.js';
import {
  initTopWalletsDisplay
} from './js/modules/topWalletsDisplay.js';
import {
  initThemeToggle
} from './js/modules/themeToggle.js';
import {
  initSoundToggle,
  initFngBadgePosition
} from './js/modules/uiHelpers.js';

// ===== State Management =====
let lastPrice = null;
let currentPriceRange = localStorage.getItem('priceRange') || '3';
let isLoadingPrice = false;
let showBtcComparison = localStorage.getItem('showBtcComparison') === 'true';
let showEthComparison = localStorage.getItem('showEthComparison') === 'true';
let showSolComparison = localStorage.getItem('showSolComparison') === 'true';
let showEurPrices = localStorage.getItem('showEurPrices') === 'true';
let showCandleChart = localStorage.getItem('showCandleChart') === 'true';
let showVolume = localStorage.getItem('showVolume') === 'true';

// Wrapper: fetchPriceHistory with current OHLCV mode
async function fetchPriceHistory(range = '7') {
  return _fetchPriceHistory(range, { needsOHLCV: showCandleChart || showVolume });
}

// Wrapper: fetchEurUsdRate that syncs local eurUsdRate
let eurUsdRate = null;
async function fetchEurUsdRate() {
  eurUsdRate = await _fetchEurUsdRate();
  return eurUsdRate;
}

// Sync chart config on init
function syncChartConfig() {
  setChartConfig({
    showBtcComparison,
    showEthComparison,
    showSolComparison,
    showEurPrices,
    showCandleChart,
    showVolume,
    eurUsdRate
  });
}

// Wrapper: animatePriceChange with local state
function animatePriceChange(element, newPrice) {
  lastPrice = _animatePriceChange(element, newPrice, lastPrice);
}

// Wrapper: updateTaoPrice with local state
function updateTaoPrice(priceData) {
  _updateTaoPrice(priceData, {
    showEurPrices,
    eurUsdRate,
    onPriceUpdate: (price) => {
      lastPrice = price;
      tryUpdateMarketCapAndFDV();
    }
  });
}

// Helper: try updating market cap and FDV
function tryUpdateMarketCapAndFDV() {
  if (window.circulatingSupply && lastPrice) {
    updateMarketCapAndFDV(lastPrice, window.circulatingSupply);
  }
}

// Wrapper for refreshPriceChart that syncs config and passes fetchers
async function refreshPriceChart() {
  syncChartConfig();
  return _refreshPriceChart({
    range: currentPriceRange,
    fetchPriceHistory,
    fetchBtcPriceHistory,
    fetchEthPriceHistory,
    fetchSolPriceHistory
  });
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
    // record last halving with timestamp (ms) and persist to localStorage
    const halvingTimestamp = Date.now();
    saveLastHalving(HALVING_SUPPLY, halvingTimestamp);
    window.halvingJustHappened = { threshold: HALVING_SUPPLY, at: new Date(halvingTimestamp) };
    window.halvingDate = new Date(halvingTimestamp);
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
          // Format ETA as UTC date+time: DD.MM.YY HH:MM UTC
          let eta = 'N/A';
          if (h.eta) {
            const d = new Date(h.eta);
            const day = String(d.getUTCDate()).padStart(2, '0');
            const month = String(d.getUTCMonth() + 1).padStart(2, '0');
            const year = String(d.getUTCFullYear()).slice(-2);
            const hours = String(d.getUTCHours()).padStart(2, '0');
            const mins = String(d.getUTCMinutes()).padStart(2, '0');
            eta = `${day}.${month}.${year} ${hours}:${mins} UTC`;
          }
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
  document.addEventListener('DOMContentLoaded', () => setupDynamicTooltips({ MatrixSound }));
} else {
  setupDynamicTooltips({ MatrixSound });
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
    updateVolumeSignal(taostats.volume_24h, priceChange24h, lastPrice);
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

// Initialize refresh controls with callbacks
initRefreshControls({ refreshDashboard, MatrixSound });

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
    updateVolumeSignal(taostats.volume_24h, initPriceChange24h, lastPrice);
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
    syncChartConfig();
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
          syncChartConfig();
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

  // Background toggle button (now handled by themeToggle module)
  initThemeToggle();

  // Sound toggle button (now handled by uiHelpers module)
  initSoundToggle(MatrixSound);
});

// ===== Top Subnets Display Card (Main Grid) =====
let _refreshTopSubnets = null;
document.addEventListener('DOMContentLoaded', function() {
  _refreshTopSubnets = initTopSubnetsDisplay();
  if (_refreshTopSubnets) {
    const originalRefreshDashboard = window.refreshDashboard;
    window.refreshDashboard = async function() {
      await originalRefreshDashboard.call(this);
      _refreshTopSubnets();
    };
  }
});

// ===== Top Validators Display =====
let _refreshTopValidators = null;
document.addEventListener('DOMContentLoaded', function() {
  _refreshTopValidators = initTopValidatorsDisplay();
  if (_refreshTopValidators) {
    const origRefresh = window.refreshDashboard;
    window.refreshDashboard = async function() {
      await origRefresh.call(this);
      _refreshTopValidators();
    };
  }
});

// ===== Top Wallets Display =====
let _refreshTopWallets = null;
document.addEventListener('DOMContentLoaded', function() {
  _refreshTopWallets = initTopWalletsDisplay();
  if (_refreshTopWallets) {
    const currentRefresh = window.refreshDashboard;
    window.refreshDashboard = async function() {
      await currentRefresh.call(this);
      _refreshTopWallets.refreshAll();
    };
  }
});

// Old Top Subnets Tooltip handler removed - now uses standard data-tooltip

// Initialize seasonal effects (imported from module)
document.addEventListener('DOMContentLoaded', initAllSeasonalEffects);

// ===== Force Fear & Greed Badge Position on Desktop =====
initFngBadgePosition();

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
// Volume signal functions moved to js/modules/volumeSignal.js