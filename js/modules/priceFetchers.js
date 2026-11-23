// ===== Price Fetchers Module (ES6) =====
// All price-related API fetch functions

import { API_BASE, BINANCE_API, COINGECKO_API } from './config.js';
import { normalizeRange, getCachedPrice, setCachedPrice } from './utils.js';
import { fetchTaostats, fetchTaostatsAggregates } from './api.js';

// Module-level state
let _eurUsdRate = null;

/**
 * Get cached EUR/USD rate
 * @returns {number|null}
 */
export function getEurUsdRate() {
  return _eurUsdRate;
}

/**
 * Set EUR/USD rate (for use by external code)
 * @param {number} rate
 */
export function setEurUsdRate(rate) {
  _eurUsdRate = rate;
}

/**
 * Fetch current TAO price with fallback chain: Binance → Taostats → CoinGecko
 * @returns {Promise<{price: number|null, change24h: number|null, volume_24h: number|null, last_updated: string|null, _source: string}>}
 */
export async function fetchTaoPrice() {
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
  const url = `${COINGECKO_API}/simple/price?ids=bittensor&vs_currencies=usd&include_24hr_change=true`;
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

/**
 * Fetch TAO price history
 * @param {string} range - Time range ('1', '3', '7', '30', '60', '90', 'max')
 * @param {Object} options - Options
 * @param {boolean} options.needsOHLCV - Whether OHLCV data is needed (candlestick/volume mode)
 * @returns {Promise<{prices: Array, ohlcv: Array|null, volume: Array|null, source: string}|null>}
 */
export async function fetchPriceHistory(range = '7', options = {}) {
  const { needsOHLCV = false } = options;
  const key = normalizeRange(range);

  // Use different cache key for OHLCV mode
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

/**
 * Fetch BTC price history for TAO vs BTC comparison
 * @param {string} range - Time range
 * @returns {Promise<Array|null>}
 */
export async function fetchBtcPriceHistory(range = '7') {
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

/**
 * Fetch ETH price history for TAO vs ETH comparison
 * @param {string} range - Time range
 * @returns {Promise<Array|null>}
 */
export async function fetchEthPriceHistory(range = '7') {
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

/**
 * Fetch SOL price history for TAO vs SOL comparison
 * @param {string} range - Time range
 * @returns {Promise<Array|null>}
 */
export async function fetchSolPriceHistory(range = '7') {
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

/**
 * Fetch EUR/USD exchange rate from Binance
 * @returns {Promise<number>}
 */
export async function fetchEurUsdRate() {
  if (_eurUsdRate) return _eurUsdRate;
  try {
    const res = await fetch(`${BINANCE_API}/ticker/price?symbol=EURUSDT`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      _eurUsdRate = parseFloat(data.price);
      if (window._debug) console.debug('EUR/USD rate from Binance:', _eurUsdRate);
      return _eurUsdRate;
    }
  } catch (e) {
    if (window._debug) console.debug('EUR/USD rate fetch failed:', e);
  }
  // Fallback rate if API fails
  _eurUsdRate = 0.92;
  return _eurUsdRate;
}

/**
 * Fetch circulating supply from Taostats or CoinGecko
 * @returns {Promise<number|null>}
 */
export async function fetchCirculatingSupply() {
  const taostats = await fetchTaostats();
  if (taostats && taostats.circulating_supply) {
    window._circSupplySource = taostats._source || 'taostats';
    return taostats.circulating_supply;
  }
  try {
    const res = await fetch(`${COINGECKO_API}/coins/bittensor`);
    const data = await res.json();
    window._circSupplySource = 'coingecko';
    return data.market_data?.circulating_supply ?? null;
  } catch (err) {
    window._circSupplySource = 'fallback';
    return null;
  }
}
