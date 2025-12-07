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

  // Update volume change
  const volumeMetric = card.querySelector('#marketVolume');
  if (volumeMetric && volumeData) {
    const volChange = volumeData.change || 0;
    const volStr = volChange >= 0 ? `+${volChange.toFixed(1)}%` : `${volChange.toFixed(1)}%`;
    volumeMetric.querySelector('.metric-value').textContent = volStr;
  }

  // Update price change
  const priceMetric = card.querySelector('#marketPrice');
  if (priceMetric && priceChange24h !== null) {
    const priceStr = priceChange24h >= 0 ? `+${priceChange24h.toFixed(1)}%` : `${priceChange24h.toFixed(1)}%`;
    priceMetric.querySelector('.metric-value').textContent = priceStr;
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

    phaseSection.textContent = phaseLines.join('\n');

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

  // Update phase badge
  const phaseMetric = card.querySelector('#marketPhase');
  if (phaseMetric) {
    let phaseLabel = 'Neutral';
    if (tooltip.includes('Bullish')) phaseLabel = 'Bullish';
    else if (tooltip.includes('Bearish')) phaseLabel = 'Bearish';
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
 * Update Token Economics Card
 */
async function updateTokenEconomicsCard() {
  const card = document.getElementById('tokenEconomicsCard');
  if (!card) return;

  try {
    const res = await fetch('/api/network');
    if (!res.ok) throw new Error('Network API failed');
    const data = await res.json();

    // Daily Emission
    const emissionEl = card.querySelector('#dailyEmissionValue');
    if (emissionEl && data.emission) {
      emissionEl.textContent = `${Number(data.emission).toLocaleString()} τ`;
    }

    // Issued percentage
    const issuedEl = card.querySelector('#issuedPercentValue');
    if (issuedEl && data.totalIssuance && data.halvingThresholds) {
      const maxSupply = 21000000;
      const issuedPct = (data.totalIssuanceHuman / maxSupply) * 100;
      issuedEl.textContent = `${issuedPct.toFixed(2)}%`;
    }

    // Halving removed - we have the pill for that

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

// Hook into init and refresh to update Token Economics Card
if (typeof window !== 'undefined') {
  // Add to refresh cycle
  const originalRefresh = window.refreshDashboard;
  if (originalRefresh) {
    window.refreshDashboard = async function() {
      await originalRefresh.apply(this, arguments);
      try {
        await updateTokenEconomicsCard();
      } catch (e) {
        console.warn('Failed to update Token Economics card:', e);
      }
    };
  }
}
