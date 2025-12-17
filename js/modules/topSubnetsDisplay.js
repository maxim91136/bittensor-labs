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

// Module state
let currentView = 'emissions';
let cachedData = {
  topSubnets: [],
  alphaPrices: {},
  predictions: [],
  history: []
};

/**
 * Fetch all required data for all views
 */
async function fetchAllData() {
  const [currentRes, historyRes, alphaRes, predictionsRes] = await Promise.all([
    fetch('/api/top_subnets'),
    fetch('/api/top_subnets_history?limit=96'),
    fetch('/api/alpha_prices'),
    fetch('/api/subnet_predictions?top_n=20')
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
 * Get sorted data based on current view
 */
function getSortedData() {
  const alphaPrices = cachedData.alphaPrices;

  if (currentView === 'emissions') {
    // Use top_subnets data (already sorted by emission)
    return cachedData.topSubnets.slice(0, 10).map((subnet, idx) => ({
      rank: idx + 1,
      netuid: subnet.netuid,
      name: subnet.subnet_name || subnet.taostats_name || `SN${subnet.netuid}`,
      share: ((subnet.taostats_emission_share || 0) * 100).toFixed(2),
      daily: (subnet.estimated_emission_daily || 0).toFixed(2),
      alpha: alphaPrices[subnet.netuid] || {}
    }));
  }

  if (currentView === 'mcap') {
    // Sort alpha prices by market cap
    const sorted = Object.values(alphaPrices)
      .filter(s => s.market_cap_tao && s.market_cap_tao > 0)
      .sort((a, b) => (b.market_cap_tao || 0) - (a.market_cap_tao || 0))
      .slice(0, 10);

    // Enrich with emission data
    const emissionMap = {};
    cachedData.topSubnets.forEach(s => {
      emissionMap[s.netuid] = s;
    });

    return sorted.map((alpha, idx) => {
      const emission = emissionMap[alpha.netuid] || {};
      return {
        rank: idx + 1,
        netuid: alpha.netuid,
        name: alpha.name || emission.subnet_name || `SN${alpha.netuid}`,
        share: ((emission.taostats_emission_share || 0) * 100).toFixed(2),
        daily: (emission.estimated_emission_daily || 0).toFixed(2),
        alpha: alpha
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

  // Update header for current view
  updateTableHeader();

  if (data.length === 0) {
    displayList.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">No data available</td></tr>';
    return;
  }

  const rows = data.map(item => {
    const alphaPrice = item.alpha.alpha_price ? item.alpha.alpha_price.toFixed(4) : '-';
    const taoInPool = formatCompact(item.alpha.tao_in_pool);
    const marketCap = formatCompact(item.alpha.market_cap_tao);

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

    // Third column: Share (%) or Probability (%) depending on view
    let thirdColValue, thirdColClass;
    if (currentView === 'hybrid') {
      thirdColValue = item.probability ? `${(item.probability * 100).toFixed(1)}%` : '-';
      thirdColClass = 'share-col prob-col';
    } else {
      thirdColValue = `${item.share}%`;
      thirdColClass = 'share-col';
    }

    // For hybrid view: blur rows 4-10 (teaser mode)
    const isBlurred = currentView === 'hybrid' && item.rank > 3;
    const rowClass = isBlurred ? 'blurred-row' : '';

    return `<tr class="${rowClass}">
      <td class="rank-col">${item.rank}${changeHtml}</td>
      <td class="subnet-col"><span class="sn-id">SN${item.netuid}</span> ${item.name}</td>
      <td class="${thirdColClass}">${thirdColValue}</td>
      <td class="daily-col">${item.daily}τ</td>
      <td class="price-col">${alphaPrice}</td>
      <td class="pool-col">${taoInPool}</td>
      <td class="mcap-col">${marketCap}</td>
    </tr>`;
  }).join('');

  // Add Pro overlay after row 3 for hybrid view
  if (currentView === 'hybrid' && data.length > 3) {
    const proOverlay = `<tr class="pro-overlay-row">
      <td colspan="7">
        <div class="pro-overlay">
          <span class="pro-badge">PRO</span>
          <span class="pro-text">Unlock full ML predictions</span>
        </div>
      </td>
    </tr>`;
    // Insert after 3rd row
    const rowsArray = rows.split('</tr>');
    rowsArray.splice(3, 0, '</tr>' + proOverlay);
    displayList.innerHTML = rowsArray.join('</tr>');
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
