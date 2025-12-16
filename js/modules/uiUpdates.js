// ===== UI Update Functions (ES6 Module) =====
import { fetchBlockTime, fetchStakingApr } from './api.js';
import { formatFull, formatExact } from './utils.js';

/**
 * Update ATH/ATL Pills
 */
export async function updateAthAtlPills() {
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

/**
 * Update Block Time card
 */
export async function updateBlockTime() {
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
      const source = data._source || 'unknown';
      const sourceLabel = source === 'on-chain' ? 'Bittensor SDK (on-chain)' :
                         source === 'taostats_fallback' ? 'Taostats Block API (fallback)' :
                         'Taostats Block API';
      const tooltipLines = [
        `Average time between blocks (last ${blocksAnalyzed} blocks).`,
        `Target: 12.0s`,
        `Current: ${avgTime}s`,
        `Deviation: ${deviation}s`,
        `Status: ${status}`,
        '',
        `Calculation: (newest_ts - oldest_ts) / (blocks - 1)`,
        `Source: ${sourceLabel}`
      ];
      const blockLastUpd = data.last_updated || window._lastUpdated;
      if (blockLastUpd) tooltipLines.push(`Last updated: ${new Date(blockLastUpd).toLocaleString()}`);
      badge.setAttribute('data-tooltip', tooltipLines.join('\n'));
    }
  } else {
    el.textContent = '—';
  }
}

/**
 * Update Staking APR card
 */
export async function updateStakingApr() {
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
