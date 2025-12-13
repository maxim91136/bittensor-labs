// ===== API Functions (ES6 Module) =====
import { API_BASE } from './config.js';

/**
 * Fetch network data (validator count, active miners, etc.)
 */
export async function fetchNetworkData() {
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

/**
 * Fetch Taostats data (main price/volume source)
 */
export async function fetchTaostats() {
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

/**
 * Fetch Block Time data from our API
 */
export async function fetchBlockTime() {
  try {
    const res = await fetch(`${API_BASE}/block_time`);
    if (!res.ok) throw new Error(`Block Time API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('⚠️ Block Time fetch failed:', err);
    return null;
  }
}

/**
 * Fetch Staking APR data from our API
 */
export async function fetchStakingApr() {
  try {
    const res = await fetch(`${API_BASE}/staking_apy`);
    if (!res.ok) throw new Error(`Staking APR API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('⚠️ Staking APR fetch failed:', err);
    return null;
  }
}

/**
 * Fetch ATH/ATL data for distance calculation
 */
export async function fetchAthAtl() {
  try {
    const res = await fetch('/api/ath-atl', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('📊 Failed to fetch ATH/ATL:', e);
    return null;
  }
}

/**
 * Fetch taostats aggregates (for MA data)
 */
export async function fetchTaostatsAggregates() {
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
 * Fetch Fear & Greed Index data (CMC primary, Alternative.me fallback)
 */
export async function fetchFearAndGreed() {
  // Primary: CMC data via our API (more frequent updates)
  try {
    const res = await fetch('/api/cmc?type=fng', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.value !== undefined) {
        return {
          current: {
            value: data.value,
            value_classification: data.value_classification
          },
          _source: 'coinmarketcap'
        };
      }
    }
  } catch (e) {
    if (window._debug) console.debug('fetchFearAndGreed CMC primary failed', e);
  }

  // Fallback: Alternative.me via our API
  try {
    const res = await fetch('/api/fear_and_greed_index', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.current && data.current.value !== undefined) {
        return data;
      }
    }
  } catch (e) {
    if (window._debug) console.debug('fetchFearAndGreed Alternative.me fallback failed', e);
  }

  return null;
}

/**
 * Fetch CMC data (global metrics, season, TAO quote)
 */
export async function fetchCmcData() {
  try {
    const res = await fetch('/api/cmc', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    if (window._debug) console.debug('fetchCmcData failed', e);
    return null;
  }
}

/**
 * Fetch DEX data (wTAO pairs from DexScreener)
 */
export async function fetchDexData() {
  try {
    const res = await fetch('/api/dex', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    if (window._debug) console.debug('fetchDexData failed', e);
    return null;
  }
}
