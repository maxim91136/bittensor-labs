// ===== Top Wallets Display Module (ES6) =====
// Display cards for top wallets, TAO distribution, and decentralization score

/**
 * Load and display top 10 wallets with ranking changes
 * @param {HTMLElement} displayList - The tbody element to populate
 */
export async function loadTopWalletsDisplay(displayList) {
  if (!displayList) return;

  try {
    // Fetch current data and history in parallel
    const [currentRes, historyRes] = await Promise.all([
      fetch('/api/top_wallets'),
      fetch('/api/top_wallets_history?limit=96')  // ~24h of history
    ]);

    if (!currentRes.ok) throw new Error('Failed to fetch top wallets');
    const data = await currentRes.json();

    const wallets = data.wallets || [];
    if (wallets.length === 0) {
      displayList.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No wallet data available</td></tr>';
      return;
    }

    // Build previous ranking map from history
    let prevRankMap = {}; // address/id -> previous rank (1-based)
    try {
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        const history = historyData.history || [];
        // Get the oldest snapshot in history (for 24h comparison)
        if (history.length >= 1) {
          const prevSnapshot = history[0];  // First = oldest
          // History stores in 'entries' or 'top_wallets' array
          const prevWallets = prevSnapshot.entries || prevSnapshot.top_wallets || [];
          prevWallets.forEach((w, idx) => {
            // Use 'id' (address) from history snapshot
            const key = w.id || w.address;
            if (key) prevRankMap[key] = idx + 1;
          });
        }
      }
    } catch (e) {
      console.warn('Could not load wallet history for ranking:', e);
    }

    // Display TOP 10 with ranking changes
    const rows = wallets.slice(0, 10).map((w, idx) => {
      const rank = idx + 1;
      const address = w.address;
      const identity = w.identity || null;
      const addressShort = w.address_short || 'Unknown';
      const balance = w.balance_total != null ? `${w.balance_total.toLocaleString(undefined, {maximumFractionDigits: 0})} τ` : '—';
      const dominance = w.dominance != null ? `${w.dominance.toFixed(2)}%` : '—';
      const stakedPercent = w.staked_percent != null ? `${w.staked_percent.toFixed(2)}%` : '—';

      // Calculate rank change
      let changeHtml = '';
      const prevRank = prevRankMap[address];

      if (prevRank === undefined && Object.keys(prevRankMap).length > 0) {
        changeHtml = ' <span class="rank-new">NEW</span>';
      } else if (prevRank > rank) {
        const diff = prevRank - rank;
        changeHtml = ` <span class="rank-up">▲${diff}</span>`;
      } else if (prevRank < rank) {
        const diff = rank - prevRank;
        changeHtml = ` <span class="rank-down">▼${diff}</span>`;
      }

      // Show identity if available, otherwise just address
      const walletDisplay = identity
        ? `<span class="wallet-identity">${identity}</span><span class="wallet-address">${addressShort}</span>`
        : `<span class="wallet-address wallet-address-only">${addressShort}</span>`;

      return `<tr>
        <td class="rank-col">${rank}${changeHtml}</td>
        <td class="wallet-col">${walletDisplay}</td>
        <td class="balance-col">${balance}</td>
        <td class="dominance-col">${dominance}</td>
        <td class="staked-col">${stakedPercent}</td>
      </tr>`;
    }).join('');

    displayList.innerHTML = rows;
  } catch (err) {
    console.error('Error loading top wallets:', err);
    displayList.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">Error loading wallet data</td></tr>';
  }
}

/**
 * Load TAO Distribution data and update UI
 */
export async function loadDistribution() {
  try {
    const res = await fetch('/api/distribution', { cache: 'no-store' });
    if (!res.ok) {
      console.warn('Distribution API returned', res.status);
      return;
    }
    const data = await res.json();
    if (!data || !data.percentiles) return;

    // Update percentile values
    const percentiles = data.percentiles;
    if (percentiles['1']) {
      const el = document.getElementById('percentile1');
      if (el) el.textContent = `≥ ${percentiles['1'].threshold.toLocaleString(undefined, { maximumFractionDigits: 0 })} τ`;
    }
    if (percentiles['3']) {
      const el = document.getElementById('percentile3');
      if (el) el.textContent = `≥ ${percentiles['3'].threshold.toLocaleString(undefined, { maximumFractionDigits: 0 })} τ`;
    }
    if (percentiles['5']) {
      const el = document.getElementById('percentile5');
      if (el) el.textContent = `≥ ${percentiles['5'].threshold.toLocaleString(undefined, { maximumFractionDigits: 0 })} τ`;
    }
    if (percentiles['10']) {
      const el = document.getElementById('percentile10');
      if (el) el.textContent = `≥ ${percentiles['10'].threshold.toLocaleString(undefined, { maximumFractionDigits: 0 })} τ`;
    }

    // Update bracket counts
    const brackets = data.brackets;
    if (brackets) {
      const bracket10000 = document.getElementById('bracket10000');
      if (bracket10000 && brackets['10000']) {
        bracket10000.textContent = `${brackets['10000'].count.toLocaleString()} (${brackets['10000'].percentage}%)`;
      }
      const bracket1000 = document.getElementById('bracket1000');
      if (bracket1000 && brackets['1000']) {
        bracket1000.textContent = `${brackets['1000'].count.toLocaleString()} (${brackets['1000'].percentage}%)`;
      }
      const bracket100 = document.getElementById('bracket100');
      if (bracket100 && brackets['100']) {
        bracket100.textContent = `${brackets['100'].count.toLocaleString()} (${brackets['100'].percentage}%)`;
      }
      const bracket10 = document.getElementById('bracket10');
      if (bracket10 && brackets['10']) {
        bracket10.textContent = `${brackets['10'].count.toLocaleString()} (${brackets['10'].percentage}%)`;
      }
    }

    // Update meta info
    const metaEl = document.getElementById('distributionMeta');
    if (metaEl && data.sample_size) {
      metaEl.textContent = `Sample: ${data.sample_size.toLocaleString()} wallets`;
    }
    const updateEl = document.getElementById('distributionUpdate');
    if (updateEl && data.last_updated) {
      const date = new Date(data.last_updated);
      updateEl.textContent = `Updated: ${date.toLocaleDateString()}`;
    }
  } catch (err) {
    console.warn('Failed to load distribution:', err);
  }
}

/**
 * Load Decentralization Score and update UI
 */
export async function loadDecentralization() {
  try {
    const res = await fetch('/api/decentralization');
    if (!res.ok) return;
    const data = await res.json();
    if (!data || data.error) return;

    // Helper to format numbers with K suffix
    const formatK = (n) => {
      if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
      return n.toLocaleString();
    };

    // Helper to set element text
    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    // Main score
    const scoreEl = document.getElementById('decentralizationScore');
    const ratingEl = document.getElementById('decentralizationRating');
    const barEl = document.getElementById('decentralizationBar');

    if (scoreEl) scoreEl.textContent = data.score ?? '—';
    if (ratingEl) {
      const rating = (data.rating || '').toLowerCase();
      ratingEl.textContent = data.rating || '—';
      ratingEl.className = 'score-rating ' + rating;
    }
    if (barEl) barEl.style.width = (data.score || 0) + '%';

    // Score description - plain language explanation
    const descEl = document.getElementById('decentralizationDescription');
    if (descEl) {
      const score = data.score || 0;
      let desc = '';
      if (score >= 80) desc = 'Network is well distributed with healthy decentralization';
      else if (score >= 65) desc = 'Good distribution with room for improvement';
      else if (score >= 50) desc = 'Moderate concentration - validator stake is highly centralized';
      else if (score >= 35) desc = 'Concerning concentration - few entities control majority';
      else desc = 'High centralization risk - immediate attention needed';
      descEl.textContent = desc;
    }

    // Component scores
    setEl('walletScore', data.components?.wallet_score ?? '—');
    setEl('validatorScore', data.components?.validator_score ?? '—');
    setEl('subnetScore', data.components?.subnet_score ?? '—');

    // Helper to get Nakamoto context
    const getNakamotoContext = (n) => {
      if (n == null) return { text: '', cls: '' };
      if (n <= 3) return { text: 'Critical', cls: 'critical' };
      if (n <= 7) return { text: 'Low', cls: 'low' };
      if (n <= 15) return { text: 'Moderate', cls: 'moderate' };
      return { text: 'Good', cls: 'good' };
    };

    // Validator metrics
    const va = data.validator_analysis || {};
    setEl('validatorNakamoto', va.nakamoto_coefficient ?? '—');
    const vCtx = getNakamotoContext(va.nakamoto_coefficient);
    const vCtxEl = document.getElementById('validatorNakamotoContext');
    if (vCtxEl && vCtx.text) {
      vCtxEl.textContent = vCtx.text;
      vCtxEl.className = 'metric-context ' + vCtx.cls;
    }
    setEl('validatorGini', va.gini != null ? va.gini.toFixed(3) : '—');
    setEl('validatorTop10', va.top_10_concentration != null ? (va.top_10_concentration * 100).toFixed(0) + '%' : '—');
    setEl('totalValidators', va.total_validators ?? '—');

    // Subnet metrics
    const sa = data.subnet_analysis || {};
    setEl('subnetNakamoto', sa.nakamoto_coefficient ?? '—');
    const sCtx = getNakamotoContext(sa.nakamoto_coefficient);
    const sCtxEl = document.getElementById('subnetNakamotoContext');
    if (sCtxEl && sCtx.text) {
      sCtxEl.textContent = sCtx.text;
      sCtxEl.className = 'metric-context ' + sCtx.cls;
    }
    setEl('subnetHHI', sa.emission_hhi != null ? sa.emission_hhi.toFixed(4) : '—');
    setEl('subnetTop5', sa.top_5_emission_concentration != null ? (sa.top_5_emission_concentration * 100).toFixed(2) + '%' : '—');
    setEl('totalSubnets', sa.total_subnets ?? '—');

    // Wallet metrics
    const wa = data.wallet_analysis || {};
    const whales = wa.whales_10k_plus || {};
    setEl('whaleCount', whales.count ?? '—');
    setEl('whalePercent', whales.percentage != null ? whales.percentage.toFixed(2) + '%' : '—');
    setEl('top1Threshold', wa.top_1_percent?.threshold_tao != null ? wa.top_1_percent.threshold_tao.toFixed(0) + ' τ' : '—');
    setEl('totalWallets', wa.total_wallets != null ? formatK(wa.total_wallets) : '—');

    // Update timestamp
    const updateEl = document.getElementById('decentralizationUpdate');
    if (updateEl && data.last_updated) {
      const date = new Date(data.last_updated);
      updateEl.textContent = `Updated: ${date.toLocaleDateString()}`;
    }
  } catch (err) {
    console.warn('Failed to load decentralization:', err);
  }
}

/**
 * Load Experimental Decentralization Score (TDS/EDS/Hybrid)
 * Separates Technical (control) vs Economic (ownership) decentralization
 */
export async function loadExperimentalDecentralization() {
  try {
    // Fetch decentralization data and top wallets in parallel
    const [decRes, walletsRes] = await Promise.all([
      fetch('/api/decentralization'),
      fetch('/api/top_wallets')
    ]);

    if (!decRes.ok) return;
    const decData = await decRes.json();
    if (!decData || decData.error) return;

    // Parse wallet data for CEX calculation
    let cexHoldingsPercent = null;
    let totalSupplyInWallets = 0;
    let cexSupply = 0;

    if (walletsRes.ok) {
      const walletsData = await walletsRes.json();
      const wallets = walletsData.wallets || [];

      // Known CEX identifiers (case-insensitive)
      const cexNames = ['binance', 'coinbase', 'kraken', 'okx', 'bybit', 'kucoin', 'gate.io', 'htx', 'bitfinex', 'crypto.com'];

      wallets.forEach(w => {
        const balance = w.balance_total || 0;
        totalSupplyInWallets += balance;

        // Check if wallet is a CEX
        const identity = (w.identity || '').toLowerCase();
        if (identity && cexNames.some(cex => identity.includes(cex))) {
          cexSupply += balance;
        }
      });

      if (totalSupplyInWallets > 0) {
        cexHoldingsPercent = (cexSupply / totalSupplyInWallets) * 100;
      }
    }

    // Extract metrics from existing data
    const va = decData.validator_analysis || {};
    const wa = decData.wallet_analysis || {};

    // Validator Top10 concentration (0-1 scale)
    const valTop10 = va.top_10_concentration ?? null;
    const valGini = va.gini ?? null;

    // Calculate TDS (Technical Decentralization Score)
    // Lower CEX holdings = better, Lower validator concentration = better
    let tds = null;
    let tdsComponents = { cex: null, valConc: null };

    if (cexHoldingsPercent !== null || valTop10 !== null) {
      let tdsSum = 0;
      let tdsWeight = 0;

      // CEX Holdings: 0% = 100 score, 50%+ = 0 score
      if (cexHoldingsPercent !== null) {
        const cexScore = Math.max(0, 100 - (cexHoldingsPercent * 2));
        tdsSum += cexScore * 0.5;
        tdsWeight += 0.5;
        tdsComponents.cex = cexHoldingsPercent;
      }

      // Validator Top10: 0% = 100 score, 100% = 0 score
      if (valTop10 !== null) {
        const valScore = Math.max(0, 100 - (valTop10 * 100));
        tdsSum += valScore * 0.5;
        tdsWeight += 0.5;
        tdsComponents.valConc = valTop10 * 100;
      }

      if (tdsWeight > 0) {
        tds = Math.round(tdsSum / tdsWeight);
      }
    }

    // Calculate EDS (Economic Decentralization Score)
    // Based on ownership distribution metrics
    let eds = null;
    let edsComponents = { gini: null, stakeSpread: null };

    // Use wallet_score as proxy for ownership distribution
    const walletScore = decData.components?.wallet_score ?? null;

    // Gini: 0 = perfect equality (100), 1 = perfect inequality (0)
    if (valGini !== null) {
      edsComponents.gini = valGini;
    }

    // Stake spread: inverse of top10 concentration
    if (valTop10 !== null) {
      edsComponents.stakeSpread = 100 - (valTop10 * 100);
    }

    // EDS calculation: weighted average
    if (walletScore !== null) {
      let edsSum = walletScore * 0.5;  // Wallet distribution
      let edsWeight = 0.5;

      if (valGini !== null) {
        const giniScore = (1 - valGini) * 100;  // Convert: lower gini = higher score
        edsSum += giniScore * 0.25;
        edsWeight += 0.25;
      }

      if (valTop10 !== null) {
        const spreadScore = 100 - (valTop10 * 100);
        edsSum += spreadScore * 0.25;
        edsWeight += 0.25;
      }

      eds = Math.round(edsSum / edsWeight);
    }

    // Calculate Hybrid Score (weighted average of TDS and EDS)
    let hybrid = null;
    if (tds !== null && eds !== null) {
      hybrid = Math.round((tds * 0.5) + (eds * 0.5));
    } else if (tds !== null) {
      hybrid = tds;
    } else if (eds !== null) {
      hybrid = eds;
    }

    // Helper to set element text
    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    // Update UI
    setEl('tdsScore', tds ?? '—');
    setEl('edsScore', eds ?? '—');
    setEl('hybridScore', hybrid ?? '—');

    // Detail metrics
    setEl('expCexHoldings', tdsComponents.cex !== null ? tdsComponents.cex.toFixed(1) + '%' : '—');
    setEl('expValTop10', tdsComponents.valConc !== null ? tdsComponents.valConc.toFixed(1) + '%' : '—');
    setEl('expOwnershipGini', edsComponents.gini !== null ? edsComponents.gini.toFixed(3) : '—');
    setEl('expStakeSpread', edsComponents.stakeSpread !== null ? edsComponents.stakeSpread.toFixed(1) + '%' : '—');

    // Update timestamp
    const updateEl = document.getElementById('expDecentralizationUpdate');
    if (updateEl) {
      const now = new Date();
      updateEl.textContent = `Updated: ${now.toLocaleDateString()}`;
    }

  } catch (err) {
    console.warn('Failed to load experimental decentralization:', err);
  }
}

/**
 * Initialize top wallets display card with distribution and decentralization
 * @returns {Object|null} Object with refresh functions, or null if elements not found
 */
export function initTopWalletsDisplay() {
  const displayTable = document.getElementById('topWalletsDisplayTable');
  const displayList = document.getElementById('topWalletsDisplayList');

  if (!displayTable || !displayList) return null;

  // Initial load
  loadTopWalletsDisplay(displayList);
  loadDistribution();
  loadDecentralization();
  loadExperimentalDecentralization();

  // Return refresh functions for external use
  return {
    refreshWallets: () => loadTopWalletsDisplay(displayList),
    refreshDistribution: loadDistribution,
    refreshDecentralization: loadDecentralization,
    refreshExperimental: loadExperimentalDecentralization,
    refreshAll: () => {
      loadTopWalletsDisplay(displayList);
      loadDistribution();
      loadDecentralization();
      loadExperimentalDecentralization();
    }
  };
}
