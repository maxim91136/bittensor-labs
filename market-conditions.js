// ===== ES6 Module Imports =====
import {
  fetchVolumeHistory,
  calculateVolumeChange,
  getVolumeSignal
} from './js/modules/volumeSignal.js';
import {
  fetchTaostatsAggregates,
  fetchFearAndGreed,
  fetchAthAtl,
  fetchTaostats
} from './js/modules/api.js';

/**
 * Format compact volume in dollars (e.g., $1.2M, $45.3M)
 */
function formatCompactVolume(num) {
  if (num === null || num === undefined) return '—';
  if (Math.abs(num) >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
  if (Math.abs(num) >= 1e6) return '$' + (num / 1e6).toFixed(1) + 'M';
  if (Math.abs(num) >= 1e3) return '$' + (num / 1e3).toFixed(0) + 'k';
  return '$' + Number(num).toLocaleString();
}

/**
 * Format MA value in dollars (e.g., $119.2M)
 */
function formatMADollar(num) {
  if (num === null || num === undefined) return '—';
  if (Math.abs(num) >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
  if (Math.abs(num) >= 1e6) return '$' + (num / 1e6).toFixed(1) + 'M';
  if (Math.abs(num) >= 1e3) return '$' + (num / 1e3).toFixed(0) + 'k';
  return '$' + Number(num).toLocaleString();
}

/**
 * Format MA percentage change (e.g., -1.4%, +0.9%)
 */
function formatMAPct(num) {
  if (num === null || num === undefined) return '';
  const pct = (num * 100).toFixed(1);
  return num > 0 ? `+${pct}%` : `${pct}%`;
}

/**
 * Update the new Market Conditions Card with all volume signal data
 */
async function updateMarketConditionsCard(currentVolume, priceChange24h) {
  const card = document.getElementById('marketConditionsCard');
  if (!card) {
    console.warn('Market Conditions Card not found');
    return;
  }

  // Fetch all data
  const history = await fetchVolumeHistory();
  const volumeData = calculateVolumeChange(history, currentVolume);
  const aggregates = await fetchTaostatsAggregates();
  const fngData = await fetchFearAndGreed();
  const athAtlData = await fetchAthAtl();
  const taostats = await fetchTaostats();
  const { signal, tooltip } = getVolumeSignal(volumeData, priceChange24h, currentVolume, aggregates, fngData);

  // Parse tooltip to extract structured data
  const lines = tooltip.split('\n');

  // Update signal icon and text
  const signalMetric = card.querySelector('#marketSignal');
  if (signalMetric) {
    const icons = { green: '🟢', red: '🔴', yellow: '🟡', orange: '🟠', neutral: '⚪' };
    const labels = {
      green: 'Bullish',
      red: 'Bearish',
      yellow: 'Caution',
      orange: 'Watch',
      neutral: 'Stable'
    };

    signalMetric.className = 'market-metric signal-' + signal;
    signalMetric.querySelector('.metric-icon').textContent = icons[signal] || '⚪';
    signalMetric.querySelector('.metric-value').textContent = labels[signal] || 'Neutral';
  }

  // Update volume with dollar value and change
  const volumeMetric = card.querySelector('#marketVolume');
  if (volumeMetric) {
    // Format current volume in dollars (compact)
    const volumeValueEl = volumeMetric.querySelector('#marketVolumeValue');
    if (volumeValueEl && currentVolume) {
      const formatted = formatCompactVolume(currentVolume);
      volumeValueEl.textContent = formatted;
    }

    // Format volume change percentage
    const volumeChangeEl = volumeMetric.querySelector('#marketVolumeChange');
    if (volumeChangeEl && volumeData) {
      const volChange = volumeData.change || 0;
      const volStr = volChange >= 0 ? `+${volChange.toFixed(1)}%` : `${volChange.toFixed(1)}%`;
      volumeChangeEl.textContent = volStr;

      // Add conditional color class
      volumeChangeEl.classList.remove('positive', 'negative');
      if (volChange >= 0) {
        volumeChangeEl.classList.add('positive');
      } else {
        volumeChangeEl.classList.add('negative');
      }
    }
  }

  // Update price change
  const priceMetric = card.querySelector('#marketPrice');
  if (priceMetric && priceChange24h !== null) {
    const priceStr = priceChange24h >= 0 ? `+${priceChange24h.toFixed(1)}%` : `${priceChange24h.toFixed(1)}%`;
    const priceValueEl = priceMetric.querySelector('.metric-value');
    priceValueEl.textContent = priceStr;

    // Add conditional color class
    priceValueEl.classList.remove('positive', 'negative');
    if (priceChange24h >= 0) {
      priceValueEl.classList.add('positive');
    } else {
      priceValueEl.classList.add('negative');
    }
  }

  // Extract market phase from tooltip
  const phaseSection = card.querySelector('#marketPhaseSection');
  if (phaseSection) {
    const phaseLines = [];
    let inPhaseSection = false;

    for (const line of lines) {
      if (line.includes('Market:') || line.includes('Sentiment:')) {
        phaseLines.push(line);
        inPhaseSection = true;
      } else if (inPhaseSection && line.includes('📊 Moving Averages')) {
        break;
      } else if (inPhaseSection && line.trim() && !line.includes('Confidence:') && !line.includes('Last updated:')) {
        phaseLines.push(line);
      }
    }

    // Build HTML content with plain text lines
    let htmlContent = phaseLines.map(line => {
      // Escape HTML entities
      return line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }).join('<br>');

    // Add ATH/ATL distance line with colored values
    if (athAtlData && taostats?.price) {
      const currentPrice = taostats.price;
      const ath = athAtlData.ath;
      const atl = athAtlData.atl;
      if (ath && atl && currentPrice) {
        const distFromAtl = ((currentPrice - atl) / atl) * 100;
        const distFromAth = ((ath - currentPrice) / ath) * 100;
        htmlContent += `<br>📍 ATL: <span class="positive">+${distFromAtl.toFixed(1)}%</span> | ATH: <span class="negative">-${distFromAth.toFixed(1)}%</span>`;
      }
    }

    phaseSection.innerHTML = htmlContent;

    // Set phase class
    phaseSection.className = 'market-phase-section';
    if (phaseLines.join('').includes('Bullish')) {
      phaseSection.classList.add('phase-bullish');
    } else if (phaseLines.join('').includes('Bearish')) {
      phaseSection.classList.add('phase-bearish');
    } else {
      phaseSection.classList.add('phase-neutral');
    }
  }

  // Update phase badge with color
  const phaseMetric = card.querySelector('#marketPhase');
  if (phaseMetric) {
    let phaseLabel = 'Neutral';
    let phaseClass = 'phase-neutral';

    if (tooltip.includes('Bullish')) {
      phaseLabel = 'Bullish';
      phaseClass = 'phase-bullish';
    } else if (tooltip.includes('Bearish')) {
      phaseLabel = 'Bearish';
      phaseClass = 'phase-bearish';
    } else if (tooltip.includes('Caution')) {
      phaseLabel = 'Caution';
      phaseClass = 'phase-caution';
    } else if (tooltip.includes('Watch')) {
      phaseLabel = 'Watch';
      phaseClass = 'phase-watch';
    }

    // Remove all phase classes and add the current one
    phaseMetric.classList.remove('phase-bullish', 'phase-bearish', 'phase-caution', 'phase-watch', 'phase-neutral');
    phaseMetric.classList.add(phaseClass);
    phaseMetric.querySelector('.metric-value').textContent = phaseLabel;
  }

  // Update Moving Averages
  const maGrid = card.querySelector('#marketMAGrid');
  if (maGrid && aggregates) {
    const mas = [
      { label: 'MA-2h', value: aggregates.ma_short, change: aggregates.pct_change_vs_ma_short },
      { label: 'MA-4h', value: aggregates.ma_med, change: aggregates.pct_change_vs_ma_med },
      { label: 'MA-3d', value: aggregates.ma_3d, change: aggregates.pct_change_vs_ma_3d },
      { label: 'MA-7d', value: aggregates.ma_7d, change: aggregates.pct_change_vs_ma_7d }
    ];

    maGrid.innerHTML = mas.map(ma => {
      if (ma.value === null || ma.value === undefined) return '';
      const changeStr = ma.change !== null ? formatMAPct(ma.change) : '';
      const changeClass = ma.change > 0 ? 'positive' : (ma.change < 0 ? 'negative' : '');

      return `
        <div class="ma-item">
          <span class="ma-label">${ma.label}:</span>
          <span class="ma-value">${formatMADollar(ma.value)}</span>
          <span class="ma-change ${changeClass}">${changeStr}</span>
        </div>
      `;
    }).filter(Boolean).join('');
  }

  // Update confidence
  const confidenceSection = card.querySelector('#marketConfidence');
  if (confidenceSection && volumeData) {
    let confText = '';
    if (volumeData.confidence) {
      confText = `Confidence: ${volumeData.confidence}`;
      if (volumeData.samples) confText += ` (${volumeData.samples} samples`;
      if (volumeData.hoursOfData) confText += `, ${volumeData.hoursOfData.toFixed(1)}h data)`;
      else confText += ')';
    }
    confidenceSection.textContent = confText;
  }

  // Update last updated
  const lastUpdated = card.querySelector('#marketLastUpdated');
  if (lastUpdated) {
    let lastUpdatedStr = '—';
    if (aggregates && aggregates.last_updated) {
      lastUpdatedStr = new Date(aggregates.last_updated).toLocaleString();
    } else if (volumeData && volumeData.last_updated) {
      lastUpdatedStr = new Date(volumeData.last_updated).toLocaleString();
    }
    lastUpdated.textContent = lastUpdatedStr;
  }

  // Apply light mode if active
  if (document.body.classList.contains('light-bg')) {
    card.classList.add('light-bg');
  } else {
    card.classList.remove('light-bg');
  }

  console.log('📊 Market Conditions Card updated:', signal);
}

/**
 * Update Token Economics Card (Issued Tokens %)
 */
async function updateTokenEconomicsCard() {
  const card = document.getElementById('tokenEconomicsCard');
  if (!card) return;

  try {
    const res = await fetch('/api/network');
    if (!res.ok) throw new Error('Network API failed');
    const data = await res.json();

    // Issued percentage
    const issuedEl = card.querySelector('#issuedPercentValue');
    if (issuedEl && data.totalIssuance) {
      const maxSupply = 21000000;
      const issuedPct = (data.totalIssuanceHuman / maxSupply) * 100;
      issuedEl.textContent = `${issuedPct.toFixed(2)}%`;
    }

    // Update tooltip with source + timestamp
    const badge = card.querySelector('.info-badge');
    if (badge) {
      const lines = [
        'Percentage of maximum supply (21M TAO) that has been issued',
        'Calculation: (circulating supply / 21M) × 100',
        '',
        'Source: Bittensor SDK'
      ];
      // Use last_issuance_ts (unix seconds) or _timestamp (ISO string)
      if (data.last_issuance_ts) {
        lines.push(`Last updated: ${new Date(data.last_issuance_ts * 1000).toLocaleString()}`);
      } else if (data._timestamp) {
        lines.push(`Last updated: ${new Date(data._timestamp).toLocaleString()}`);
      }
      badge.setAttribute('data-tooltip', lines.join('\n'));
    }

    // Apply light mode
    if (document.body.classList.contains('light-bg')) {
      card.classList.add('light-bg');
    } else {
      card.classList.remove('light-bg');
    }

  } catch (error) {
    console.warn('Failed to update Token Economics card:', error);
  }
}
// ===== ES6 Module Exports =====
export {
  updateMarketConditionsCard,
  updateTokenEconomicsCard
};
