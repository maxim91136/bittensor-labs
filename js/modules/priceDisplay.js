// ===== Price Display Module (ES6) =====
// UI functions for displaying price, market cap, and API status

import { formatPercent, formatCompact, readPercentValue } from './utils.js';

/**
 * Build HTML for API status tooltip showing per-source chips
 * @param {Object} options - Data sources status
 * @returns {string} HTML string for tooltip
 */
export function buildApiStatusHtml({ networkData, taostats, taoPrice, fearAndGreed, dexData, cmcData }) {
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

  // Binance (derive from taoPrice._source)
  let binanceStatus = 'error';
  if (taoPrice && taoPrice._source === 'binance') {
    binanceStatus = taoPrice.price ? 'ok' : 'error';
  } else if (taoPrice && taoPrice.price) {
    // Binance not used but price available from other source
    binanceStatus = 'partial';
  }

  // CoinGecko (derive from taoPrice._source if available)
  let coingeckoStatus = 'error';
  if (taoPrice && taoPrice._source === 'coingecko') {
    coingeckoStatus = taoPrice.price ? 'ok' : 'error';
  } else if (taoPrice && taoPrice.price) {
    // CoinGecko not used but price available from other source
    coingeckoStatus = 'partial';
  }

  // CoinMarketCap (F&G, global metrics, TAO quote)
  let cmcStatus = 'error';
  if (cmcData) {
    const hasFng = cmcData.fear_and_greed && cmcData.fear_and_greed.value !== undefined;
    const hasGlobal = cmcData.global_metrics && cmcData.global_metrics.btc_dominance !== undefined;
    cmcStatus = (hasFng && hasGlobal) ? 'ok' : (hasFng || hasGlobal ? 'partial' : 'error');
  }

  // DexScreener (wTAO DEX pairs)
  let dexStatus = 'error';
  if (dexData) {
    const hasPairs = dexData.pairs && dexData.pairs.length > 0;
    const hasVolume = dexData.total_volume_24h !== undefined && dexData.total_volume_24h > 0;
    dexStatus = (hasPairs && hasVolume) ? 'ok' : (hasPairs || hasVolume ? 'partial' : 'error');
  }

  // Fear & Greed source detection
  let fngStatus = 'error';
  let fngSource = 'Alternative.me';
  if (fearAndGreed && fearAndGreed.current) {
    const hasValue = fearAndGreed.current.value !== undefined && fearAndGreed.current.value !== null;
    fngStatus = hasValue ? 'ok' : 'partial';
    if (fearAndGreed._source === 'coinmarketcap') {
      fngSource = 'CMC';
    }
  }

  // Bittensor SDK / network API
  const networkStatus = networkData ? 'ok' : 'error';

  const lines = [];
  lines.push('<div>Status of all data sources powering the dashboard</div>');
  // Order: Bittensor SDK, Taostats, Binance, CoinGecko, CMC, DexScreener
  lines.push('<div style="margin-top:8px">' + chip(networkStatus) + ' Bittensor SDK</div>');
  lines.push('<div>' + chip(taostatsStatus) + ' Taostats</div>');
  lines.push('<div>' + chip(binanceStatus) + ' Binance</div>');
  lines.push('<div>' + chip(coingeckoStatus) + ' CoinGecko</div>');
  lines.push('<div>' + chip(cmcStatus) + ' CoinMarketCap</div>');
  lines.push('<div>' + chip(dexStatus) + ' DexScreener (wTAO)</div>');
  return lines.join('');
}

/**
 * Animate price change with color flash
 * @param {HTMLElement} element - Element to animate
 * @param {number} newPrice - New price value
 * @param {number|null} lastPrice - Previous price value
 * @returns {number} The new price (to be stored as lastPrice)
 */
export function animatePriceChange(element, newPrice, lastPrice) {
  if (lastPrice === null) {
    return newPrice;
  }
  if (newPrice > lastPrice) {
    element.classList.add('blink-green');
  } else if (newPrice < lastPrice) {
    element.classList.add('blink-red');
  }
  setTimeout(() => {
    element.classList.remove('blink-green', 'blink-red');
  }, 600);
  return newPrice;
}

/**
 * Update TAO price display
 * @param {Object} priceData - Price data object
 * @param {Object} options - Display options
 * @param {boolean} options.showEurPrices - Whether to show EUR prices
 * @param {number|null} options.eurUsdRate - EUR/USD exchange rate
 * @param {Function} options.onPriceUpdate - Callback after price update (for market cap)
 */
export function updateTaoPrice(priceData, options = {}) {
  const { showEurPrices = false, eurUsdRate = null, onPriceUpdate = null } = options;

  const priceEl = document.getElementById('taoPrice');
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

    // Get 7d change from taostats
    const ts = window._taostats ?? null;
    const p7d = readPercentValue(ts, ['percent_change_7d','percent_change_7day','pct_change_7d','percent_change_7day']);

    // Display 7d change in pill
    const change7dEl = document.getElementById('priceChange7d');
    if (change7dEl && p7d !== null) {
      const sign = p7d >= 0 ? '+' : '';
      change7dEl.textContent = `7d ${sign}${p7d.toFixed(1)}%`;
      change7dEl.classList.remove('positive', 'negative', 'neutral');
      if (p7d > 0.5) {
        change7dEl.classList.add('positive');
      } else if (p7d < -0.5) {
        change7dEl.classList.add('negative');
      } else {
        change7dEl.classList.add('neutral');
      }
    }

    // Apply subtle pulse animation to price pill based on 7d change
    if (pricePill && p7d !== null) {
      pricePill.classList.remove('price-up', 'price-down', 'price-neutral');
      if (p7d > 0.5) {
        pricePill.classList.add('price-up');
      } else if (p7d < -0.5) {
        pricePill.classList.add('price-down');
      } else {
        pricePill.classList.add('price-neutral');
      }
    } else if (pricePill && priceData.change24h !== undefined && priceData.change24h !== null) {
      // Fallback to 24h if 7d not available
      const change = priceData.change24h;
      pricePill.classList.remove('price-up', 'price-down', 'price-neutral');
      if (change > 0.5) {
        pricePill.classList.add('price-up');
      } else if (change < -0.5) {
        pricePill.classList.add('price-down');
      } else {
        pricePill.classList.add('price-neutral');
      }
    }
  } else {
    priceEl.textContent = 'N/A';
    if (pricePill) pricePill.classList.remove('price-up', 'price-down', 'price-neutral');
  }

  // Callback for market cap update
  if (onPriceUpdate) onPriceUpdate(priceData.price);

  // Price tooltip: show percent changes for available ranges from Taostats
  try {
    const pill = document.getElementById('taoPricePill') || document.querySelector('.price-pill');
    if (pill) {
      const ts = window._taostats ?? null;
      const parts = [];
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

/**
 * Update market cap and FDV display
 * @param {number} price - Current TAO price
 * @param {number} circulatingSupply - Circulating supply
 */
export function updateMarketCapAndFDV(price, circulatingSupply) {
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
