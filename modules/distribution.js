// ===== TAO Distribution Module =====
// Tracks wallet distribution and holder percentiles
// Data source: Taostats API

const TaoDistribution = (function() {
  'use strict';

  // ===== Configuration =====
  const CONFIG = {
    API_BASE: '/api',
    CACHE_KEY: 'tao_distribution',
    CACHE_TTL: 3600000, // 1 hour
    BRACKETS: [100000, 50000, 10000, 1000, 500, 250, 100, 50, 25, 10, 5, 1, 0.1],
    PERCENTILES: [10, 5, 3, 1] // Top X%
  };

  // ===== State =====
  let distributionData = null;
  let lastFetch = 0;

  // ===== Data Fetching =====

  /**
   * Fetch wallet distribution data
   * TODO: Implement actual API call once endpoint is identified
   */
  async function fetchDistribution() {
    try {
      // Check cache first
      const cached = getCachedData();
      if (cached) {
        distributionData = cached;
        return cached;
      }

      // TODO: Replace with actual Taostats API endpoint
      // Options:
      // 1. Taostats API endpoint for distribution (if exists)
      // 2. Fetch all wallets and calculate client-side
      // 3. Our own worker that aggregates data

      const res = await fetch(`${CONFIG.API_BASE}/distribution`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      distributionData = processDistributionData(data);
      cacheData(distributionData);

      return distributionData;
    } catch (e) {
      console.warn('📊 Failed to fetch distribution:', e);
      return null;
    }
  }

  /**
   * Process raw wallet data into distribution brackets
   */
  function processDistributionData(rawData) {
    if (!rawData || !rawData.wallets) return null;

    const wallets = rawData.wallets;
    const totalWallets = wallets.length;

    // Sort by balance descending
    wallets.sort((a, b) => b.balance_total - a.balance_total);

    // Calculate brackets
    const brackets = {};
    CONFIG.BRACKETS.forEach(threshold => {
      const count = wallets.filter(w => w.balance_total > threshold).length;
      brackets[threshold] = {
        count,
        percentage: (count / totalWallets * 100).toFixed(2)
      };
    });

    // Calculate percentile thresholds
    const percentiles = {};
    CONFIG.PERCENTILES.forEach(p => {
      const index = Math.floor(totalWallets * (p / 100));
      const wallet = wallets[index];
      percentiles[p] = {
        threshold: wallet ? wallet.balance_total : 0,
        walletCount: index
      };
    });

    return {
      totalWallets,
      brackets,
      percentiles,
      timestamp: Date.now(),
      source: rawData.source || 'taostats'
    };
  }

  // ===== Cache Helpers =====

  function getCachedData() {
    try {
      const raw = localStorage.getItem(CONFIG.CACHE_KEY);
      if (!raw) return null;

      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp > CONFIG.CACHE_TTL) {
        localStorage.removeItem(CONFIG.CACHE_KEY);
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  function cacheData(data) {
    try {
      localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      // Ignore storage errors
    }
  }

  // ===== Percentile Calculator =====

  /**
   * Calculate what percentile a given TAO amount falls into
   * @param {number} amount - TAO amount to check
   * @returns {object} - { percentile, rank, message }
   */
  function calculatePercentile(amount) {
    if (!distributionData) return null;

    const { percentiles, totalWallets } = distributionData;

    // Find which percentile bracket the amount falls into
    for (const p of CONFIG.PERCENTILES) {
      if (amount >= percentiles[p].threshold) {
        return {
          percentile: p,
          threshold: percentiles[p].threshold,
          rank: percentiles[p].walletCount,
          totalWallets,
          message: `Top ${p}%`
        };
      }
    }

    // Below all tracked percentiles
    return {
      percentile: null,
      threshold: null,
      rank: null,
      totalWallets,
      message: 'Below Top 10%'
    };
  }

  // ===== UI Rendering =====

  /**
   * Render the distribution card
   * @param {string} containerId - ID of container element
   */
  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!distributionData) {
      container.innerHTML = `
        <div class="distribution-card loading">
          <div class="card-header">
            <h3>📊 TAO Distribution</h3>
          </div>
          <div class="card-body">
            <span class="skeleton-text">Loading...</span>
          </div>
        </div>
      `;
      return;
    }

    const { percentiles, totalWallets, timestamp } = distributionData;
    const lastUpdated = new Date(timestamp).toLocaleString();

    container.innerHTML = `
      <div class="distribution-card">
        <div class="card-header">
          <h3>📊 TAO Distribution</h3>
          <span class="card-updated">Updated: ${lastUpdated}</span>
        </div>

        <div class="percentile-grid">
          ${CONFIG.PERCENTILES.map(p => `
            <div class="percentile-item">
              <span class="percentile-label">Top ${p}%</span>
              <span class="percentile-value">≥ ${formatTao(percentiles[p].threshold)} TAO</span>
              <span class="percentile-count">(${formatNumber(percentiles[p].walletCount)} 👛)</span>
            </div>
          `).join('')}
        </div>

        <div class="total-wallets">
          Total: ${formatNumber(totalWallets)} Wallets
        </div>

        <div class="percentile-calculator">
          <label for="taoAmountInput">Your TAO:</label>
          <input type="number" id="taoAmountInput" placeholder="Enter amount" min="0" step="0.01">
          <div id="percentileResult" class="percentile-result"></div>
        </div>

        <details class="distribution-details">
          <summary>Full Breakdown</summary>
          <table class="distribution-table">
            <thead>
              <tr>
                <th>Wallet Size</th>
                <th>Accounts</th>
                <th>Position</th>
              </tr>
            </thead>
            <tbody>
              ${renderBracketsTable()}
            </tbody>
          </table>
        </details>
      </div>
    `;

    // Attach input handler
    const input = document.getElementById('taoAmountInput');
    const result = document.getElementById('percentileResult');
    if (input && result) {
      input.addEventListener('input', (e) => {
        const amount = parseFloat(e.target.value) || 0;
        const calc = calculatePercentile(amount);
        if (calc) {
          result.innerHTML = calc.percentile
            ? `→ You're in the <strong>${calc.message}</strong>! 🎯`
            : `→ ${calc.message}`;
          result.className = 'percentile-result ' + (calc.percentile ? 'highlight' : '');
        }
      });
    }
  }

  function renderBracketsTable() {
    if (!distributionData?.brackets) return '';

    return CONFIG.BRACKETS.map(threshold => {
      const bracket = distributionData.brackets[threshold];
      return `
        <tr>
          <td>&gt; ${formatTao(threshold)}</td>
          <td>${formatNumber(bracket.count)}</td>
          <td>${bracket.percentage}%</td>
        </tr>
      `;
    }).join('');
  }

  // ===== Formatting Helpers =====

  function formatTao(amount) {
    if (amount >= 1000) {
      return (amount / 1000).toFixed(amount >= 10000 ? 0 : 1) + 'k';
    }
    return amount.toFixed(amount < 10 ? 2 : 0);
  }

  function formatNumber(num) {
    return num.toLocaleString('en-US');
  }

  // ===== Public API =====

  return {
    init: async function(containerId) {
      await fetchDistribution();
      render(containerId);
    },
    refresh: async function(containerId) {
      localStorage.removeItem(CONFIG.CACHE_KEY);
      await fetchDistribution();
      if (containerId) render(containerId);
    },
    getPercentile: calculatePercentile,
    getData: () => distributionData
  };
})();

// Export for module systems (optional)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TaoDistribution;
}
