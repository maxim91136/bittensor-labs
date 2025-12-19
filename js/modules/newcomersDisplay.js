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

/**
 * Get emission health zone based on share percentage
 * Thresholds per Gemini analysis:
 * - >= 1.0%: Healthy (miners profitable)
 * - 0.5-1.0%: Rising (approaching milestone)
 * - 0.2-0.5%: Struggling (miner attrition risk)
 * - < 0.2%: Death zone (miners leaving)
 */
function getEmissionHealth(sharePct) {
  const share = parseFloat(sharePct) || 0;
  if (share >= 1.0) return { zone: 'healthy', icon: '🟢', label: 'Healthy', class: 'emission-healthy' };
  if (share >= 0.5) return { zone: 'rising', icon: '🟡', label: 'Rising', class: 'emission-rising' };
  if (share >= 0.2) return { zone: 'struggling', icon: '🟠', label: 'Struggling', class: 'emission-struggling' };
  return { zone: 'critical', icon: '🔴', label: 'Critical', class: 'emission-critical' };
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
 * Build emission trend map from history
 * Compares oldest emission to current to determine direction
 * Returns: { netuid: { oldShare, delta, trend: 'rising'|'falling'|'stable' } }
 */
function buildEmissionTrendMap(history, currentSubnets) {
  const trendMap = {};

  if (!history || history.length < 2) return trendMap;

  // Get oldest snapshot for baseline
  const oldest = history[0];
  const oldEntries = oldest?.entries || [];

  // Build old emission map (value = daily emission τ)
  // Daily emission ~3600τ total, so share = value/3600
  const DAILY_TOTAL = 3600;
  const oldEmissions = {};
  oldEntries.forEach(e => {
    const netuid = parseInt(e.id || e.netuid);
    if (netuid && e.value) {
      oldEmissions[netuid] = e.value / DAILY_TOTAL; // Convert to share
    }
  });

  // Calculate trend for each current subnet
  currentSubnets.forEach(subnet => {
    const netuid = parseInt(subnet.netuid);
    const currentShare = subnet.taostats_emission_share || 0;
    const oldShare = oldEmissions[netuid];

    if (oldShare !== undefined && currentShare > 0) {
      const delta = currentShare - oldShare;
      const deltaPct = delta * 100; // Convert to percentage points

      // Threshold: ±0.05% is considered significant movement
      let trend = 'stable';
      if (deltaPct >= 0.05) trend = 'rising';
      else if (deltaPct <= -0.05) trend = 'falling';

      trendMap[netuid] = {
        oldShare: oldShare * 100,  // Store as percentage
        delta: deltaPct,
        trend: trend
      };
    }
  });

  return trendMap;
}

/**
 * Build peak rank map from ALL history
 * Returns the best (lowest) rank each subnet ever achieved
 * Used to detect "fallen giants" - subnets that were once Top 10
 */
function buildPeakRankMap(history) {
  const peakMap = {};

  if (!history || history.length === 0) return peakMap;

  // Scan all snapshots to find the best rank for each subnet
  history.forEach(snapshot => {
    const entries = snapshot?.entries || [];
    entries.forEach(e => {
      const netuid = parseInt(e.id || e.netuid);
      const rank = e.rank;
      if (netuid && rank) {
        // Lower rank number = better position
        if (!peakMap[netuid] || rank < peakMap[netuid]) {
          peakMap[netuid] = rank;
        }
      }
    });
  });

  return peakMap;
}

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
 * Uses PREDICTIONS API for 7d rank changes (has data for 50+ subnets)
 * Uses HISTORY for fallen giant detection (peak rank tracking)
 * Returns { prospects: [], fallenAngels: [], isCollectingData: boolean }
 */
function identifyNewcomers(topSubnets, alphaPrices, predictions, fullHistory) {
  const prospects = [];
  const fallenAngels = [];

  // Build prediction map by netuid for quick lookup
  const predictionMap = {};
  predictions.forEach(p => {
    predictionMap[p.netuid] = p;
  });

  // Build peak rank map from ALL history (for fallen giant detection)
  const peakRankMap = buildPeakRankMap(fullHistory);

  // Build emission trend map from history
  const emissionTrendMap = buildEmissionTrendMap(fullHistory, topSubnets);

  // Check if we have prediction data for subnets outside top 10
  const hasPredictionData = predictions.some(p => {
    const rank = topSubnets.findIndex(s => s.netuid == p.netuid) + 1;
    return rank >= NEWCOMER_CRITERIA.minRank && p.trend_indicators?.rank_delta_7d !== undefined;
  });

  // Collect all eligible subnets (underdogs with liquidity)
  topSubnets.forEach((subnet, idx) => {
    const currentRank = idx + 1;
    const emissionShare = subnet.taostats_emission_share || 0;
    const alpha = alphaPrices[subnet.netuid] || {};
    const prediction = predictionMap[subnet.netuid] || {};
    const rank7dDelta = prediction.trend_indicators?.rank_delta_7d;
    const poolLiquidity = alpha.tao_in_pool || 0;

    // Check basic criteria: underdogs (outside top 10) with liquidity
    const isUnderdog = currentRank >= NEWCOMER_CRITERIA.minRank;
    const hasLiquidity = poolLiquidity >= NEWCOMER_CRITERIA.minPoolLiquidity;
    const hasRankData = rank7dDelta !== undefined;
    const isRising = hasRankData && rank7dDelta >= NEWCOMER_CRITERIA.minRankImprovement;
    const isFalling = hasRankData && rank7dDelta <= -NEWCOMER_CRITERIA.minRankImprovement;

    // Fallen Giant Detection: was once Top 10, now ranked 30+
    const peakRank = peakRankMap[subnet.netuid];
    const isFallenGiant = peakRank && peakRank <= 10 && currentRank >= 30;

    if (isUnderdog && hasLiquidity) {
      const sharePct = (emissionShare * 100).toFixed(2);
      const emissionTrend = emissionTrendMap[subnet.netuid] || null;
      const entry = {
        rank: currentRank,
        netuid: subnet.netuid,
        name: subnet.subnet_name || subnet.taostats_name || `SN${subnet.netuid}`,
        share: sharePct,
        emissionHealth: getEmissionHealth(sharePct),
        emissionTrend: emissionTrend,  // { oldShare, delta, trend }
        rank7dDelta: hasRankData ? rank7dDelta : null,
        poolLiquidity: poolLiquidity,
        marketCapTao: alpha.market_cap_tao || 0,
        alpha: alpha,
        isDeepUnderdog: currentRank >= 30,
        isFallenGiant: isFallenGiant,
        peakRank: peakRank
      };

      if (hasPredictionData) {
        // Fallen giants go to Fallen Angels regardless of recent momentum
        if (isFallenGiant) {
          fallenAngels.push(entry);
        } else if (isRising) {
          prospects.push(entry);
        } else if (isFalling) {
          fallenAngels.push(entry);
        }
      } else {
        // No prediction data: show all as watch list
        prospects.push(entry);
      }
    }
  });

  // Sort prospects by momentum (or liquidity if no data)
  if (hasPredictionData) {
    prospects.sort((a, b) => {
      const aScore = (a.rank7dDelta || 0) * (a.isDeepUnderdog ? 1.5 : 1);
      const bScore = (b.rank7dDelta || 0) * (b.isDeepUnderdog ? 1.5 : 1);
      return bScore - aScore;
    });
    // Sort fallen angels: fallen giants first (by how far they fell from peak), then by 7d momentum
    fallenAngels.sort((a, b) => {
      // Fallen giants get priority (sorted by total fall from peak)
      if (a.isFallenGiant && !b.isFallenGiant) return -1;
      if (!a.isFallenGiant && b.isFallenGiant) return 1;
      if (a.isFallenGiant && b.isFallenGiant) {
        // Both fallen giants: sort by total fall (current - peak)
        const aFall = a.rank - (a.peakRank || a.rank);
        const bFall = b.rank - (b.peakRank || b.rank);
        return bFall - aFall;  // Bigger fall first
      }
      // Regular fallen angels: sort by 7d momentum (most negative first)
      return (a.rank7dDelta || 0) - (b.rank7dDelta || 0);
    });
  } else {
    prospects.sort((a, b) => b.poolLiquidity - a.poolLiquidity);
  }

  return {
    prospects: prospects.slice(0, 5),
    fallenAngels: fallenAngels.slice(0, 3),  // Show up to 3 fallen angels (including giants)
    isCollectingData: !hasPredictionData
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

    // Emission health indicator with trend arrow
    const healthIcon = item.emissionHealth?.icon || '';
    const healthClass = item.emissionHealth?.class || '';
    const trend = item.emissionTrend;
    const trendArrow = trend ? (trend.trend === 'rising' ? '↗' : trend.trend === 'falling' ? '↘' : '') : '';
    const trendDelta = trend && trend.delta ? (trend.delta > 0 ? `+${trend.delta.toFixed(2)}` : trend.delta.toFixed(2)) : '';
    const trendTooltip = trend ? `${item.emissionHealth?.label || ''} (${trendDelta}% vs 7d ago)` : (item.emissionHealth?.label || '');

    html += `<tr class="${rowClass}${item.isDeepUnderdog ? ' deep-underdog-row' : ''}">
      <td class="rank-col">${item.rank}</td>
      <td class="subnet-col"><span class="sn-id">SN${item.netuid}</span> ${item.name}</td>
      <td class="share-col ${healthClass}"><span class="health-icon" title="${trendTooltip}">${healthIcon}${trendArrow}</span>${item.share}%</td>
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

      // Fallen giants show total fall from peak, regular fallen angels show 7d momentum
      let momentumDisplay;
      if (item.isFallenGiant && item.peakRank) {
        const totalFall = item.rank - item.peakRank;
        momentumDisplay = `<span class="momentum-badge fallen-giant" title="Was rank #${item.peakRank}">↓${totalFall}</span>`;
      } else {
        momentumDisplay = `<span class="momentum-badge falling">${item.rank7dDelta}</span>`;
      }
      const rowClass = isBlurred ? 'newcomer-row blurred-row' : 'newcomer-row';
      const giantClass = item.isFallenGiant ? ' fallen-giant-row' : '';

      // Emission health indicator with trend arrow
      const healthIcon = item.emissionHealth?.icon || '';
      const healthClass = item.emissionHealth?.class || '';
      const trend = item.emissionTrend;
      const trendArrow = trend ? (trend.trend === 'rising' ? '↗' : trend.trend === 'falling' ? '↘' : '') : '';
      const trendDelta = trend && trend.delta ? (trend.delta > 0 ? `+${trend.delta.toFixed(2)}` : trend.delta.toFixed(2)) : '';
      const trendTooltip = trend ? `${item.emissionHealth?.label || ''} (${trendDelta}% vs 7d ago)` : (item.emissionHealth?.label || '');

      html += `<tr class="${rowClass}${giantClass}">
        <td class="rank-col">${item.rank}</td>
        <td class="subnet-col"><span class="sn-id">SN${item.netuid}</span> ${item.name}${item.isFallenGiant ? ' <span class="giant-badge" title="Former Top 10">👑</span>' : ''}</td>
        <td class="share-col ${healthClass}"><span class="health-icon" title="${trendTooltip}">${healthIcon}${trendArrow}</span>${item.share}%</td>
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
 * Uses PREDICTIONS API for 7d rank changes (has data for 50+ subnets)
 * Uses HISTORY for fallen giant detection (peak rank tracking)
 */
export async function loadNewcomersDisplay(displayList) {
  if (!displayList) return;

  try {
    // Fetch required data
    // - predictions API for momentum (has 50+ subnets with rank7dDelta)
    // - full history for fallen giant detection (peak rank tracking)
    const [subnetsRes, alphaRes, predictionsRes, fullHistoryRes, taostatsRes] = await Promise.all([
      fetch('/api/top_subnets'),
      fetch('/api/alpha_prices'),
      fetch('/api/subnet_predictions?top_n=100'),    // Predictions with rank7dDelta for ALL subnets
      fetch('/api/top_subnets_history?limit=1000'),  // Full history for fallen giant detection
      fetch('/api/taostats')
    ]);

    let topSubnets = [];
    let alphaPrices = {};
    let predictions = [];
    let fullHistory = [];
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

    if (predictionsRes.ok) {
      const data = await predictionsRes.json();
      predictions = data.predictions || [];
    }

    if (fullHistoryRes.ok) {
      const data = await fullHistoryRes.json();
      fullHistory = data.history || [];
    }

    if (taostatsRes.ok) {
      const data = await taostatsRes.json();
      taoPrice = data.price || 0;
    }

    // Identify and render newcomers
    // predictions for 7d momentum, fullHistory for fallen giant detection
    const { prospects, fallenAngels, isCollectingData } = identifyNewcomers(topSubnets, alphaPrices, predictions, fullHistory);
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
