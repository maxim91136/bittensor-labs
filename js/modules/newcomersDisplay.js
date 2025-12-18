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

// PRO unlock state
let proUnlocked = false;

// Icons for newcomers
const starIcon = `<svg class="newcomer-star-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
const fireIcon = `<svg class="newcomer-fire-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-4.97 0-9-3.58-9-8 0-2.52 1.17-5.06 3-7.5 1.09-1.45 2.41-2.74 3.8-3.8.36-.27.84-.22 1.14.12.3.34.32.84.05 1.21-.84 1.14-1.4 2.43-1.67 3.47 1.1-.91 2.5-1.5 4.18-1.5 4.14 0 7.5 3.58 7.5 8s-3.58 8-8 8z"/></svg>`;
const chartIcon = `<svg class="newcomer-chart-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v8H3v-8zm6-6h2v14H9V7zm6-4h2v18h-2V3zm6 8h2v10h-2V11z"/></svg>`;
const hourglassIcon = `<svg class="newcomer-hourglass-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2H6zm10 14.5V20H8v-3.5l4-4 4 4zm-4-5l-4-4V4h8v3.5l-4 4z"/></svg>`;
const fallenAngelIcon = `<svg class="newcomer-fallen-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;

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
 * Returns { prospects: [], fallenAngels: [], isCollectingData: boolean }
 */
function identifyNewcomers(topSubnets, alphaPrices, history) {
  const prospects = [];
  const fallenAngels = [];

  // Build 7d rank change map from history
  const rank7dChangeMap = build7dRankChangeMap(history, topSubnets);

  // Check if we have historical data for subnets outside top 10
  const hasExtendedHistory = Object.keys(rank7dChangeMap).some(netuid => {
    const rank = topSubnets.findIndex(s => s.netuid == netuid) + 1;
    return rank >= NEWCOMER_CRITERIA.minRank && rank7dChangeMap[netuid] !== undefined;
  });

  // Collect all eligible subnets (underdogs with liquidity)
  topSubnets.forEach((subnet, idx) => {
    const currentRank = idx + 1;
    const emissionShare = subnet.taostats_emission_share || 0;
    const alpha = alphaPrices[subnet.netuid] || {};
    const rank7dDelta = rank7dChangeMap[subnet.netuid];
    const poolLiquidity = alpha.tao_in_pool || 0;

    // Check basic criteria: underdogs (outside top 10) with liquidity
    const isUnderdog = currentRank >= NEWCOMER_CRITERIA.minRank;
    const hasLiquidity = poolLiquidity >= NEWCOMER_CRITERIA.minPoolLiquidity;
    const hasRankData = rank7dDelta !== undefined;
    const isRising = hasRankData && rank7dDelta >= NEWCOMER_CRITERIA.minRankImprovement;
    const isFalling = hasRankData && rank7dDelta <= -NEWCOMER_CRITERIA.minRankImprovement;

    if (isUnderdog && hasLiquidity) {
      const entry = {
        rank: currentRank,
        netuid: subnet.netuid,
        name: subnet.subnet_name || subnet.taostats_name || `SN${subnet.netuid}`,
        share: (emissionShare * 100).toFixed(2),
        rank7dDelta: hasRankData ? rank7dDelta : null,
        poolLiquidity: poolLiquidity,
        marketCapTao: alpha.market_cap_tao || 0,
        alpha: alpha,
        isDeepUnderdog: currentRank >= 30
      };

      if (hasExtendedHistory) {
        // With data: categorize into rising vs falling
        if (isRising) {
          prospects.push(entry);
        } else if (isFalling) {
          fallenAngels.push(entry);
        }
      } else {
        // Collecting data: show all as watch list
        prospects.push(entry);
      }
    }
  });

  // Sort prospects by momentum (or liquidity if no data)
  if (hasExtendedHistory) {
    prospects.sort((a, b) => {
      const aScore = (a.rank7dDelta || 0) * (a.isDeepUnderdog ? 1.5 : 1);
      const bScore = (b.rank7dDelta || 0) * (b.isDeepUnderdog ? 1.5 : 1);
      return bScore - aScore;
    });
    // Sort fallen angels by how much they fell (most negative first)
    fallenAngels.sort((a, b) => (a.rank7dDelta || 0) - (b.rank7dDelta || 0));
  } else {
    prospects.sort((a, b) => b.poolLiquidity - a.poolLiquidity);
  }

  return {
    prospects: prospects.slice(0, 5),
    fallenAngels: fallenAngels.slice(0, 2),
    isCollectingData: !hasExtendedHistory
  };
}

/**
 * Render newcomers table with ranking titles
 * Shows graded prospect titles (TOP PROSPECT → HOT PROSPECTS → PROSPECTS) + FALLEN ANGELS
 */
function renderNewcomers(displayList, prospects, fallenAngels, taoPrice, isCollectingData = false) {
  if (prospects.length === 0 && fallenAngels.length === 0) {
    displayList.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#666;">
      ${starIcon} No rising talents found matching criteria
    </td></tr>`;
    return;
  }

  // PRO overlay HTML (only show if not unlocked)
  const proOverlay = proUnlocked ? '' : `<tr class="pro-overlay-row">
    <td colspan="6">
      <div class="pro-overlay" id="newcomersProOverlayBtn" style="cursor:pointer;">
        <span class="pro-badge">PRO</span>
        <span class="pro-text">Unlock full talent scouting</span>
        <span class="pro-joke">[jk, just click → this is open source]</span>
      </div>
    </td>
  </tr>`;

  let html = '';
  let totalIdx = 0;

  // Intro header when COLLECTING data - we don't know yet if they're prospects or fallen angels
  if (isCollectingData && prospects.length > 0) {
    html += `<tr class="prospect-intro-row">
      <td colspan="6">TOP PROSPECT <span class="or-text">or</span> FALLEN ANGEL<span class="question-mark">?!</span></td>
    </tr>`;
  }

  // Render prospects with graded titles (TOP PROSPECT → HOT PROSPECTS → PROSPECTS)
  // Only show graded titles when we have momentum data (not during collection)
  prospects.forEach((item, idx) => {
    const listRank = idx + 1;
    totalIdx++;
    const poolDisplay = formatCompact(item.poolLiquidity);
    const mcapDisplay = formatCompact(item.marketCapTao);
    const mcapUsd = taoPrice ? formatUsd(item.marketCapTao * taoPrice) : '';

    // Blur rows 2+ (teaser mode) unless unlocked
    const isBlurred = listRank > 1 && !proUnlocked;

    // Add graded title row before certain positions (only when we have momentum data)
    if (!isCollectingData && prospectTitles[listRank]) {
      const prospect = prospectTitles[listRank];
      const titleBlurClass = isBlurred ? ' blurred-row' : '';
      html += `<tr class="prospect-title-row ${prospect.class}${titleBlurClass}">
        <td colspan="6">${prospect.title}</td>
      </tr>`;
    }

    // Momentum display - show "..." if no data yet
    const momentumDisplay = item.rank7dDelta !== null
      ? `<span class="momentum-badge rising${item.isDeepUnderdog ? ' deep-underdog' : ''}">+${item.rank7dDelta}</span>`
      : `<span class="momentum-tbd">...</span>`;
    const rowClass = isBlurred ? 'newcomer-row blurred-row' : 'newcomer-row';

    html += `<tr class="${rowClass}${item.isDeepUnderdog ? ' deep-underdog-row' : ''}">
      <td class="rank-col">${item.rank}</td>
      <td class="subnet-col"><span class="sn-id">SN${item.netuid}</span> ${item.name}</td>
      <td class="share-col">${item.share}%</td>
      <td class="momentum-col">${momentumDisplay}</td>
      <td class="pool-col">${poolDisplay}τ</td>
      <td class="mcap-col">${mcapDisplay}τ${mcapUsd ? ` <span class="mcap-usd">(${mcapUsd})</span>` : ''}</td>
    </tr>`;

    // Insert PRO overlay AFTER first data row
    if (listRank === 1) {
      html += proOverlay;
    }
  });

  // Render FALLEN ANGELS section (only when we have momentum data)
  if (fallenAngels.length > 0 && !isCollectingData) {
    const titleBlurred = !proUnlocked ? ' blurred-row' : '';
    html += `<tr class="prospect-title-row prospect-fallen${titleBlurred}">
      <td colspan="6">${fallenAngelIcon} FALLEN ANGELS</td>
    </tr>`;

    fallenAngels.forEach((item) => {
      totalIdx++;
      const poolDisplay = formatCompact(item.poolLiquidity);
      const mcapDisplay = formatCompact(item.marketCapTao);
      const mcapUsd = taoPrice ? formatUsd(item.marketCapTao * taoPrice) : '';
      const isBlurred = !proUnlocked;

      const momentumDisplay = `<span class="momentum-badge falling">${item.rank7dDelta}</span>`;
      const rowClass = isBlurred ? 'newcomer-row blurred-row' : 'newcomer-row';

      html += `<tr class="${rowClass}">
        <td class="rank-col">${item.rank}</td>
        <td class="subnet-col"><span class="sn-id">SN${item.netuid}</span> ${item.name}</td>
        <td class="share-col">${item.share}%</td>
        <td class="momentum-col">${momentumDisplay}</td>
        <td class="pool-col">${poolDisplay}τ</td>
        <td class="mcap-col">${mcapDisplay}τ${mcapUsd ? ` <span class="mcap-usd">(${mcapUsd})</span>` : ''}</td>
      </tr>`;
    });
  }

  displayList.innerHTML = html;

  // Add click handler for PRO unlock
  const proBtn = document.getElementById('newcomersProOverlayBtn');
  if (proBtn) {
    proBtn.addEventListener('click', () => {
      proUnlocked = true;
      renderNewcomers(displayList, prospects, fallenAngels, taoPrice, isCollectingData);
    });
  }
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
    const { prospects, fallenAngels, isCollectingData } = identifyNewcomers(topSubnets, alphaPrices, history);
    renderNewcomers(displayList, prospects, fallenAngels, taoPrice, isCollectingData);

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
