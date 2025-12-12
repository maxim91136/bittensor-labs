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
  roundUpTo2,
  formatPercent,
  readPercentValue
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