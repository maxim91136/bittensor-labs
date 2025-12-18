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
const hourglassIcon = `<svg class="newcomer-hourglass-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2H6zm10 14.5V20H8v-3.5l4-4 4 4zm-4-5l-4-4V4h8v3.5l-4 4z"/></svg>`;

// Prospect titles - for confirmed rising talents
const prospectTitles = {
  1: { title: `${starIcon} TOP PROSPECT`, class: 'prospect-top' },
  2: { title: `${fireIcon} HOT PROSPECTS`, class: 'prospect-hot' },
  4: { title: `${chartIcon} PROSPECTS`, class: 'prospect-rising' }
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
 * Returns { newcomers: [], isCollectingData: boolean }
 */
function identifyNewcomers(topSubnets, alphaPrices, history) {
  const newcomers = [];

  // Build 7d rank change map from history
  const rank7dChangeMap = build7dRankChangeMap(history, topSubnets);

  // Check if we have historical data for subnets outside top 10
  const hasExtendedHistory = Object.keys(rank7dChangeMap).some(netuid => {
    const rank = topSubnets.findIndex(s => s.netuid == netuid) + 1;
    return rank >= NEWCOMER_CRITERIA.minRank && rank7dChangeMap[netuid] !== undefined;
  });

  // If no extended history yet, return collecting data state (Truth)
  if (!hasExtendedHistory) {
    return { newcomers: [], isCollectingData: true };
  }

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
    const hasRankData = rank7dDelta !== undefined;
    const isRising = hasRankData && rank7dDelta >= NEWCOMER_CRITERIA.minRankImprovement;

    if (isUnderdog && hasLiquidity && isRising) {
      newcomers.push({
        rank: currentRank,
        netuid: subnet.netuid,
        name: subnet.subnet_name || subnet.taostats_name || `SN${subnet.netuid}`,
        share: (emissionShare * 100).toFixed(2),
        rank7dDelta: rank7dDelta,
        poolLiquidity: poolLiquidity,
        marketCapTao: alpha.market_cap_tao || 0,
        alpha: alpha,
        isDeepUnderdog: currentRank >= 30  // Flag for deep underdogs (Katniss-style)
      });
    }
  });

  // Hybrid sorting: Prioritize deep underdogs with big moves
  // A +10 move from rank 60 is more impressive than +10 from rank 15
  newcomers.sort((a, b) => {
    const aScore = a.rank7dDelta * (a.isDeepUnderdog ? 1.5 : 1);
    const bScore = b.rank7dDelta * (b.isDeepUnderdog ? 1.5 : 1);
    return bScore - aScore;
  });

  return { newcomers: newcomers.slice(0, 5), isCollectingData: false };
}

/**
 * Render newcomers table with ranking titles
 * Shows confirmed rising talents or collecting data message
 */
function renderNewcomers(displayList, newcomers, taoPrice, isCollectingData = false) {
  // Show collecting data message if no extended history yet (Truth)
  if (isCollectingData) {
    displayList.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#888;">
      ${hourglassIcon}
      <div style="margin-top:10px;font-size:1.1em;">Collecting momentum data...</div>
      <div style="margin-top:5px;font-size:0.85em;opacity:0.7;">Rising talents will appear once we have 7d rank history</div>
    </td></tr>`;
    return;
  }

  if (newcomers.length === 0) {
    displayList.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#666;">
      ${starIcon} No rising talents found matching criteria
    </td></tr>`;
    return;
  }

  const rows = newcomers.map((item, idx) => {
    const listRank = idx + 1; // Position in newcomers list (1-5)
    const poolDisplay = formatCompact(item.poolLiquidity);
    const mcapDisplay = formatCompact(item.marketCapTao);
    const mcapUsd = taoPrice ? formatUsd(item.marketCapTao * taoPrice) : '';

    // Add title row before certain positions
    let titleRow = '';
    if (prospectTitles[listRank]) {
      const prospect = prospectTitles[listRank];
      titleRow = `<tr class="prospect-title-row ${prospect.class}">
        <td colspan="6">${prospect.title}</td>
      </tr>`;
    }

    // Momentum display with rank improvement (deep underdogs get highlight)
    const momentumDisplay = `<span class="momentum-badge${item.isDeepUnderdog ? ' deep-underdog' : ''}">+${item.rank7dDelta}</span>`;

    return `${titleRow}<tr class="newcomer-row${item.isDeepUnderdog ? ' deep-underdog-row' : ''}">
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
    const { newcomers, isCollectingData } = identifyNewcomers(topSubnets, alphaPrices, history);
    renderNewcomers(displayList, newcomers, taoPrice, isCollectingData);

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
