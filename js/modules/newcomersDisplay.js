// ===== Newcomers Display Module (ES6) =====
// Talent Scouting: Rising subnets with strong momentum

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

// Newcomer criteria thresholds - Katniss comes from outside Top 10
const NEWCOMER_CRITERIA = {
  minRank: 11,               // Only subnets ranked 11+ (outside top 10)
  minRankImprovement: 1,     // >= 1 rank improvement in 7d
  minPoolLiquidity: 5000     // > 5K TAO in pool (real traction)
};

// Icons for newcomers
const starIcon = `<svg class="newcomer-star-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
const fireIcon = `<svg class="newcomer-fire-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-4.97 0-9-3.58-9-8 0-2.52 1.17-5.06 3-7.5 1.09-1.45 2.41-2.74 3.8-3.8.36-.27.84-.22 1.14.12.3.34.32.84.05 1.21-.84 1.14-1.4 2.43-1.67 3.47 1.1-.91 2.5-1.5 4.18-1.5 4.14 0 7.5 3.58 7.5 8s-3.58 8-8 8z"/></svg>`;
const chartIcon = `<svg class="newcomer-chart-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v8H3v-8zm6-6h2v14H9V7zm6-4h2v18h-2V3zm6 8h2v10h-2V11z"/></svg>`;

// Eye icon for watchlist
const eyeIcon = `<svg class="newcomer-eye-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;

// Prospect titles - for confirmed rising talents
const prospectTitles = {
  1: { title: `${starIcon} TOP PROSPECT`, class: 'prospect-top' },
  2: { title: `${fireIcon} HOT PROSPECTS`, class: 'prospect-hot' },
  4: { title: `${chartIcon} PROSPECTS`, class: 'prospect-rising' }
};

// Watch list titles - for high-liquidity subnets without historical rank data
const watchListTitles = {
  1: { title: `${eyeIcon} TOP PROSPECT`, class: 'prospect-watch' },
  2: { title: `${fireIcon} STRONG TALENTS`, class: 'prospect-hot' }
};

/**
 * Build 7d rank change map from history
 * Compares oldest snapshot to current rankings
 */
function build7dRankChangeMap(history, currentSubnets) {
  const changeMap = {};

  if (!history || history.length < 2) return changeMap;

  // Build current rank map from topSubnets
  const currentRanks = {};
  currentSubnets.forEach((s, idx) => {
    currentRanks[parseInt(s.netuid)] = idx + 1;
  });

  // Get oldest snapshot (~7 days ago)
  const oldest = history[0];
  const oldEntries = oldest?.entries || [];

  // Build old rank map
  const oldRanks = {};
  oldEntries.forEach((e) => {
    const netuid = parseInt(e.id || e.netuid);
    if (netuid) oldRanks[netuid] = e.rank;
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
 * Identify newcomers based on criteria
 * Uses history data for 7d rank changes (works for all subnets, not just top 10)
 * Falls back to liquidity-based prospects if no historical data available
 */
function identifyNewcomers(topSubnets, alphaPrices, history) {
  const newcomers = [];
  const watchList = []; // Fallback for subnets without rank history

  // Build 7d rank change map from history
  const rank7dChangeMap = build7dRankChangeMap(history, topSubnets);

  // Check if we have historical data for subnets outside top 10
  const hasExtendedHistory = Object.keys(rank7dChangeMap).some(netuid => {
    const rank = topSubnets.findIndex(s => s.netuid == netuid) + 1;
    return rank >= NEWCOMER_CRITERIA.minRank && rank7dChangeMap[netuid] !== undefined;
  });

  // Check all subnets - look for rising underdogs (rank 11+)
  topSubnets.forEach((subnet, idx) => {
    const currentRank = idx + 1;
    const emissionShare = subnet.taostats_emission_share || 0;
    const alpha = alphaPrices[subnet.netuid] || {};
    const rank7dDelta = rank7dChangeMap[subnet.netuid];
    const poolLiquidity = alpha.tao_in_pool || 0;

    // Check newcomer criteria: underdogs (outside top 10) who are rising
    const isUnderdog = currentRank >= NEWCOMER_CRITERIA.minRank;
    const hasLiquidity = poolLiquidity >= NEWCOMER_CRITERIA.minPoolLiquidity;

    if (isUnderdog && hasLiquidity) {
      const hasRankData = rank7dDelta !== undefined;
      const isRising = hasRankData && rank7dDelta >= NEWCOMER_CRITERIA.minRankImprovement;

      if (hasRankData && isRising) {
        // Primary: Rising talent with confirmed momentum
        newcomers.push({
          rank: currentRank,
          netuid: subnet.netuid,
          name: subnet.subnet_name || subnet.taostats_name || `SN${subnet.netuid}`,
          share: (emissionShare * 100).toFixed(2),
          rank7dDelta: rank7dDelta,
          poolLiquidity: poolLiquidity,
          marketCapTao: alpha.market_cap_tao || 0,
          alpha: alpha,
          isWatchList: false
        });
      } else if (!hasExtendedHistory) {
        // Fallback: No historical data yet - show high-liquidity prospects
        watchList.push({
          rank: currentRank,
          netuid: subnet.netuid,
          name: subnet.subnet_name || subnet.taostats_name || `SN${subnet.netuid}`,
          share: (emissionShare * 100).toFixed(2),
          rank7dDelta: null, // Unknown
          poolLiquidity: poolLiquidity,
          marketCapTao: alpha.market_cap_tao || 0,
          alpha: alpha,
          isWatchList: true
        });
      }
    }
  });

  // Sort newcomers by rank improvement (best momentum first)
  newcomers.sort((a, b) => b.rank7dDelta - a.rank7dDelta);

  // Sort watchList by liquidity (highest first) as proxy for interest
  watchList.sort((a, b) => b.poolLiquidity - a.poolLiquidity);

  // Use newcomers if available, otherwise fallback to watchList
  const result = newcomers.length > 0 ? newcomers : watchList;

  return result.slice(0, 5); // Top 5
}

/**
 * Render newcomers table with ranking titles
 * Handles both confirmed rising talents and watch list items
 */
function renderNewcomers(displayList, newcomers, taoPrice) {
  if (newcomers.length === 0) {
    displayList.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#666;">
      ${starIcon} No rising talents found matching criteria
    </td></tr>`;
    return;
  }

  // Check if these are watch list items (no historical data)
  const isWatchListMode = newcomers[0]?.isWatchList === true;
  const titles = isWatchListMode ? watchListTitles : prospectTitles;

  const rows = newcomers.map((item, idx) => {
    const listRank = idx + 1; // Position in newcomers list (1-5)
    const poolDisplay = formatCompact(item.poolLiquidity);
    const mcapDisplay = formatCompact(item.marketCapTao);
    const mcapUsd = taoPrice ? formatUsd(item.marketCapTao * taoPrice) : '';

    // Add title row before certain positions
    let titleRow = '';
    if (titles[listRank]) {
      const prospect = titles[listRank];
      titleRow = `<tr class="prospect-title-row ${prospect.class}">
        <td colspan="6">${prospect.title}</td>
      </tr>`;
    }

    // Momentum display: show badge for confirmed, "TBD" for watch list
    const momentumDisplay = item.isWatchList
      ? `<span class="momentum-tbd" title="Historical data being collected">TBD</span>`
      : `<span class="momentum-badge">+${item.rank7dDelta}</span>`;

    return `${titleRow}<tr class="newcomer-row${item.isWatchList ? ' watchlist-row' : ''}">
      <td class="rank-col">${item.rank}</td>
      <td class="subnet-col"><span class="sn-id">SN${item.netuid}</span> ${item.name}</td>
      <td class="share-col">${item.share}%</td>
      <td class="momentum-col">${momentumDisplay}</td>
      <td class="pool-col">${poolDisplay}τ</td>
      <td class="mcap-col">${mcapDisplay}τ${mcapUsd ? ` <span class="mcap-usd">(${mcapUsd})</span>` : ''}</td>
    </tr>`;
  }).join('');

  displayList.innerHTML = rows;
}

/**
 * Load and display newcomers
 * Uses history data for 7d rank changes (works for ALL subnets, not just top 10)
 */
export async function loadNewcomersDisplay(displayList) {
  if (!displayList) return;

  try {
    // Fetch required data - using history instead of predictions
    const [subnetsRes, alphaRes, historyRes, taostatsRes] = await Promise.all([
      fetch('/api/top_subnets'),
      fetch('/api/alpha_prices'),
      fetch('/api/top_subnets_history?limit=168'),  // 7 days of hourly data
      fetch('/api/taostats')
    ]);

    let topSubnets = [];
    let alphaPrices = {};
    let history = [];
    let taoPrice = 0;

    if (subnetsRes.ok) {
      const data = await subnetsRes.json();
      topSubnets = data.top_subnets || [];
    }

    if (alphaRes.ok) {
      const data = await alphaRes.json();
      (data.subnets || []).forEach(s => {
        alphaPrices[s.netuid] = s;
      });
    }

    if (historyRes.ok) {
      const data = await historyRes.json();
      history = data.history || [];
    }

    if (taostatsRes.ok) {
      const data = await taostatsRes.json();
      taoPrice = data.price || 0;
    }

    // Identify and render newcomers using history
    const newcomers = identifyNewcomers(topSubnets, alphaPrices, history);
    renderNewcomers(displayList, newcomers, taoPrice);

    // Update timestamp
    const updateEl = document.getElementById('newcomersUpdate');
    if (updateEl) {
      updateEl.textContent = `Updated: ${new Date().toLocaleString()}`;
    }

  } catch (err) {
    console.error('Error loading newcomers:', err);
    displayList.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Error loading newcomers</td></tr>';
  }
}

/**
 * Initialize newcomers display
 */
export function initNewcomersDisplay() {
  const displayList = document.getElementById('newcomersDisplayList');
  if (!displayList) return null;

  // Initial load
  loadNewcomersDisplay(displayList);

  // Return refresh function
  return () => loadNewcomersDisplay(displayList);
}
