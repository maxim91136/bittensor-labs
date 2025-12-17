// ===== Top Subnets Display Module (ES6) =====
// Display card showing top 10 subnets with ranking changes and alpha prices

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
 * Load and display top 10 subnets with ranking changes and alpha prices
 * @param {HTMLElement} displayList - The tbody element to populate
 */
export async function loadTopSubnetsDisplay(displayList) {
  if (!displayList) return;

  try {
    // Fetch current data, history, and alpha prices in parallel
    const [currentRes, historyRes, alphaRes] = await Promise.all([
      fetch('/api/top_subnets'),
      fetch('/api/top_subnets_history?limit=96'),  // ~24h of history at 15min intervals
      fetch('/api/alpha_prices')
    ]);

    if (!currentRes.ok) throw new Error('Failed to fetch top subnets');
    const currentData = await currentRes.json();
    const topSubnets = currentData.top_subnets || [];

    // Build alpha prices map by netuid
    let alphaPricesMap = {};
    try {
      console.log('Alpha API status:', alphaRes.status, alphaRes.ok);
      if (alphaRes.ok) {
        const alphaData = await alphaRes.json();
        console.log('Alpha data received:', alphaData.total_subnets, 'subnets');
        (alphaData.subnets || []).forEach(s => {
          alphaPricesMap[s.netuid] = s;
        });
        console.log('Alpha map keys:', Object.keys(alphaPricesMap).slice(0, 10));
      }
    } catch (e) {
      console.warn('Could not load alpha prices:', e);
    }

    if (topSubnets.length === 0) {
      displayList.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">No subnet data available</td></tr>';
      return;
    }

    // Build previous ranking map from history
    let prevRankMap = {}; // netuid -> previous rank (1-based)
    try {
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        const history = historyData.history || [];
        // Get the oldest snapshot in history (for 24h comparison)
        if (history.length >= 1) {
          const prevSnapshot = history[0];  // First = oldest
          // History stores in 'entries' array with 'id' for netuid
          const prevSubnets = prevSnapshot.entries || prevSnapshot.top_subnets || [];
          prevSubnets.forEach((s, idx) => {
            // Use 'id' from history (netuid as string) or 'netuid'
            const netuid = s.id || s.netuid;
            if (netuid) prevRankMap[parseInt(netuid)] = idx + 1;
          });
        }
      }
    } catch (e) {
      console.warn('Could not load subnet history for ranking:', e);
    }

    // Display TOP 10 with ranking changes and alpha prices
    const rows = topSubnets.slice(0, 10).map((subnet, idx) => {
      const rank = idx + 1;
      const netuid = subnet.netuid;
      const name = subnet.subnet_name || subnet.taostats_name || `SN${netuid}`;
      const share = ((subnet.taostats_emission_share || 0) * 100).toFixed(2);
      const daily = (subnet.estimated_emission_daily || 0).toFixed(2);

      // Get alpha price data for this subnet
      const alpha = alphaPricesMap[netuid] || {};
      if (idx === 0) console.log('First subnet alpha lookup:', netuid, alpha);
      const alphaPrice = alpha.alpha_price ? alpha.alpha_price.toFixed(4) : '-';
      const taoInPool = formatCompact(alpha.tao_in_pool);
      const marketCap = formatCompact(alpha.market_cap_tao);
      if (idx === 0) console.log('First subnet values:', alphaPrice, taoInPool, marketCap);

      // Calculate rank change
      let changeHtml = '';
      const prevRank = prevRankMap[netuid];

      if (prevRank === undefined && Object.keys(prevRankMap).length > 0) {
        changeHtml = ' <span class="rank-new">NEW</span>';
      } else if (prevRank > rank) {
        const diff = prevRank - rank;
        changeHtml = ` <span class="rank-up">▲${diff}</span>`;
      } else if (prevRank < rank) {
        const diff = rank - prevRank;
        changeHtml = ` <span class="rank-down">▼${diff}</span>`;
      }

      return `<tr>
        <td class="rank-col">${rank}${changeHtml}</td>
        <td class="subnet-col"><span class="sn-id">SN${netuid}</span> ${name}</td>
        <td class="share-col">${share}%</td>
        <td class="daily-col">${daily}τ</td>
        <td class="price-col">${alphaPrice}</td>
        <td class="pool-col">${taoInPool}</td>
        <td class="mcap-col">${marketCap}</td>
      </tr>`;
    }).join('');

    displayList.innerHTML = rows;
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

  // Initial load
  loadTopSubnetsDisplay(displayList);

  // Return the refresh function for external use
  return () => loadTopSubnetsDisplay(displayList);
}
