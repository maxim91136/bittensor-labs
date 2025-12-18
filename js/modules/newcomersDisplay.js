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

// Newcomer criteria thresholds
const NEWCOMER_CRITERIA = {
  maxEmissionShare: 0.02,    // < 2% emission share (still small)
  minRankImprovement: 2,     // >= 2 rank improvement in 7d
  minPoolLiquidity: 10000    // > 10K TAO in pool
};

// Icons for newcomers
const starIcon = `<svg class="newcomer-star-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
const fireIcon = `<svg class="newcomer-fire-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-4.97 0-9-3.58-9-8 0-2.52 1.17-5.06 3-7.5 1.09-1.45 2.41-2.74 3.8-3.8.36-.27.84-.22 1.14.12.3.34.32.84.05 1.21-.84 1.14-1.4 2.43-1.67 3.47 1.1-.91 2.5-1.5 4.18-1.5 4.14 0 7.5 3.58 7.5 8s-3.58 8-8 8z"/></svg>`;
const chartIcon = `<svg class="newcomer-chart-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v8H3v-8zm6-6h2v14H9V7zm6-4h2v18h-2V3zm6 8h2v10h-2V11z"/></svg>`;

// Prospect titles
const prospectTitles = {
  1: { title: `${starIcon} TOP PROSPECT`, class: 'prospect-top' },
  2: { title: `${fireIcon} HOT PROSPECTS`, class: 'prospect-hot' },
  4: { title: `${chartIcon} PROSPECTS`, class: 'prospect-rising' }
};

/**
 * Identify newcomers based on criteria
 */
function identifyNewcomers(topSubnets, alphaPrices, predictions) {
  const newcomers = [];

  // Build predictions lookup for 7d rank change
  const predictionsMap = {};
  predictions.forEach(p => {
    predictionsMap[p.netuid] = p;
  });

  // Check all subnets (not just top 10)
  topSubnets.forEach((subnet, idx) => {
    const emissionShare = subnet.taostats_emission_share || 0;
    const alpha = alphaPrices[subnet.netuid] || {};
    const prediction = predictionsMap[subnet.netuid];
    const rank7dDelta = prediction?.trend_indicators?.rank_delta_7d || 0;
    const poolLiquidity = alpha.tao_in_pool || 0;

    // Check newcomer criteria
    const isSmall = emissionShare < NEWCOMER_CRITERIA.maxEmissionShare;
    const isRising = rank7dDelta >= NEWCOMER_CRITERIA.minRankImprovement;
    const hasLiquidity = poolLiquidity >= NEWCOMER_CRITERIA.minPoolLiquidity;

    if (isSmall && isRising && hasLiquidity) {
      newcomers.push({
        rank: idx + 1,
        netuid: subnet.netuid,
        name: subnet.subnet_name || subnet.taostats_name || `SN${subnet.netuid}`,
        share: (emissionShare * 100).toFixed(2),
        rank7dDelta: rank7dDelta,
        poolLiquidity: poolLiquidity,
        marketCapTao: alpha.market_cap_tao || 0,
        alpha: alpha
      });
    }
  });

  // Sort by rank improvement (best momentum first)
  newcomers.sort((a, b) => b.rank7dDelta - a.rank7dDelta);

  return newcomers.slice(0, 5); // Top 5 newcomers
}

/**
 * Render newcomers table with ranking titles
 */
function renderNewcomers(displayList, newcomers, taoPrice) {
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

    return `${titleRow}<tr class="newcomer-row">
      <td class="rank-col">${item.rank}</td>
      <td class="subnet-col"><span class="sn-id">SN${item.netuid}</span> ${item.name}</td>
      <td class="share-col">${item.share}%</td>
      <td class="momentum-col"><span class="momentum-badge">+${item.rank7dDelta}</span></td>
      <td class="pool-col">${poolDisplay}τ</td>
      <td class="mcap-col">${mcapDisplay}τ${mcapUsd ? ` <span class="mcap-usd">(${mcapUsd})</span>` : ''}</td>
    </tr>`;
  }).join('');

  displayList.innerHTML = rows;
}

/**
 * Load and display newcomers
 */
export async function loadNewcomersDisplay(displayList) {
  if (!displayList) return;

  try {
    // Fetch required data
    const [subnetsRes, alphaRes, predictionsRes, taostatsRes] = await Promise.all([
      fetch('/api/top_subnets'),
      fetch('/api/alpha_prices'),
      fetch('/api/subnet_predictions?top_n=50'),
      fetch('/api/taostats')
    ]);

    let topSubnets = [];
    let alphaPrices = {};
    let predictions = [];
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

    if (taostatsRes.ok) {
      const data = await taostatsRes.json();
      taoPrice = data.price || 0;
    }

    // Identify and render newcomers
    const newcomers = identifyNewcomers(topSubnets, alphaPrices, predictions);
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
