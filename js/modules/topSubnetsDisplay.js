// ===== Top Subnets Display Module (ES6) =====
// Display card showing top 10 subnets with toggle views: Emissions, Market Cap, Hybrid

/**
 * Format large numbers with K/M suffix
 */
function formatCompact(num) {
  if (!num || num === 0) return '-';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toFixed(1);
}

/**
 * Format USD value compactly
 */
function formatUsd(num) {
  if (!num || num === 0) return '';
  if (num >= 1000000) return '$' + (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return '$' + (num / 1000).toFixed(0) + 'K';
  return '$' + num.toFixed(0);
}

// Module state
let currentView = 'emissions';
let proUnlocked = false; // Easter egg: fake paywall
let cachedData = {
  topSubnets: [],
  alphaPrices: {},
  predictions: [],
  history: [],
  mcapHistory: [],
  taoPrice: null
};

/**
 * Fetch all required data for all views
 */
async function fetchAllData() {
  const [currentRes, historyRes, alphaRes, predictionsRes, taostatsRes, mcapHistoryRes] = await Promise.all([
    fetch('/api/top_subnets'),
    fetch('/api/top_subnets_history?limit=96'),
    fetch('/api/alpha_prices'),
    fetch('/api/subnet_predictions?top_n=20'),
    fetch('/api/taostats'),
    fetch('/api/mcap_history?limit=168')  // 7 days @ hourly
  ]);

  // Top subnets (emissions)
  if (currentRes.ok) {
    const data = await currentRes.json();
    cachedData.topSubnets = data.top_subnets || [];
  }

  // Alpha prices (market cap)
  if (alphaRes.ok) {
    const data = await alphaRes.json();
    cachedData.alphaPrices = {};
    (data.subnets || []).forEach(s => {
      cachedData.alphaPrices[s.netuid] = s;
    });
  }

  // Predictions (hybrid)
  if (predictionsRes.ok) {
    const data = await predictionsRes.json();
    cachedData.predictions = data.predictions || [];
  }

  // History (for rank changes)
  if (historyRes.ok) {
    const data = await historyRes.json();
    cachedData.history = data.history || [];
  }

  // TAO price for USD conversion
  if (taostatsRes.ok) {
    const data = await taostatsRes.json();
    cachedData.taoPrice = data.price || null;
  }

  // MCap history (for MCap rank changes)
  if (mcapHistoryRes.ok) {
    const data = await mcapHistoryRes.json();
    cachedData.mcapHistory = data.history || [];
  }
}

/**
 * Build previous ranking map from history
 */
function buildPrevRankMap() {
  const prevRankMap = {};
  if (cachedData.history.length >= 1) {
    const prevSnapshot = cachedData.history[0];
    const prevSubnets = prevSnapshot.entries || prevSnapshot.top_subnets || [];
    prevSubnets.forEach((s, idx) => {
      const netuid = s.id || s.netuid;
      if (netuid) prevRankMap[parseInt(netuid)] = idx + 1;
    });
  }
  return prevRankMap;
}

/**
 * Build 7-day MCap rank change map
 * Returns: { netuid: delta } where positive = moved up, negative = moved down
 */
function buildMcap7dChangeMap() {
  const changeMap = {};
  const history = cachedData.mcapHistory;

  if (history.length < 2) return changeMap;

  // Current = most recent snapshot (last in array)
  const current = history[history.length - 1];
  // 7d ago = oldest snapshot we have (first in array, up to 7d back)
  const oldest = history[0];

  // Build current rank map
  const currentRanks = {};
  (current.entries || []).forEach((s, idx) => {
    const netuid = parseInt(s.id || s.netuid);
    if (netuid) currentRanks[netuid] = idx + 1;
  });

  // Build old rank map
  const oldRanks = {};
  (oldest.entries || []).forEach((s, idx) => {
    const netuid = parseInt(s.id || s.netuid);
    if (netuid) oldRanks[netuid] = idx + 1;
  });

  // Calculate delta for each subnet in current rankings
  for (const netuid of Object.keys(currentRanks)) {
    const nid = parseInt(netuid);
    const currRank = currentRanks[nid];
    const oldRank = oldRanks[nid];

    if (oldRank !== undefined) {
      // Delta: positive = improved (was lower rank, now higher)
      changeMap[nid] = oldRank - currRank;
    }
  }

  return changeMap;
}

/**
 * Get sorted data based on current view
 */
function getSortedData() {
  const alphaPrices = cachedData.alphaPrices;

  // Build predictions lookup for momentum data
  const predictionsMap = {};
  cachedData.predictions.forEach(p => {
    predictionsMap[p.netuid] = p;
  });

  if (currentView === 'emissions') {
    // Use top_subnets data (already sorted by emission)
    return cachedData.topSubnets.slice(0, 10).map((subnet, idx) => ({
      rank: idx + 1,
      netuid: subnet.netuid,
      name: subnet.subnet_name || subnet.taostats_name || `SN${subnet.netuid}`,
      share: ((subnet.taostats_emission_share || 0) * 100).toFixed(2),
      daily: (subnet.estimated_emission_daily || 0).toFixed(2),
      alpha: alphaPrices[subnet.netuid] || {},
      trend: predictionsMap[subnet.netuid]?.trend_indicators
    }));
  }

  if (currentView === 'mcap') {
    // Sort alpha prices by market cap
    const sorted = Object.values(alphaPrices)
      .filter(s => s.market_cap_tao && s.market_cap_tao > 0)
      .sort((a, b) => (b.market_cap_tao || 0) - (a.market_cap_tao || 0))
      .slice(0, 10);

    // alpha_prices now includes emission data merged from top_subnets KV
    // Fallback to topSubnets for any missing data
    const topSubnetsMap = {};
    cachedData.topSubnets.forEach(s => {
      topSubnetsMap[s.netuid] = s;
    });

    return sorted.map((alpha, idx) => {
      // Primary source: emission data merged into alpha_prices
      // Fallback: topSubnets data for subnets in top emissions
      const fallback = topSubnetsMap[alpha.netuid] || {};
      const emissionShare = alpha.emission_share ?? fallback.taostats_emission_share ?? 0;
      const emissionDaily = alpha.emission_daily ?? fallback.estimated_emission_daily ?? 0;

      return {
        rank: idx + 1,
        netuid: alpha.netuid,
        name: alpha.name || fallback.subnet_name || `SN${alpha.netuid}`,
        share: (emissionShare * 100).toFixed(2),
        daily: emissionDaily.toFixed(2),
        alpha: alpha,
        trend: predictionsMap[alpha.netuid]?.trend_indicators
      };
    });
  }

  if (currentView === 'hybrid') {
    // Use prediction probabilities
    const predictions = cachedData.predictions.slice(0, 10);

    return predictions.map((pred, idx) => {
      const alpha = alphaPrices[pred.netuid] || {};
      return {
        rank: idx + 1,
        netuid: pred.netuid,
        name: pred.subnet_name || `SN${pred.netuid}`,
        probability: pred.probability,
        daily: pred.current_emission_daily ? pred.current_emission_daily.toFixed(2) : '-',
        alpha: alpha,
        trend: pred.trend_indicators
      };
    });
  }

  return [];
}

/**
 * Update table header based on view
 */
function updateTableHeader() {
  const shareHeader = document.querySelector('.subnets-display-table th.share-col');
  if (!shareHeader) return;

  if (currentView === 'hybrid') {
    shareHeader.textContent = '→#1';
    shareHeader.classList.add('prob-header');
  } else {
    shareHeader.textContent = 'Share';
    shareHeader.classList.remove('prob-header');
  }
}

/**
 * Render the table rows
 */
function renderTable(displayList) {
  const data = getSortedData();
  const prevRankMap = buildPrevRankMap();
  const mcap7dChangeMap = buildMcap7dChangeMap();

  // Update header for current view
  updateTableHeader();

  if (data.length === 0) {
    displayList.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">No data available</td></tr>';
    return;
  }

  const taoPrice = cachedData.taoPrice || 0;

  const rows = data.map(item => {
    const alphaPrice = item.alpha.alpha_price ? item.alpha.alpha_price.toFixed(4) : '-';
    const taoInPool = formatCompact(item.alpha.tao_in_pool);
    const marketCapTao = item.alpha.market_cap_tao || 0;
    const marketCap = formatCompact(marketCapTao);
    const marketCapUsd = taoPrice ? formatUsd(marketCapTao * taoPrice) : '';

    // Rank change indicator (not for hybrid - it uses probability column)
    let changeHtml = '';
    const prevRank = prevRankMap[item.netuid];

    if (currentView !== 'hybrid') {
      if (prevRank === undefined && Object.keys(prevRankMap).length > 0) {
        changeHtml = ' <span class="rank-new">NEW</span>';
      } else if (prevRank > item.rank) {
        const diff = prevRank - item.rank;
        changeHtml = ` <span class="rank-up">▲${diff}</span>`;
      } else if (prevRank < item.rank) {
        const diff = item.rank - prevRank;
        changeHtml = ` <span class="rank-down">▼${diff}</span>`;
      }
    }

    // 7-day rank change - different source per view
    // Emissions/Hybrid: ML predictions (emission ranking based)
    // MCap: MCap history (market cap ranking based)
    let rank7dHtml = '';
    let rankDelta7d = 0;

    if (currentView === 'mcap') {
      // Use MCap history for MCap view
      rankDelta7d = mcap7dChangeMap[item.netuid] || 0;
    } else {
      // Use ML predictions for emissions/hybrid
      rankDelta7d = item.trend?.rank_delta_7d || 0;
    }

    if (rankDelta7d !== 0) {
      const sign = rankDelta7d > 0 ? '+' : '';
      const colorClass = rankDelta7d > 0 ? 'rank-7d-up' : 'rank-7d-down';
      rank7dHtml = `<div class="rank-7d ${colorClass}">7d: ${sign}${rankDelta7d}</div>`;
    }

    // Third column: Share (%) or Probability (%) depending on view
    let thirdColValue, thirdColClass;
    if (currentView === 'hybrid') {
      thirdColValue = item.probability ? `${(item.probability * 100).toFixed(1)}%` : '-';
      thirdColClass = 'share-col prob-col';
    } else {
      thirdColValue = `${item.share}%`;
      thirdColClass = 'share-col';
    }

    // For hybrid view: blur rows 4-10 (teaser mode) - unless unlocked
    const isBlurred = currentView === 'hybrid' && item.rank > 3 && !proUnlocked;

    // Alert: Zero emissions in Market Cap view = potential overvaluation
    const isZeroEmission = currentView === 'mcap' && parseFloat(item.daily) === 0;

    // Momentum indicator for strong movers (2+ rank change in 7d)
    // Uses rankDelta7d which is already calculated per-view above
    let momentumClass = '';
    if (rankDelta7d >= 2) {
      momentumClass = 'momentum-up';
    } else if (rankDelta7d <= -2) {
      momentumClass = 'momentum-down';
    }

    // Build row classes
    let rowClass = '';
    if (isBlurred) rowClass = 'blurred-row';
    else if (isZeroEmission) rowClass = 'zero-emission-row';
    if (momentumClass) rowClass += ' ' + momentumClass;

    // Warning indicator for zero emission subnets
    const emissionWarning = isZeroEmission ? ' <span class="emission-warning" title="No emissions - speculative value">⚠️</span>' : '';

    return `<tr class="${rowClass}">
      <td class="rank-col">${item.rank}${changeHtml}${rank7dHtml}</td>
      <td class="subnet-col"><span class="sn-id">SN${item.netuid}</span> ${item.name}${emissionWarning}</td>
      <td class="${thirdColClass}">${thirdColValue}</td>
      <td class="daily-col">${isZeroEmission ? '<span class="zero-emission">0.00τ</span>' : item.daily + 'τ'}</td>
      <td class="price-col">${alphaPrice === '-' ? '-' : alphaPrice + 'τ'}</td>
      <td class="pool-col">${taoInPool === '-' ? '-' : taoInPool + 'τ'}</td>
      <td class="mcap-col">${marketCap === '-' ? '-' : `${marketCap}τ${marketCapUsd ? ` <span class="mcap-usd">(${marketCapUsd})</span>` : ''}`}</td>
    </tr>`;
  }).join('');

  // Add Pro overlay after row 3 for hybrid view (unless unlocked)
  if (currentView === 'hybrid' && data.length > 3 && !proUnlocked) {
    const proOverlay = `<tr class="pro-overlay-row">
      <td colspan="7">
        <div class="pro-overlay" id="proOverlayBtn" style="cursor:pointer;">
          <span class="pro-badge">PRO</span>
          <span class="pro-text">Unlock full ML predictions <span class="pro-joke">[jk, just click → this is open source]</span></span>
        </div>
      </td>
    </tr>`;
    // Insert after 3rd row
    const rowsArray = rows.split('</tr>');
    rowsArray.splice(3, 0, '</tr>' + proOverlay);
    displayList.innerHTML = rowsArray.join('</tr>');

    // Add click handler to unlock
    const overlayBtn = document.getElementById('proOverlayBtn');
    if (overlayBtn) {
      overlayBtn.addEventListener('click', () => {
        proUnlocked = true;
        renderTable(displayList);
      });
    }
  } else {
    displayList.innerHTML = rows;
  }
}

/**
 * Handle view toggle
 */
function setupViewToggle(displayList) {
  const toggleContainer = document.getElementById('subnetsViewToggle');
  if (!toggleContainer) return;

  toggleContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;

    const view = btn.dataset.view;
    if (view === currentView) return;

    // Update active state
    toggleContainer.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Switch view
    currentView = view;
    renderTable(displayList);
  });
}

/**
 * Load and display top 10 subnets with ranking changes and alpha prices
 * @param {HTMLElement} displayList - The tbody element to populate
 */
export async function loadTopSubnetsDisplay(displayList) {
  if (!displayList) return;

  try {
    await fetchAllData();
    renderTable(displayList);

    // Update timestamp
    const updateEl = document.getElementById('subnetsUpdate');
    if (updateEl) {
      const now = new Date();
      updateEl.textContent = `Updated: ${now.toLocaleDateString('de-DE')}`;
    }
  } catch (err) {
    console.error('Error loading top subnets for display:', err);
    displayList.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Error loading subnet data</td></tr>';
  }
}

/**
 * Initialize top subnets display card
 * @returns {Function|null} The refresh function, or null if elements not found
 */
export function initTopSubnetsDisplay() {
  const displayTable = document.getElementById('topSubnetsDisplayTable');
  const displayList = document.getElementById('topSubnetsDisplayList');

  if (!displayTable || !displayList) return null;

  // Setup view toggle buttons
  setupViewToggle(displayList);

  // Initial load
  loadTopSubnetsDisplay(displayList);

  // Return the refresh function for external use
  return () => loadTopSubnetsDisplay(displayList);
}
